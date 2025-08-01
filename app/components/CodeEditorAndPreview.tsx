'use client';

import { useState } from 'react';
import { CodeEditor } from './CodeEditor';
import { Preview } from './Preview';
import { DevelopmentLogs } from './DevelopmentLogs';

interface GeneratedProject {
    projectId: string;
    port: number;
    url: string;
    generatedFiles?: string[];
}

interface CodeEditorAndPreviewProps {
    currentProject: GeneratedProject | null;
    isGenerating?: boolean;
    onFileChange?: (filePath: string, content: string) => void;
    onSaveFile?: (filePath: string, content: string) => Promise<boolean>;
}

type ViewMode = 'code' | 'preview';

export function CodeEditorAndPreview({
    currentProject,
    isGenerating = false,
    onFileChange,
    onSaveFile
}: CodeEditorAndPreviewProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('code');
    const [showLogs, setShowLogs] = useState(false);

    const getViewModeIcon = (mode: ViewMode) => {
        switch (mode) {
        case 'code':
            return (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
            );
        case 'preview':
            return (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
            );
        }
    };

    const getViewModeLabel = (mode: ViewMode) => {
        switch (mode) {
        case 'code':
            return 'Code';
        case 'preview':
            return 'Preview';
        }
    };

    // Show development logs when generating
    if (isGenerating || showLogs) {
        return (
            <div className="h-full flex flex-col">
                <DevelopmentLogs
                    onComplete={() => {
                        setShowLogs(false);
                    }}
                />
            </div>
        );
    }

    if (!currentProject) {
        return (
            <div className="h-full flex flex-col rounded-lg">
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-black-60 text-sm text-center">
                        Project files and preview will appear here after generation.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header with toggle icons and project URL */}
            <div className="flex items-center justify-between p-4 border-b border-black-10 bg-white">
                {/* Left side - Toggle icons */}
                <div className="flex items-center gap-1 bg-black-5 rounded-lg p-1">
                    {(['code', 'preview'] as ViewMode[]).map((mode) => (
                        <button
                            key={mode}
                            onClick={() => setViewMode(mode)}
                            className={`p-2 rounded-md transition-colors ${viewMode === mode
                                ? 'bg-black text-white'
                                : 'text-black-60 hover:text-black hover:bg-black-10'
                                }`}
                            title={`${getViewModeLabel(mode)} view`}
                        >
                            {getViewModeIcon(mode)}
                        </button>
                    ))}
                </div>

                {/* Right side - Project URL controls */}
                {currentProject && (
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                            <div className="text-xs text-black-60 font-medium">Project URL</div>
                            <div className="text-xs text-black font-mono">
                                preview.minidev.fun/p/{currentProject.projectId}
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(currentProject.url);
                            }}
                            className="p-2 bg-black text-white rounded hover:bg-black-80 transition-colors"
                            title="Copy URL"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                        </button>
                        <button
                            onClick={() => window.open(currentProject.url, '_blank')}
                            className="p-2 bg-black-20 text-black rounded hover:bg-black-30 transition-colors"
                            title="Open in new tab"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                        </button>
                    </div>
                )}
            </div>

            {/* Content based on view mode */}
            <div className="flex-1 overflow-y-auto">
                {/* Always render CodeEditor but hide when not in code mode */}
                <div className={`h-full ${viewMode === 'code' ? 'block' : 'hidden'}`}>
                    <CodeEditor
                        currentProject={currentProject}
                        onFileChange={onFileChange}
                        onSaveFile={onSaveFile}
                    />
                </div>

                {/* Always render Preview but hide when not in preview mode */}
                <div className={`h-full ${viewMode === 'preview' ? 'block' : 'hidden'}`}>
                    <Preview currentProject={currentProject} />
                </div>
            </div>
        </div>
    );
} 