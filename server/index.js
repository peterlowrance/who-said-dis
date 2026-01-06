const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const RoomManager = require('./roomManager');

const app = express();
// Security headers (disable CSP for easier React/Vite integration)
app.use(helmet({ contentSecurityPolicy: false }));
// Compress all responses
app.use(compression());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all for LAN
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;
const roomManager = new RoomManager();

// Serve static files from frontend build
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// API to get local IP (optional, for display)
app.get('/api/ip', (req, res) => {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    const results = {};

    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                if (!results[name]) {
                    results[name] = [];
                }
                results[name].push(net.address);
            }
        }
    }
    res.json(results);
});

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // --- Helper Functions ---

    const getRoomContext = () => {
        const roomCode = socket.data.roomCode;
        if (!roomCode) return null;
        const gameState = roomManager.getRoom(roomCode);
        return gameState ? { roomCode, gameState } : null;
    };

    const findActivePlayerOrHeal = (gameState, socketId, providedPlayerId) => {
        // 1. Try to find by socket ID (standard)
        let player = gameState.players.find(p => p.socketId === socketId);
        if (player) return player;

        // 2. If not found, try to heal using provided playerId
        if (providedPlayerId) {
            player = gameState.players.find(p => p.id === providedPlayerId);
            if (player) {
                console.log(`Connection Healing: Player ${player.name} (${player.id}) rejoined implicitly from new socket ${socketId}`);
                player.socketId = socketId;
                player.connected = true;
                player.disconnectedAt = null; 
                return player;
            }
        }
        return null;
    };

    // --- Room Management Events ---

    socket.on('create_room', () => {
        const { code, gameState } = roomManager.createRoom();
        socket.join(code);
        socket.data.roomCode = code;
        socket.emit('room_joined', { code, state: gameState });
        console.log(`Room created: ${code}`);
    });

    socket.on('join_room', ({ code }) => {
        if (!code) return socket.emit('error', { message: 'No room code provided' });
        
        const gameState = roomManager.getRoom(code);
        if (gameState) {
            socket.join(gameState.roomCode || code.toUpperCase()); // Ensure consistent casing
            socket.data.roomCode = code.toUpperCase();
            socket.emit('room_joined', { code: code.toUpperCase(), state: gameState });
            console.log(`User joined room: ${code}`);
        } else {
            socket.emit('room_error', { message: 'Room not found' });
        }
    });

    // --- Game Events ---

    socket.on('join_game', ({ name, avatar }) => {
        const ctx = getRoomContext();
        if (!ctx) return;
        const { roomCode, gameState } = ctx;

        const player = gameState.addPlayer(socket.id, name, avatar);
        io.to(roomCode).emit('state_update', gameState);
        socket.emit('join_success', player); 
    });

    socket.on('rejoin_game', ({ playerId, roomCode: providedRoomCode }) => {
        // If we are reconnecting, we might not be in the room yet.
        // Use provided roomCode to restore context.
        if (!socket.data.roomCode && providedRoomCode) {
            const gameState = roomManager.getRoom(providedRoomCode);
            if (gameState) {
                socket.join(gameState.roomCode || providedRoomCode.toUpperCase());
                socket.data.roomCode = providedRoomCode.toUpperCase();
            }
        }

        const ctx = getRoomContext();
        if (!ctx) {
            // If still no context, we can't rejoin
            socket.emit('rejoin_failed');
            return;
        }
        const { roomCode, gameState } = ctx;

        const player = gameState.rejoinPlayer(socket.id, playerId);
        if (player) {
            socket.emit('join_success', player);
            io.to(roomCode).emit('state_update', gameState);
        } else {
            socket.emit('rejoin_failed');
        }
    });

    socket.on('leave_game', () => {
        const ctx = getRoomContext();
        if (!ctx) return;
        const { roomCode, gameState } = ctx;

        gameState.removePlayer(socket.id);
        io.to(roomCode).emit('state_update', gameState);
        // We don't necessarily leave the socket room, just the game state
    });

    socket.on('start_game', () => {
        const ctx = getRoomContext();
        if (!ctx) return;
        const { roomCode, gameState } = ctx;

        if (gameState.startGame()) {
            io.to(roomCode).emit('state_update', gameState);
        }
    });

    socket.on('reveal_answer', ({ playerId } = {}) => {
        const ctx = getRoomContext();
        if (!ctx) return;
        const { roomCode, gameState } = ctx;

        const player = findActivePlayerOrHeal(gameState, socket.id, playerId);
        if (!player) return;

        if (gameState.currentRound.readerId !== player.id) return;

        if (gameState.revealNextAnswer()) {
            io.to(roomCode).emit('state_update', gameState);
        }
    });

    socket.on('submit_answer', ({ text, playerId }) => {
        const ctx = getRoomContext();
        if (!ctx) return;
        const { roomCode, gameState } = ctx;

        const player = findActivePlayerOrHeal(gameState, socket.id, playerId);

        if (player && gameState.submitAnswer(player.id, text)) {
            io.to(roomCode).emit('state_update', gameState);
        }
    });

    socket.on('make_guess', ({ targetPlayerId, answerText, playerId }) => {
        const ctx = getRoomContext();
        if (!ctx) return;
        const { roomCode, gameState } = ctx;

        const player = findActivePlayerOrHeal(gameState, socket.id, playerId);
        if (!player) return;

        const result = gameState.makeGuess(player.id, targetPlayerId, answerText);

        io.to(roomCode).emit('guess_result', result);

        if (result.success) {
            io.to(roomCode).emit('state_update', gameState);

            if (gameState.status === 'ROUND_OVER') {
                setTimeout(() => {
                    // Re-fetch state to be safe, though closure captures current
                    if (gameState.status === 'ROUND_OVER') {
                        gameState.nextRound();
                        io.to(roomCode).emit('state_update', gameState);
                    }
                }, 3500);
            }
        }
    });

    socket.on('next_round', ({ playerId } = {}) => {
        const ctx = getRoomContext();
        if (!ctx) return;
        const { roomCode, gameState } = ctx;

        const player = findActivePlayerOrHeal(gameState, socket.id, playerId);
        if (!player) return;

        if (gameState.status !== 'WRITING') {
            gameState.nextRound();
            io.to(roomCode).emit('state_update', gameState);
        }
    });

    // ========== Minigame Events ==========

    socket.on('minigame_join', ({ playerId }) => {
        const ctx = getRoomContext();
        if (!ctx) return;
        const { roomCode, gameState } = ctx;

        const player = findActivePlayerOrHeal(gameState, socket.id, playerId);
        if (!player) return;

        socket.to(roomCode).emit('minigame_player_joined', {
            playerId: player.id,
            avatar: player.avatar
        });

        socket.emit('minigame_state', gameState.minigameState);
    });

    socket.on('minigame_launch', ({ playerId, angle, power }) => {
        const ctx = getRoomContext();
        if (!ctx) return;
        const { roomCode, gameState } = ctx;

        const player = findActivePlayerOrHeal(gameState, socket.id, playerId);
        if (!player) return;

        socket.to(roomCode).emit('minigame_launch', {
            playerId: player.id,
            angle,
            power
        });
    });

    socket.on('minigame_bubble_popped', ({ playerId, bubbleId }) => {
        const ctx = getRoomContext();
        if (!ctx) return;
        const { roomCode, gameState } = ctx;

        const player = findActivePlayerOrHeal(gameState, socket.id, playerId);
        if (!player) return;

        const isFirstPop = gameState.recordMinigamePop(player.id, bubbleId);

        if (isFirstPop) {
            socket.to(roomCode).emit('minigame_bubble_popped', {
                playerId: player.id,
                bubbleId
            });
        }

        io.to(roomCode).emit('minigame_scores', gameState.minigameState.popCounts);
    });

    socket.on('minigame_state_sync', ({ playerId, x, y, vx, vy }) => {
        const ctx = getRoomContext();
        if (!ctx) return;
        const { roomCode, gameState } = ctx;

        const player = findActivePlayerOrHeal(gameState, socket.id, playerId);
        if (!player) return;

        socket.to(roomCode).emit('minigame_state_sync', {
            playerId: player.id,
            x, y, vx, vy
        });
    });

    socket.on('disconnect', () => {
        // Find which room this socket belonged to
        const roomCode = socket.data.roomCode;
        if (roomCode) {
            const gameState = roomManager.getRoom(roomCode);
            if (gameState) {
                console.log(`User disconnected from room ${roomCode}:`, socket.id);
                gameState.disconnectPlayer(socket.id);
                io.to(roomCode).emit('state_update', gameState);
                
                // Check if room is empty to schedule garbage collection
                const activeCount = gameState.players.filter(p => p.connected).length;
                if (activeCount === 0) {
                     roomManager.scheduleCleanup(roomCode);
                }
            }
        } else {
             console.log('User disconnected (no room):', socket.id);
        }
    });
});

// Handle React routing, return all requests to React app
app.get(/^(?!\/api).+/, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});