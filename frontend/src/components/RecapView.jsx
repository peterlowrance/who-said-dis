import React from 'react';
import { Avatar } from './Avatar';
import clsx from 'clsx';

export function RecapView({ previousRound, players, onNext, selfId }) {
    if (!previousRound) return null;

    // Sort players by score for the mini-scoreboard at bottom
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    const myPlayer = players.find(p => p.id === selfId);

    return (
        <div className="fixed inset-0 bg-gradient-to-br from-indigo-950/95 via-purple-950/95 to-pink-950/95 backdrop-blur-xl z-[100] flex flex-col animate-fade-in overflow-hidden">
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                <div className="max-w-4xl mx-auto space-y-8">

                    <div className="text-center space-y-2 pt-8">
                        <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400 uppercase tracking-widest">
                            Round Recap
                        </h2>
                        <p className="text-2xl font-bold text-white/90">"{previousRound.prompt}"</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {previousRound.answers.map((ans, idx) => {
                            const author = players.find(p => p.id === ans.playerId);
                            // Find all guesses targeting this answer
                            // In previousRound.guesses: guesserId, targetId, correct
                            // We want guesses where targetId === ans.playerId (meaning they guessed THIS person)
                            // AND they guessed correctly (meaning they identified this answer)
                            // OR they guessed incorrectly on this specific answer? 
                            // Wait, the guess object has `answerText` and `targetId`. 
                            // If I guessed "Pizza" belongs to "Bob", and "Pizza" was written by "Bob", that's a correct guess.
                            // If I guessed "Pizza" belongs to "Alice", that's wrong.

                            // Let's rely on `ans.playerId` to find who wrote it.

                            const relevantGuesses = previousRound.guesses?.filter(g => g.answerText === ans.text) || [];
                            const correctGuess = relevantGuesses.find(g => g.correct);
                            const wrongGuesses = relevantGuesses.filter(g => !g.correct);

                            return (
                                <div key={idx} className="glass-panel p-4 flex flex-col gap-3 relative overflow-hidden">
                                    {/* Author Header */}
                                    <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                                        <Avatar seed={author?.avatar} size="sm" />
                                        <span className="font-bold text-lg text-pink-300">{author?.name}</span>
                                        <span className="text-xs uppercase tracking-wider opacity-50 ml-auto">Author</span>
                                    </div>

                                    <div className="py-2">
                                        <p className="text-xl font-medium leading-snug">"{ans.text}"</p>
                                    </div>

                                    {/* Guesses Footer */}
                                    <div className="mt-auto pt-3 border-t border-white/10 text-sm space-y-2">
                                        {correctGuess ? (
                                            <div className="flex items-center gap-2 text-green-300">
                                                <span className="opacity-70">Guessed by:</span>
                                                <div className="flex items-center gap-1.5 font-bold">
                                                    <Avatar seed={players.find(p => p.id === correctGuess.guesserId)?.avatar} size="xs" className="w-4 h-4" />
                                                    {players.find(p => p.id === correctGuess.guesserId)?.name}
                                                </div>
                                                <span className="text-xs font-black text-green-400 bg-green-500/20 px-1.5 py-0.5 rounded-full">+1</span>
                                            </div>
                                        ) : wrongGuesses.length === 0 ? (
                                            <div className="flex items-center gap-2 text-yellow-300 bg-yellow-500/10 px-2 py-1 rounded-lg">
                                                <span className="text-lg">🏆</span>
                                                <div className="flex flex-col">
                                                    <span className="font-bold">Survived!</span>
                                                    <span className="text-xs opacity-70">Never guessed correctly</span>
                                                </div>
                                                <span className="text-xs font-black text-green-400 bg-green-500/20 px-1.5 py-0.5 rounded-full ml-auto">+1</span>
                                            </div>
                                        ) : (
                                            <div className="text-white/40 italic">Guessed incorrectly</div>
                                        )}

                                        {wrongGuesses.length > 0 && (
                                            <div className="flex flex-wrap gap-2 pt-1">
                                                {wrongGuesses.map((wg, i) => (
                                                    <div key={i} className="flex items-center gap-1 text-red-300/60 bg-red-500/10 px-2 py-0.5 rounded-full text-xs">
                                                        <span className="line-through decoration-red-500/50">
                                                            {players.find(p => p.id === wg.guesserId)?.name}
                                                        </span>
                                                        <span className="opacity-50 text-[10px]">
                                                            (guessed {players.find(p => p.id === wg.targetId)?.name})
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                </div>
            </div>

            {/* Bottom Bar: Scores & Action */}
            <div className="shrink-0 p-6 glass-panel border-t border-white/10 bg-black/40 backdrop-blur-xl">
                <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-6 justify-between">

                    {/* Mini Scoreboard */}
                    <div className="flex items-center gap-4 overflow-x-auto max-w-full pb-2 md:pb-0 custom-scrollbar mask-fade-right">
                        {sortedPlayers.map(p => (
                            <div key={p.id} className={clsx(
                                "flex flex-col items-center gap-1 min-w-[60px] pt-2", // Added pt-2 for top clipping
                                p.id === selfId ? "opacity-100 scale-110" : "opacity-60"
                            )}>
                                <Avatar seed={p.avatar} size="sm" className={clsx(p.id === selfId && "ring-2 ring-pink-500")} />
                                <span className="text-xs font-bold truncate max-w-[80px]">{p.name}</span>
                                <span className="font-black text-pink-400">{p.score}</span>
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={onNext}
                        className="btn-primary px-8 py-4 text-lg min-w-[200px] shadow-xl shadow-pink-500/20 hover:shadow-pink-500/40"
                    >
                        Start Next Round
                    </button>
                </div>
            </div>
        </div>
    );
}
