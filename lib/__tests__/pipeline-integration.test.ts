import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { executeEnhancedPipeline } from '../enhancedPipeline';
import { executeDiffBasedPipeline } from '../diffBasedPipeline';

// Mock the dependencies
jest.mock('../llmOptimizer', () => ({
  executeInitialGenerationPipeline: jest.fn().mockImplementation(async (userPrompt) => {
    console.log('Mock executeInitialGenerationPipeline called with:', { userPrompt });
    // Return mock generated files for initial generation
    return {
      files: [
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
      title: 'Token Airdrop',
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
      ],
      intentSpec: {
        feature: "Token Airdrop",
        requirements: ["Add wagmi hooks", "Implement airdrop logic"],
        targetFiles: ["src/app/page.tsx"],
        dependencies: [],
        needsChanges: true
      }
    };
  }),
  executeFollowUpPipeline: jest.fn().mockImplementation(async (userPrompt) => {
    console.log('Mock executeFollowUpPipeline called with:', { userPrompt });
    // For follow-up changes, return modified files
    return {
      files: [
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
  const { address: walletAddress } = useAccount();

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
      title: 'Token Airdrop',
      content: (
        <div className="space-y-4">
          <h1>Token Airdrop</h1>
          <p>Claim your eligible tokens</p>
          <button onClick={() => console.log('Claim tokens')}>Claim Tokens</button>
          <p>Wallet: {walletAddress ? \`\${walletAddress.slice(0, 6)}...\${walletAddress.slice(-4)}\` : 'Not connected'}</p>
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
      ],
      intentSpec: {
        feature: "Add wallet address display",
        requirements: ["Add wagmi hooks", "Display wallet address"],
        targetFiles: ["src/app/page.tsx"],
        dependencies: [],
        needsChanges: true
      }
    };
  }),
  getStage0ContextGathererPrompt: jest.fn(),
  STAGE_MODEL_CONFIG: {}
}));

jest.mock('../toolExecutionService', () => ({
  gatherContextWithTools: jest.fn().mockResolvedValue({
    contextResult: { needsContext: false, toolCalls: [] },
    enhancedFiles: [],
    contextData: 'Mock context data'
  }),
  executeToolCalls: jest.fn()
}));

jest.mock('../diffUtils', () => ({
  generateDiff: jest.fn(),
  validateDiff: jest.fn(),
  applyDiffToContent: jest.fn(),
  applyDiffHunks: jest.fn()
}));

describe('Pipeline Integration Tests', () => {
  let mockCallLLM: jest.MockedFunction<(systemPrompt: string, userPrompt: string, stageName: string) => Promise<string>>;
  let mockBoilerplateFiles: { filename: string; content: string }[];
  let mockCurrentFiles: { filename: string; content: string }[];

  beforeEach(() => {
    mockCallLLM = jest.fn().mockResolvedValue('Mock response');
    
    mockBoilerplateFiles = [
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

    mockCurrentFiles = [...mockBoilerplateFiles];
  });

  describe('Initial Generation (POST)', () => {
    it('should use full file generation for initial projects', async () => {
      const result = await executeEnhancedPipeline(
        'Create a token airdrop miniapp',
        mockBoilerplateFiles,
        'test-project',
        'test-token',
        mockCallLLM,
        true // isInitialGeneration = true
      );

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].filename).toBe('src/app/page.tsx');
      expect(result.files[0].content).toContain('Token Airdrop');
      expect(result.files[0].content).toContain('Claim your eligible tokens');
      // Should not have diff for initial generation
      expect(result.files[0].diff).toBeUndefined();
    });
  });

  describe('Follow-up Changes (PATCH)', () => {
    it('should use diff-based patching for follow-up changes', async () => {
      const result = await executeEnhancedPipeline(
        'Add wallet address display to the airdrop tab',
        mockCurrentFiles,
        'test-project',
        'test-token',
        mockCallLLM,
        false // isInitialGeneration = false
      );

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].filename).toBe('src/app/page.tsx');
      expect(result.files[0].content).toContain('import { useReadContract, useWriteContract } from \'wagmi\';');
      expect(result.files[0].content).toContain('import { useAccount } from \'wagmi\';');
      expect(result.files[0].content).toContain('Wallet:');
    });

    it('should use diff-based pipeline for surgical changes', async () => {
      const result = await executeDiffBasedPipeline(
        'Add wallet address display to the airdrop tab',
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

      expect(result.files).toHaveLength(1);
      expect(result.files[0].filename).toBe('src/app/page.tsx');
      expect(result.files[0].content).toContain('import { useReadContract, useWriteContract } from \'wagmi\';');
      expect(result.files[0].content).toContain('import { useAccount } from \'wagmi\';');
      expect(result.files[0].content).toContain('Wallet:');
    });
  });

  describe('Pipeline Behavior Differences', () => {
    it('should handle initial generation differently from follow-up changes', async () => {
      // Test initial generation
      const initialResult = await executeEnhancedPipeline(
        'Create a token airdrop miniapp',
        mockBoilerplateFiles,
        'test-project',
        'test-token',
        mockCallLLM,
        true // isInitialGeneration = true
      );

      // Test follow-up changes
      const followUpResult = await executeEnhancedPipeline(
        'Add wallet address display',
        mockCurrentFiles,
        'test-project',
        'test-token',
        mockCallLLM,
        false // isInitialGeneration = false
      );

      // Both should succeed
      expect(initialResult.success).toBe(true);
      expect(followUpResult.success).toBe(true);

      // Both should return files
      expect(initialResult.files).toHaveLength(1);
      expect(followUpResult.files).toHaveLength(1);

      // Initial generation should have complete file content
      expect(initialResult.files[0].content).toContain('Token Airdrop');
      
      // Follow-up changes should have modified content
      expect(followUpResult.files[0].content).toContain('useAccount');
    });
  });
});
