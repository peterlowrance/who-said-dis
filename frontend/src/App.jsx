import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { Lobby } from './components/Lobby';
import { GameView } from './components/GameView';
import { Scoreboard } from './components/Scoreboard';

// Initialize socket outside component to prevent reconnects
const socket = io();

function App() {
  const [gameState, setGameState] = useState(null);
  const [selfId, setSelfId] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);

      // Check for saved session
      const savedSession = localStorage.getItem('got_session');
      if (savedSession) {
        const { id } = JSON.parse(savedSession);
        console.log('Attempting to rejoin with ID:', id);
        socket.emit('rejoin_game', { playerId: id });
      }
    };

    socket.on('connect', onConnect);

    // If already connected when component mounts
    if (socket.connected) {
      onConnect();
    }

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('join_success', (player) => {
      setSelfId(player.id);
      localStorage.setItem('got_session', JSON.stringify(player));
    });

    socket.on('rejoin_failed', () => {
      localStorage.removeItem('got_session');
      setSelfId(null);
    });

    socket.on('state_update', (state) => {
      setGameState(state);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('join_success');
      socket.off('rejoin_failed');
      socket.off('state_update');
    };
  }, []);

  if (!connected) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-xl font-bold">Connecting to server...</div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin text-4xl">🌀</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col">
      {gameState.status === 'LOBBY' && (
        <Lobby socket={socket} players={gameState.players} selfId={selfId} />
      )}

      {(gameState.status === 'WRITING' || gameState.status === 'READING' || gameState.status === 'GUESSING' || gameState.status === 'ROUND_OVER') && (
        <GameView socket={socket} gameState={gameState} selfId={selfId} />
      )}



      {/* Debug Info (Optional) */}
      {/* <div className="fixed bottom-2 right-2 text-xs text-white/20 pointer-events-none">
        ID: {selfId} | Status: {gameState.status}
      </div> */}
    </div>
  );
}

export default App;
