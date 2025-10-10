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

const TIPS = [
    {
        title: "This might take a while",
        message: "This process takes 5-6 minutes. Feel free to grab a coffee or come back later. We'll keep working on your project in the background!"
    },
    {
        title: "Did you know?",
        message: "We're using AI to analyze your requirements and generate custom code tailored specifically to your needs."
    },
    {
        title: "Pro tip",
        message: "You can make changes to your miniapp after it's generated! Just chat with the AI to refine your project."
    },
    {
        title: "Behind the scenes",
        message: "We're setting up your entire tech stack including Next.js, TypeScript, and blockchain integrations automatically."
    },
    {
        title: "Quality assurance",
        message: "Every generated project includes error handling, responsive design, and best practices out of the box."
    },
    {
        title: "Almost there!",
        message: "Your project will be deployed and ready to preview in your browser as soon as generation completes."
    }
];

export function DevelopmentLogs({ onComplete }: DevelopmentLogsProps) {
    const [currentStage, setCurrentStage] = useState(0);
    const [progress, setProgress] = useState(0);
    const [currentTipIndex, setCurrentTipIndex] = useState(0);

    useEffect(() => {
        // Simulate generation time - 12 minutes to be safer than actual generation timeout
        const totalTime = 12 * 60 * 1000; // 12 minutes in milliseconds
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

        // Rotate tips every 15 seconds
        const tipRotation = setInterval(() => {
            setCurrentTipIndex((prev) => (prev + 1) % TIPS.length);
        }, 15000);

        const completionTimer = setTimeout(() => {
            clearInterval(progressTimer);
            clearInterval(tipRotation);
            stageTimeouts.forEach(clearTimeout);
            onComplete();
        }, totalTime);

        return () => {
            clearTimeout(completionTimer);
            clearInterval(progressTimer);
            clearInterval(tipRotation);
            stageTimeouts.forEach(clearTimeout);
        };
    }, [onComplete]);

    // Calculate circular progress stroke
    const circumference = 2 * Math.PI * 45; // radius = 45
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
        <div className="flex-1 flex items-center justify-center p-8 bg-gradient-to-br from-gray-50 to-white">
            <div className="text-center max-w-lg w-full">
                {/* Circular Progress with Laptop Icon */}
                <div className="flex justify-center mb-8">
                    <div className="relative w-32 h-32">
                        {/* Background circle */}
                        <svg className="w-full h-full transform -rotate-90">
                            <circle
                                cx="64"
                                cy="64"
                                r="45"
                                stroke="#E5E7EB"
                                strokeWidth="6"
                                fill="none"
                            />
                            {/* Progress circle */}
                            <circle
                                cx="64"
                                cy="64"
                                r="45"
                                stroke="#3B82F6"
                                strokeWidth="6"
                                fill="none"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap="round"
                                className="transition-all duration-300 ease-out"
                            />
                        </svg>
                        {/* Laptop Icon */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <svg className="w-12 h-12 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2H0c0 1.1.9 2 2 2h20c1.1 0 2-.9 2-2h-4zM4 5h16v11H4V5zm8 14c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-8">
                    <div className="w-full bg-gray-200 rounded-full h-3 mb-3 shadow-inner overflow-hidden">
                        <div
                            className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500 ease-out shadow-lg relative overflow-hidden"
                            style={{ width: `${progress}%` }}
                        >
                            {/* Shine animation */}
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-shimmer"></div>
                        </div>
                    </div>
                    <p className="text-base font-semibold text-gray-600">{Math.round(progress)}% complete</p>
                </div>

                {/* Current Stage */}
                <div className="mb-8">
                    <p className="text-2xl font-bold text-gray-900 mb-2 flex items-center justify-center gap-2">
                        <span className="animate-pulse">{BUILDING_STAGES[currentStage]?.icon || '🚀'}</span>
                        <span>{BUILDING_STAGES[currentStage]?.text || 'Finalizing your project...'}</span>
                    </p>
                    <p className="text-lg text-gray-600">
                        Minidev is crafting your project with care
                    </p>
                </div>

                {/* Rotating Tips with fade animation */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-5 mb-6 shadow-md min-h-[120px] relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-100/20 to-transparent"></div>
                    <div className="relative">
                        <div className="flex items-start space-x-3 animate-fadeIn" key={currentTipIndex}>
                            <div className="text-blue-600 text-2xl flex-shrink-0 mt-0.5">💡</div>
                            <div className="text-left flex-1">
                                <p className="text-base font-bold text-blue-900 mb-2">
                                    {TIPS[currentTipIndex].title}
                                </p>
                                <p className="text-sm text-blue-800 leading-relaxed">
                                    {TIPS[currentTipIndex].message}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tip Pagination Dots */}
                <div className="flex justify-center space-x-2 mb-6">
                    {TIPS.map((_, index) => (
                        <button
                            key={index}
                            onClick={() => setCurrentTipIndex(index)}
                            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                                index === currentTipIndex
                                    ? 'bg-blue-600 scale-125 shadow-lg'
                                    : 'bg-gray-300 hover:bg-gray-400 hover:scale-110'
                            }`}
                            aria-label={`Show tip ${index + 1}`}
                        />
                    ))}
                </div>

                {/* Stage Indicators */}
                <div className="flex justify-center space-x-2">
                    {BUILDING_STAGES.map((stage, index) => (
                        <div
                            key={index}
                            className={`transition-all duration-500 ${
                                index <= currentStage
                                    ? 'w-3 h-3 bg-blue-600 rounded-full scale-110 shadow-md'
                                    : 'w-2 h-2 bg-gray-300 rounded-full'
                            }`}
                            title={stage.text}
                        />
                    ))}
                </div>
            </div>

            <style jsx>{`
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                @keyframes fadeIn {
                    0% { opacity: 0; transform: translateY(10px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
                .animate-shimmer {
                    animation: shimmer 2s infinite;
                }
                .animate-fadeIn {
                    animation: fadeIn 0.5s ease-out;
                }
            `}</style>
        </div>
    );
} 