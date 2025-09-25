'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Icons } from './sections/icons';
import { useAuthContext } from '../contexts/AuthContext';

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

interface ChatMessage {
    role: 'user' | 'ai';
    content: string;
    changedFiles?: string[];
    timestamp?: number;
    phase?: 'requirements' | 'building' | 'editing';
}

interface ChatInterfaceProps {
    currentProject: GeneratedProject | null;
    onProjectGenerated: (project: GeneratedProject | null) => void;
    onGeneratingChange: (isGenerating: boolean) => void;
}

export function ChatInterface({ currentProject, onProjectGenerated, onGeneratingChange }: ChatInterfaceProps) {
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    // const [error, setError] = useState<string | null>(null);
    const [chat, setChat] = useState<ChatMessage[]>([]);
    const [aiLoading, setAiLoading] = useState(false);
    const [hasShownWarning, setHasShownWarning] = useState(false);
    const chatBottomRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const { sessionToken } = useAuthContext();


    // Chat session state
    const [chatSessionId, setChatSessionId] = useState<string>('');
    const [currentPhase, setCurrentPhase] = useState<'requirements' | 'building' | 'editing'>('requirements');

    // Function to scroll to bottom of chat
    const scrollToBottom = () => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    };

    // Initialize chat session
    useEffect(() => {
        if (!chatSessionId) {
            setChatSessionId(crypto.randomUUID());
        }
    }, [chatSessionId]);

    // Load chat messages when project changes
    useEffect(() => {
        const loadChatMessages = async () => {
            if (currentProject?.projectId && sessionToken) {
                try {
                    // Use the main chat API to get messages for this project
                    const response = await fetch(`/api/chat?projectId=${currentProject.projectId}`, {
                        headers: { 'Authorization': `Bearer ${sessionToken}` }
                    });
                    if (response.ok) {
                        const data = await response.json();
                        if (data.messages && data.messages.length > 0) {
                            const loadedMessages: ChatMessage[] = data.messages.map((msg: { role: string; content: string; phase?: string; timestamp: number; changedFiles?: string[] }) => ({
                                role: msg.role,
                                content: msg.content,
                                phase: msg.phase,
                                timestamp: msg.timestamp,
                                changedFiles: msg.changedFiles
                            }));
                            setChat(loadedMessages);
                            return;
                        }
                    }
                } catch (error) {
                    console.warn('Failed to load chat messages:', error);
                }
            }
            
            // Add welcome message when no project or no messages
            if (chat.length === 0 && !aiLoading) {
                setChat([{
                    role: 'ai',
                    content: `Minidev is your on-chain sidekick that transforms ideas into fully functional Farcaster Mini Apps — no coding required.`,
                    phase: 'requirements',
                    timestamp: Date.now()
                }]);
            }
        };

        loadChatMessages();
    }, [currentProject?.projectId, sessionToken, aiLoading, chat.length]);

    // Show warning message once when user hasn't started chatting
    useEffect(() => {
        if (chat.length === 1 && !hasShownWarning && !aiLoading) {
            setHasShownWarning(true);
        }
    }, [chat.length, hasShownWarning, aiLoading]);

    // Scroll to bottom when chat messages change
    useEffect(() => {
        scrollToBottom();
    }, [chat, aiLoading]);

    // Notify parent when generating state changes
    useEffect(() => {
        onGeneratingChange(isGenerating);
    }, [isGenerating, onGeneratingChange]);

    const handleSendMessage = async (userMessage: string) => {
        if (!chatSessionId || !sessionToken) return;
        // setPrompt('');
        setAiLoading(true);

        // setError(null);

        // Add user message immediately
        const userMsg: ChatMessage = {
            role: 'user',
            content: userMessage,
            phase: currentPhase,
            timestamp: Date.now()
        };
        setChat(prev => [...prev, userMsg]);

        // User message will be saved to database by the chat API

        try {
            const endpoint = '/api/chat';
            const body: {
                sessionId: string;
                message: string;
                stream: boolean;
                action?: string;
                projectId?: string;
            } = {
                sessionId: chatSessionId,
                message: userMessage,
                stream: false,
                projectId: currentProject?.projectId
            };

            // Determine the appropriate action based on current phase
            if (currentPhase === 'requirements') {
                body.action = 'requirements_gathering';
            } else if (currentPhase === 'building') {
                body.action = 'confirm_project';
            } else {
                // For editing phase, directly apply changes without streaming conversation
                console.log('🔄 Directly applying changes to existing project...');

                try {
                    // Add processing message
                    setChat(prev => [
                        ...prev,
                        {
                            role: 'ai',
                            content: 'Processing your request and updating the project...',
                            phase: 'editing',
                            timestamp: Date.now()
                        }
                    ]);

                    // Directly call the multi-stage pipeline for updates
                    const updateResponse = await fetch('/api/generate', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
                        body: JSON.stringify({
                            projectId: currentProject?.projectId,
                            prompt: userMessage,
                            stream: false
                        }),
                    });

                    if (updateResponse.ok) {
                        const updateData = await updateResponse.json();
                        console.log('✅ Changes applied successfully:', updateData.changed);

                        // Update the last AI message with success
                        setChat(prev => {
                            const newChat = [...prev];
                            if (newChat.length > 0 && newChat[newChat.length - 1].role === 'ai') {
                                newChat[newChat.length - 1].content = `Changes applied successfully! I've updated ${updateData.changed?.length || 0} files. The preview should reflect your changes shortly.`;
                                newChat[newChat.length - 1].changedFiles = updateData.changed || [];
                            }
                            return newChat;
                        });
                    } else {
                        const errorData = await updateResponse.json();
                        throw new Error(errorData.error || 'Failed to apply changes');
                    }
                } catch (updateError) {
                    console.error('Failed to apply changes:', updateError);

                    // Update the last AI message with error
                    setChat(prev => {
                        const newChat = [...prev];
                        if (newChat.length > 0 && newChat[newChat.length - 1].role === 'ai') {
                            newChat[newChat.length - 1].content = '❌ Sorry, I encountered an error while applying the changes. Please try again.';
                        }
                        return newChat;
                    });
                }

                return; // Skip the rest of the function since we handled the editing phase
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to process message');
            }

            // Handle non-streaming response for requirements/building phases
            const data = await response.json();
            const aiResponse = data.response;

            // Add AI message to chat
            const aiMsg: ChatMessage = {
                role: 'ai',
                content: aiResponse,
                phase: currentPhase,
                timestamp: Date.now()
            };
            setChat(prev => [...prev, aiMsg]);

            // AI message will be saved to database by the chat API

            // Check if we should transition to building phase
            if (currentPhase === 'requirements') {
                const aiResponseLower = aiResponse.toLowerCase();
                const isConfirmedByText = aiResponseLower.includes('proceed to build') ||
                    aiResponseLower.includes('building your miniapp') ||
                    aiResponseLower.includes('creating all the necessary files') ||
                    aiResponseLower.includes('perfect! i\'ll now proceed') ||
                    aiResponseLower.includes('proceeding to build');

                const isConfirmedByAPI = data.projectConfirmed === true;

                if (isConfirmedByText || isConfirmedByAPI) {
                    console.log('✅ Project confirmation detected! Transitioning to building phase...');
                    setCurrentPhase('building');

                    // Use the AI's analysis as the final prompt
                    const finalPrompt = aiResponse;

                    console.log('🚀 Triggering project generation with AI analysis:', finalPrompt.substring(0, 200) + '...');
                    setTimeout(() => {
                        handleGenerateProject(aiResponse);
                    }, 1000);
                }
            }
        } catch (err) {
            console.error('Error:', err);
            // setError(err instanceof Error ? err.message : 'An error occurred');
            setChat(prev => [
                ...prev,
                {
                    role: 'ai',
                    content: 'Sorry, I encountered an error. Please try again.',
                    phase: currentPhase,
                    timestamp: Date.now()
                }
            ]);
        } finally {
            setAiLoading(false);
            setPrompt('');
        }
    };

    const handleGenerateProject = async (generationPrompt: string) => {
        if (!generationPrompt.trim() || !sessionToken) {
            // setError('Please enter a prompt');
            return;
        }
        setIsGenerating(true);
        // setError(null);
        try {
            console.log('🚀 Starting generation with prompt:', generationPrompt.substring(0, 200) + '...');



            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
                body: JSON.stringify({ prompt: generationPrompt }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                const errorMessage = errorData.details || errorData.error || 'Failed to generate project';
                console.error('Generation error details:', errorData);
                throw new Error(errorMessage);
            }
            const project = await response.json();
            onProjectGenerated(project);
            setCurrentPhase('editing');

            // Add generation success message to chat
            const aiMessage = project.generatedFiles && project.generatedFiles.length > 0
                ? `🎉 Your miniapp has been created! I've generated ${project.generatedFiles.length} files and your app is now running. You can preview it on the right and continue chatting with me to make changes.`
                : '🎉 Your miniapp has been created! The preview should be available shortly. You can continue chatting with me to make changes.';

            const successMsg: ChatMessage = {
                role: 'ai',
                content: aiMessage,
                changedFiles: project.generatedFiles || [],
                phase: 'editing',
                timestamp: Date.now()
            };

            setChat(prev => [...prev, successMsg]);

            // Save success message to database
            if (project.projectId) {
                try {
                    await fetch(`/api/projects/${project.projectId}/chat`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
                        body: JSON.stringify({
                            role: 'ai',
                            content: aiMessage,
                            phase: 'editing',
                            changedFiles: project.generatedFiles || []
                        })
                    });
                } catch (error) {
                    console.warn('Failed to save success message to database:', error);
                }
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'An error occurred';
            console.error('Generation failed:', errorMessage);
            // setError(errorMessage);
            setChat(prev => [
                ...prev,
                {
                    role: 'ai',
                    content: `❌ Failed to generate project, Please try again.`,
                    phase: 'building',
                    timestamp: Date.now()
                }
            ]);
        } finally {
            setIsGenerating(false);
        }
    };

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const adjustTextareaHeight = () => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setPrompt(e.target.value);
    };

    useEffect(() => {
        adjustTextareaHeight();
    }, [prompt]);

    // const handleCleanup = async () => {
    //     if (!currentProject) return;
    //     try {
    //         await fetch('/api/generate', {
    //             method: 'DELETE',
    //             headers: { 'Content-Type': 'application/json' },
    //             body: JSON.stringify({ projectId: currentProject.projectId }),
    //         });
    //         onProjectGenerated(null);
    //         setChat([]);
    //         setCurrentPhase('requirements');
    //     } catch (error) {
    //         console.error('Failed to cleanup project:', error);
    //     }
    // };

    // const handleResetChat = () => {
    //     setChat([]);
    //     setCurrentPhase('requirements');
    //     onProjectGenerated(null);
    //     setPrompt('');
    //     setError(null);
    // };



    // const getPhaseBadge = (phase: string) => {
    //     switch (phase) {
    //     case 'requirements':
    //         return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-black-10 text-black">Planning</span>;
    //     case 'building':
    //         return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-black-20 text-black">Building</span>;
    //     case 'editing':
    //         return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-black-30 text-black">Editing</span>;
    //     default:
    //         return null;
    //     }
    // };

    return (
        <div className="flex-1 w-full flex flex-col bg-[#0000000A] max-h-full">
            {/* Chat Header */}
            <div className="sticky top-0 left-0 flex items-center gap-2 justify-center py-2 mb-2">
                <Icons.earnySmallGrayIcon className="w-6 h-6 text-white/40" />
                <span className="text-[24px] font-funnel-display text-black font-medium">Agent</span>
            </div>
            {/* Chat Messages */}
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-[20px]">
                <div className="space-y-4">
                    {chat.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`rounded-lg px-4 py-2 max-w-[80%] text-sm ${msg.role === 'user'
                                ? 'bg-white text-black break-all'
                                : 'bg-transparent text-black'
                                }`}>
                                {/* <div className="flex items-center gap-2 mb-1">
                                    {msg.phase && getPhaseBadge(msg.phase)}
                                </div> */}
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        p: ({ children }) => <p>{children}</p>,
                                        h1: ({ children }) => <h1 className="text-xl font-bold mb-4">{children}</h1>,
                                        h2: ({ children }) => <h2 className="text-base font-semibold mb-3">{children}</h2>,
                                        h3: ({ children }) => <h3 className="text-base font-semibold mb-2">{children}</h3>,
                                        ul: ({ children }) => <ul className="list-disc ml-4 mb-3">{children}</ul>,
                                        li: ({ children }) => <li className="mb-1">{children}</li>,
                                        br: () => <br className="mb-2" />
                                    }}
                                >
                                    {msg.content}
                                </ReactMarkdown>
                                {msg.role === 'ai' && msg.changedFiles && msg.changedFiles.length > 0 && (
                                    <div className="mt-1 text-xs text-gray-500">{msg.changedFiles.length} file(s) updated</div>
                                )}
                            </div>
                        </div>
                    ))}
                    {aiLoading && (
                        <div className="flex justify-start">
                            <div className="rounded-lg px-4 py-2 max-w-[80%] text-sm bg-transparent text-black">
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-2 text-gray-600">
                                        <div className="animate-spin h-4 w-4 border-2 border-gray-600 border-t-transparent rounded-full"></div>
                                        <span>Thinking...</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={chatBottomRef} />
                </div>
            </div>

            {/* Chat Input */}
            <div className="pb-4 px-[20px]">
                {/* Beta Warning Message */}
                {chat.length === 1 && hasShownWarning && (
                    <div className="mb-3">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-full px-4 py-2.5 text-sm">
                            <div className="flex items-center gap-2">
                                <div className="flex-shrink-0 mt-0.5">
                                    <svg className="w-3.5 h-3.5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <div className="text-yellow-700">
                                    <p className="font-normal text-xs">This is a beta version—stick to simple ideas, as complex prompts may break or behave unexpectedly</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                <form
                    onSubmit={e => {
                        e.preventDefault();
                        if (prompt.trim() && !aiLoading) {
                            handleSendMessage(prompt.trim());
                        }
                    }}
                    className="bg-transparent text-black rounded-3xl p-2 border-2 border-black-10 mb-2 flex flex-col items-center gap-1"
                >
                    {/* <input
                        value={prompt}
                        onChange={e => setPrompt(e.target.value)}
                        placeholder={
                            currentPhase === 'requirements'
                                ? "Ask Minidev"
                                : currentPhase === 'building'
                                    ? "Ask Minidev"
                                    : "Ask Minidev"
                        }
                        className="flex-1 resize-none p-2 px-4 bg-transparent rounded-lg border-none focus:outline-none focus:border-none font-funnel-sans text-black-80 font-semibold"
                        disabled={aiLoading || isGenerating}
                    /> */}
                    <textarea
                        ref={textareaRef}
                        value={prompt}
                        onChange={handleInputChange}
                        placeholder="Ask Minidev"
                        className="w-full max-w-full max-h-[100px] overflow-y-auto resize-none p-2 bg-transparent rounded-lg border-none focus:outline-none focus:border-none font-funnel-sans text-black-80 font-medium max-h-[100px]"
                        disabled={aiLoading || isGenerating}
                        rows={1}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if (prompt.trim() && !aiLoading) {
                                    handleSendMessage(prompt.trim());
                                }
                            }
                        }}
                    />
                    <button
                        type="submit"
                        className="p-2 bg-black-80 rounded-full disabled:opacity-50 ml-auto"
                        disabled={aiLoading || isGenerating || !prompt.trim()}
                    >
                        {aiLoading ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M4.2503 11.5713L12 3.82156L19.7498 11.5713"
                                    stroke="white"
                                    strokeWidth="2.78195"
                                    strokeLinecap="round"
                                />
                                <path
                                    d="M12 3.82185L12 20.1777"
                                    stroke="white"
                                    strokeWidth="2.78195"
                                    strokeLinecap="round"
                                />
                            </svg>
                        )}
                    </button>
                </form>
                <p className="text-xs text-gray-400 text-center">
                    Outputs are auto-generated — please review before deploying.
                </p>

                {/* Project Controls */}
                {/* {currentProject && (
                    <div className="mx-4 mb-4 p-3 bg-black-10 rounded-md border border-black-20">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-black">Project Active</span>
                            <button
                                onClick={handleCleanup}
                                className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                            >
                                Stop Server
                            </button>
                        </div>
                    </div>
                )} */}

                {/* {error && (
                    <div className="mx-4 mb-4 p-3 bg-red-900 border border-red-700 rounded-md">
                        <p className="text-red-300 text-sm">{error}</p>
                    </div>
                )} */}
            </div>
        </div>
    );
} 