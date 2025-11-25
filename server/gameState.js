const prompts = require('./prompts');

const { randomUUID } = require('crypto');

class GameState {
    constructor() {
        this.players = []; // { id, socketId, name, avatar, score, connected }
        this.status = 'LOBBY'; // LOBBY, WRITING, READING, GUESSING, SCORING
        this.currentRound = {
            prompt: '',
            answers: [], // { playerId, text, revealed }
            guesses: [], // { guesserId, targetId, authorId, correct }
            readerId: null,
            guessedPlayers: [] // ids of players whose answers have been guessed
        };
        this.usedPrompts = new Set();
    }

    addPlayer(socketId, name, avatar) {
        // Check if name already taken (simple check)
        const existingName = this.players.find(p => p.name === name);
        if (existingName) {
            // If disconnected, maybe reclaim? For now, just return null or error?
            // Let's assume unique names for simplicity or append #
        }

        const player = {
            id: randomUUID(),
            socketId,
            name,
            avatar,
            score: 0,
            connected: true
        };
        this.players.push(player);
        return player;
    }

    rejoinPlayer(socketId, playerId) {
        const player = this.players.find(p => p.id === playerId);
        if (player) {
            player.socketId = socketId;
            player.connected = true;
            return player;
        }
        return null;
    }

    disconnectPlayer(socketId) {
        const player = this.players.find(p => p.socketId === socketId);
        if (player) {
            player.connected = false;
        }
    }

    removePlayer(socketId) {
        const index = this.players.findIndex(p => p.socketId === socketId);
        if (index !== -1) {
            this.players.splice(index, 1);
        }
    }

    startGame() {
        if (this.players.filter(p => p.connected).length < 3) return false;
        this.players.forEach(p => p.score = 0);
        this.usedPrompts.clear();
        this.nextRound();
        return true;
    }

    nextRound() {
        this.status = 'WRITING';

        // Pick a random prompt
        let availablePrompts = prompts.filter(p => !this.usedPrompts.has(p));
        if (availablePrompts.length === 0) {
            this.usedPrompts.clear();
            availablePrompts = prompts;
        }
        const prompt = availablePrompts[Math.floor(Math.random() * availablePrompts.length)];
        this.usedPrompts.add(prompt);

        // Rotate reader
        const currentReaderIndex = this.players.findIndex(p => p.id === this.currentRound.readerId);
        const nextReaderIndex = (currentReaderIndex + 1) % this.players.length;
        const readerId = this.players[nextReaderIndex]?.id || this.players[0].id;

        this.currentRound = {
            prompt,
            answers: [],
            guesses: [],
            readerId,
            readerId,
            guessedPlayers: [],
            revealedCount: 0
        };

        // Determine first guesser (player to the left of the reader)
        const readerIndex = this.players.findIndex(p => p.id === readerId);
        let firstGuesserIndex = (readerIndex + 1) % this.players.length;
        // Skip reader if they are the first guesser
        while (this.players[firstGuesserIndex].id === readerId) {
            firstGuesserIndex = (firstGuesserIndex + 1) % this.players.length;
        }
        this.currentRound.guesserId = this.players[firstGuesserIndex].id;
    }

    submitAnswer(playerId, text) {
        if (this.status !== 'WRITING') return false;
        // Reader CAN write now
        // if (playerId === this.currentRound.readerId) return false; 

        const existing = this.currentRound.answers.find(a => a.playerId === playerId);
        if (existing) {
            existing.text = text;
        } else {
            this.currentRound.answers.push({ playerId, text, isRevealed: false, isGuessed: false, wrongGuesses: [] });
        }

        // Check if all players have submitted
        const writers = this.players.filter(p => p.connected);
        if (this.currentRound.answers.length >= writers.length) {
            this.status = 'READING';
        }
        return true;
    }

    revealNextAnswer() {
        if (this.status !== 'READING') return false;

        // Find next unrevealed answer
        // We can just use revealedCount as index if we keep order
        if (this.currentRound.revealedCount < this.currentRound.answers.length) {
            this.currentRound.answers[this.currentRound.revealedCount].isRevealed = true;
            this.currentRound.revealedCount++;

            // If all revealed, move to GUESSING? 
            // Usually there is a pause or manual trigger. 
            // Let's keep it in READING until they are all revealed, then maybe auto-switch or manual?
            // The prompt says "Players take turns guessing".
            // Let's auto-switch to GUESSING when all are revealed? 
            // Or maybe wait for Reader to click "Start Guessing"?
            // Let's auto-switch for flow.
            if (this.currentRound.revealedCount === this.currentRound.answers.length) {
                this.status = 'GUESSING';
            }
            return true;
        }
        return false;
    }

    startGuessing() {
        this.status = 'GUESSING';
    }

    makeGuess(guesserId, targetPlayerId, answerText) {
        if (this.status !== 'GUESSING') return { success: false, message: 'Not guessing phase' };
        if (guesserId !== this.currentRound.guesserId) return { success: false, message: 'Not your turn' };

        // Find the answer by text (since we might not know the ID on client side easily, or we can pass ID if we want)
        // Actually, client should probably send the answer object or ID if we expose it.
        // But answers are anonymous. We should probably index them or send text.
        // Let's assume we send the answer text or a temporary ID for the answer.
        // For simplicity, let's match by text (assuming unique answers, or handle duplicates).

        const answer = this.currentRound.answers.find(a => a.text === answerText && !a.isGuessed);
        if (!answer) return { success: false, message: 'Answer not found or already guessed' };

        if (answer.playerId === targetPlayerId) {
            // Correct guess
            answer.isGuessed = true;
            this.currentRound.guessedPlayers.push(targetPlayerId);

            const guesser = this.players.find(p => p.id === guesserId);
            if (guesser) guesser.score += 1;

            // Check if round over
            const unguessedAnswers = this.currentRound.answers.filter(a => !a.isGuessed);
            const answersNotBelongingToGuesser = unguessedAnswers.filter(a => a.playerId !== guesserId);

            // Round over if all answers guessed OR the only remaining answer belongs to the guesser
            if (unguessedAnswers.length === 0 || answersNotBelongingToGuesser.length === 0) {
                // Award +3 points to the last remaining player (if any) whose answer wasn't guessed
                // This usually happens if answersNotBelongingToGuesser.length === 0 but unguessedAnswers.length > 0
                // The remaining answer belongs to the current guesser (who survived till the end)
                if (unguessedAnswers.length === 1) {
                    const survivorId = unguessedAnswers[0].playerId;
                    const survivor = this.players.find(p => p.id === survivorId);
                    if (survivor) {
                        survivor.score += 3;
                    }
                }

                this.status = 'SCORING';
            }

            // Guesser goes again if correct
            return { success: true, correct: true, message: 'Correct!' };
        } else {
            // Incorrect guess
            answer.wrongGuesses.push(targetPlayerId);

            // Turn passes to next non-eliminated player
            this.advanceTurn();
            return { success: true, correct: false, message: 'Incorrect.' };
        }
    }

    advanceTurn() {
        // Find next player after current guesser who is not reader and not eliminated
        // Wait, eliminated players can't guess.
        // Also reader doesn't guess? "One player is the reader... All other players write... Players take turns guessing."
        // Usually reader doesn't guess.

        let currentIndex = this.players.findIndex(p => p.id === this.currentRound.guesserId);
        let nextIndex = (currentIndex + 1) % this.players.length;

        // Loop until we find a valid guesser
        let attempts = 0;
        while (attempts < this.players.length) {
            const p = this.players[nextIndex];
            // Reader CAN guess now
            // const isReader = p.id === this.currentRound.readerId;
            const isEliminated = this.currentRound.guessedPlayers.includes(p.id);

            if (!isEliminated) {
                this.currentRound.guesserId = p.id;
                return;
            }
            nextIndex = (nextIndex + 1) % this.players.length;
            attempts++;
        }
        // If no one found, round might be over.
    }
}

module.exports = GameState;
