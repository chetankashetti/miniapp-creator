'use client';

import { useEffect } from 'react';

interface DevelopmentLogsProps {
    onComplete: () => void;
}

export function DevelopmentLogs({ onComplete }: DevelopmentLogsProps) {
    useEffect(() => {
        // Simulate generation time
        const timer = setTimeout(() => {
            onComplete();
        }, 15000); // 15 seconds

        return () => clearTimeout(timer);
    }, [onComplete]);

    return (
        <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
                <div className="flex justify-center mb-4">
                    <div className="w-8 h-8 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                </div>
                <p className="text-lg font-medium text-gray-700">Minidev is generating your project</p>
            </div>
        </div>
    );
} 