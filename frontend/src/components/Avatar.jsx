
import React, { useMemo } from 'react';
import { createAvatar } from '@dicebear/core';
import { bottts } from '@dicebear/collection';
import clsx from 'clsx';

export function Avatar({ seed, size = 'md', className, onClick }) {
    const avatar = useMemo(() => {
        return createAvatar(bottts, {
            seed: seed || 'random',
            size: 128,
            backgroundColor: ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf'],
        }).toDataUri();
    }, [seed]);

    const sizes = {
        sm: 'w-10 h-10',
        md: 'w-16 h-16',
        lg: 'w-24 h-24'
    };

    return (
        <div
            onClick={onClick}
            className={clsx(
                'rounded-2xl overflow-hidden bg-white/10 border-2 border-white/20 transition-all select-none',
                sizes[size],
                onClick ? 'cursor-pointer hover:scale-105 hover:border-pink-400' : '',
                className
            )}
        >
            <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
        </div>
    );
}
