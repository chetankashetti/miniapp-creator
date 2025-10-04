'use client';

import { useState, useEffect } from 'react';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
import { CodeGenerator } from './components/CodeGenerator';
import { ChatInterface } from './components/ChatInterface';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider, useAuthContext } from './contexts/AuthContext';
import { useApiUtils } from '../lib/apiUtils';


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

function HomeContent() {
  const [currentProject, setCurrentProject] = useState<GeneratedProject | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const { sessionToken } = useAuthContext();
  const { apiCall } = useApiUtils();

  // Debug currentProject changes
  useEffect(() => {
    console.log('🏠 currentProject state changed to:', currentProject ? 'present' : 'null');
  }, [currentProject]);

  const handleProjectSelect = async (project: { id: string; name: string; description?: string; previewUrl?: string; vercelUrl?: string; createdAt: string; updatedAt: string }) => {
    try {
      console.log('🔍 handleProjectSelect called with project:', project);
      console.log('🔍 Attempting to fetch project with ID:', project.id);
      
      // Load project files and create a GeneratedProject object using apiCall
      const data = await apiCall<{ project: { id: string; name: string; description?: string; previewUrl?: string; vercelUrl?: string; files: unknown[]; chatMessages: unknown[] } }>(`/api/projects/${project.id}`, {
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('🔍 Project API response data:', data);
      const projectData = data.project;

      // Convert database project to GeneratedProject format
      const generatedProject: GeneratedProject = {
        projectId: projectData.id,
        port: 3000, // Default port
        url: projectData.previewUrl || projectData.vercelUrl || `https://${projectData.id}.minidev.fun`,
        generatedFiles: (projectData.files as { filename: string }[])?.map((f: { filename: string }) => f.filename) || [],
        previewUrl: projectData.previewUrl,
        vercelUrl: projectData.vercelUrl,
        aliasSuccess: true,
        isNewDeployment: false,
        hasPackageChanges: false,
      };

      setCurrentProject(generatedProject);
    } catch (error) {
      console.error('Error loading project:', error);
      // You might want to show an error message to the user
    }
  };

  const handleNewProject = () => {
    console.log('🆕 handleNewProject called - clearing current project');
    setCurrentProject(null);
    // Focus on the chat interface for new project creation
  };

  return (
    <div className="flex min-h-screen h-[calc(100vh-40px)] font-funnel-sans relative bg-pink p-[20px]">
      {/* Left Section - Chat/Agent */}
      <section className="w-1/3 border-r border-black/10 h-[calc(100vh-40px)] flex flex-col rounded-tl-[56px] rounded-bl-[56px] bg-white">
        <ChatInterface
          currentProject={currentProject}
          onProjectGenerated={setCurrentProject}
          onGeneratingChange={setIsGenerating}
        />
      </section>

      {/* Right Section - Code/Preview */}
      <section className="w-2/3 h-[calc(100vh-40px)] bg-white transition-all duration-500 rounded-tr-[56px] rounded-br-[56px] dot-bg">
        <CodeGenerator 
          currentProject={currentProject} 
          isGenerating={isGenerating}
          onProjectSelect={handleProjectSelect}
          onNewProject={handleNewProject}
        />
      </section>
    </div>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <HomeContent />
      </ProtectedRoute>
    </AuthProvider>
  );
}
