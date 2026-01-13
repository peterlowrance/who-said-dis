import React, { useState } from 'react';

export function LandingPage({ socket, onJoin, onShowAbout }) {
    const [roomCode, setRoomCode] = useState('');
    const [error, setError] = useState('');
    const [isJoining, setIsJoining] = useState(false);

    const handleCreate = () => {
        setIsJoining(true);
        socket.emit('create_room');
    };

    const handleJoin = () => {
        if (!roomCode.trim()) return;
        if (roomCode.length !== 4) {
            setError('Room code must be 4 letters');
            return;
        }
        setIsJoining(true);
        socket.emit('join_room', { code: roomCode });
    };

    return (
        <div className="flex flex-col items-center gap-8 max-w-md mx-auto w-full animate-fade-in py-12">
            <div className="text-center space-y-2">
                <h1 className="text-6xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 drop-shadow-lg">
                    THINGS...
                </h1>
                <p className="text-xl text-white/80">The Game of Funny Responses</p>
            </div>

            <div className="glass-panel p-8 w-full space-y-8">
                {error && (
                    <div className="bg-red-500/20 border border-red-500/50 p-3 rounded text-red-200 text-center text-sm">
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    <button
                        onClick={handleCreate}
                        disabled={isJoining}
                        className="btn-primary w-full text-xl py-4"
                    >
                        Create New Game
                    </button>
                    
                    <div className="relative flex items-center py-2">
                        <div className="flex-grow border-t border-white/10"></div>
                        <span className="flex-shrink-0 mx-4 text-white/40 text-sm uppercase font-bold">Or Join Existing</span>
                        <div className="flex-grow border-t border-white/10"></div>
                    </div>

                    <div className="space-y-2">
                        <input
                            type="text"
                            value={roomCode}
                            onChange={e => {
                                setRoomCode(e.target.value.toUpperCase());
                                setError('');
                            }}
                            className="input-field text-center text-3xl font-black tracking-[0.2em] uppercase"
                            placeholder="ABCD"
                            maxLength={4}
                            disabled={isJoining}
                        />
                        <button
                            onClick={handleJoin}
                            disabled={!roomCode || isJoining}
                            className="w-full py-3 bg-white/10 hover:bg-white/20 rounded-lg font-bold transition-colors disabled:opacity-50"
                        >
                            Join Game
                        </button>
                    </div>

                    <button
                        onClick={onShowAbout}
                        className="w-full py-3 mt-4 text-white/50 hover:text-white hover:bg-white/5 rounded-lg text-sm font-semibold transition-all"
                    >
                        How to Play / About
                    </button>
                </div>
            </div>

            <div className="text-white/20 text-xs text-center">
                Create a room to host, or enter a 4-letter code to join friends.
            </div>
        </div>
    );
}
