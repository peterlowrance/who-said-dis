import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { Lobby } from './components/Lobby';
import { GameView } from './components/GameView';
import { LandingPage } from './components/LandingPage';
import { AboutPage } from './components/AboutPage';

// Initialize socket outside component to prevent reconnects
const socket = io();

function App() {
  const [gameState, setGameState] = useState(null);
  const [selfId, setSelfId] = useState(null);
  const [connected, setConnected] = useState(false);
  const [roomCode, setRoomCode] = useState(null);
  const [showAbout, setShowAbout] = useState(window.location.pathname === '/about');

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);

      // Check for saved session
      const savedSession = localStorage.getItem('got_session');
      if (savedSession) {
        try {
          const { id, roomCode: savedRoom } = JSON.parse(savedSession);
          if (id && savedRoom) {
            console.log('Attempting to rejoin room:', savedRoom);
            socket.emit('rejoin_game', { playerId: id, roomCode: savedRoom });
          }
        } catch (e) {
          console.error("Session parse error", e);
        }
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

    socket.on('room_joined', ({ code, state }) => {
        setRoomCode(code);
        setGameState(state);
        // We don't save session here yet, only when they actually join as a player
    });

    socket.on('room_error', (err) => {
        alert(err.message);
        setRoomCode(null);
    });

    socket.on('join_success', (player) => {
      setSelfId(player.id);
      // Save session with Room Code now
      localStorage.setItem('got_session', JSON.stringify({ 
          id: player.id, 
          roomCode: socket.io.opts.query?.roomCode || roomCode // Handle potential async state issues
      }));
    });

    socket.on('rejoin_failed', () => {
      localStorage.removeItem('got_session');
      setSelfId(null);
      setRoomCode(null);
      setGameState(null);
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
      socket.off('room_joined');
      socket.off('room_error');
    };
  }, [roomCode]); // Add roomCode dependency to ensure updated state in closures if needed

  // Update session storage when roomCode changes to ensure it's captured
  useEffect(() => {
     if (selfId && roomCode) {
         localStorage.setItem('got_session', JSON.stringify({ id: selfId, roomCode }));
     }
  }, [selfId, roomCode]);


  if (!connected) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-xl font-bold">Connecting to server...</div>
      </div>
    );
  }

  // If we are connected but haven't joined a room yet, show Landing or About
  if (!roomCode) {
      if (showAbout) {
          return <AboutPage onBack={() => {
              setShowAbout(false);
              window.history.pushState({}, '', '/');
          }} />;
      }
      return <LandingPage socket={socket} onShowAbout={() => {
          setShowAbout(true);
          window.history.pushState({}, '', '/about');
      }} />;
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
        <Lobby 
            socket={socket} 
            players={gameState.players} 
            selfId={selfId} 
            roomCode={roomCode}
        />
      )}

      {(gameState.status === 'WRITING' || gameState.status === 'READING' || gameState.status === 'GUESSING' || gameState.status === 'ROUND_OVER') && (
        <GameView socket={socket} gameState={gameState} selfId={selfId} />
      )}
    </div>
  );
}

export default App;