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
            guessedPlayers: [], // ids of players whose answers have been guessed
            eliminationOrder: [] // array of player IDs in the order they were eliminated
        };
        this.previousRoundEliminationOrder = []; // store elimination order from the previous round
        this.usedPrompts = new Set();
        this.minigameState = {
            popCounts: {}, // playerId -> count
            poppedBubbles: [], // list of slot indices
            playerPops: {} // playerId -> { bubbleId -> true }
        };
    }

    addPlayer(socketId, name, avatar) {
        // Check if name already taken and append a counter if so
        let finalName = name;
        let counter = 2;
        while (this.players.some(p => p.name === finalName)) {
            finalName = `${name} ${counter}`;
            counter++;
        }

        const player = {
            id: randomUUID(),
            socketId,
            name: finalName,
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

    // Helper function to shuffle an array using Fisher-Yates algorithm
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
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

        // Same check for WRITING phase
        if (this.status === 'WRITING') {
            const writers = this.players.filter(p => p.connected);
            if (this.currentRound.answers.length >= writers.length && writers.length > 0) {
                this.shuffleArray(this.currentRound.answers);
                this.status = 'READING';
            }
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

        // Archive the current round (deep copy essential for arrays/objects)
        this.previousRound = JSON.parse(JSON.stringify(this.currentRound));

        // Save the current round's elimination order as the previous round's elimination order
        this.previousRoundEliminationOrder = [...this.currentRound.eliminationOrder];

        // Pick a random prompt
        let availablePrompts = prompts.filter(p => !this.usedPrompts.has(p));
        if (availablePrompts.length === 0) {
            this.usedPrompts.clear();
            availablePrompts = prompts;
        }
        const prompt = availablePrompts[Math.floor(Math.random() * availablePrompts.length)];
        this.usedPrompts.add(prompt);

        // Rotate reader to next CONNECTED player
        const currentReaderIndex = this.players.findIndex(p => p.id === this.currentRound.readerId);
        let nextReaderIndex = (currentReaderIndex + 1) % this.players.length;

        let attempts = 0;
        while (!this.players[nextReaderIndex]?.connected && attempts < this.players.length) {
            nextReaderIndex = (nextReaderIndex + 1) % this.players.length;
            attempts++;
        }

        const readerId = this.players[nextReaderIndex]?.id || this.players[0].id;

        this.currentRound = {
            prompt,
            answers: [],
            guesses: [],
            readerId,
            guessedPlayers: [],
            eliminationOrder: [],
            revealedCount: 0
        };

        // Determine first guesser based on elimination order from previous round
        // Players who were eliminated first in the previous round guess first
        // The player who survived the longest (last eliminated) guesses last
        // If no previous round (this is the first round), start with player after the reader

        let firstGuesserId;
        if (this.previousRoundEliminationOrder && this.previousRoundEliminationOrder.length > 0) {
            // Find the first player in the previous round's elimination order who is still in the game
            for (const eliminatedPlayerId of this.previousRoundEliminationOrder) {
                if (this.players.some(p => p.id === eliminatedPlayerId && p.connected)) {
                    firstGuesserId = eliminatedPlayerId;
                    break;
                }
            }

            // If no eliminated players from the previous round are still in the game,
            // or the previous elimination order is empty, fall back to the default logic (player after reader)
            if (!firstGuesserId) {
                const readerIndex = this.players.findIndex(p => p.id === readerId);
                let fallbackGuesserIndex = (readerIndex + 1) % this.players.length;
                firstGuesserId = this.players[fallbackGuesserIndex].id;
            }
        } else {
            // This is the first round, use the default logic (player after reader)
            const readerIndex = this.players.findIndex(p => p.id === readerId);
            let firstGuesserIndex = (readerIndex + 1) % this.players.length;
            firstGuesserId = this.players[firstGuesserIndex].id;
        }

        this.currentRound.guesserId = firstGuesserId;

        // Reset minigame state for the new round
        this.minigameState = {
            popCounts: {},
            poppedBubbles: [],
            playerPops: {}
        };
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
        // Grace period: give recently disconnected players 5 seconds to rejoin
        if (this.currentRound.answers.length >= this.players.length) {
            // Shuffle the answers to randomize the order they will be revealed in
            this.shuffleArray(this.currentRound.answers);
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

        const guessData = {
            guesserId,
            targetId: targetPlayerId,
            answerText,
            correct: false,
            timestamp: Date.now()
        };

        if (answer.playerId === targetPlayerId) {
            // Correct guess
            answer.isGuessed = true;
            guessData.correct = true;
            this.currentRound.guesses.push(guessData);
            this.currentRound.guessedPlayers.push(targetPlayerId);

            // Add the eliminated player to the elimination order
            this.currentRound.eliminationOrder.push(targetPlayerId);

            const guesser = this.players.find(p => p.id === guesserId);
            if (guesser) guesser.score += 1;

            // Check if round over
            const unguessedAnswers = this.currentRound.answers.filter(a => !a.isGuessed);
            const answersNotBelongingToGuesser = unguessedAnswers.filter(a => a.playerId !== guesserId);

            // Round over if all answers guessed OR the only remaining answer belongs to the guesser
            if (unguessedAnswers.length === 0 || answersNotBelongingToGuesser.length === 0) {
                // Award +1 point to the last remaining player (if any) whose answer wasn't guessed
                // This usually happens if answersNotBelongingToGuesser.length === 0 but unguessedAnswers.length > 0
                // The remaining answer belongs to the current guesser (who survived till the end)
                if (unguessedAnswers.length === 1) {
                    const survivorId = unguessedAnswers[0].playerId;
                    const survivor = this.players.find(p => p.id === survivorId);
                    if (survivor) {
                        survivor.score += 1;
                    }
                    // Add the survivor to the elimination order as the last eliminated (survived the longest)
                    this.currentRound.eliminationOrder.push(survivorId);
                }

                this.status = 'ROUND_OVER';
            }

            // Guesser goes again if correct
            return { success: true, correct: true, message: 'Correct!' };
        } else {
            // Incorrect guess
            answer.wrongGuesses.push(targetPlayerId);
            this.currentRound.guesses.push(guessData);

            // Turn passes to next non-eliminated player
            this.advanceTurn();
            return { success: true, correct: false, message: 'Incorrect.' };
        }
    }

    advanceTurn() {
        // Find the next player to guess based on the previous round's elimination order
        // This ensures all players get turns in the order they were eliminated last round

        // If there's no previous elimination order, fall back to the default sequential logic
        if (!this.previousRoundEliminationOrder || this.previousRoundEliminationOrder.length === 0) {
            // Original fallback logic: sequential order
            let currentIndex = this.players.findIndex(p => p.id === this.currentRound.guesserId);
            let nextIndex = (currentIndex + 1) % this.players.length;

            // Loop until we find a valid guesser
            let attempts = 0;
            while (attempts < this.players.length) {
                const p = this.players[nextIndex];
                const isEliminated = this.currentRound.guessedPlayers.includes(p.id);

                if (!isEliminated) {
                    this.currentRound.guesserId = p.id;
                    return;
                }
                nextIndex = (nextIndex + 1) % this.players.length;
                attempts++;
            }
            return; // If no one found, round might be over
        }

        // Use the previous round's elimination order for determining next guesser
        // Find the current guesser's position in the elimination order
        const currentIndex = this.previousRoundEliminationOrder.indexOf(this.currentRound.guesserId);

        // Find the next non-eliminated player in the elimination order sequence
        let attempts = 0;
        let nextIndexInOrder = (currentIndex + 1) % this.previousRoundEliminationOrder.length;

        while (attempts < this.previousRoundEliminationOrder.length) {
            const playerId = this.previousRoundEliminationOrder[nextIndexInOrder];
            const player = this.players.find(p => p.id === playerId);

            // Check if the player exists and hasn't been eliminated in the current round
            if (player && !this.currentRound.guessedPlayers.includes(playerId)) {
                this.currentRound.guesserId = playerId;
                return;
            }

            nextIndexInOrder = (nextIndexInOrder + 1) % this.previousRoundEliminationOrder.length;
            attempts++;
        }

        // Fallback if no player found in elimination order (shouldn't happen in normal gameplay)
        // Use original logic
        let fallbackIndex = this.players.findIndex(p => p.id === this.currentRound.guesserId);
        let nextFallbackIndex = (fallbackIndex + 1) % this.players.length;

        attempts = 0;
        while (attempts < this.players.length) {
            const p = this.players[nextFallbackIndex];
            const isEliminated = this.currentRound.guessedPlayers.includes(p.id);

            if (!isEliminated) {
                this.currentRound.guesserId = p.id;
                return;
            }
            nextFallbackIndex = (nextFallbackIndex + 1) % this.players.length;
            attempts++;
        }
    }

    recordMinigamePop(playerId, bubbleId) {
        if (!this.minigameState.playerPops[playerId]) {
            this.minigameState.playerPops[playerId] = {};
        }

        // Only count if this SPECIFIC player hasn't already popped this bubble
        if (!this.minigameState.playerPops[playerId][bubbleId]) {
            this.minigameState.playerPops[playerId][bubbleId] = true;

            if (!this.minigameState.popCounts[playerId]) {
                this.minigameState.popCounts[playerId] = 0;
            }
            this.minigameState.popCounts[playerId]++;

            // Still track which bubbles are gone for late joiners (visual)
            // Return true if this is the FIRST time anyone popped it
            if (!this.minigameState.poppedBubbles.includes(bubbleId)) {
                this.minigameState.poppedBubbles.push(bubbleId);
                return true;
            }
        }

        return false;
    }
}

module.exports = GameState;
