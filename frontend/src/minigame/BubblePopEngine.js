import * as PIXI from 'pixi.js';
import * as planck from 'planck';
import avatar from 'animal-avatar-generator';
import * as C from './constants.js';
import { toPixels, toPhysics, clamp, easeOutCubic, hashString, createPRNG } from './utils.js';

/**
 * BubblePopEngine - Core game engine using PixiJS for rendering and Planck for physics
 * Manages the bubble-popping minigame independently from React
 */
export class BubblePopEngine {
    constructor(container, options = {}) {
        this.container = container;
        this.onPopCallback = options.onPop || (() => { });
        this.onGroundedChange = options.onGroundedChange || (() => { });
        this.onStateSync = options.onStateSync || (() => { });

        // Game state
        this.players = new Map(); // playerId -> { body, sprite, avatar, isGrounded }
        this.bubbles = new Map(); // bubbleId -> { body, sprite, radius }
        this.popAnimations = []; // Active pop animations
        this.selfId = options.selfId;

        // Track grounded state
        this.lastGroundedState = null;

        // Track initialization state
        this.isReady = false;
        this.isDestroyed = false;

        // Store pending player additions
        this.pendingPlayers = [];

        // Synchronization state
        this.syncSeed = options.syncSeed ? hashString(options.syncSeed) : 0;
        this.poppedIndices = new Set(); // indices of bubbles popped by anyone
        this.processedPopEvents = new Set(); // "playerId:bubbleId" to prevent double scoring
        this.lastSlotIndex = -1;
        this.lastSyncTime = 0;
        this.serverState = null; // Store full state for late joiners

        // Start initialization and store the promise
        this.ready = this.init();
    }

    async init() {
        try {
            // Create PixiJS application
            this.app = new PIXI.Application();
            await this.app.init({
                width: C.CANVAS_WIDTH,
                height: C.CANVAS_HEIGHT,
                backgroundColor: C.BACKGROUND_COLOR,
                antialias: true,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true,
            });

            // Check if destroyed while initializing or if app failed
            if (!this.app || this.isDestroyed || !this.app.renderer) {
                if (this.app?.renderer) {
                    this.app.destroy(true, { children: true, texture: true });
                }
                return;
            }

            if (this.container) {
                this.container.appendChild(this.app.canvas);
            }

            // Make canvas responsive
            if (this.app.canvas) {
                this.app.canvas.style.width = '100%';
                this.app.canvas.style.height = '100%';
            }

            // Create physics world with gravity
            this.world = new planck.World({
                gravity: planck.Vec2(0, C.GRAVITY)
            });

            // Create walls and floor
            this.createBoundaries();

            // Setup collision handling
            this.setupCollisions();

            // Create layers for rendering order
            this.bubbleLayer = new PIXI.Container();
            this.avatarLayer = new PIXI.Container();
            this.effectsLayer = new PIXI.Container();

            this.app.stage.addChild(this.bubbleLayer);
            this.app.stage.addChild(this.avatarLayer);
            this.app.stage.addChild(this.effectsLayer);

            // Start game loop
            this.lastTime = performance.now();
            this.app.ticker.add(() => this.update());

            // Initial deterministic catch-up
            const currentSlot = Math.floor(Date.now() / C.BUBBLE_SPAWN_INTERVAL);
            this.lastSlotIndex = currentSlot - 1;

            // Check for bubbles that spawned recently and should still be on screen
            for (let i = currentSlot - 10; i <= currentSlot; i++) {
                if (i >= 0) {
                    this.spawnDeterministicBubble(i);
                }
            }

            // Mark as ready
            this.isReady = true;

            // Add any pending players
            this.pendingPlayers.forEach(({ playerId, avatarSeed, isOwn }) => {
                this.addPlayer(playerId, avatarSeed, isOwn);
            });
            this.pendingPlayers = [];
        } catch (error) {
            console.error('BubblePopEngine init failed:', error);
        }
    }

    createBoundaries() {
        const wallDef = {
            restitution: C.WALL_RESTITUTION,
            friction: 0.1
        };

        const floorDef = {
            restitution: C.FLOOR_RESTITUTION,
            friction: 1.0
        };

        // Floor
        const floor = this.world.createBody();
        floor.createFixture(
            planck.Edge(
                planck.Vec2(0, C.WORLD_HEIGHT),
                planck.Vec2(C.WORLD_WIDTH, C.WORLD_HEIGHT)
            ),
            floorDef
        );
        floor.setUserData({ type: 'floor' });

        // Left wall
        const leftWall = this.world.createBody();
        leftWall.createFixture(
            planck.Edge(
                planck.Vec2(0, 0),
                planck.Vec2(0, C.WORLD_HEIGHT)
            ),
            wallDef
        );

        // Right wall
        const rightWall = this.world.createBody();
        rightWall.createFixture(
            planck.Edge(
                planck.Vec2(C.WORLD_WIDTH, 0),
                planck.Vec2(C.WORLD_WIDTH, C.WORLD_HEIGHT)
            ),
            wallDef
        );

        // Ceiling
        const ceiling = this.world.createBody();
        ceiling.createFixture(
            planck.Edge(
                planck.Vec2(0, 0),
                planck.Vec2(C.WORLD_WIDTH, 0)
            ),
            wallDef
        );
    }

    setupCollisions() {
        this.world.on('begin-contact', (contact) => {
            const fixtureA = contact.getFixtureA();
            const fixtureB = contact.getFixtureB();
            const bodyA = fixtureA.getBody();
            const bodyB = fixtureB.getBody();

            const dataA = bodyA.getUserData();
            const dataB = bodyB.getUserData();

            if (!dataA || !dataB) return;

            // Avatar hitting bubble
            if (dataA.type === 'avatar' && dataB.type === 'bubble') {
                this.handleBubblePop(dataB.id, dataA.playerId, true);
            } else if (dataB.type === 'avatar' && dataA.type === 'bubble') {
                this.handleBubblePop(dataA.id, dataB.playerId, true);
            }
        });
    }

    handleBubblePop(bubbleId, playerId, isLocal = false) {
        // Track the visual removal
        this.poppedIndices.add(bubbleId);

        // Visual removal - this should only happen once per bubbleId ever
        const bubble = this.bubbles.get(bubbleId);
        if (bubble) {
            // Create pop animation
            this.createPopAnimation(bubble);

            // Remove bubble
            this.world.destroyBody(bubble.body);
            this.bubbleLayer.removeChild(bubble.sprite);
            this.bubbles.delete(bubbleId);
        }

        // Only award points immediately if this is the LOCAL player
        // For others, we wait for the server's authoritative score sync
        // this avoids double-counting or sync drift
        if (isLocal) {
            const eventId = `${playerId}:${bubbleId}`;
            if (!this.processedPopEvents.has(eventId)) {
                this.processedPopEvents.add(eventId);
                const player = this.players.get(playerId);
                if (player) {
                    player.popCount = (player.popCount || 0) + 1;
                    const newScore = player.popCount;
                    if (player.scoreText) {
                        player.scoreText.text = newScore.toString();
                    }
                    // Notify local React wrapper with the authoritative new score
                    this.onPopCallback(playerId, bubbleId, newScore);
                }
            }
        }
    }

    /**
     * Authroritative score sync from server
     */
    syncScores(popCounts) {
        if (!popCounts) return;
        Object.entries(popCounts).forEach(([pid, count]) => {
            const player = this.players.get(pid);
            if (player) {
                if (pid === this.selfId) {
                    // For SELF, only update if server has MORE (in case we lagged or missed one)
                    // This prevents local score from flickering down
                    if (count > (player.popCount || 0)) {
                        player.popCount = count;
                        if (player.scoreText) {
                            player.scoreText.text = count.toString();
                        }
                    }
                } else {
                    // For OTHERS, the server is the absolute authority
                    // This resolves any local discrepancies immediately
                    player.popCount = count;
                    if (player.scoreText) {
                        player.scoreText.text = count.toString();
                    }
                }
            }
        });
    }

    /**
     * Batch update minigame state (usually for late joiners)
     */
    syncMinigameState(state) {
        if (!state) return;
        this.serverState = state;

        // Sync popped bubbles
        if (state.poppedBubbles) {
            state.poppedBubbles.forEach(id => {
                this.poppedIndices.add(id);
                // If bubble already exists, remove it
                const bubble = this.bubbles.get(id);
                if (bubble) {
                    this.world.destroyBody(bubble.body);
                    this.bubbleLayer.removeChild(bubble.sprite);
                    this.bubbles.delete(id);
                }
            });
        }

        // Sync scores
        if (state.popCounts) {
            Object.entries(state.popCounts).forEach(([pid, count]) => {
                const player = this.players.get(pid);
                if (player) {
                    player.popCount = count;
                    if (player.scoreText) {
                        player.scoreText.text = count.toString();
                    }
                }
            });
        }

        // Sync processed events to prevent double-counting old pops
        if (state.playerPops) {
            Object.entries(state.playerPops).forEach(([pid, bubbleIds]) => {
                if (bubbleIds && typeof bubbleIds === 'object') {
                    Object.keys(bubbleIds).forEach(bid => {
                        this.processedPopEvents.add(`${pid}:${bid}`);
                    });
                }
            });
        }
    }

    createPopAnimation(bubble) {
        const pos = bubble.body.getPosition();
        const x = toPixels(pos.x, C.PHYSICS_SCALE);
        const y = toPixels(pos.y, C.PHYSICS_SCALE);
        const radius = toPixels(bubble.radius, C.PHYSICS_SCALE);

        // Create particles
        const particles = [];
        const numParticles = 8;

        for (let i = 0; i < numParticles; i++) {
            const angle = (i / numParticles) * Math.PI * 2;
            const particle = new PIXI.Graphics();
            particle.circle(0, 0, radius * 0.2);
            particle.fill({ color: bubble.color, alpha: 0.8 });
            particle.x = x;
            particle.y = y;
            particle.vx = Math.cos(angle) * 3;
            particle.vy = Math.sin(angle) * 3;
            this.effectsLayer.addChild(particle);
            particles.push(particle);
        }

        // Ring effect
        const ring = new PIXI.Graphics();
        ring.circle(0, 0, radius);
        ring.stroke({ color: bubble.color, width: 3, alpha: 0.8 });
        ring.x = x;
        ring.y = y;
        this.effectsLayer.addChild(ring);

        this.popAnimations.push({
            particles,
            ring,
            startTime: performance.now(),
            duration: C.POP_ANIMATION_DURATION
        });
    }

    updatePopAnimations() {
        const now = performance.now();

        this.popAnimations = this.popAnimations.filter(anim => {
            const elapsed = now - anim.startTime;
            const progress = Math.min(elapsed / anim.duration, 1);

            if (progress >= 1) {
                // Cleanup
                anim.particles.forEach(p => this.effectsLayer.removeChild(p));
                this.effectsLayer.removeChild(anim.ring);
                return false;
            }

            const ease = easeOutCubic(progress);

            // Update particles
            anim.particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.alpha = 1 - ease;
                p.scale.set(1 - ease * 0.5);
            });

            // Update ring
            anim.ring.scale.set(1 + ease * 0.5);
            anim.ring.alpha = 1 - ease;

            return true;
        });
    }

    spawnDeterministicBubble(slotIndex) {
        if (!this.isReady || this.poppedIndices.has(slotIndex) || this.isDestroyed) return;
        if (this.bubbles.has(slotIndex)) return;

        // Use the syncSeed + slotIndex to create a deterministic PRNG for this bubble
        const prng = createPRNG(this.syncSeed + slotIndex);

        const radius = C.BUBBLE_MIN_RADIUS + prng() * (C.BUBBLE_MAX_RADIUS - C.BUBBLE_MIN_RADIUS);
        const x = radius + prng() * (C.WORLD_WIDTH - radius * 2);

        // Deterministic individual speed and gravity
        const fallSpeed = C.BUBBLE_MIN_FALL_SPEED + prng() * (C.BUBBLE_MAX_FALL_SPEED - C.BUBBLE_MIN_FALL_SPEED);
        const bubbleGravity = C.BUBBLE_MIN_GRAVITY + prng() * (C.BUBBLE_MAX_GRAVITY - C.BUBBLE_MIN_GRAVITY);

        // Deterministic color pick
        const colorIndex = Math.floor(prng() * C.BUBBLE_COLORS.length);
        const color = C.BUBBLE_COLORS[colorIndex];

        // Calculate initial Y based on time elapsed since this slot
        const spawnTime = slotIndex * C.BUBBLE_SPAWN_INTERVAL;
        const currentTime = Date.now();
        const elapsed = (currentTime - spawnTime) / 1000; // seconds

        // Initial spawn Y is just above the top of the screen
        const startY = -radius;
        // y = y0 + v0*t + 0.5*g*t^2
        const currentY = startY + (fallSpeed * elapsed) + (0.5 * bubbleGravity * elapsed * elapsed);

        // If the bubble is already off-screen at the bottom, don't spawn
        if (currentY > C.WORLD_HEIGHT + radius) return;

        // Create physics body
        const body = this.world.createBody({
            type: 'kinematic',
            position: planck.Vec2(x, currentY)
        });

        body.createFixture(planck.Circle(radius), { isSensor: true });
        body.setUserData({ type: 'bubble', id: slotIndex });

        const sprite = this.createBubbleSprite(radius, color);
        sprite.x = toPixels(x, C.PHYSICS_SCALE);
        sprite.y = toPixels(currentY, C.PHYSICS_SCALE);

        this.bubbleLayer.addChild(sprite);
        this.bubbles.set(slotIndex, {
            body,
            sprite,
            radius,
            color,
            fallSpeed,
            bubbleGravity,
            spawnTime
        });
    }

    createBubbleSprite(radius, color) {
        const pixelRadius = toPixels(radius, C.PHYSICS_SCALE);
        const graphics = new PIXI.Graphics();

        // Gradient-like effect with multiple circles
        graphics.circle(0, 0, pixelRadius);
        graphics.fill({ color, alpha: 0.6 });

        // Inner highlight
        graphics.circle(-pixelRadius * 0.2, -pixelRadius * 0.2, pixelRadius * 0.7);
        graphics.fill({ color: 0xFFFFFF, alpha: 0.2 });

        // Small shine
        graphics.circle(-pixelRadius * 0.3, -pixelRadius * 0.3, pixelRadius * 0.2);
        graphics.fill({ color: 0xFFFFFF, alpha: 0.4 });

        // Outer glow
        graphics.circle(0, 0, pixelRadius * 1.1);
        graphics.stroke({ color, width: 2, alpha: 0.3 });

        return graphics;
    }

    addPlayer(playerId, avatarSeed, isOwn = false) {
        if (!this.isReady) {
            this.pendingPlayers.push({ playerId, avatarSeed, isOwn });
            return;
        }
        if (this.players.has(playerId)) return;

        // Deterministic initial position based on playerId hash
        // This ensures all clients spawn the player at the same location regardless of join order
        const hash = hashString(playerId);
        const normalizedHash = (Math.abs(hash) % 1000) / 1000;
        const x = C.AVATAR_RADIUS + normalizedHash * (C.WORLD_WIDTH - C.AVATAR_RADIUS * 2);
        const y = C.WORLD_HEIGHT - C.AVATAR_RADIUS - 0.1;

        // Create physics body
        const body = this.world.createDynamicBody({
            position: planck.Vec2(x, y),
            linearDamping: C.AVATAR_LINEAR_DAMPING,
            fixedRotation: true
        });

        body.createFixture(
            planck.Circle(C.AVATAR_RADIUS),
            {
                density: C.AVATAR_DENSITY,
                friction: C.AVATAR_FRICTION,
                restitution: C.AVATAR_RESTITUTION
            }
        );

        body.setUserData({ type: 'avatar', playerId });

        // Create avatar sprite container
        const sprite = new PIXI.Container();

        // Background circle
        const bg = new PIXI.Graphics();
        bg.circle(0, 0, C.AVATAR_PIXEL_RADIUS);
        bg.fill({ color: isOwn ? 0x22d3ee : 0x8b5cf6, alpha: 0.3 });
        bg.stroke({ color: isOwn ? 0x22d3ee : 0xa855f7, width: 3, alpha: 0.8 });
        sprite.addChild(bg);

        // Create avatar image using animal-avatar-generator
        const avatarSvg = avatar(avatarSeed || 'random', {
            size: 150, // Slightly higher res for better quality
            blackout: true
        });

        // Use Blob and URL for more reliable loading in PixiJS v8
        const svgBlob = new Blob([avatarSvg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        // Load through Image to ensure it works across all platforms
        const img = new Image();
        const avatarSprite = new PIXI.Sprite();
        avatarSprite.anchor.set(0.5);
        avatarSprite.width = C.AVATAR_PIXEL_RADIUS * 1.9;
        avatarSprite.height = C.AVATAR_PIXEL_RADIUS * 1.9;
        sprite.addChild(avatarSprite);

        img.onload = () => {
            if (this.isDestroyed) {
                URL.revokeObjectURL(url);
                return;
            }
            avatarSprite.texture = PIXI.Texture.from(img);
            URL.revokeObjectURL(url);
        };
        img.onerror = (err) => {
            console.error('Failed to load avatar image:', err);
            URL.revokeObjectURL(url);
        };
        img.src = url;

        // Store avatar seed for later use
        sprite.avatarSeed = avatarSeed;
        sprite.isOwn = isOwn;

        // Add score text overlay
        const initialCount = this.serverState?.popCounts?.[playerId] || 0;
        const scoreText = new PIXI.Text({
            text: initialCount.toString(),
            style: {
                fontFamily: 'Arial Black, sans-serif',
                fontSize: 16,
                fill: 0xffffff,
                align: 'center',
                stroke: { color: 0x000000, width: 4, join: 'round' }
            }
        });
        scoreText.anchor.set(0.5);
        scoreText.x = C.AVATAR_PIXEL_RADIUS * 0.7;
        scoreText.y = -C.AVATAR_PIXEL_RADIUS * 0.7;
        sprite.addChild(scoreText);

        sprite.x = toPixels(x, C.PHYSICS_SCALE);
        sprite.y = toPixels(y, C.PHYSICS_SCALE);

        this.avatarLayer.addChild(sprite);
        this.players.set(playerId, {
            body,
            sprite,
            avatar: avatarSeed,
            isGrounded: true,
            popCount: initialCount,
            scoreText
        });

        // If this is our own player, check initial grounded state
        if (isOwn) {
            this.selfId = playerId;
            this.lastGroundedState = true;
            this.onGroundedChange(true);
        }
    }

    removePlayer(playerId) {
        const player = this.players.get(playerId);
        if (!player) return;

        this.world.destroyBody(player.body);
        this.avatarLayer.removeChild(player.sprite);
        this.players.delete(playerId);
    }

    isPlayerGrounded(playerId) {
        const player = this.players.get(playerId);
        if (!player) return false;

        const pos = player.body.getPosition();
        const vel = player.body.getLinearVelocity();
        const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);

        return pos.y >= C.GROUNDED_Y_THRESHOLD && speed < C.GROUNDED_VELOCITY_THRESHOLD;
    }

    canLaunch(playerId) {
        return this.isPlayerGrounded(playerId);
    }

    launchAvatar(playerId, angle, power) {
        if (!this.isReady) return false;
        const player = this.players.get(playerId);
        if (!player) return false;

        if (!this.canLaunch(playerId)) return false;

        // Clamp power
        const clampedPower = clamp(power, C.MIN_LAUNCH_POWER, C.MAX_LAUNCH_POWER);

        // Calculate velocity from angle and power
        const vx = Math.cos(angle) * clampedPower;
        const vy = Math.sin(angle) * clampedPower;

        player.body.setLinearVelocity(planck.Vec2(vx, vy));

        // Mark as not grounded immediately
        player.isGrounded = false;

        if (playerId === this.selfId) {
            this.lastGroundedState = false;
            this.onGroundedChange(false);
        }

        return true;
    }

    /**
     * Reconcile remote player state with soft interpolation
     */
    syncPlayerState(playerId, state) {
        if (playerId === this.selfId) return;

        const player = this.players.get(playerId);
        if (!player) return;

        const { x, y, vx, vy } = state;
        const currentPos = player.body.getPosition();

        // Distance check for hard snap vs soft interpolation
        const dist = Math.sqrt(Math.pow(x - currentPos.x, 2) + Math.pow(y - currentPos.y, 2));

        if (dist > 2.0) {
            // Hard snap if too far off
            player.body.setPosition(planck.Vec2(x, y));
            player.body.setLinearVelocity(planck.Vec2(vx, vy));
        } else if (dist > 0.05) {
            // Soft interpolation for minor drift
            // Gently move towards the target position
            const targetPos = planck.Vec2(
                currentPos.x + (x - currentPos.x) * 0.3,
                currentPos.y + (y - currentPos.y) * 0.3
            );
            player.body.setPosition(targetPos);

            // Also blend velocities
            const currentVel = player.body.getLinearVelocity();
            const targetVel = planck.Vec2(
                currentVel.x + (vx - currentVel.x) * 0.2,
                currentVel.y + (vy - currentVel.y) * 0.2
            );
            player.body.setLinearVelocity(targetVel);
        }
    }

    update() {
        if (!this.isReady || !this.world || this.isDestroyed) return;

        // Check for new deterministic bubble slots
        const currentSlot = Math.floor(Date.now() / C.BUBBLE_SPAWN_INTERVAL);
        if (currentSlot > this.lastSlotIndex) {
            this.spawnDeterministicBubble(currentSlot);
            this.lastSlotIndex = currentSlot;
        }

        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 1 / 30); // Cap at 30fps minimum
        this.lastTime = now;

        // Periodic state sync for our own player
        if (this.selfId && now - this.lastSyncTime > C.STATE_SYNC_INTERVAL) {
            const self = this.players.get(this.selfId);
            if (self && !self.isGrounded) {
                const pos = self.body.getPosition();
                const v = self.body.getLinearVelocity();
                this.onStateSync({
                    playerId: this.selfId,
                    x: pos.x,
                    y: pos.y,
                    vx: v.x,
                    vy: v.y
                });
                this.lastSyncTime = now;
            }
        }

        // Step physics
        this.world.step(dt, 8, 3);

        // Update bubble positions (downward fall with gravity)
        this.bubbles.forEach((bubble, slotIndex) => {
            const pos = bubble.body.getPosition();
            const elapsed = (Date.now() - bubble.spawnTime) / 1000;

            // Deterministic wobble
            const prng = createPRNG(this.syncSeed + slotIndex);
            const wobbleSeed = prng() * 100;
            const wobble = Math.sin(now / 1000 + wobbleSeed) * 0.01;

            // v = v0 + g * t
            const currentVelocityY = bubble.fallSpeed + (bubble.bubbleGravity * elapsed);
            bubble.body.setLinearVelocity(planck.Vec2(wobble, currentVelocityY));

            // Remove if way off screen (bottom)
            if (pos.y > C.WORLD_HEIGHT + bubble.radius + 1) {
                this.world.destroyBody(bubble.body);
                this.bubbleLayer.removeChild(bubble.sprite);
                this.bubbles.delete(slotIndex);
                return;
            }

            // Update sprite position
            bubble.sprite.x = toPixels(pos.x, C.PHYSICS_SCALE);
            bubble.sprite.y = toPixels(pos.y, C.PHYSICS_SCALE);

            // Gentle pulsing
            const pulse = 1 + Math.sin(now / 500 + pos.x * 2) * 0.05;
            bubble.sprite.scale.set(pulse);
        });

        // Update avatar positions
        this.players.forEach((player, playerId) => {
            const pos = player.body.getPosition();
            const vel = player.body.getLinearVelocity();
            const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);

            // Stability logic: if near floor and moving slowly, settle it
            if (pos.y >= C.GROUNDED_Y_THRESHOLD && speed < C.GROUNDED_VELOCITY_THRESHOLD * 1.5) {
                // Apply extra damping to vertical velocity to stop the bounce
                if (Math.abs(vel.y) > 0.1) {
                    player.body.setLinearVelocity(planck.Vec2(vel.x, vel.y * 0.8));
                }

                // If it's very close to floor and almost stopped, snap it to ground precisely
                if (pos.y >= C.WORLD_HEIGHT - C.AVATAR_RADIUS - 0.1 && speed < 0.2) {
                    player.body.setLinearVelocity(planck.Vec2(0, 0));
                    player.body.setPosition(planck.Vec2(pos.x, C.WORLD_HEIGHT - C.AVATAR_RADIUS));
                }
            }

            player.sprite.x = toPixels(pos.x, C.PHYSICS_SCALE);
            player.sprite.y = toPixels(pos.y, C.PHYSICS_SCALE);

            // Check grounded state for own player
            if (playerId === this.selfId) {
                const isGrounded = this.isPlayerGrounded(playerId);
                if (isGrounded !== this.lastGroundedState) {
                    this.lastGroundedState = isGrounded;
                    this.onGroundedChange(isGrounded);
                }
            }

            // Slight squash/stretch based on velocity
            const squash = 1 + Math.min(speed * 0.02, 0.2);

            if (vel.y < 0) {
                // Going up - stretch vertically
                player.sprite.scale.set(1 / Math.sqrt(squash), squash);
            } else if (vel.y > 0) {
                // Going down - squash horizontally
                player.sprite.scale.set(squash, 1 / Math.sqrt(squash));
            } else {
                player.sprite.scale.set(1, 1);
            }
        });

        // Update pop animations
        this.updatePopAnimations();
    }

    getAvatarPosition(playerId) {
        const player = this.players.get(playerId);
        if (!player) return null;

        const pos = player.body.getPosition();
        return {
            x: toPixels(pos.x, C.PHYSICS_SCALE),
            y: toPixels(pos.y, C.PHYSICS_SCALE)
        };
    }

    resize(width, height) {
        if (!this.app) return;

        const size = Math.min(width, height);
        this.app.renderer.resize(size, size);
    }

    destroy() {
        this.isDestroyed = true;
        this.isReady = false;

        if (this.bubbleSpawnTimer) {
            clearInterval(this.bubbleSpawnTimer);
            this.bubbleSpawnTimer = null;
        }

        if (this.app) {
            // PixiJS v8 destroy is sync but takes options
            try {
                // Only destroy if renderer exists to avoid "undefined is not an object"
                if (this.app.renderer) {
                    this.app.destroy(true, { children: true, texture: true });
                }
            } catch (e) {
                console.warn('Error destroying PixiJS app:', e);
            }
            this.app = null;
        }

        if (this.world) {
            this.world = null;
        }

        this.container = null;
    }
}
