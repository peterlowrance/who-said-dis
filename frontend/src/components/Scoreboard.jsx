import React from 'react';
import { Avatar } from './Avatar';

export function Scoreboard({ players, gameState, socket }) {
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

    return (
        <div className="flex flex-col items-center gap-8 max-w-2xl mx-auto w-full animate-fade-in">
            <div className="text-center space-y-2">
                <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
                    Scoreboard
                </h2>
                <p className="text-white/60">Round Complete!</p>
            </div>

            <div className="w-full space-y-4">
                {sortedPlayers.map((p, i) => (
                    <div
                        key={p.id}
                        className="glass-panel p-4 flex items-center gap-4 animate-slide-up"
                        style={{ animationDelay: `${i * 100}ms` }}
                    >
                        <div className="text-2xl font-bold w-8 text-white/40">#{i + 1}</div>
                        <Avatar seed={p.avatar} size="md" />
                        <div className="flex-1">
                            <p className="font-bold text-xl">{p.name}</p>
                        </div>
                        <div className="text-3xl font-black text-pink-400">{p.score}</div>
                    </div>
                ))}
            </div>

            <button
                onClick={() => socket.emit('next_round')}
                className="btn-primary w-full max-w-xs text-xl mt-8"
            >
                Next Round
            </button>
        </div>
    );
}
