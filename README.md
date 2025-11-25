# Who Said Dis? (formerly Game of Things)

A modern, mobile-first web adaptation of the classic party game "The Game of Things". Players write anonymous responses to funny prompts, then take turns guessing who wrote what.

## Features

*   **Mobile-First Design**: Sleek, responsive UI built with Tailwind CSS v4, featuring glassmorphism and smooth animations.
*   **Real-time Gameplay**: Powered by Socket.io for instant updates across all devices.
*   **Dynamic Avatars**: Integrated DiceBear avatars that regenerate based on your name.
*   **Persistent Sessions**: Rejoin the game seamlessly if you accidentally disconnect or refresh.
*   **Smart Game Logic**:
    *   **Sequential Reveal**: The Reader reveals answers one by one for dramatic effect.
    *   **Anti-Spoiler**: Authors are hidden until their answer is correctly guessed.
    *   **Elimination**: Guess wrong and you're out for the round!
    *   **Scoring**: Points for correct guesses and a +3 bonus for the last survivor.

## Tech Stack

*   **Frontend**: React, Vite, Tailwind CSS v4
*   **Backend**: Node.js, Express, Socket.io
*   **State Management**: In-memory server state with persistent player tracking

## Getting Started

### Prerequisites

*   Node.js (v18+ recommended)
*   npm

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/peterlowrance/who-said-dis.git
    cd who-said-dis
    ```

2.  **Install dependencies:**
    ```bash
    # Install server dependencies
    cd server
    npm install

    # Install frontend dependencies
    cd ../frontend
    npm install
    ```

### Running the Game

1.  **Start the Server:**
    ```bash
    cd server
    node index.js
    ```
    The server will run on `http://localhost:3000`.

2.  **Start the Frontend (Development):**
    ```bash
    cd frontend
    npm run dev
    ```
    Open your browser to the URL shown (usually `http://localhost:5173`).

3.  **Build for Production:**
    ```bash
    cd frontend
    npm run build
    ```
    The server is configured to serve the built frontend files from `frontend/dist`.

## How to Play

1.  **Lobby**: Enter your name and join the game. Wait for everyone to join.
2.  **Writing**: A prompt appears (e.g., "Things you shouldn't say to a cop"). Everyone writes a funny answer.
3.  **Reading**: The Reader reveals the answers one by one.
4.  **Guessing**: Players take turns guessing who wrote which answer.
    *   **Correct Guess**: You get 1 point and guess again. The writer is revealed.
    *   **Wrong Guess**: Your turn ends.
    *   **Elimination**: If you are guessed correctly, you are out of the guessing round.
5.  **Scoring**: The last person whose answer hasn't been guessed gets 3 bonus points!

## License

[MIT](LICENSE)
