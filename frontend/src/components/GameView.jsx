import React, { useState } from 'react';
import { Avatar } from './Avatar';
import clsx from 'clsx';

export function GameView({ socket, gameState, selfId }) {
    const { status, currentRound, players } = gameState;
    const [answer, setAnswer] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [selectedAnswer, setSelectedAnswer] = useState(null); // Text of selected answer
    const [selectedPlayer, setSelectedPlayer] = useState(null); // ID of selected player to guess

    const isReader = currentRound.readerId === selfId;
    const isGuesser = currentRound.guesserId === selfId;
    const myAnswer = currentRound.answers.find(a => a.playerId === selfId);
    const myPlayer = players.find(p => p.id === selfId);
    const readerPlayer = players.find(p => p.id === currentRound.readerId);

    const [lastGuessResult, setLastGuessResult] = useState(null); // { correct: boolean, message: string }

    // Clear toast after 3 seconds
    React.useEffect(() => {
        if (lastGuessResult) {
            const timer = setTimeout(() => setLastGuessResult(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [lastGuessResult]);

    // Listen for guess results
    React.useEffect(() => {
        const handleGuessResult = (result) => {
            if (result.success) {
                setLastGuessResult({ correct: result.correct, message: result.message });
            }
        };
        socket.on('guess_result', handleGuessResult);
        return () => socket.off('guess_result', handleGuessResult);
    }, [socket]);

    const [scoreChange, setScoreChange] = useState(null); // { amount: number, id: string }

    // Listen for score updates to trigger animation
    React.useEffect(() => {
        const handleStateUpdate = (newState) => {
            const oldMe = myPlayer;
            const newMe = newState.players.find(p => p.id === selfId);

            if (oldMe && newMe && newMe.score > oldMe.score) {
                const diff = newMe.score - oldMe.score;
                setScoreChange({ amount: diff, id: Date.now() });
                setTimeout(() => setScoreChange(null), 2000);
            }
        };

        socket.on('state_update', handleStateUpdate);
        return () => socket.off('state_update', handleStateUpdate);
    }, [socket, myPlayer, selfId]);

    const handleSubmit = () => {
        if (!answer.trim()) return;
        socket.emit('submit_answer', { text: answer, playerId: selfId });
        setSubmitted(true);
    };

    const handleReveal = () => {
        socket.emit('reveal_answer', { playerId: selfId });
    };

    const handleGuess = () => {
        if (!selectedAnswer || !selectedPlayer) return;
        socket.emit('make_guess', { targetPlayerId: selectedPlayer, answerText: selectedAnswer, playerId: selfId }, (response) => {
            // Callback if server supports it, otherwise use event listener above
        });
        setSelectedAnswer(null);
        setSelectedPlayer(null);
    };

    const handleNextRound = () => {
        socket.emit('next_round', { playerId: selfId });
    };

    if (status === 'WRITING') {
        return (
            <div className="flex flex-col items-center gap-8 max-w-2xl mx-auto w-full animate-fade-in">
                <div className="glass-panel p-8 w-full text-center space-y-6 relative">
                    {/* Persistent User Info */}
                    <div className="absolute top-2 right-2 flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
                        <span className="text-sm font-bold opacity-80">{myPlayer?.name}</span>
                        <Avatar seed={myPlayer?.avatar} size="sm" className="w-6 h-6" />
                    </div>

                    <div className="space-y-2 pt-4">
                        <h3 className="text-xl font-bold text-pink-400 uppercase tracking-widest">Topic</h3>
                        <p className="text-3xl font-black leading-tight">{currentRound.prompt}</p>
                    </div>

                    {submitted || myAnswer ? (
                        <div className="p-8 bg-green-500/20 border border-green-500/50 rounded-xl">
                            <p className="text-xl font-bold text-green-200">Answer Submitted!</p>
                            <p className="text-white/60">Waiting for others...</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <textarea
                                value={answer}
                                onChange={e => setAnswer(e.target.value)}
                                className="input-field min-h-[150px] text-lg resize-none"
                                placeholder="Write your funny response here..."
                                maxLength={200}
                            />
                            <button onClick={handleSubmit} disabled={!answer.trim()} className="btn-primary w-full">
                                Submit Answer
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }



    if (status === 'READING' || status === 'GUESSING') {
        const revealedAnswers = currentRound.answers?.filter(a => a.isRevealed) || [];
        const unrevealedCount = (currentRound.answers?.length || 0) - revealedAnswers.length;

        return (
            <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full h-full animate-fade-in relative">
                {/* Feedback Toast */}
                {lastGuessResult && (
                    <div className={clsx(
                        "fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full font-bold text-xl shadow-2xl animate-bounce-in",
                        lastGuessResult.correct ? "bg-green-500 text-white" : "bg-red-500 text-white"
                    )}>
                        {lastGuessResult.message}
                    </div>
                )}

                <div className="glass-panel p-6 text-center shrink-0 relative">
                    {/* Persistent User Info */}
                    <div className="absolute top-2 right-2 flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
                        <div className="flex flex-col items-end leading-tight mr-1">
                            <span className="text-xs font-bold opacity-60 uppercase tracking-wider">Score</span>
                            <span className="text-lg font-black text-pink-400">{myPlayer?.score || 0}</span>
                        </div>
                        <div className="relative">
                            <Avatar seed={myPlayer?.avatar || 'guest'} size="sm" className="w-8 h-8" />
                            {scoreChange && (
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-2xl font-black text-green-400 animate-float-up pointer-events-none" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                                    +{scoreChange.amount}
                                </div>
                            )}
                        </div>
                    </div>

                    <h3 className="text-sm font-bold text-pink-400 uppercase tracking-widest mb-2 pt-2">Current Topic</h3>
                    <p className="text-2xl font-bold">{currentRound.prompt}</p>
                </div>

                <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_300px] gap-6 min-h-0">
                    {/* Answers Grid */}
                    <div className="space-y-4 overflow-y-auto custom-scrollbar pr-2 pl-2 -ml-2 pb-20">

                        <div className="grid gap-3">
                            {/* Reveal Controls (at the top) */}
                            {status === 'READING' && unrevealedCount > 0 && (
                                isReader && (
                                    <button
                                        onClick={handleReveal}
                                        className="w-full p-6 rounded-xl border-2 border-dashed border-cyan-500/50 bg-cyan-500/10 hover:bg-cyan-500/20 hover:border-cyan-400 hover:shadow-[0_0_30px_rgba(6,182,212,0.3)] active:scale-[0.98] active:bg-cyan-500/30 transition-all duration-200 flex items-center justify-center gap-4 group animate-pulse-slow ring-1 ring-cyan-500/30"
                                    >
                                        <p className="font-black text-cyan-300">Reveal Next Answer</p>
                                    </button>
                                )
                            )}

                            {/* Revealed Answers */}
                            {revealedAnswers.map((ans, i) => {
                                const isGuessed = ans.isGuessed;
                                const isSelected = selectedAnswer === ans.text;
                                const author = players.find(p => p.id === ans.playerId);
                                const wrongGuesses = ans.wrongGuesses || [];

                                return (
                                    <div
                                        key={i}
                                        onClick={() => !isGuessed && status === 'GUESSING' && isGuesser && setSelectedAnswer(ans.text)}
                                        className={clsx(
                                            "p-4 rounded-xl border transition-all duration-500 relative overflow-hidden group animate-slide-up",
                                            isGuessed
                                                ? "bg-green-500/20 border-green-500/50"
                                                : isSelected
                                                    ? "bg-cyan-500/20 border-cyan-500 cursor-pointer ring-2 ring-cyan-500"
                                                    : status === 'GUESSING' && isGuesser
                                                        ? "bg-white/5 border-2 border-dashed border-white/30 hover:border-cyan-400 hover:bg-cyan-500/10 hover:shadow-[0_0_15px_rgba(6,182,212,0.1)] cursor-pointer hover:scale-[1.02]"
                                                        : "bg-white/5 border-white/10"
                                        )}
                                    >
                                        <p className="text-lg font-medium">{ans.text}</p>

                                        {/* Wrong Guesses Display */}
                                        {wrongGuesses.length > 0 && !isGuessed && (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {wrongGuesses.map(pid => {
                                                    const p = players.find(pl => pl.id === pid);
                                                    if (!p) return null;
                                                    return (
                                                        <div key={pid} className="flex items-center gap-1.5 bg-black/20 pr-2 rounded-full border border-red-500/30">
                                                            <div className="relative">
                                                                <Avatar seed={p.avatar} size="sm" className="w-6 h-6 grayscale opacity-70" />
                                                                <div className="absolute inset-0 flex items-center justify-center text-red-500 font-bold text-lg leading-none shadow-black drop-shadow-md">
                                                                    ✕
                                                                </div>
                                                            </div>
                                                            <span className="text-xs font-bold text-red-300/80">{p.name}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {isGuessed && author && (
                                            <div className="mt-2 flex items-center gap-2 text-green-300 animate-fade-in">
                                                <Avatar seed={author.avatar} size="sm" className="w-6 h-6 text-sm" />
                                                <span className="font-bold text-sm">Written by {author.name}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Sidebar: Status & Actions */}
                    <div className="glass-panel p-4 flex flex-col gap-4 h-fit order-first md:order-last">
                        {status === 'READING' && (
                            <div className="space-y-4">
                                <div className="text-center border-b border-white/10 pb-4">
                                    <p className="text-sm uppercase tracking-wider opacity-60">Current Reader</p>
                                    <div className="flex items-center justify-center gap-2 mt-2">
                                        <Avatar seed={readerPlayer?.avatar} size="sm" />
                                        <span className="font-bold text-xl">{readerPlayer?.name}</span>
                                    </div>
                                </div>
                                {isReader ? (
                                    <div className="p-4 bg-pink-500/20 border border-pink-500/50 rounded-xl text-center animate-pulse-slow">
                                        <p className="text-xl font-bold text-pink-300">You are the Reader!</p>
                                        <p className="text-sm text-white/60">Reveal the answers and read them aloud</p>
                                    </div>
                                ) : (
                                    <div className="text-center opacity-60">
                                        Waiting for reader to reveal...
                                    </div>
                                )}
                            </div>
                        )}

                        {status === 'GUESSING' && (
                            <div className="space-y-4">
                                <div className="text-center border-b border-white/10 pb-4">
                                    <p className="text-sm uppercase tracking-wider opacity-60">Current Guesser</p>
                                    <div className="flex items-center justify-center gap-2 mt-2">
                                        <Avatar seed={players.find(p => p.id === currentRound.guesserId)?.avatar} size="sm" />
                                        <span className="font-bold text-xl">{players.find(p => p.id === currentRound.guesserId)?.name}</span>
                                    </div>
                                </div>

                                {currentRound.guessedPlayers.includes(selfId) ? (
                                    <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-center animate-pulse-slow">
                                        <p className="text-xl font-bold text-red-300">You are Eliminated!</p>
                                        <p className="text-sm text-white/60">You can no longer guess this round.</p>
                                    </div>
                                ) : isGuesser ? (
                                    <div className="space-y-4 animate-pulse-slow">
                                        <p className="text-center font-bold text-pink-300">It's your turn!</p>
                                        <p className="text-sm text-center opacity-80">Select an answer to guess.</p>
                                    </div>
                                ) : (
                                    <div className="text-center opacity-60">
                                        Waiting for guess...
                                    </div>
                                )}


                            </div>
                        )}
                    </div>
                </div>

                {/* Guessing Modal */}
                {selectedAnswer && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                        <div className="glass-panel w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-pop-in">
                            <div className="p-6 border-b border-white/10">
                                <h3 className="text-xl font-bold text-center mb-2">Who wrote this?</h3>
                                <div className="p-4 bg-white/5 rounded-xl text-center text-lg font-medium italic">
                                    "{selectedAnswer}"
                                </div>
                            </div>

                            <div className="p-6 overflow-y-auto custom-scrollbar">
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                    {players.filter(p => p.id !== selfId && !currentRound.guessedPlayers.includes(p.id)).map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => setSelectedPlayer(p.id)}
                                            className={clsx(
                                                "flex flex-col items-center p-4 rounded-xl transition-all",
                                                selectedPlayer === p.id
                                                    ? "bg-cyan-500/40 ring-2 ring-cyan-500 scale-105"
                                                    : "bg-white/5 hover:bg-white/10 hover:scale-105"
                                            )}
                                        >
                                            <Avatar seed={p.avatar} size="md" />
                                            <span className="font-bold mt-2 text-center truncate w-full">{p.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="p-6 border-t border-white/10 flex gap-4">
                                <button
                                    onClick={() => { setSelectedAnswer(null); setSelectedPlayer(null); }}
                                    className="flex-1 py-3 bg-white/10 hover:bg-white/20 rounded-lg font-bold transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleGuess}
                                    disabled={!selectedPlayer}
                                    className="flex-1 btn-primary"
                                >
                                    Confirm Guess
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return null;
}
