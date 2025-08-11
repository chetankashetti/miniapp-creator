'use client';


import { CodeEditorAndPreview } from './CodeEditorAndPreview';
import { Icons } from './sections/icons';

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

interface CodeGeneratorProps {
  currentProject: GeneratedProject | null;
  isGenerating?: boolean;
}

export function CodeGenerator({ currentProject, isGenerating = false }: CodeGeneratorProps) {

  return (
    <div className="h-full flex-1 w-full flex flex-col px-[20px] pb-[20px]">
      <div className="sticky top-0 left-0 flex items-center gap-2 justify-center py-2 mb-2">
        <Icons.earnySmallGrayIcon className="w-6 h-6 text-white/40" />
        <span className="text-[24px] font-funnel-display text-black font-medium">Mini App Preview</span>
      </div>
      <CodeEditorAndPreview
        currentProject={currentProject}
        isGenerating={isGenerating}
        onFileChange={(filePath, content) => {
          console.log('File changed:', filePath, content.substring(0, 100));
        }}
        onSaveFile={async (filePath, content) => {
          if (!currentProject) return false;
          try {
            const response = await fetch('/api/files', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ projectId: currentProject.projectId, filename: filePath, content }),
            });
            return response.ok;
          } catch (error) {
            console.error('Failed to save file:', error);
            return false;
          }
        }}
      />
    </div>
  );
} 