'use client';

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

    if (!currentProject) {
        return (
            <ProjectList 
                onProjectSelect={onProjectSelect || (() => {})}
                onNewProject={onNewProject || (() => {})}
            />
        );
    }

    return (
        <div className="h-full flex flex-col bg-white overflow-y-auto">
            {/* Mobile Preview */}
            <div className="flex-1 flex items-center justify-center p-4">
                <div className="relative flex flex-col items-center">
                    {/* iPhone frame */}
                    <div className="bg-black rounded-[40px] shadow-2xl p-2 border-4 border-gray-800 relative">
                        <iframe
                            src={currentProject.previewUrl || currentProject.url}
                            className="w-full h-full rounded-[32px] border-0 bg-white"
                            title="Generated App Preview"
                            allow="fullscreen; camera; microphone; gyroscope; accelerometer; geolocation; clipboard-write; autoplay"
                            data-origin={currentProject.previewUrl || currentProject.url}
                            data-v0="true"
                            loading="eager"
                            sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups-to-escape-sandbox allow-pointer-lock allow-popups allow-modals allow-orientation-lock allow-presentation"
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
                </div>
            </div>
        </div>
    );
} 