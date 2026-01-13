import React from 'react';

export function AboutPage({ onBack }) {
    return (
        <div className="flex flex-col items-center gap-8 max-w-2xl mx-auto w-full animate-fade-in py-12 px-4">
            <div className="text-center space-y-2">
                <h1 className="text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 drop-shadow-lg">
                    ABOUT THE GAME
                </h1>
                <p className="text-xl text-white/80">Everything you need to know about "Who Said Dis?"</p>
            </div>

            <div className="glass-panel p-8 w-full space-y-8 text-white/90">
                <section className="space-y-4">
                    <h2 className="text-2xl font-bold text-pink-400">What is it?</h2>
                    <p className="leading-relaxed">
                        <strong className="text-white">Who Said Dis?</strong> is a hilarious party game where you write anonymous answers to funny prompts and try to guess who wrote what. It's based on the classic "The Game of Things".
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-2xl font-bold text-purple-400">How to Play</h2>
                    <ol className="list-decimal list-inside space-y-3 marker:text-purple-500">
                        <li><strong className="text-white">Write:</strong> Everyone answers a funny prompt (e.g., "Things you shouldn't say to a cop").</li>
                        <li><strong className="text-white">Reveal:</strong> The answers are read out loud one by one.</li>
                        <li><strong className="text-white">Guess:</strong> Take turns guessing who wrote which answer.</li>
                        <li><strong className="text-white">Score:</strong> Guess correctly to gain points and eliminate players!</li>
                    </ol>
                </section>

                <section className="space-y-4">
                    <h2 className="text-2xl font-bold text-indigo-400">Scoring & Winning</h2>
                    <ul className="list-disc list-inside space-y-2 marker:text-indigo-500">
                        <li><span className="font-bold">+1 Point</span> for every correct guess.</li>
                        <li>If you are guessed correctly, you are <span className="text-red-400 font-bold">out</span> for the round.</li>
                        <li><span className="font-bold text-yellow-400">+3 Bonus Points</span> if you're the last person standing (your answer wasn't guessed).</li>
                    </ul>
                </section>

                <div className="pt-4 flex justify-center">
                    <button 
                        onClick={onBack}
                        className="btn-primary px-12 py-3 text-lg"
                    >
                        Back to Game
                    </button>
                </div>
            </div>
            
            <div className="text-white/30 text-sm text-center">
                Built with ❤️ by Peter Lowrance
            </div>
        </div>
    );
}
