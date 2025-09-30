import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { executeDiffBasedPipeline, applyDiffsToFiles, storeDiffs, rollbackDiffs } from '../diffBasedPipeline';
import { FileDiff } from '../diffBasedPipeline';

// Mock the dependencies
jest.mock('../llmOptimizer', () => ({
  executeMultiStagePipeline: jest.fn().mockImplementation(async (userPrompt, currentFiles, callLLM, projectId, isInitialGeneration) => {
    console.log('Mock executeMultiStagePipeline called with:', { userPrompt, isInitialGeneration });
    // Return mock generated files
    return [
      {
        filename: 'src/app/page.tsx',
        content: `'use client';

import { ConnectWallet } from '@/components/wallet/ConnectWallet';
import { Tabs } from '@/components/ui/Tabs';
import { useReadContract, useWriteContract } from 'wagmi';
import { useAccount } from 'wagmi';
import { useUser } from '@/hooks';

export default function App() {
  const { username, displayName, address, fid, isMiniApp, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="miniapp-container">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <div className="text-white">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  const userDisplayName = isMiniApp
    ? (displayName || username)
    : (address ? \`Wallet: \${address.slice(0, 6)}...\${address.slice(-4)}\` : null);

  const welcomeMessage = userDisplayName
    ? \`Welcome, \${userDisplayName}\`
    : 'Connect wallet and start building';

  const tabs = [
    {
      id: 'tab1',
      title: 'Tab1',
      content: (
        <div className="space-y-4">
          <h1>Token Airdrop</h1>
          <p>Claim your eligible tokens</p>
          <button onClick={() => console.log('Claim tokens')}>Claim Tokens</button>
        </div>
      )
    },
    {
      id: 'tab2',
      title: 'Tab2',
      content: (
        <div className="space-y-4">
          <h1>Tab 2 Content</h1>
        </div>
      )
    }
  ];

  return (
    <div className="miniapp-container">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            {isMiniApp ? 'Farcaster Miniapp' : 'Web3 App'}
          </h1>
          <p className="text-lg text-gray-200">
            {welcomeMessage}
          </p>
        </header>

        {isMiniApp ? (
          <div className="bg-gray-800 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-white mb-2">Farcaster User Info</h3>
            <div className="space-y-1 text-sm">
              {fid && <p>FID: {fid}</p>}
              {username && <p>Username: @{username}</p>}
              {displayName && <p>Display Name: {displayName}</p>}
              {address && <p>Address: {address.slice(0, 6)}...{address.slice(-4)}</p>}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <ConnectWallet />
            {address && (
              <div className="bg-gray-800 p-4 rounded-lg">
                <h3 className="text-lg font-medium text-white mb-2">Wallet Info</h3>
                <p className="text-sm font-mono">
                  {address}
                </p>
              </div>
            )}
          </div>
        )}

        <main className="max-w-2xl mx-auto my-4">
          <Tabs tabs={tabs} defaultTab="tab1" />
        </main>
      </div>
    </div>
  );
}`
      }
    ];
  }),
  getStage0ContextGathererPrompt: jest.fn(),
  STAGE_MODEL_CONFIG: {}
}));
jest.mock('../diffUtils', () => ({
  applyDiffHunks: jest.fn((content: string, hunks: unknown[]) => {
    console.log('Mock applyDiffHunks called with:', { content, hunks });
    // Simple mock implementation that adds a line
    return content + '\nline1.5';
  }),
  applyDiffToContent: jest.fn((content: string, unifiedDiff: string) => {
    console.log('Mock applyDiffToContent called with:', { content, unifiedDiff });
    // Simple mock implementation that adds wagmi imports
    return content.replace(
      "import { useUser } from '@/hooks';",
      "import { useReadContract, useWriteContract } from 'wagmi';\nimport { useAccount } from 'wagmi';\nimport { useUser } from '@/hooks';"
    );
  }),
  generateDiff: jest.fn(),
  validateDiff: jest.fn(),
  createMinimalDiff: jest.fn()
}));
jest.mock('../toolExecutionService');

describe('Diff-Based Pipeline', () => {
  let mockCallLLM: jest.MockedFunction<(systemPrompt: string, userPrompt: string, stageName: string) => Promise<string>>;
  let mockCurrentFiles: { filename: string; content: string }[];

  beforeEach(() => {
    mockCallLLM = jest.fn().mockImplementation(async (systemPrompt: string, userPrompt: string, stageName: string) => {
      if (stageName === "Stage 0: Context Gatherer") {
        return JSON.stringify({ needsContext: false, toolCalls: [], contextSummary: "No context needed" });
      }
      if (stageName === "Stage 1: Intent Parser") {
        return JSON.stringify({
          feature: "Add token airdrop functionality",
          requirements: ["Add wagmi hooks", "Implement airdrop logic"],
          targetFiles: ["src/app/page.tsx"],
          dependencies: [],
          needsChanges: true
        });
      }
      if (stageName === "Stage 2: Patch Planner") {
        return JSON.stringify({
          patches: [
            {
              filename: "src/app/page.tsx",
              operation: "modify",
              purpose: "Add wagmi hooks for token airdrop",
              changes: [],
              diffHunks: [
                {
                  oldStart: 1, oldLines: 3, newStart: 1, newLines: 5,
                  lines: [
                    " import { ConnectWallet } from '@/components/wallet/ConnectWallet';",
                    " import { Tabs } from '@/components/ui/Tabs';",
                    "+import { useReadContract, useWriteContract } from 'wagmi';",
                    "+import { useAccount } from 'wagmi';",
                    " import { useUser } from '@/hooks';"
                  ]
                }
              ],
              unifiedDiff: "@@ -1,3 +1,5 @@\n import { ConnectWallet } from '@/components/wallet/ConnectWallet';\n import { Tabs } from '@/components/ui/Tabs';\n+import { useReadContract, useWriteContract } from 'wagmi';\n+import { useAccount } from 'wagmi';\n import { useUser } from '@/hooks';"
            }
          ]
        });
      }
      if (stageName === "Stage 3: Code Generator") {
        return JSON.stringify([
          {
            filename: "src/app/page.tsx",
            operation: "modify",
            unifiedDiff: "@@ -1,3 +1,5 @@\n import { ConnectWallet } from '@/components/wallet/ConnectWallet';\n import { Tabs } from '@/components/ui/Tabs';\n+import { useReadContract, useWriteContract } from 'wagmi';\n+import { useAccount } from 'wagmi';\n import { useUser } from '@/hooks';",
            diffHunks: [
              {
                oldStart: 1, oldLines: 3, newStart: 1, newLines: 5,
                lines: [
                  " import { ConnectWallet } from '@/components/wallet/ConnectWallet';",
                  " import { Tabs } from '@/components/ui/Tabs';",
                  "+import { useReadContract, useWriteContract } from 'wagmi';",
                  "+import { useAccount } from 'wagmi';",
                  " import { useUser } from '@/hooks';"
                ]
              }
            ]
          }
        ]);
      }
      if (stageName === "Stage 4: Validator") {
        return JSON.stringify([]); // No fixes needed
      }
      return JSON.stringify({});
    });
    mockCurrentFiles = [
      {
        filename: 'src/app/page.tsx',
        content: `'use client';

import { ConnectWallet } from '@/components/wallet/ConnectWallet';
import { Tabs } from '@/components/ui/Tabs';
import { useUser } from '@/hooks';

export default function App() {
  const { username, displayName, address, fid, isMiniApp, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="miniapp-container">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <div className="text-white">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  const userDisplayName = isMiniApp
    ? (displayName || username)
    : (address ? \`Wallet: \${address.slice(0, 6)}...\${address.slice(-4)}\` : null);

  const welcomeMessage = userDisplayName
    ? \`Welcome, \${userDisplayName}\`
    : 'Connect wallet and start building';

  const tabs = [
    {
      id: 'tab1',
      title: 'Tab1',
      content: (
        <div className="space-y-4">
          <h1>Tab 1 Content</h1>
        </div>
      )
    },
    {
      id: 'tab2',
      title: 'Tab2',
      content: (
        <div className="space-y-4">
          <h1>Tab 2 Content</h1>
        </div>
      )
    }
  ];

  return (
    <div className="miniapp-container">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            {isMiniApp ? 'Farcaster Miniapp' : 'Web3 App'}
          </h1>
          <p className="text-lg text-gray-200">
            {welcomeMessage}
          </p>
        </header>

        {isMiniApp ? (
          <div className="bg-gray-800 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-white mb-2">Farcaster User Info</h3>
            <div className="space-y-1 text-sm">
              {fid && <p>FID: {fid}</p>}
              {username && <p>Username: @{username}</p>}
              {displayName && <p>Display Name: {displayName}</p>}
              {address && <p>Address: {address.slice(0, 6)}...{address.slice(-4)}</p>}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <ConnectWallet />
            {address && (
              <div className="bg-gray-800 p-4 rounded-lg">
                <h3 className="text-lg font-medium text-white mb-2">Wallet Info</h3>
                <p className="text-sm font-mono">
                  {address}
                </p>
              </div>
            )}
          </div>
        )}

        <main className="max-w-2xl mx-auto my-4">
          <Tabs tabs={tabs} defaultTab="tab1" />
        </main>
      </div>
    </div>
  );
}`
      }
    ];
  });

  describe('executeDiffBasedPipeline', () => {
    it('should execute the diff-based pipeline successfully', async () => {
      const result = await executeDiffBasedPipeline(
        'Add token airdrop functionality to Tab1',
        mockCurrentFiles,
        mockCallLLM,
        {
          enableContextGathering: true,
          enableDiffValidation: true,
          enableLinting: true
        },
        'test-project',
        '/test/dir'
      );

      expect(result).toBeDefined();
      expect(result.files).toHaveLength(1);
      expect(result.files[0].filename).toBe('src/app/page.tsx');
      expect(result.files[0].content).toContain('import { useReadContract, useWriteContract } from \'wagmi\';');
      expect(result.files[0].content).toContain('import { useAccount } from \'wagmi\';');
      expect(result.files[0].content).toContain('Token Airdrop');
    });

    it('should handle context gathering when needed', async () => {
      const result = await executeDiffBasedPipeline(
        'Add state management to the app',
        mockCurrentFiles,
        mockCallLLM,
        { enableContextGathering: true },
        'test-project',
        '/test/dir'
      );

      expect(result).toBeDefined();
      expect(result.files).toHaveLength(1);
    });

    it('should handle new file creation', async () => {
      const result = await executeDiffBasedPipeline(
        'Create a Button component',
        mockCurrentFiles,
        mockCallLLM,
        {},
        'test-project',
        '/test/dir'
      );

      expect(result).toBeDefined();
      expect(result.files).toHaveLength(1);
      expect(result.files[0].filename).toBe('src/app/page.tsx');
    });
  });

  describe('applyDiffsToFiles', () => {
    it('should apply diffs to existing files', () => {
      const files = [
        {
          filename: 'test.ts',
          content: 'line1\nline2\nline3'
        }
      ];

      const diffs: FileDiff[] = [
        {
          filename: 'test.ts',
          hunks: [
            {
              oldStart: 1,
              oldLines: 3,
              newStart: 1,
              newLines: 4,
              lines: [
                ' line1',
                '+line1.5',
                ' line2',
                ' line3'
              ]
            }
          ],
          unifiedDiff: '@@ -1,3 +1,4 @@\n line1\n+line1.5\n line2\n line3'
        }
      ];

      console.log('Files before:', files);
      console.log('Diffs:', diffs);
      
      const result = applyDiffsToFiles(files, diffs);

      console.log('Files after:', files);
      console.log('Result:', result);
      console.log('Result length:', result.length);
      console.log('Result[0]:', result[0]);
      console.log('Result[0].content:', result[0]?.content);

      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe('test.ts');
      expect(result[0].content).toContain('line1.5');
    });

    it('should handle files without diffs', () => {
      const files = [
        {
          filename: 'test.ts',
          content: 'line1\nline2\nline3'
        }
      ];

      const diffs: FileDiff[] = [];

      const result = applyDiffsToFiles(files, diffs);

      expect(result).toEqual([]);
    });
  });

  describe('storeDiffs', () => {
    it('should store diffs for rollback', () => {
      const projectId = 'test-project';
      const diffs: FileDiff[] = [
        {
          filename: 'test.ts',
          hunks: [],
          unifiedDiff: 'test diff'
        }
      ];

      // Mock console.log to verify the function is called
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      storeDiffs(projectId, diffs);

      expect(consoleSpy).toHaveBeenCalledWith(`📦 Storing ${diffs.length} diffs for project ${projectId}`);
      expect(consoleSpy).toHaveBeenCalledWith('Diffs to store:', diffs);

      consoleSpy.mockRestore();
    });
  });

  describe('rollbackDiffs', () => {
    it('should rollback diffs', () => {
      const projectId = 'test-project';
      const diffs: FileDiff[] = [
        {
          filename: 'test.ts',
          hunks: [],
          unifiedDiff: 'test diff'
        }
      ];

      const result = rollbackDiffs(projectId, diffs);

      expect(result).toEqual([]);
    });
  });
});
