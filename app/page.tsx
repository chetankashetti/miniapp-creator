'use client';

import { useState } from 'react';
import { CodeGenerator } from './components/CodeGenerator';
import { ChatInterface } from './components/ChatInterface';
import ProtectedRoute from './components/ProtectedRoute';


interface GeneratedProject {
  projectId: string;
  port: number;
  url: string;
  generatedFiles?: string[];
}

export default function Home() {
  const [currentProject, setCurrentProject] = useState<GeneratedProject | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  return (
    <ProtectedRoute>
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
          <CodeGenerator currentProject={currentProject} isGenerating={isGenerating} />
        </section>
      </div>
    </ProtectedRoute>
  );
}
