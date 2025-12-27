import React, { useRef, useEffect, useState, useCallback } from 'react';
import { BubblePopEngine } from './BubblePopEngine.js';
import * as C from './constants.js';
import { distance, angle, clamp } from './utils.js';

/**
 * BubblePopGame - React wrapper for the bubble popping minigame
 * Handles slingshot UI, multiplayer sync, and lifecycle management
 */
export function BubblePopGame({ socket, selfId, syncSeed, myAvatar, otherPlayers = [] }) {
    const containerRef = useRef(null);
    const engineRef = useRef(null);
    const [engineReady, setEngineReady] = useState(false);
    const [popCount, setPopCount] = useState(0);
    const [isGrounded, setIsGrounded] = useState(true);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState(null);
    const [dragEnd, setDragEnd] = useState(null);

    // Initialize engine
    useEffect(() => {
        if (!containerRef.current || engineRef.current) return;

        console.log('Initializing BubblePopEngine...');
        const engine = new BubblePopEngine(containerRef.current, {
            selfId,
            syncSeed,
            onPop: (playerId, bubbleId, newScore) => {
                if (playerId === selfId) {
                    setPopCount(newScore);
                    socket?.emit('minigame_bubble_popped', { playerId, bubbleId });
                }
            },
            onGroundedChange: (grounded) => {
                setIsGrounded(grounded);
            },
            onStateSync: (state) => {
                socket?.emit('minigame_state_sync', state);
            }
        });

        engineRef.current = engine;

        // Wait for engine to be ready before showing UI
        engine.ready.then(() => {
            setEngineReady(true);
        });

        // Methods are safe to call immediately as the engine queues them internally
        engine.addPlayer(selfId, myAvatar, true);
        otherPlayers.forEach(p => {
            engine.addPlayer(p.id, p.avatar, false);
        });

        return () => {
            if (engineRef.current) {
                console.log('Destroying BubblePopEngine...');
                engineRef.current.destroy();
                engineRef.current = null;
            }
        };
    }, [selfId, myAvatar]);

    // Handle other players joining/leaving
    useEffect(() => {
        if (!engineRef.current) return;

        const currentPlayerIds = new Set(otherPlayers.map(p => p.id));

        // Add new players
        otherPlayers.forEach(p => {
            if (!engineRef.current.players.has(p.id)) {
                engineRef.current.addPlayer(p.id, p.avatar, false);
            }
        });

        // Could also remove players who left, but for waiting game it's not critical
    }, [otherPlayers]);

    // Socket listeners for multiplayer
    useEffect(() => {
        if (!socket) return;

        const handleOtherLaunch = ({ playerId, angle: launchAngle, power }) => {
            if (playerId !== selfId && engineRef.current) {
                engineRef.current.launchAvatar(playerId, launchAngle, power);
            }
        };

        const handlePlayerJoined = ({ playerId, avatar }) => {
            if (playerId !== selfId && engineRef.current) {
                engineRef.current.addPlayer(playerId, avatar, false);
            }
        };

        const handleBubblePopped = ({ playerId, bubbleId }) => {
            if (playerId !== selfId && engineRef.current) {
                engineRef.current.handleBubblePop(bubbleId, playerId, false);
            }
        };

        const handleStateSync = (state) => {
            if (state.playerId !== selfId && engineRef.current) {
                engineRef.current.syncPlayerState(state.playerId, state);
            }
        };

        const handleScores = (popCounts) => {
            if (engineRef.current) {
                engineRef.current.syncScores(popCounts);
            }
            if (popCounts[selfId] !== undefined) {
                setPopCount(prev => Math.max(prev, popCounts[selfId]));
            }
        };

        const handleFullMinigameState = (state) => {
            if (engineRef.current) {
                engineRef.current.syncMinigameState(state);
            }
            if (state?.popCounts?.[selfId] !== undefined) {
                setPopCount(prev => Math.max(prev, state.popCounts[selfId]));
            }
        };

        socket.on('minigame_launch', handleOtherLaunch);
        socket.on('minigame_player_joined', handlePlayerJoined);
        socket.on('minigame_bubble_popped', handleBubblePopped);
        socket.on('minigame_state_sync', handleStateSync);
        socket.on('minigame_state', handleFullMinigameState);
        socket.on('minigame_scores', handleScores);

        // Announce that we joined the minigame
        socket.emit('minigame_join', { playerId: selfId });

        return () => {
            socket.off('minigame_launch', handleOtherLaunch);
            socket.off('minigame_player_joined', handlePlayerJoined);
            socket.off('minigame_bubble_popped', handleBubblePopped);
            socket.off('minigame_state_sync', handleStateSync);
            socket.off('minigame_state', handleFullMinigameState);
            socket.off('minigame_scores', handleScores);
        };
    }, [socket, selfId]);

    // Get container coordinates
    const getEventPosition = useCallback((e) => {
        if (!containerRef.current) return null;

        const rect = containerRef.current.getBoundingClientRect();
        const scaleX = C.CANVAS_WIDTH / rect.width;
        const scaleY = C.CANVAS_HEIGHT / rect.height;

        let clientX, clientY;
        if (e.touches) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }, []);

    // Drag handlers
    const handleDragStart = useCallback((e) => {
        if (!isGrounded || !engineRef.current) return;

        const pos = getEventPosition(e);
        if (!pos) return;

        // Check if near own avatar
        const avatarPos = engineRef.current.getAvatarPosition(selfId);
        if (!avatarPos) return;

        const dist = distance(pos.x, pos.y, avatarPos.x, avatarPos.y);
        if (dist < C.AVATAR_PIXEL_RADIUS * 2) {
            setIsDragging(true);
            setDragStart(avatarPos);
            setDragEnd(pos);
            e.preventDefault();
        }
    }, [isGrounded, selfId, getEventPosition]);

    const handleDragMove = useCallback((e) => {
        if (!isDragging) return;

        const pos = getEventPosition(e);
        if (pos) {
            setDragEnd(pos);
        }
        e.preventDefault();
    }, [isDragging, getEventPosition]);

    const handleDragEnd = useCallback((e) => {
        if (!isDragging || !dragStart || !dragEnd) {
            setIsDragging(false);
            setDragStart(null);
            setDragEnd(null);
            return;
        }

        // Calculate launch direction (opposite of drag)
        const dx = dragStart.x - dragEnd.x;
        const dy = dragStart.y - dragEnd.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 20 && engineRef.current) {
            // Calculate angle and power
            const launchAngle = Math.atan2(dy, dx);
            const power = clamp(dist * C.LAUNCH_DRAG_SCALE, C.MIN_LAUNCH_POWER, C.MAX_LAUNCH_POWER);

            // Launch locally
            if (engineRef.current.launchAvatar(selfId, launchAngle, power)) {
                // Emit to server for other players
                socket?.emit('minigame_launch', {
                    playerId: selfId,
                    angle: launchAngle,
                    power
                });
            }
        }

        setIsDragging(false);
        setDragStart(null);
        setDragEnd(null);
    }, [isDragging, dragStart, dragEnd, selfId, socket]);

    // Handle global drag move/end to allow pulling outside the container
    useEffect(() => {
        if (!isDragging) return;

        const onWindowMouseMove = (e) => handleDragMove(e);
        const onWindowMouseUp = (e) => handleDragEnd(e);
        const onWindowTouchMove = (e) => handleDragMove(e);
        const onWindowTouchEnd = (e) => handleDragEnd(e);

        window.addEventListener('mousemove', onWindowMouseMove);
        window.addEventListener('mouseup', onWindowMouseUp);
        window.addEventListener('touchmove', onWindowTouchMove, { passive: false });
        window.addEventListener('touchend', onWindowTouchEnd);

        return () => {
            window.removeEventListener('mousemove', onWindowMouseMove);
            window.removeEventListener('mouseup', onWindowMouseUp);
            window.removeEventListener('touchmove', onWindowTouchMove);
            window.removeEventListener('touchend', onWindowTouchEnd);
        };
    }, [isDragging, handleDragMove, handleDragEnd]);

    // Calculate aim line for rendering
    const getAimLine = () => {
        if (!isDragging || !dragStart || !dragEnd) return null;

        const dx = dragStart.x - dragEnd.x;
        const dy = dragStart.y - dragEnd.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 20) return null;

        // Power indicator (color shifts from blue to red)
        const power = clamp(dist * C.LAUNCH_DRAG_SCALE, C.MIN_LAUNCH_POWER, C.MAX_LAUNCH_POWER);
        const powerRatio = (power - C.MIN_LAUNCH_POWER) / (C.MAX_LAUNCH_POWER - C.MIN_LAUNCH_POWER);

        // Line from avatar toward launch direction
        // Cap visual length at the maximum power distance
        const maxDist = C.MAX_LAUNCH_POWER / C.LAUNCH_DRAG_SCALE;
        const lineLength = Math.min(dist, maxDist);
        const endX = dragStart.x + (dx / dist) * lineLength;
        const endY = dragStart.y + (dy / dist) * lineLength;

        return {
            x1: dragStart.x,
            y1: dragStart.y,
            x2: endX,
            y2: endY,
            powerRatio
        };
    };

    const aimLine = getAimLine();

    return (
        <div className="relative w-full aspect-[10/11] select-none touch-none">
            {/* Game canvas container */}
            <div
                ref={containerRef}
                className="w-full h-full overflow-hidden border-t border-white/10 rounded-b-xl"
                onMouseDown={handleDragStart}
                onTouchStart={handleDragStart}
            />

            {/* Loading state */}
            {!engineReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm z-10">
                    <div className="animate-spin text-4xl mb-2">🌀</div>
                    <p className="text-white font-bold opacity-70">Initializing minigame...</p>
                </div>
            )}

            {/* Aim line overlay */}
            {engineReady && aimLine && (
                <svg
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    viewBox={`0 0 ${C.CANVAS_WIDTH} ${C.CANVAS_HEIGHT}`}
                >
                    {/* Trajectory line */}
                    <line
                        x1={aimLine.x1}
                        y1={aimLine.y1}
                        x2={aimLine.x2}
                        y2={aimLine.y2}
                        stroke={`hsl(${200 - aimLine.powerRatio * 200}, 80%, 50%)`}
                        strokeWidth="4"
                        strokeDasharray="10 5"
                        strokeLinecap="round"
                    />
                    {/* Arrow head */}
                    <circle
                        cx={aimLine.x2}
                        cy={aimLine.y2}
                        r="8"
                        fill={`hsl(${200 - aimLine.powerRatio * 200}, 80%, 50%)`}
                    />
                    {/* Power indicator at drag point */}
                    <circle
                        cx={dragEnd?.x || 0}
                        cy={dragEnd?.y || 0}
                        r="12"
                        fill="none"
                        stroke="white"
                        strokeWidth="2"
                        opacity="0.5"
                    />
                </svg>
            )}

            {/* Pop counter - simple number in top right */}
            {engineReady && (
                <div className="absolute top-4 right-5 text-4xl font-black text-white/30 pointer-events-none select-none">
                    {popCount}
                </div>
            )}

            {/* Grounded indicator / instructions */}
            {engineReady && (
                <div className={`absolute top-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-sm font-bold transition-all duration-300 ${isGrounded
                    ? 'bg-green-500/30 border border-green-500/50 text-green-200'
                    : 'bg-white/10 border border-white/20 text-white/50'
                    }`}>
                    {isGrounded ? 'Pull down to launch!' : 'Flying...'}
                </div>
            )}
        </div>
    );
}
