'use client';

import { useState } from 'react';
import { ProjectList } from './ProjectList';

interface GeneratedProject {
    projectId: string;
    port: number;
    url: string;
    generatedFiles?: string[];
    previewUrl?: string;
    vercelUrl?: string;
    aliasSuccess?: boolean;
    isNewDeployment?: boolean;
    hasPackageChanges?: boolean;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  previewUrl?: string;
  vercelUrl?: string;
  createdAt: string;
  updatedAt: string;
}

interface PreviewProps {
    currentProject: GeneratedProject | null;
    onProjectSelect?: (project: Project) => void;
    onNewProject?: () => void;
}

export function Preview({ currentProject, onProjectSelect, onNewProject }: PreviewProps) {
    const [iframeError, setIframeError] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    if (!currentProject) {
        return (
            <ProjectList 
                onProjectSelect={onProjectSelect || (() => {})}
                onNewProject={onNewProject || (() => {})}
            />
        );
    }

    const previewUrl = currentProject.previewUrl || currentProject.url;

    const handleIframeError = () => {
        console.error('Iframe failed to load:', previewUrl);
        setIframeError(true);
        setIsLoading(false);
    };

    const handleIframeLoad = () => {
        setIsLoading(false);
        setIframeError(false);
    };

    return (
        <div className="h-full flex flex-col bg-white overflow-y-auto">
            {/* Mobile Preview */}
            <div className="flex-1 flex items-center justify-center p-4">
                <div className="relative flex flex-col items-center">
                    {/* iPhone frame */}
                    <div className="bg-black rounded-[40px] shadow-2xl p-2 border-4 border-gray-800 relative">
                        {isLoading && !iframeError && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white rounded-[32px] z-10">
                                <div className="text-sm text-gray-600">Loading preview...</div>
                            </div>
                        )}
                        {iframeError && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white rounded-[32px] z-10 p-4">
                                <div className="text-sm text-red-600 mb-2 text-center">
                                    Preview failed to load
                                </div>
                                <div className="text-xs text-gray-500 mb-3 text-center">
                                    URL: {previewUrl}
                                </div>
                                <button
                                    onClick={() => {
                                        setIframeError(false);
                                        setIsLoading(true);
                                        // Force iframe reload by changing src
                                        const iframe = document.querySelector('iframe') as HTMLIFrameElement;
                                        if (iframe) {
                                            iframe.src = iframe.src;
                                        }
                                    }}
                                    className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                                >
                                    Retry
                                </button>
                                <button
                                    onClick={() => window.open(previewUrl, '_blank')}
                                    className="mt-2 px-3 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600"
                                >
                                    Open in New Tab
                                </button>
                            </div>
                        )}
                        <iframe
                            src={previewUrl}
                            className="w-full h-full rounded-[32px] border-0 bg-white"
                            title="Generated App Preview"
                            allow="fullscreen; camera; microphone; gyroscope; accelerometer; geolocation; clipboard-write; autoplay"
                            data-origin={previewUrl}
                            data-v0="true"
                            loading="eager"
                            sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups-to-escape-sandbox allow-pointer-lock allow-popups allow-modals allow-orientation-lock allow-presentation"
                            onError={handleIframeError}
                            onLoad={handleIframeLoad}
                            style={{
                                width: 320,
                                height: 600, // iPhone 12/13/14 aspect ratio
                                scrollbarWidth: 'none',
                                msOverflowStyle: 'none'
                            }}
                        />
                    </div>
                    <div className="mt-2 text-xs text-black-60">
                        Mobile Preview
                    </div>
                    {previewUrl && (
                        <div className="mt-1 text-xs text-gray-500 text-center max-w-xs truncate">
                            {previewUrl}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
} 