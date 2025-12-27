import React, { useMemo } from 'react';
import avatar from 'animal-avatar-generator';
import clsx from 'clsx';

export function Avatar({ seed, size = 'md', className, onClick }) {
    const sizeMap = {
        xs: 24,
        sm: 40,
        md: 64,
        lg: 96
    };

    const pixelSize = sizeMap[size] || sizeMap.md;

    const AVATAR_COLORS = [
        '#d7b89c', '#b18272', '#ec8a90', '#a1Ac88', '#99c9bd', '#50c8c6', // Docs colors
        '#f472b6', '#c084fc', '#60a5fa', '#4ade80', '#fbbf24', '#f87171'  // Extras
    ];

    const svgString = useMemo(() => {
        const svg = avatar(seed || 'random', {
            size: pixelSize,
            round: false,
            blackout: true,
            avatarColors: AVATAR_COLORS
        });
        // Add negative margin to the SVG element
        return svg.replace('<svg', '<svg style="margin-left: -2px"');
    }, [seed, pixelSize]);

    const sizes = {
        xs: 'w-6 h-6',
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
            dangerouslySetInnerHTML={{ __html: svgString }}
        />
    );
}
