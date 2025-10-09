'use client';

import { useEffect, useState } from 'react';

interface DevelopmentLogsProps {
    onComplete: () => void;
}

const BUILDING_STAGES = [
    { text: 'Analyzing your requirements...', icon: '🔍', duration: 30 },
    { text: 'Setting up project structure...', icon: '📁', duration: 45 },
    { text: 'Installing dependencies...', icon: '📦', duration: 90 },
    { text: 'Writing core application files...', icon: '💻', duration: 120 },
    { text: 'Creating UI components...', icon: '🎨', duration: 60 },
    { text: 'Setting up database schema...', icon: '🗄️', duration: 45 },
    { text: 'Configuring build tools...', icon: '⚙️', duration: 30 },
    { text: 'Running tests and validation...', icon: '🧪', duration: 30 },
    { text: 'Finalizing deployment config...', icon: '🚀', duration: 30 },
];

export function DevelopmentLogs({ onComplete }: DevelopmentLogsProps) {
    const [currentStage, setCurrentStage] = useState(0);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        // Simulate generation time - 10 minutes to be safer than actual generation timeout
        const totalTime = 10 * 60 * 1000; // 10 minutes in milliseconds
        let currentTime = 0;
        
        const progressTimer = setInterval(() => {
            currentTime += 100;
            const newProgress = (currentTime / totalTime) * 100;
            setProgress(newProgress >= 100 ? 100 : newProgress);
        }, 100);

        // Stage progression based on cumulative durations
        const stageDurations = BUILDING_STAGES.map(stage => stage.duration * 1000);
        const stageTimeouts: NodeJS.Timeout[] = [];
        
        let cumulativeTime = 0;
        stageDurations.forEach((duration, index) => {
            cumulativeTime += duration;
            const timeout = setTimeout(() => {
                setCurrentStage(index + 1);
            }, cumulativeTime);
            stageTimeouts.push(timeout);
        });

        const completionTimer = setTimeout(() => {
            clearInterval(progressTimer);
            stageTimeouts.forEach(clearTimeout);
            onComplete();
        }, totalTime);

        return () => {
            clearTimeout(completionTimer);
            clearInterval(progressTimer);
            stageTimeouts.forEach(clearTimeout);
        };
    }, [onComplete]);

    return (
        <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-md w-full">
                {/* Animated Icon */}
                <div className="flex justify-center mb-6">
                    <div className="relative">
                        <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-2xl">{BUILDING_STAGES[currentStage]?.icon || '🚀'}</span>
                        </div>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-6">
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                        <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                    <p className="text-sm text-gray-500">{Math.round(progress)}% complete</p>
                </div>

                {/* Current Stage */}
                <div className="mb-6">
                    <p className="text-xl font-semibold text-gray-800 mb-2">
                        {BUILDING_STAGES[currentStage]?.text || 'Finalizing your project...'}
                    </p>
                    <p className="text-gray-600">
                        Minidev is crafting your project with care
                    </p>
                </div>

                {/* Encouraging Message */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <div className="flex items-start space-x-3">
                        <div className="text-blue-500 text-lg">💡</div>
                        <div className="text-left">
                            <p className="text-sm font-medium text-blue-800 mb-1">
                                This might take a while
                            </p>
                            <p className="text-xs text-blue-700">
                                This process takes 5-6 minutes. Feel free to grab a coffee or come back later. We&apos;ll keep working on your project in the background!
                            </p>
                        </div>
                    </div>
                </div>

                {/* Stage Indicators */}
                <div className="flex justify-center space-x-2">
                    {BUILDING_STAGES.map((_, index) => (
                        <div
                            key={index}
                            className={`w-2 h-2 rounded-full transition-all duration-300 ${
                                index <= currentStage 
                                    ? 'bg-blue-600 scale-125' 
                                    : 'bg-gray-300'
                            }`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
} 