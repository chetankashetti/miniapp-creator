'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Monaco Editor (dynamically loaded for SSR)
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface GeneratedProject {
    projectId: string;
    port: number;
    url: string;
    generatedFiles?: string[];
}

interface CodeEditorProps {
    currentProject: GeneratedProject | null;
    onFileChange?: (filePath: string, content: string) => void;
    onSaveFile?: (filePath: string, content: string) => Promise<boolean>;
}

// Important files to show in the file tree
const IMPORTANT_FILES = [
    'src/app/page.tsx',
    'src/app/layout.tsx',
    'src/app/providers.tsx',
    'src/app/globals.css',
    'src/components/ui/Button.tsx',
    'src/components/ui/Input.tsx',
    'src/components/wallet/ConnectWallet.tsx',
    'src/lib/utils.ts',
    'src/lib/wagmi.ts',
    'src/types/index.ts',
    'package.json',
    'public/.well-known/farcaster.json'
];

// Files to exclude from display
const EXCLUDED_FILES = [
    'node_modules', '.git', '.next', 'dist', 'build',
    'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lockb',
    '.env', '.env.local', '.env.production',
    'README.md', '.gitignore'
];

// Fetch file content from the API
async function fetchFileContent(filePath: string, projectId?: string): Promise<string> {
    if (projectId) {
        try {
            const response = await fetch(`/api/files?file=${encodeURIComponent(filePath)}&projectId=${projectId}`);
            if (response.ok) {
                return await response.text();
            }
        } catch (error) {
            console.warn(`Failed to fetch file ${filePath}:`, error);
        }
    }
    return '// File not found or error loading content';
}

// Fetch list of available files from the project
async function fetchProjectFiles(projectId: string): Promise<string[]> {
    try {
        console.log(`🔍 Fetching project files for project: ${projectId}`);
        const response = await fetch(`/api/files?projectId=${projectId}&listFiles=true`);

        if (response.ok) {
            const responseText = await response.text();
            if (!responseText.trim()) {
                console.warn('⚠️ Empty response from server');
                return [];
            }

            try {
                const data = JSON.parse(responseText);
                return data.files || [];
            } catch (parseError) {
                console.error('❌ JSON parsing failed:', parseError);
                return [];
            }
        } else {
            console.error(`❌ HTTP error: ${response.status} ${response.statusText}`);
        }
    } catch (error) {
        console.error('❌ Network error fetching project files:', error);
    }
    return [];
}

// Create hierarchical file tree structure
interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'folder';
    children?: FileNode[];
    isExpanded?: boolean;
}

function createFileTree(files: string[]): FileNode[] {
    const tree: FileNode[] = [];
    const fileMap = new Map<string, FileNode>();

    // Filter important files and create nodes
    const importantFiles = files.filter(file =>
        !EXCLUDED_FILES.some(excluded => file.includes(excluded)) &&
        (IMPORTANT_FILES.includes(file) || file.startsWith('src/') || file.startsWith('public/'))
    );

    importantFiles.forEach(file => {
        const parts = file.split('/');
        let currentPath = '';

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isFile = i === parts.length - 1;
            currentPath = currentPath ? `${currentPath}/${part}` : part;

            if (!fileMap.has(currentPath)) {
                const node: FileNode = {
                    name: part,
                    path: currentPath,
                    type: isFile ? 'file' : 'folder',
                    children: [],
                    isExpanded: i < 2 // Expand first two levels by default
                };

                fileMap.set(currentPath, node);

                // Add to parent
                if (i > 0) {
                    const parentPath = parts.slice(0, i).join('/');
                    const parent = fileMap.get(parentPath);
                    if (parent) {
                        parent.children?.push(node);
                    }
                } else {
                    tree.push(node);
                }
            }
        }
    });

    return tree;
}

// File Tree View Component
interface FileTreeViewProps {
    nodes: FileNode[];
    selectedFile: string;
    onFileSelect: (filePath: string) => void;
}

function FileTreeView({ nodes, selectedFile, onFileSelect }: FileTreeViewProps) {
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

    const toggleFolder = (path: string) => {
        const newExpanded = new Set(expandedFolders);
        if (newExpanded.has(path)) {
            newExpanded.delete(path);
        } else {
            newExpanded.add(path);
        }
        setExpandedFolders(newExpanded);
    };

    const renderNode = (node: FileNode, level: number = 0) => {
        const isExpanded = expandedFolders.has(node.path);
        const isSelected = selectedFile === node.path;

        return (
            <div key={node.path}>
                <button
                    onClick={() => {
                        if (node.type === 'folder') {
                            toggleFolder(node.path);
                        } else {
                            onFileSelect(node.path);
                        }
                    }}
                    className={`w-full text-left px-2 py-1 rounded text-xs font-mono transition-colors ${isSelected
                        ? 'bg-black text-white'
                        : 'text-black hover:bg-black-10'
                        }`}
                    style={{ paddingLeft: `${level * 12 + 8}px` }}
                    title={node.path}
                >
                    <div className="flex items-center gap-2">
                        {node.type === 'folder' ? (
                            <svg
                                className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        ) : (
                            <span>📄</span>
                        )}
                        <span className="truncate">{node.name}</span>
                    </div>
                </button>
                {node.type === 'folder' && isExpanded && node.children && (
                    <div className="ml-2">
                        {node.children.map(child => renderNode(child, level + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-1">
            {nodes.map(node => renderNode(node))}
        </div>
    );
}

export function CodeEditor({ currentProject, onFileChange }: CodeEditorProps) {
    const [selectedFile, setSelectedFile] = useState<string>('');
    const [fileContent, setFileContent] = useState<string>('');
    const [fileTree, setFileTree] = useState<FileNode[]>([]);
    // const [isSaving, setIsSaving] = useState(false);
    // const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    // const [isCollapsed, setIsCollapsed] = useState(false);

    // Fetch project files when project is created
    useEffect(() => {
        if (currentProject) {
            fetchProjectFiles(currentProject.projectId).then(files => {
                setFileTree(createFileTree(files));
                // Set first available file as selected
                if (files.length > 0) {
                    const firstFile = files.find(f => f.includes('page.tsx')) || files[0];
                    setSelectedFile(firstFile);
                }
            });
        }
    }, [currentProject]);

    // Fetch file content when selected file changes
    useEffect(() => {
        if (currentProject && selectedFile) {
            fetchFileContent(selectedFile, currentProject.projectId).then(setFileContent);
            // setHasUnsavedChanges(false);
        }
    }, [selectedFile, currentProject]);

    const handleFileChange = (newContent: string | undefined) => {
        if (newContent !== undefined && newContent !== fileContent) {
            setFileContent(newContent);
            // setHasUnsavedChanges(true);
            onFileChange?.(selectedFile, newContent);
        }
    };

    // const handleSaveFile = async () => {
    //     if (!currentProject || !selectedFile || !hasUnsavedChanges) return;

    //     setIsSaving(true);
    //     try {
    //         let success = false;
    //         if (onSaveFile) {
    //             success = await onSaveFile(selectedFile, fileContent);
    //         } else {
    //             // Fallback to default save behavior
    //             const response = await fetch('/api/files', {
    //                 method: 'PUT',
    //                 headers: { 'Content-Type': 'application/json' },
    //                 body: JSON.stringify({ projectId: currentProject.projectId, filename: selectedFile, content: fileContent }),
    //             });
    //             success = response.ok;
    //         }

    //         if (success) {
    //             setHasUnsavedChanges(false);
    //             console.log('File saved successfully');
    //         } else {
    //             console.error('Failed to save file');
    //         }
    //     } catch (error) {
    //         console.error('Failed to save file:', error);
    //     } finally {
    //         setIsSaving(false);
    //     }
    // };



    const getLanguage = (filename: string) => {
        if (filename.endsWith('.json')) return 'json';
        if (filename.endsWith('.css')) return 'css';
        if (filename.endsWith('.md')) return 'markdown';
        if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return 'typescript';
        if (filename.endsWith('.js') || filename.endsWith('.jsx')) return 'javascript';
        return 'typescript';
    };

    if (!currentProject) {
        return (
            <div className="h-full flex flex-col bg-white rounded-lg">
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-black-60 text-sm text-center">
                        Project files will appear here after generation.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-white">
            <div className="flex flex-1">
                {/* File Tree Sidebar */}
                <div className="w-64 border-r border-black-10 bg-black-5 p-4 overflow-y-auto">
                    <div className="text-xs font-semibold text-black mb-3">Project Files</div>
                    <FileTreeView
                        nodes={fileTree}
                        selectedFile={selectedFile}
                        onFileSelect={setSelectedFile}
                    />
                </div>
                {/* Editor */}
                <div className="flex-1 flex flex-col">
                    {/* Editor Header */}
                    <div className="flex items-center justify-between p-3 border-b border-black-10">
                        <div className="text-sm font-medium text-black">
                            {selectedFile ? selectedFile : 'Select a file'}
                        </div>
                    </div>

                    {/* Monaco Editor */}
                    <div className="flex-1">
                        {selectedFile ? (
                            <MonacoEditor
                                height="100%"
                                language={getLanguage(selectedFile)}
                                value={fileContent}
                                onChange={handleFileChange}
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 12,
                                    wordWrap: 'on',
                                    lineNumbers: 'on',
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true,
                                    readOnly: true,
                                    theme: 'vs-light'
                                }}
                            />
                        ) : (
                            <div className="text-black-60 text-sm text-center flex-1 flex items-center justify-center">
                                Select a file to edit
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
} 