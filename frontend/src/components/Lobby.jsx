import React, { useState, useEffect } from 'react';
import { Avatar } from './Avatar';

export function Lobby({ socket, players, selfId }) {
    const [name, setName] = useState('');
    const [randomSuffix, setRandomSuffix] = useState('');
    const [joined, setJoined] = useState(false);

    // Generate random suffix on mount
    useEffect(() => {
        setRandomSuffix(Math.random().toString(36).substring(7));
    }, []);

    const avatarSeed = name + randomSuffix;

    const handleJoin = () => {
        if (!name.trim()) return;
        socket.emit('join_game', { name, avatar: avatarSeed });
        setJoined(true);
    };

    const handleRegenerate = () => {
        setRandomSuffix(Math.random().toString(36).substring(7));
    };

    const handleStart = () => {
        socket.emit('start_game');
    };

    const handleLeave = () => {
        socket.emit('leave_game');
        localStorage.removeItem('got_session');
        window.location.reload();
    };

    const myPlayer = players.find(p => p.id === selfId);

    if (joined || myPlayer) { // Check if joined locally OR if we exist in players list (rejoined)
        return (
            <div className="flex flex-col items-center gap-8 max-w-2xl mx-auto w-full animate-fade-in">
                <div className="text-center space-y-2">
                    <h2 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-400 to-purple-400">
                        Waiting for players...
                    </h2>
                    <p className="text-white/60">The host will start the game soon.</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 w-full">
                    {players.map(p => (
                        <div key={p.id} className="glass-panel p-4 flex flex-col items-center gap-2 animate-pop-in relative">
                            <Avatar seed={p.avatar} size="md" />
                            <span className="font-bold truncate max-w-full">{p.name}</span>
                            {p.id === selfId && <span className="text-xs text-pink-400">(You)</span>}
                            {!p.connected && <span className="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full" title="Disconnected"></span>}
                        </div>
                    ))}
                </div>

                <div className="flex gap-4 w-full max-w-xs">
                    <button onClick={handleLeave} className="flex-1 py-3 bg-white/10 hover:bg-white/20 rounded-lg font-bold transition-colors">
                        Leave
                    </button>
                    {players.length >= 3 && (
                        <button onClick={handleStart} className="flex-1 btn-primary text-xl">
                            Start
                        </button>
                    )}
                </div>

                {players.length < 3 && (
                    <div className="text-white/40 italic">Need at least 3 players to start</div>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center gap-8 max-w-md mx-auto w-full animate-fade-in">
            <div className="text-center space-y-2">
                <h1 className="text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 drop-shadow-lg">
                    THINGS...
                </h1>
                <p className="text-xl text-white/80">The Game of Funny Responses</p>
            </div>

            <div className="glass-panel p-8 w-full space-y-6">
                <div className="space-y-2">
                    <label className="text-sm font-bold uppercase tracking-wider text-white/60">Your Name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="input-field text-center text-xl font-bold"
                        placeholder="Enter your name"
                        maxLength={12}
                    />
                </div>

                <div className="space-y-2 flex flex-col items-center">
                    <label className="text-sm font-bold uppercase tracking-wider text-white/60">Your Avatar</label>
                    <div className="flex flex-col items-center gap-4">
                        <Avatar seed={avatarSeed} size="lg" />
                        <button
                            onClick={handleRegenerate}
                            className="text-sm text-pink-400 hover:text-pink-300 underline"
                        >
                            Regenerate Avatar
                        </button>
                    </div>
                </div>

                <button
                    onClick={handleJoin}
                    disabled={!name.trim()}
                    className="btn-primary w-full text-lg"
                >
                    Join Game
                </button>
            </div>
        </div>
    );
}
