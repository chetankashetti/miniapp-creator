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

    // Timeout ref for cleanup to prevent duplicate calls
    const generationTimeoutRef = useRef<NodeJS.Timeout | null>(null);


    // Chat session state - persist chatSessionId in sessionStorage to survive re-mounts
    const [chatSessionId] = useState<string>(() => {
        try {
            const stored = sessionStorage.getItem('minidev_chat_session_id');
            if (stored) return stored;
            const newId = crypto.randomUUID();
            sessionStorage.setItem('minidev_chat_session_id', newId);
            return newId;
        } catch {
            return crypto.randomUUID();
        }
    });
    const [chatProjectId, setChatProjectId] = useState<string>(''); // Track the actual project ID where chat messages are stored
    const [currentPhase, setCurrentPhase] = useState<'requirements' | 'building' | 'editing'>('requirements');

    // Function to scroll to bottom of chat
    const scrollToBottom = () => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    };

    // Load chat messages when project changes
    useEffect(() => {
        const loadChatMessages = async () => {
            console.log('🔍 ChatInterface useEffect triggered:', {
                currentProject: currentProject?.projectId,
                sessionToken: !!sessionToken,
                currentPhase,
                timestamp: new Date().toISOString()
            });

            if (currentProject?.projectId && sessionToken) {
                // Set phase to 'editing' when an existing project is loaded
                if (currentPhase !== 'editing') {
                    console.log('🔍 Setting phase to editing for existing project:', currentProject.projectId);
                    setCurrentPhase('editing');
                } else {
                    console.log('🔍 Phase already set to editing, skipping');
                }

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
            } else if (!currentProject && currentPhase === 'editing') {
                // Only reset phase if we're in editing mode and project is cleared
                // Don't reset during building phase to avoid interrupting generation
                console.log('🔄 Project cleared, resetting phase to requirements');
                setCurrentPhase('requirements');
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
        // REMOVED currentPhase from dependencies to prevent reset loop during generation
    }, [currentProject, sessionToken, chat.length, aiLoading, currentPhase]);

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

    // Add aiLoading timeout to prevent infinite loading
    useEffect(() => {
        if (aiLoading) {
            const timeout = setTimeout(() => {
                console.log('⏰ AI response timeout after 30 seconds');
                setAiLoading(false);
            }, 30000); // 30 second timeout for chat responses
            
            return () => clearTimeout(timeout);
        }
    }, [aiLoading]);

    // Notify parent when generating state changes
    useEffect(() => {
        console.log('🔄 onGeneratingChange called with isGenerating:', isGenerating);
        onGeneratingChange(isGenerating);
    }, [isGenerating, onGeneratingChange]);


    // Cleanup timeout on unmount to prevent memory leaks and duplicate calls
    useEffect(() => {
        return () => {
            if (generationTimeoutRef.current) {
                console.log('🧹 Cleaning up generation timeout on unmount');
                clearTimeout(generationTimeoutRef.current);
                generationTimeoutRef.current = null;
            }
        };
    }, []);

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

                        // Update currentProject with new preview URL to refresh iframe
                        if (currentProject) {
                            const updatedProject: GeneratedProject = {
                                ...currentProject,
                                previewUrl: updateData.previewUrl || currentProject.previewUrl,
                                vercelUrl: updateData.vercelUrl || currentProject.vercelUrl,
                                url: updateData.previewUrl || updateData.vercelUrl || currentProject.url,
                            };
                            console.log('🔄 Updating preview URL:', updatedProject.previewUrl);
                            onProjectGenerated(updatedProject);
                        }

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
                } finally {
                    // IMPORTANT: Reset aiLoading before early return
                    setAiLoading(false);
                    setPrompt('');
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
            
            // Track the project ID where chat messages are stored
            if (data.projectId && !chatProjectId) {
                setChatProjectId(data.projectId);
                console.log('📝 Chat messages stored in project:', data.projectId);
            }

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
            // Only allow generation in requirements phase
            if (currentPhase === 'requirements' && !isGenerating) {
                const aiResponseLower = aiResponse.toLowerCase();
                const isConfirmedByText = aiResponseLower.includes('proceed to build') ||
                    aiResponseLower.includes('building your miniapp') ||
                    aiResponseLower.includes('creating all the necessary files') ||
                    aiResponseLower.includes('perfect! i\'ll now proceed') ||
                    aiResponseLower.includes('proceeding to build');

                const isConfirmedByAPI = data.projectConfirmed === true;

                if (isConfirmedByText || isConfirmedByAPI) {
                    console.log('✅ Project confirmation detected! Transitioning to building phase...', {
                        isConfirmedByText,
                        isConfirmedByAPI,
                        isGenerating,
                        existingTimeout: !!generationTimeoutRef.current
                    });
                    setCurrentPhase('building');

                    // Use the AI's analysis as the final prompt
                    const finalPrompt = aiResponse;

                    console.log('🚀 Triggering project generation with AI analysis:', finalPrompt.substring(0, 200) + '...');

                    // Clear any existing timeout before scheduling a new one to prevent duplicates
                    if (generationTimeoutRef.current) {
                        clearTimeout(generationTimeoutRef.current);
                        console.log('🧹 Cleared existing generation timeout to prevent duplicates');
                    }

                    // Store timeout reference for cleanup
                    generationTimeoutRef.current = setTimeout(() => {
                        console.log('⏰ Timeout fired, calling handleGenerateProject');
                        handleGenerateProject(aiResponse);
                        generationTimeoutRef.current = null; // Clear ref after execution
                    }, 1000);
                    console.log('⏰ Generation timeout scheduled for 1 second');
                }
            } else {
                // Log why generation is not allowed
                const phase = currentPhase as 'requirements' | 'building' | 'editing';
                if (phase === 'editing') {
                    console.log('📝 In editing phase - generation not allowed, only file modifications');
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

    // Polling function for async job status
    const pollJobStatus = async (jobId: string): Promise<GeneratedProject> => {
        const maxAttempts = 80; // Poll for up to ~20 minutes (80 * 15 seconds)
        let attempt = 0;

        console.log(`🔄 Starting to poll job ${jobId}...`);

        return new Promise((resolve, reject) => {
            const pollInterval = setInterval(async () => {
                attempt++;

                try {
                    console.log(`🔄 Polling job ${jobId} (attempt ${attempt}/${maxAttempts})...`);

                    const response = await fetch(`/api/jobs/${jobId}`, {
                        headers: {
                            'Authorization': `Bearer ${sessionToken}`,
                        },
                    });

                    if (!response.ok) {
                        clearInterval(pollInterval);
                        reject(new Error(`Failed to fetch job status: ${response.status}`));
                        return;
                    }

                    const job = await response.json();
                    console.log(`📊 Job status:`, job.status);

                    if (job.status === 'completed') {
                        clearInterval(pollInterval);
                        console.log('✅ Job completed successfully!', job.result);

                        // Transform job result to GeneratedProject format
                        const project: GeneratedProject = {
                            projectId: job.result.projectId,
                            port: job.result.port,
                            url: job.result.url,
                            generatedFiles: job.result.generatedFiles,
                            previewUrl: job.result.previewUrl,
                            vercelUrl: job.result.vercelUrl,
                        };

                        resolve(project);
                    } else if (job.status === 'failed') {
                        clearInterval(pollInterval);
                        reject(new Error(job.error || 'Job failed'));
                    } else if (attempt >= maxAttempts) {
                        clearInterval(pollInterval);
                        reject(new Error('Job polling timeout - generation is taking too long'));
                    }
                    // Otherwise, job is still pending or processing, continue polling
                } catch (error) {
                    console.error('❌ Error polling job:', error);
                    clearInterval(pollInterval);
                    reject(error);
                }
            }, 15000); // Poll every 15 seconds
        });
    };

    const handleGenerateProject = async (generationPrompt: string) => {
        console.log('🔍 handleGenerateProject called:', {
            hasPrompt: !!generationPrompt.trim(),
            hasSessionToken: !!sessionToken,
            isGenerating,
            currentPhase,
            timestamp: new Date().toISOString()
        });

        // Check if generation should proceed
        if (!generationPrompt.trim() || !sessionToken || isGenerating) {
            console.log('⚠️ Skipping project generation:', {
                reason: !generationPrompt.trim() ? 'no prompt' :
                        !sessionToken ? 'no session token' :
                        isGenerating ? 'already generating' : 'unknown'
            });
            return;
        }

        console.log('🚀 Starting project generation...');
        setIsGenerating(true);

        // setError(null);
        try {
            console.log('🚀 Generating project with prompt:', generationPrompt.substring(0, 200) + '...');

            // Check if async processing is enabled
            const useAsyncProcessing = window.localStorage.getItem('minidev_use_async_processing') === 'true' ||
                                       process.env.NEXT_PUBLIC_USE_ASYNC_PROCESSING === 'true';

            // TEST MODE: Add this header to enable quick 30-second return for debugging
            const testQuickReturn = window.localStorage.getItem('minidev_test_quick_return') === 'true';
            if (testQuickReturn) {
                console.log('🧪 TEST MODE ENABLED: API will return after 30 seconds');
            }

            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionToken}`,
                    ...(testQuickReturn && { 'X-Test-Quick-Return': 'true' }),
                    ...(useAsyncProcessing && { 'X-Use-Async-Processing': 'true' })
                },
                body: JSON.stringify({
                    prompt: generationPrompt,
                    projectId: chatProjectId || undefined  // Pass existing project ID for chat preservation
                }),
            });

            console.log('📤 Sent /api/generate request with:', {
                hasChatProjectId: !!chatProjectId,
                chatProjectId,
                useAsyncProcessing
            });

            // Handle async processing response (202 Accepted)
            if (response.status === 202 && useAsyncProcessing) {
                const jobData = await response.json();
                console.log('🔄 Async job created:', jobData.jobId);

                // Add a message about async processing
                setChat(prev => [
                    ...prev,
                    {
                        role: 'ai',
                        content: `⏳ Your miniapp generation has started! This will take about ${jobData.estimatedTime || '5-10 minutes'}. I'll let you know when it's ready.`,
                        phase: 'building',
                        timestamp: Date.now()
                    }
                ]);

                // Start polling for job completion
                let project;
                try {
                    project = await pollJobStatus(jobData.jobId);
                } catch (pollError) {
                    console.error('❌ Async job failed:', pollError);
                    throw pollError; // Re-throw to be caught by outer catch block
                }

                // Project is now ready, continue with normal flow
                console.log('📦 Project generated successfully via async processing:', {
                    projectId: project.projectId,
                });

                // Rest of the success handling is below in the common code path
                console.log('✅ Generation complete, updating UI state...');
                onProjectGenerated(project);
                console.log('✅ Project state updated via onProjectGenerated');
                setCurrentPhase('editing');
                console.log('✅ Phase set to editing');

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

                return; // Exit early for async flow
            }

            // Handle synchronous response (200 OK)
            if (!response.ok) {
                const errorData = await response.json();
                const errorMessage = errorData.details || errorData.error || 'Failed to generate project';
                console.error('Generation error details:', errorData);
                throw new Error(errorMessage);
            }
            const project = await response.json();

            console.log('📦 Project generated successfully:', {
                projectId: project.projectId,
                chatProjectIdMatches: project.projectId === chatProjectId
            });

            // Chat messages are already in the right place! No migration needed
            // because /api/chat created the project first and saved messages there

            console.log('✅ Generation complete, updating UI state...');
            onProjectGenerated(project);
            console.log('✅ Project state updated via onProjectGenerated');
            setCurrentPhase('editing');
            console.log('✅ Phase set to editing');

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
                    content: `❌ ${errorMessage}`,
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
                                    <div className="mt-3 pt-3 border-t border-gray-200">
                                        <div className="flex items-center gap-2 mb-2">
                                            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span className="text-xs font-semibold text-green-600">
                                                {msg.changedFiles.length} file{msg.changedFiles.length !== 1 ? 's' : ''} updated
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-600 space-y-1">
                                            {msg.changedFiles.slice(0, 3).map((file, i) => (
                                                <div key={i} className="flex items-center gap-1">
                                                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                    <span className="font-mono">{file}</span>
                                                </div>
                                            ))}
                                            {msg.changedFiles.length > 3 && (
                                                <div className="text-xs text-gray-400 ml-4">
                                                    +{msg.changedFiles.length - 3} more file{msg.changedFiles.length - 3 !== 1 ? 's' : ''}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {aiLoading && (
                        <div className="flex justify-start">
                            <div className="rounded-lg px-4 py-3 max-w-[80%] bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 shadow-sm">
                                <div className="flex items-center gap-3">
                                    {/* Bouncing dots animation */}
                                    <div className="flex gap-1.5">
                                        <div
                                            className="w-2 h-2 bg-gray-600 rounded-full animate-bounce"
                                            style={{ animationDelay: '0ms', animationDuration: '1000ms' }}
                                        ></div>
                                        <div
                                            className="w-2 h-2 bg-gray-600 rounded-full animate-bounce"
                                            style={{ animationDelay: '150ms', animationDuration: '1000ms' }}
                                        ></div>
                                        <div
                                            className="w-2 h-2 bg-gray-600 rounded-full animate-bounce"
                                            style={{ animationDelay: '300ms', animationDuration: '1000ms' }}
                                        ></div>
                                    </div>
                                    <span className="text-sm text-gray-700 font-medium animate-pulse">
                                        Thinking...
                                    </span>
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