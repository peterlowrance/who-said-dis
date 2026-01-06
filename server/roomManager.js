const GameState = require('./gameState');

class RoomManager {
    constructor() {
        this.rooms = new Map(); // roomCode -> GameState
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
        return { code, gameState };
    }

    getRoom(code) {
        return this.rooms.get(code.toUpperCase());
    }

    removeRoom(code) {
        this.rooms.delete(code);
    }
}

module.exports = RoomManager;
