'use client';

import { useState, useEffect } from 'react';
import { CodeGenerator } from './components/CodeGenerator';
import { ChatInterface } from './components/ChatInterface';
import { PasswordProtection } from './components/PasswordProtection';
import { config } from '../lib/config';

interface GeneratedProject {
  projectId: string;
  port: number;
  url: string;
  generatedFiles?: string[];
}

export default function Home() {
  const [currentProject, setCurrentProject] = useState<GeneratedProject | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check authentication status and session timeout
  useEffect(() => {
    const checkAuth = () => {
      const authData = localStorage.getItem(config.authKey);

      if (authData) {
        try {
          const { timestamp } = JSON.parse(authData);
          const now = Date.now();
          const timeDiff = now - timestamp;

          // Check if session has expired
          if (config.sessionTimeout && timeDiff > config.sessionTimeout) {
            // Session expired, clear authentication
            localStorage.removeItem(config.authKey);
            setIsAuthenticated(false);
          } else {
            setIsAuthenticated(true);
          }
        } catch {
          // Invalid auth data, clear it
          localStorage.removeItem(config.authKey);
          setIsAuthenticated(false);
        }
      } else {
        setIsAuthenticated(false);
      }

      setIsLoading(false);
    };

    // Add a small delay to prevent flash of content
    const timer = setTimeout(checkAuth, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleAuthenticated = () => {
    // Store authentication with timestamp
    const authData = {
      timestamp: Date.now()
    };
    localStorage.setItem(config.authKey, JSON.stringify(authData));
    setIsAuthenticated(true);
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-blue-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // Show password protection if not authenticated
  if (!isAuthenticated) {
    return <PasswordProtection onAuthenticated={handleAuthenticated} />;
  }

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
        <CodeGenerator currentProject={currentProject} isGenerating={isGenerating} />
      </section>
    </div>
  );
}
