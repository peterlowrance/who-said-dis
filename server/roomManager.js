const GameState = require('./gameState');

class RoomManager {
    constructor() {
        this.rooms = new Map(); // roomCode -> GameState
        this.cleanupTimeouts = new Map(); // roomCode -> TimeoutID
    }

    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Removed I, O to avoid confusion
        let result = '';
        for (let i = 0; i < 4; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    createRoom() {
        let code = this.generateRoomCode();
        while (this.rooms.has(code)) {
            code = this.generateRoomCode();
        }
        
        const gameState = new GameState();
        this.rooms.set(code, gameState);
        
        // Schedule cleanup initially (in case created but nobody joins)
        this.scheduleCleanup(code);
        
        return { code, gameState };
    }

    getRoom(code) {
        const cleanCode = code.toUpperCase();
        const room = this.rooms.get(cleanCode);
        
        // If the room is accessed, it's active. Cancel pending deletion.
        if (room) {
            this.cancelCleanup(cleanCode);
        }
        return room;
    }

    removeRoom(code) {
        this.cancelCleanup(code);
        this.rooms.delete(code);
        console.log(`Room ${code} deleted.`);
    }

    scheduleCleanup(code) {
        if (this.cleanupTimeouts.has(code)) return; // Already scheduled

        console.log(`Room ${code} is empty. Scheduled for deletion in 30 minutes.`);
        const timeout = setTimeout(() => {
            this.removeRoom(code);
        }, 30 * 60 * 1000); // 30 minutes

        this.cleanupTimeouts.set(code, timeout);
    }

    cancelCleanup(code) {
        if (this.cleanupTimeouts.has(code)) {
            clearTimeout(this.cleanupTimeouts.get(code));
            this.cleanupTimeouts.delete(code);
            console.log(`Room ${code} became active. Deletion cancelled.`);
        }
    }
}

module.exports = RoomManager;
