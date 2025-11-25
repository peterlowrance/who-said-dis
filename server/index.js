const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const GameState = require('./gameState');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all for LAN
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;
const gameState = new GameState();

// Serve static files from frontend build
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// API to get local IP (optional, for display)
app.get('/api/ip', (req, res) => {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    const results = {};

    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
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

    // Send current state to new user
    socket.emit('state_update', gameState);

    socket.on('join_game', ({ name, avatar }) => {
        const player = gameState.addPlayer(socket.id, name, avatar);
        io.emit('state_update', gameState);
        socket.emit('join_success', player); // Send back full player object with ID
    });

    socket.on('rejoin_game', ({ playerId }) => {
        const player = gameState.rejoinPlayer(socket.id, playerId);
        if (player) {
            socket.emit('join_success', player);
            io.emit('state_update', gameState);
        } else {
            socket.emit('rejoin_failed');
        }
    });

    socket.on('leave_game', () => {
        gameState.removePlayer(socket.id);
        io.emit('state_update', gameState);
    });

    socket.on('start_game', () => {
        if (gameState.startGame()) {
            io.emit('state_update', gameState);
        }
    });

    socket.on('reveal_answer', () => {
        // Only reader can reveal
        if (gameState.currentRound.readerId !== gameState.players.find(p => p.socketId === socket.id)?.id) return;

        if (gameState.revealNextAnswer()) {
            io.emit('state_update', gameState);
        }
    });

    socket.on('submit_answer', ({ text }) => {
        // We need to find the player by socket.id to get their persistent ID
        const player = gameState.players.find(p => p.socketId === socket.id);
        if (player && gameState.submitAnswer(player.id, text)) {
            io.emit('state_update', gameState);
        }
    });

    socket.on('make_guess', ({ targetPlayerId, answerText }) => {
        const player = gameState.players.find(p => p.socketId === socket.id);
        if (!player) return;

        const result = gameState.makeGuess(player.id, targetPlayerId, answerText);

        // Emit result to everyone for toast/feedback
        io.emit('guess_result', result);

        if (result.success) {
            io.emit('state_update', gameState);
        }
    });

    socket.on('next_round', () => {
        // Only allow if round is over? Or anytime?
        // Usually reader decides or automatic.
        // Let's allow any player to trigger next round for now if status is GUESSING/SCORING
        gameState.nextRound();
        io.emit('state_update', gameState);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        gameState.disconnectPlayer(socket.id);
        io.emit('state_update', gameState);
    });
});

// Handle React routing, return all requests to React app
// Handle React routing, return all requests to React app
app.get(/^(?!\/api).+/, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
