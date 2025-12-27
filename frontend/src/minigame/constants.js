// Minigame Physics & Rendering Constants

// Canvas dimensions (10:11 ratio for very subtle vertical lean)
export const CANVAS_WIDTH = 400;
export const CANVAS_HEIGHT = 440;

// Physics world settings (planck uses meters, we use pixels and scale)
export const PHYSICS_SCALE = 30; // pixels per meter
export const GRAVITY = 15; // m/s² - moderate gravity for playful feel

// World boundaries (in physics units)
export const WORLD_WIDTH = CANVAS_WIDTH / PHYSICS_SCALE;
export const WORLD_HEIGHT = CANVAS_HEIGHT / PHYSICS_SCALE;

// Avatar settings
export const AVATAR_RADIUS = 0.72; // meters (physics) - increased by 20%
export const AVATAR_PIXEL_RADIUS = AVATAR_RADIUS * PHYSICS_SCALE;
export const AVATAR_RESTITUTION = 0.7; // bounciness
export const AVATAR_FRICTION = 0.3;
export const AVATAR_DENSITY = 1.0;
export const AVATAR_LINEAR_DAMPING = 0.8; // Increased from 0.5 to help settle faster

// Grounded detection
export const GROUNDED_VELOCITY_THRESHOLD = 1.0; // Increased from 0.5 for more stability
export const GROUNDED_Y_THRESHOLD = WORLD_HEIGHT - AVATAR_RADIUS - 0.5; // Increased range to catch bounces early

// Launch settings
export const MIN_LAUNCH_POWER = 5; // minimum velocity magnitude
export const MAX_LAUNCH_POWER = 28; // maximum velocity magnitude
export const LAUNCH_DRAG_SCALE = 0.4; // increased from 0.15 for better mobile sensitivity

// Bubble settings
export const BUBBLE_MIN_RADIUS = 0.4; // meters
export const BUBBLE_MAX_RADIUS = 0.8;
export const BUBBLE_SPAWN_INTERVAL = 2000; // ms
export const MAX_BUBBLES = 15;
export const BUBBLE_MIN_FALL_SPEED = 0.2; // starting downward velocity
export const BUBBLE_MAX_FALL_SPEED = 0.8;
export const BUBBLE_MIN_GRAVITY = 0.05; // gentle acceleration
export const BUBBLE_MAX_GRAVITY = 0.2;

// Bubble Y spawn range (no longer used for spawn location, but maybe for reference)
export const BUBBLE_SPAWN_Y_MIN = WORLD_HEIGHT * 0.2;
export const BUBBLE_SPAWN_Y_MAX = WORLD_HEIGHT * 0.7;

// Wall settings
export const WALL_RESTITUTION = 0.9; // very bouncy walls
export const FLOOR_RESTITUTION = 0.0; // no bounce on the floor

// Colors
export const BUBBLE_COLORS = [
    0xFF6B9D, // Pink
    0x9D6BFF, // Purple
    0x6BB8FF, // Blue
    0x6BFFC4, // Mint
    0xFFE66B, // Yellow
    0xFF9D6B, // Orange
];

export const BACKGROUND_COLOR = 0x1a0a2e; // Dark purple, matches game theme

// Animation timings
export const POP_ANIMATION_DURATION = 300; // ms
export const AVATAR_TRAIL_DURATION = 150; // ms

// Sync settings
export const STATE_SYNC_INTERVAL = 500; // ms - frequency of position/velocity sync

