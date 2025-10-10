// Multi-stage LLM optimization utilities for Farcaster Miniapp generation

import * as fs from 'fs';
import * as path from 'path';
import { parseUnifiedDiff, applyDiffToContent } from './diffUtils';
import { applyDiffsToFiles } from './diffBasedPipeline';
import { 
  parseStage2PatchResponse, 
  parseStage3CodeResponse, 
  parseStage4ValidatorResponse,
  isResponseTruncated 
} from './parserUtils';
import { CompilationValidator, CompilationResult, CompilationError, CompilationErrorUtils } from './compilationValidator';
import { createRailwayValidationClient, RailwayValidationResult, RailwayValidationError } from './railwayValidationClient';

// Debug logging utilities
const createDebugLogDir = (projectId: string): string => {
  const debugDir = path.join(process.cwd(), 'debug-logs', projectId);
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
  }
  return debugDir;
};

const logStageResponse = (projectId: string, stageName: string, response: string, metadata?: Record<string, unknown>): void => {
  try {
    const logContent = {
      timestamp: new Date().toISOString(),
      stage: stageName,
      projectId,
      metadata,
      responseLength: response.length,
      response: response
    };
    
    // In production (Vercel), use structured console logging instead of file system
    if (process.env.NODE_ENV === 'production') {
      console.log(`[${stageName}] ${JSON.stringify(logContent)}`);
    } else {
      // In development, still write to files
      const debugDir = createDebugLogDir(projectId);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${stageName}-${timestamp}.log`;
      const filepath = path.join(debugDir, filename);
      
      fs.writeFileSync(filepath, JSON.stringify(logContent, null, 2));
      console.log(`📝 Debug log saved: ${filepath}`);
    }
  } catch (error) {
    console.error('Failed to write debug log:', error);
  }
};

// Anthropic Model Selection for Different Stages
export const ANTHROPIC_MODELS = {
  // Fast, cost-effective for simple tasks
  FAST: "claude-3-5-haiku-20241022",
  // Balanced performance for most tasks
  BALANCED: "claude-3-7-sonnet-20250219",
  // High performance for complex tasks
  // POWERFUL: "claude-3-7-sonnet-20250219",
  POWERFUL: "claude-sonnet-4-20250514",
} as const;

// Model selection strategy for each stage with fallbacks
export const STAGE_MODEL_CONFIG = {
  STAGE_0_CONTEXT_GATHERER: {
    model: ANTHROPIC_MODELS.FAST,
    fallbackModel: ANTHROPIC_MODELS.BALANCED,
    maxTokens: 2000,
    temperature: 0,
    reason: "Context gathering needs to be fast and efficient",
  },
  STAGE_1_INTENT_PARSER: {
    model: ANTHROPIC_MODELS.FAST,
    fallbackModel: ANTHROPIC_MODELS.BALANCED, // Use Sonnet if Haiku is overloaded
    maxTokens: 4000,
    temperature: 0,
    reason: "Simple JSON parsing task, fast model sufficient",
  },
  STAGE_2_PATCH_PLANNER: {
    model: ANTHROPIC_MODELS.BALANCED,
    fallbackModel: ANTHROPIC_MODELS.POWERFUL, // Use latest Sonnet if regular Sonnet is overloaded
    maxTokens: 4000,
    temperature: 0,
    reason: "Complex planning task, needs good reasoning and more tokens for detailed diffs",
  },
  STAGE_3_CODE_GENERATOR: {
    model: ANTHROPIC_MODELS.POWERFUL,
    fallbackModel: ANTHROPIC_MODELS.BALANCED, // Use regular Sonnet if latest Sonnet is overloaded
    maxTokens: 40000,
    temperature: 0.1,
    reason: "Complex code generation, needs highest quality and more tokens for large projects",
  },
  STAGE_4_VALIDATOR: {
    model: ANTHROPIC_MODELS.BALANCED,
    fallbackModel: ANTHROPIC_MODELS.POWERFUL, // Use Haiku if Sonnet is overloaded
    maxTokens: 10000,
    temperature: 0,
    reason: "Error fixing requires good reasoning but not highest tier",
  },
  LEGACY_SINGLE_STAGE: {
    model: ANTHROPIC_MODELS.POWERFUL,
    fallbackModel: ANTHROPIC_MODELS.BALANCED, // Use regular Sonnet if latest Sonnet is overloaded
    maxTokens: 20000,
    temperature: 0,
    reason: "Single-stage does everything, needs highest quality",
  },
} as const;

// Farcaster Miniapp Boilerplate Structure
const BOILERPLATE_STRUCTURE = `
farcaster-miniapp/
├── public/
│   ├── .well-known/
│   │   └── farcaster.json          # Farcaster manifest (optional)
│   └── (static files)              # Icons, images, etc.
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout with providers
│   │   ├── page.tsx                # Main app component with tabs
│   │   ├── providers.tsx           # SDK and wallet providers
│   │   ├── globals.css             # Global styles
│   │   ├── favicon.ico             # App favicon
│   │   └── api/                    # API routes
│   │       └── me/                 # User authentication endpoint
│   │           └── route.ts        # Farcaster Quick Auth API
│   ├── components/
│   │   ├── ui/                     # Reusable UI components
│   │   │   ├── Button.tsx          # Styled button component
│   │   │   ├── Input.tsx           # Styled input component
│   │   │   └── Tabs.tsx            # Tab navigation component
│   │   ├── auth/                   # Authentication components
│   │   └── wallet/                 # Wallet integration
│   │       └── ConnectWallet.tsx   # Wallet connection UI
│   ├── hooks/                      # Custom React hooks
│   │   ├── useUser.ts              # Unified user hook (Farcaster + Wallet)
│   │   └── index.ts                # Hook exports
│   ├── lib/
│   │   ├── utils.ts                # Utility functions (cn, truncateAddress)
│   │   └── wagmi.ts                # Web3 configuration
│   └── types/
│       └── index.ts                # TypeScript definitions
├── contracts/                      # Smart contract templates
│   ├── ERC20Template.sol           # Secure ERC20 token template
│   ├── ERC721Template.sol          # Secure ERC721 NFT template
│   ├── EscrowTemplate.sol          # Secure escrow contract template
│   ├── hardhat.config.js           # Hardhat configuration
│   ├── package.json                # Contract dependencies
│   └── scripts/
│       └── deploy.js               # Deployment script
├── package.json                    # Dependencies
├── next.config.ts                  # Next.js configuration
├── tsconfig.json                   # TypeScript configuration
├── eslint.config.mjs               # ESLint configuration
├── postcss.config.mjs              # PostCSS configuration
├── next-env.d.ts                   # Next.js types
├── .gitignore                      # Git ignore file
└── README.md                       # Project documentation
`;

// Enhanced boilerplate context with available features
const FARCASTER_BOILERPLATE_CONTEXT = {
  structure: BOILERPLATE_STRUCTURE,
  availableFeatures: {
    sdk: "@farcaster/miniapp-sdk",
    wallet: "@farcaster/miniapp-wagmi-connector",
    ui: "Available UI components: Button, Input, ConnectWallet, Tabs",
    hooks: "useUser hook for unified user data",
    contracts:
      "Wagmi hooks: useReadContract, useWriteContract, useWaitForTransactionReceipt",
    environment: "Automatic environment detection (sdk.isInMiniApp())",
    navigation: "Tab-based single page application",
    smartContracts: {
      erc20: "ERC20Template.sol - Secure token template with minting, burning, pausable",
      erc721: "ERC721Template.sol - Secure NFT template with metadata, enumerable, batch minting",
      escrow: "EscrowTemplate.sol - Secure escrow with dispute resolution, multi-token support",
      security: "All templates use OpenZeppelin standards with access controls and reentrancy protection"
    },
  },
  constraints: {
    mobileFirst: "375px width, touch targets ≥44px",
    singlePage: "Tab-based SPA, all logic in src/app/page.tsx",
    connectors:
      "Only farcasterMiniApp() from @farcaster/miniapp-wagmi-connector",
    userManagement: "Always use useUser hook from @/hooks for user data",
    noPackageChanges: "Do not modify package.json unless absolutely necessary",
    wagmiConfig: "Do not modify wagmi.ts - it has everything needed",
  },
  keyComponents: {
    useUser: {
      location: "src/hooks/useUser.ts",
      purpose: "Unified user authentication for Farcaster miniapp and browser",
      usage: "const { username, fid, isMiniApp, isLoading } = useUser()",
      features: [
        "Auto-detects Farcaster miniapp vs browser",
        "Provides Farcaster user data (fid, username, displayName, pfpUrl)",
        "Handles loading states and errors",
        "Single source of truth for user data",
      ],
    },
    tabs: {
      location: "src/components/ui/Tabs.tsx",
      purpose: "Mobile-friendly tab navigation",
      usage:
        "Import Tabs component and pass tabs array with id, title, content",
    },
    layout: {
      location: "src/app/page.tsx",
      structure: "Header + Tab Navigation + Content areas",
      responsive: "Mobile-first design with proper spacing",
    },
  },
};

// Stage 0: Context Gatherer Types and Prompts
//
// PURPOSE: Stage 0 determines if additional context is needed before processing the user request.
// It can request tool calls to explore the codebase and gather information.
//
// KEY PRINCIPLE: GATHER CONTEXT FIRST - UNDERSTAND THE CODEBASE BEFORE MAKING CHANGES
//
export interface ContextGatheringResult {
  needsContext: boolean;
  toolCalls: Array<{
    tool: string;
    args: string[];
    workingDirectory?: string;
    reason: string;
  }>;
  contextSummary?: string;
}

export function getStage0ContextGathererPrompt(
  userPrompt: string,
  currentFiles: { filename: string; content: string }[]
): string {
  return `
ROLE: Context Gatherer for Farcaster Miniapp

TASK: Analyze if additional context is needed before processing the user request. If the request is vague or requires understanding existing code structure, request tool calls to gather context.

USER REQUEST: ${userPrompt}

CURRENT FILES AVAILABLE:
${currentFiles.map(f => `- ${f.filename}`).join('\n')}

AVAILABLE TOOLS:
- grep: Search for patterns in files
  Usage: {"tool": "grep", "args": ["pattern", "file_or_directory"], "workingDirectory": "src"}
  Example: {"tool": "grep", "args": ["useState", "app/page.tsx"], "workingDirectory": "src"}
  
- cat: Read complete file contents  
  Usage: {"tool": "cat", "args": ["file_path"], "workingDirectory": "src"}
  Example: {"tool": "cat", "args": ["components/TodoList.tsx"], "workingDirectory": "src"}
  
- find: Find files by name pattern
  Usage: {"tool": "find", "args": [".", "-name", "*.tsx"], "workingDirectory": "src"}
  
- ls: List directory contents
  Usage: {"tool": "ls", "args": ["-la", "components"], "workingDirectory": "src"}

TOOL USAGE RULES:
- ALWAYS use "src" as workingDirectory for React components
- For grep: Use specific file paths rather than broad directory searches
- For file paths: Use relative paths from the workingDirectory (e.g., "app/page.tsx", not "src/app/page.tsx")
- Avoid complex patterns that might fail - keep searches simple and specific

CRITICAL: You MUST return ONLY valid JSON. No explanations, no text, no markdown, no code fences.

OUTPUT FORMAT (JSON ONLY):
{
  "needsContext": boolean,
  "toolCalls": [
    {
      "tool": "grep",
      "args": ["pattern", "file_path"],
      "workingDirectory": "src",
      "reason": "Need to find all instances of useState hook usage"
    }
  ],
  "contextSummary": "Brief summary of what context is being gathered"
}

DECISION RULES:
- If user request is specific and clear (e.g., "Add a button to Tab1"), set needsContext: false
- If user request is vague (e.g., "Fix the bug", "Improve the UI"), set needsContext: true
- If user mentions specific files/functions but they're not in current files, set needsContext: true
- If user wants to modify existing functionality, set needsContext: true
- Always provide clear reason for each tool call
- Limit to 3 tool calls maximum
- Use workingDirectory to scope searches appropriately

EXAMPLES:

User: "Add a token airdrop feature"
Output: {"needsContext": true, "toolCalls": [{"tool": "grep", "args": ["useAccount|useUser", "src"], "workingDirectory": "src", "reason": "Need to understand current wallet integration"}], "contextSummary": "Understanding wallet integration for token airdrop"}

User: "Change the button color in Tab1 to blue"
Output: {"needsContext": false, "toolCalls": [], "contextSummary": "Specific UI change, no additional context needed"}

User: "Fix the bug in the voting system"
Output: {"needsContext": true, "toolCalls": [{"tool": "grep", "args": ["voting|vote|poll", "src"], "workingDirectory": "src", "reason": "Need to find voting-related code to understand the bug"}], "contextSummary": "Finding voting system code to identify the bug"}

REMEMBER: Return ONLY the JSON object above. No other text, no explanations, no markdown formatting.
`;
}

// Stage 1: Intent Parser Types and Prompts
export interface IntentSpec {
  feature: string;
  requirements: string[];
  targetFiles: string[];
  dependencies: string[];
  contractInteractions?: {
    reads: string[];
    writes: string[];
  };
  // New field to indicate if changes are needed
  needsChanges: boolean;
  reason?: string; // Why changes are needed or not needed
}

export function getStage1IntentParserPrompt(): string {
  return `
ROLE: Intent Parser for Farcaster Miniapp Generation

TASK: Parse user request into structured JSON specification and determine if changes are needed

BOILERPLATE CONTEXT:
${JSON.stringify(FARCASTER_BOILERPLATE_CONTEXT, null, 2)}

AVAILABLE FEATURES:
- Farcaster SDK integration (@farcaster/miniapp-sdk)
- Wallet connection (farcasterMiniApp() from @farcaster/miniapp-wagmi-connector)
- ALWAYS use useUser hook from @/hooks for user data like username, fid, displayName, pfpUrl, etc. and always take address from useAccount hook from wagmi
- Tab-based single page application (Tabs component from @/components/ui/Tabs)
- Mobile-first UI components (Button, Input, ConnectWallet, Tabs)
- Automatic environment detection (Mini App vs Browser)
- Pre-configured API endpoint for Farcaster authentication (/api/me)
- Do not change wagmi.ts file - it has everything you need
- Do not modify package.json unless absolutely necessary

CRITICAL: You MUST return ONLY valid JSON. No explanations, no text, no markdown, no code fences.

CURRENT PACKAGE.JSON:
${JSON.stringify(
  {
    name: "farcaster-miniapp",
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "next dev",
      build: "next build",
      start: "next start",
      lint: "next lint",
    },
    dependencies: {
      "@farcaster/miniapp-sdk": "^0.1.7",
      "@farcaster/miniapp-wagmi-connector": "^1.0.0",
      "@farcaster/quick-auth": "^0.0.7",
      "@rainbow-me/rainbowkit": "^2.0.0",
      "@tanstack/react-query": "^5.83.0",
      "class-variance-authority": "^0.7.0",
      clsx: "^2.1.0",
      ethers: "^6.11.0",
      "lucide-react": "^0.525.0",
      next: "15.2.0",
      react: "^19.0.0",
      "react-dom": "^19.0.0",
      viem: "^2.7.0",
      wagmi: "^2.5.0",
    },
    devDependencies: {
      "@eslint/eslintrc": "^3",
      "@tailwindcss/postcss": "^4",
      "@types/node": "^20",
      "@types/react": "^19",
      "@types/react-dom": "^19",
      eslint: "^9",
      "eslint-config-next": "15.2.0",
      tailwindcss: "^4",
      typescript: "^5",
    },
  },
  null,
  2
)}

OUTPUT FORMAT (JSON ONLY):
{
  "feature": "string describing main feature",
  "requirements": ["list", "of", "requirements"],
  "targetFiles": ["files", "to", "modify"],
  "dependencies": ["npm", "packages", "needed"],
  "needsChanges": boolean,
  "reason": "string explaining why changes are/aren't needed",
  "contractInteractions": {
    "reads": ["contract functions to read"],
    "writes": ["contract functions to write"]
  }
}

RULES:
- If user just asks for "miniapp" without specific features → needsChanges: false
- If user asks for specific functionality → needsChanges: true
- If functionality involves blockchain (e.g., polls, votes, tokens, airdrops, etc.) → prioritize Web3 integration
- Analyze user intent carefully
- Identify required files to modify (empty array if no changes needed)
- List all npm dependencies needed (empty array if no changes needed)
- For IPFS/storage: use "web3.storage" (not @web3-storage/web3-storage)
- Specify contract interactions if any
- Provide clear reason for decision
- Return valid JSON only
- NO EXPLANATIONS, NO TEXT, ONLY JSON

EXAMPLE  1:
User: “Create a miniapp with a token airdrop component”
Output:
{
  "feature": "Token Airdrop",
  "requirements": ["Create a token airdrop component in Tab1", "Display a list of recipients", "Allow users to claim tokens", "Use useAccount hook from wagmi for wallet address"],
  "targetFiles": ["src/app/page.tsx"],
  "dependencies": [],
  "needsChanges": true,
  "reason": "Token airdrop requires new UI and contract integration in tabs",
  "contractInteractions": {
    "reads": ["fetchTokenBalance", "fetchTokenAllowance", "fetchTokenTotalSupply"],
    "writes": ["transferTokens", "approveTokens", "mintTokens", "burnTokens"]
  }
}

EXAMPLE 2:
User: “Create miniapp”
Output:
{"feature":"bootstrap","requirements":[],"targetFiles":[],"dependencies":[],"needsChanges":false,"reason":"no specific feature","contractInteractions":{"reads":[],"writes":[]}}

EXAMPLE 3:
User: “Add polls feature to miniapp”
Output:
{"feature":"polls","requirements":["createPoll","castVote","fetchPollResults","display in tabs","use useUser for authentication"],"targetFiles":["src/app/page.tsx"],"dependencies":[],"needsChanges":true,"reason":"polls require new UI and contract integration in tab layout","contractInteractions":{"reads":["fetchPollResults","getPollById"],"writes":["createPoll","castVote"]}}
REMEMBER: Return ONLY the JSON object above. No other text, no explanations, no markdown formatting.
`;
}

// Stage 2: Patch Planner Types and Prompts
//
// PURPOSE: Stage 2 creates DETAILED PLANNING without generating actual code.
// It provides comprehensive descriptions of what needs to be implemented so that
// Stage 3 can generate the exact code based on these detailed specifications.
//
// KEY PRINCIPLE: NO CODE GENERATION - ONLY DETAILED PLANNING AND DESCRIPTIONS
//
export interface PatchPlan {
  patches: {
    filename: string;
    operation: "create" | "modify" | "delete";
    purpose: string; // High-level description of what this file change accomplishes
    changes: {
      type: "add" | "replace" | "remove";
      target: string; // e.g., "imports", "tab-content", "function", "component"
      description: string; // Detailed description of what needs to be implemented
      location?: string; // Where in the file (e.g., "inside Tab1 content", "after existing imports")
      dependencies?: string[]; // What this change depends on (hooks, components, etc.)
      contractInteraction?: {
        type: "read" | "write";
        functions: string[];
      };
    }[];
    // New diff-based fields
    diffHunks?: DiffHunk[]; // Unified diff hunks for this file
    unifiedDiff?: string; // Full unified diff for this file
  }[];
  implementationNotes?: string[]; // High-level notes for Stage 3 about implementation approach
}

// New interfaces for diff-based patching
export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[]; // The actual diff lines with +, -, and context
}

export interface FileDiff {
  filename: string;
  hunks: DiffHunk[];
  unifiedDiff: string;
}

export function getStage2PatchPlannerPrompt(
  intentSpec: IntentSpec,
  currentFiles: { filename: string; content: string }[],
  isInitialGeneration: boolean = false
): string {
  if (isInitialGeneration) {
    return `
ROLE: Patch Planner for Farcaster Miniapp - Initial Generation

INTENT: ${JSON.stringify(intentSpec, null, 2)}

CURRENT FILES (Boilerplate):
${currentFiles.map((f) => `---${f.filename}---\n${f.content}`).join("\n\n")}

TASK: Plan detailed file changes to implement the intent for initial project generation

INITIAL GENERATION APPROACH:
- Focus on complete file planning rather than surgical diffs
- Plan full file modifications since we're starting from boilerplate
- Generate comprehensive change descriptions for complete implementation
- No need for diff hunks or unified diffs - Stage 3 will generate complete files

BOILERPLATE CONTEXT:
${JSON.stringify(FARCASTER_BOILERPLATE_CONTEXT, null, 2)}

CRITICAL: Return ONLY valid JSON. Surround the JSON with EXACT markers:
__START_JSON__
{ ... your JSON ... }
__END_JSON__
Nothing else before/after the markers. Do not include any explanatory text, comments, or additional content outside the JSON markers.

OUTPUT FORMAT (JSON ONLY) - INITIAL GENERATION:
{
  "patches": [
    {
      "filename": "src/app/page.tsx",
      "operation": "modify",
      "purpose": "Add token airdrop functionality to Tab1",
      "changes": [
        {
          "type": "add",
          "target": "imports",
          "description": "Import wagmi hooks for contract interaction (useReadContract, useWriteContract, useWaitForTransactionReceipt)",
          "location": "at the top with other imports"
        },
        {
          "type": "replace",
          "target": "tab-content",
          "description": "Replace Tab1 content with airdrop interface including claim button, eligible tokens display, and transaction status",
          "location": "inside Tab1 content area",
          "dependencies": ["useAccount hook from wagmi for wallet address", "wagmi hooks for contract calls"],
          "contractInteraction": {
            "type": "write",
            "functions": ["claimTokens"]
          }
        }
      ]
    }
  ],
  "implementationNotes": [
    "Use useAccount hook from wagmi to get connected wallet address for contract interactions",
    "Display loading state during transaction",
    "Show success/error states for claim attempts",
    "Use existing Tabs component structure"
  ]
}

CRITICAL REQUIREMENTS - INITIAL GENERATION:
- Every patch MUST have: filename, operation, purpose, changes
- filename: string (file path)
- operation: "create" | "modify" | "delete"
- purpose: string (high-level description of what this file change accomplishes)
- changes: array of change objects
- Each change MUST have: type, target, description
- type: "add" | "replace" | "remove"
- target: string (e.g., "imports", "tab-content", "function", "component")
- description: string (detailed description of what needs to be implemented - NO ACTUAL CODE)
- location: string (where in the file this change should happen)
- dependencies: array of what this change depends on (hooks, components, etc.)
- contractInteraction: object with type and functions if blockchain interaction needed
- do not change wagmi.ts file it has everything you need
- do not edit package.json or add any extra dependencies to package.json if not needed must be minimal

PLANNING RULES:
- Plan changes for each file that needs modification
- The boilerplate is on nextjs app router with src directory structure so think for the code in that structure only
- ALWAYS use useUser hook from @/hooks for user data like username, fid, displayName, pfpUrl, etc. and always take address from useAccount hook from wagmi
- ALWAYS use Tabs component from @/components/ui/Tabs for navigation
- ALWAYS target tab content areas for feature implementation (Tab1, Tab2, etc.)
- Specify exact operations (create/modify/delete) and clear purposes
- Target specific sections with detailed descriptions:
  * "imports" - what imports to add/modify
  * "tab-content" - which tab content to modify and how
  * "function" - what functions to add/modify
  * "component" - what UI components to add
  * "state" - what state management to add
- Describe implementation requirements without writing actual code
- Include dependencies and contract interactions where relevant
- Ensure all required files are covered with detailed change descriptions
- If blockchain functionality is requested, specify contract interaction types and functions using the pre-vetted templates:
  * Reference ERC20Template.sol for token functionality
  * Reference ERC721Template.sol for NFT functionality  
  * Reference EscrowTemplate.sol for payment/escrow functionality
  * Always specify which template to use and how to modify it
  * ALWAYS include a patch for contracts/scripts/deploy.js to deploy the specific contract
- Provide implementation notes for Stage 3 guidance
- Return valid JSON only
- Every patch must have a valid changes array with descriptions
- NO ACTUAL CODE, NO EXPLANATIONS, ONLY PLANNING JSON

EXAMPLE PLANNING OUTPUT:
User wants to "Add a voting feature"
Correct Stage 2 Output:
__START_JSON__
{
  "patches": [
    {
      "filename": "src/app/page.tsx", 
      "operation": "modify",
      "purpose": "Add voting functionality to Tab2 with create poll and vote features",
      "changes": [
        {
          "type": "add",
          "target": "imports",
          "description": "Import wagmi hooks (useReadContract, useWriteContract, useWaitForTransactionReceipt) for voting contract interaction",
          "location": "at the top with existing imports"
        },
        {
          "type": "add",
          "target": "state",
          "description": "Add state for poll creation form (question, options, current poll data, voting status)",
          "location": "inside App component after useUser hook",
          "dependencies": ["useState hook", "useAccount hook from wagmi for connected wallet address"]
        },
        {
          "type": "replace",
          "target": "tab-content",
          "description": "Replace Tab2 content with voting interface including create poll form, active polls list, and voting buttons",
          "location": "inside Tab2 content area",
          "dependencies": ["useAccount hook from wagmi for connected wallet address", "wagmi hooks for contract calls", "Button component"],
          "contractInteraction": {
            "type": "write",
            "functions": ["createPoll", "castVote"]
          }
        }
      ]
    }
  ],
  "implementationNotes": [
    "Use useAccount hook from wagmi to get connected wallet address for voting eligibility",
    "Show loading states during poll creation and voting transactions", 
    "Display success/error messages for all operations",
    "Maintain existing tab structure and mobile-first design"
  ]
}
__END_JSON__

REMEMBER: Return ONLY the JSON object above surrounded by __START_JSON__ and __END_JSON__ markers. No other text, no explanations, no markdown formatting.
`;
  } else {
    // Follow-up changes - use diff-based approach
    return `
ROLE: Patch Planner for Farcaster Miniapp - Follow-up Changes

INTENT: ${JSON.stringify(intentSpec, null, 2)}

CURRENT FILES (with line numbers for accurate diff planning):
${currentFiles.map((f) => {
  const lines = f.content.split('\n');
  const numberedContent = lines.map((line, index) => `${(index + 1).toString().padStart(3, ' ')}|${line}`).join('\n');
  return `---${f.filename}---\n${numberedContent}`;
}).join("\n\n")}

TASK: Plan detailed file changes to implement the intent and generate unified diff hunks for surgical changes

DIFF GENERATION REQUIREMENTS - CRITICAL:
- For each file modification, generate unified diff hunks in VALID format: @@ -oldStart,oldLines +newStart,newLines @@
- Use the numbered lines (e.g., "  5|import { useState }") from CURRENT FILES to determine exact line positions
- oldLines and newLines MUST be the ACTUAL count of lines in that section (NEVER use 0)
- Include 2-3 context lines (unchanged lines with space prefix) around changes for better accuracy
- Use + prefix for added lines, - prefix for removed lines, space prefix for context lines
- Generate minimal, surgical diffs rather than full file rewrites
- Focus on precise line-by-line changes to preserve existing code structure
- CRITICAL: Always preserve the 'use client'; directive at the very top of React component files
- When adding imports, place them AFTER the 'use client'; directive but BEFORE other imports

UNIFIED DIFF FORMAT VALIDATION:
✅ CORRECT: @@ -5,3 +5,5 @@  (means: old section starts at line 5 with 3 lines, new section starts at line 5 with 5 lines)
✅ CORRECT: @@ -10,7 +10,12 @@ (old: 7 lines starting at 10, new: 12 lines starting at 10)
❌ WRONG: @@ -2,0 +3,1 @@     (NEVER use 0 for oldLines - must be actual count)
❌ WRONG: @@ -5 +5,2 @@        (missing line counts - must include both)

LINE COUNTING WITH NUMBERED CONTENT:
- Use the numbered lines from CURRENT FILES to calculate exact positions
- Count ALL lines in the hunk including context lines, removed lines, and added lines
- oldLines = number of context lines + number of removed lines (lines with - prefix)
- newLines = number of context lines + number of added lines (lines with + prefix)
- Example: To modify line 15, include context from lines 13-14 and 16-17
- If adding 2 new lines with 3 context lines: oldLines=3, newLines=5
- If removing 1 line with 2 context lines: oldLines=3, newLines=2

HUNK VALIDATION CHECKLIST:
- Does the hunk start and end with context lines (space prefix)?
- Do the line counts (oldLines, newLines) match the actual number of lines in the hunk?
- Are the line numbers (oldStart, newStart) correct based on the numbered content?
- Are context lines exactly matching the numbered content from CURRENT FILES?

BOILERPLATE CONTEXT:
${JSON.stringify(FARCASTER_BOILERPLATE_CONTEXT, null, 2)}

CRITICAL: Return ONLY valid JSON. Surround the JSON with EXACT markers:
__START_JSON__
{ ... your JSON ... }
__END_JSON__
Nothing else before/after the markers. Do not include any explanatory text, comments, or additional content outside the JSON markers.

OUTPUT FORMAT (JSON ONLY) - FOLLOW-UP CHANGES:
{
  "patches": [
    {
      "filename": "src/app/page.tsx",
      "operation": "modify",
      "purpose": "Add token airdrop functionality to Tab1",
      "changes": [
        {
          "type": "add",
          "target": "imports",
          "description": "Import wagmi hooks for contract interaction (useReadContract, useWriteContract, useWaitForTransactionReceipt)",
          "location": "at the top with other imports"
        },
        {
          "type": "replace",
          "target": "tab-content",
          "description": "Replace Tab1 content with airdrop interface including claim button, eligible tokens display, and transaction status",
          "location": "inside Tab1 content area",
          "dependencies": ["useAccount hook from wagmi for wallet address", "wagmi hooks for contract calls"],
          "contractInteraction": {
            "type": "write",
            "functions": ["claimTokens"]
          }
        }
      ],
      "diffHunks": [
        {
          "oldStart": 1,
          "oldLines": 3,
          "newStart": 1,
          "newLines": 6,
          "lines": [
            "'use client';",
            "",
            " import { ConnectWallet } from '@/components/wallet/ConnectWallet';",
            " import { Tabs } from '@/components/ui/Tabs';",
            "+import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';",
            "+import { useAccount } from 'wagmi';",
            " import { useUser } from '@/hooks';",
            " "
          ]
        }
      ],
      "unifiedDiff": "@@ -1,3 +1,6 @@\n'use client';\n\n import { ConnectWallet } from '@/components/wallet/ConnectWallet';\n import { Tabs } from '@/components/ui/Tabs';\n+import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';\n+import { useAccount } from 'wagmi';\n import { useUser } from '@/hooks';\n \n@@ -40,10 +43,25 @@\n   const tabs = [\n     {\n       id: 'tab1',\n       title: 'Tab1',\n-      content: (\n-        <div className=\"space-y-4\">\n-          <h1>Tab 1 Content</h1>\n-        </div>\n-      )\n+      content: (\n+        <div className=\"space-y-4\">\n+          <h1>Token Airdrop</h1>\n+          <p>Claim your eligible tokens</p>\n+          <button onClick={handleClaim}>Claim Tokens</button>\n+        </div>\n+      )\n     },\n"
    }
  ],
  "implementationNotes": [
    "Use useAccount hook from wagmi to get connected wallet address for contract interactions",
    "Display loading state during transaction",
    "Show success/error states for claim attempts",
    "Use existing Tabs component structure"
  ]
}

CRITICAL REQUIREMENTS - FOLLOW-UP CHANGES:
- Every patch MUST have: filename, operation, purpose, changes, diffHunks, unifiedDiff
- filename: string (file path)
- operation: "create" | "modify" | "delete"
- purpose: string (high-level description of what this file change accomplishes)
- changes: array of change objects
- Each change MUST have: type, target, description
- type: "add" | "replace" | "remove"
- target: string (e.g., "imports", "tab-content", "function", "component")
- description: string (detailed description of what needs to be implemented - NO ACTUAL CODE)
- location: string (where in the file this change should happen)
- dependencies: array of what this change depends on (hooks, components, etc.)
- contractInteraction: object with type and functions if blockchain interaction needed
- diffHunks: array of diff hunk objects with oldStart, oldLines, newStart, newLines, lines
- unifiedDiff: string containing the complete unified diff format for the file
- do not change wagmi.ts file it has everything you need
- do not edit package.json or add any extra dependencies to package.json if not needed must be minimal

PLANNING RULES:
- Plan changes for each file that needs modification
- The boilerplate is on nextjs app router with src directory structure so think for the code in that structure only
- ALWAYS use useUser hook from @/hooks for user data like username, fid, displayName, pfpUrl, etc. and always take address from useAccount hook from wagmi
- ALWAYS use Tabs component from @/components/ui/Tabs for navigation
- ALWAYS target tab content areas for feature implementation (Tab1, Tab2, etc.)
- Specify exact operations (create/modify/delete) and clear purposes
- Target specific sections with detailed descriptions:
  * "imports" - what imports to add/modify
  * "tab-content" - which tab content to modify and how
  * "function" - what functions to add/modify
  * "component" - what UI components to add
  * "state" - what state management to add
- Describe implementation requirements without writing actual code
- Include dependencies and contract interactions where relevant
- Ensure all required files are covered with detailed change descriptions
- If blockchain functionality is requested, specify contract interaction types and functions using the pre-vetted templates:
  * Reference ERC20Template.sol for token functionality
  * Reference ERC721Template.sol for NFT functionality  
  * Reference EscrowTemplate.sol for payment/escrow functionality
  * Always specify which template to use and how to modify it
- Provide implementation notes for Stage 3 guidance
- Return valid JSON only
- Every patch must have a valid changes array with descriptions
- NO ACTUAL CODE, NO EXPLANATIONS, ONLY PLANNING JSON

REMEMBER: Return ONLY the JSON object above surrounded by __START_JSON__ and __END_JSON__ markers. No other text, no explanations, no markdown formatting.
`;
  }
}

// Stage 3: Code Generator Types and Prompts
//
// PURPOSE: Stage 3 generates ACTUAL CODE based on the detailed patch plan from Stage 2.
// It translates the planning descriptions, dependencies, and implementation notes
// into complete, working code files.
//
// KEY PRINCIPLE: FOLLOW PATCH PLAN DESCRIPTIONS EXACTLY - GENERATE COMPLETE CODE
//
export function getStage3CodeGeneratorPrompt(
  patchPlan: PatchPlan,
  intentSpec: IntentSpec,
  currentFiles: { filename: string; content: string }[],
  isInitialGeneration: boolean = false
): string {
  if (isInitialGeneration) {
    return `
ROLE: Code Generator for Farcaster Miniapp - Initial Generation

INTENT: ${JSON.stringify(intentSpec, null, 2)}

DETAILED PATCH PLAN: ${JSON.stringify(patchPlan, null, 2)}

CURRENT FILES (Boilerplate):
${currentFiles.map((f) => `---${f.filename}---\n${f.content}`).join("\n\n")}

BOILERPLATE CONTEXT:
${JSON.stringify(FARCASTER_BOILERPLATE_CONTEXT, null, 2)}

TASK: Generate complete file contents based on the detailed patch plan for initial project generation

GENERATION APPROACH:
- Generate complete file contents (not diffs) for initial generation
- Follow patch plan fields: purpose, description, location, dependencies, contractInteraction
- Mobile-first design (~375px) with tab-based layout in src/app/page.tsx
- Use wagmi hooks for contract interactions, don't modify wagmi.ts or package.json

CRITICAL: Return ONLY valid JSON. Surround the JSON with EXACT markers:
__START_JSON__
{ ... your JSON ... }
__END_JSON__
Nothing else before/after the markers. Do not include any explanatory text, comments, or additional content outside the JSON markers.

OUTPUT FORMAT - INITIAL GENERATION:
Generate a JSON array of complete files:
__START_JSON__
[
  {
    "filename": "path/to/file",
    "content": "complete file content"
  }
]
__END_JSON__
Nothing else before/after the markers. Do not include any explanatory text, comments, or additional content outside the JSON markers.

JSON FORMATTING:
- Escape quotes as \\\", newlines as \\n, backslashes as \\\\
- Example: "content": "'use client';\\n\\nimport { useState } from \\\"react\\\";\\n\\nconst Component = () => {\\n  const [state, setState] = useState();\\n  return <div>Hello</div>;\\n};"

🚨 CRITICAL WARNING - COMMON MISTAKE WITH JSON FILES:
When generating package.json or any .json file, it is STILL just a text string in the "content" field.
❌ WRONG: Double-escaping like {\\\\n  \\\\\\\"name\\\\\\\": \\\\\\\"foo\\\\\\\"...
✅ CORRECT: Single-escaping like {\\n  \\\"name\\\": \\\"foo\\\"...
Treat JSON files identically to .tsx/.ts files - they all go in a string field with the same escaping!

CODE GENERATION RULES:
- Generate complete file contents based on patch plan descriptions
- Use useUser hook: const { username, fid, isMiniApp, isLoading } = useUser()
- Use Tabs component from @/components/ui/Tabs for navigation
- Follow patch plan fields exactly (purpose, description, location, dependencies)
- Include all required imports and implement contract interactions when specified
- Prefer neutral colors with subtle accents, ensure good contrast and accessibility

CLIENT DIRECTIVE REQUIREMENTS (CRITICAL - BUILD WILL FAIL IF MISSING):
🚨 MANDATORY: Every React component file MUST start with 'use client'; directive
🚨 MANDATORY: This is the FIRST line of EVERY file that uses React features
🚨 MANDATORY: Without this directive, the build will fail with hydration errors

REQUIRED FILES:
- src/app/page.tsx (ALWAYS needs 'use client')
- src/components/*.tsx (ALL component files)
- src/components/ui/*.tsx (ALL UI component files)
- ANY file with React hooks: useState, useEffect, useCallback, useMemo, useRef, useContext, useReducer
- ANY file with event handlers: onClick, onChange, onSubmit, onFocus, onBlur, onKeyDown, onKeyUp
- ANY file with interactive JSX components

EXACT PATTERN REQUIRED:
'use client';

import { useState } from 'react';
// ... rest of component

CRITICAL VALIDATION:
- First line MUST be exactly: 'use client';
- NO quotes around the directive
- NO variations like "use client" or 'use client' without semicolon
- MUST be the very first line of the file
- NO empty lines before the directive

FARCASTER AUTHENTICATION (CRITICAL - MUST PRESERVE):
- ALWAYS import and keep ConnectWallet: import { ConnectWallet } from '@/components/wallet/ConnectWallet';
- ALWAYS render ConnectWallet for non-miniapp users: {!isMiniApp && <ConnectWallet />}
- ALWAYS use useUser hook to detect miniapp vs browser: const { isMiniApp, username, address } = useUser();
- ALWAYS show loading state: if (isLoading) return <div>Loading...</div>;
- ALWAYS handle both Farcaster miniapp AND browser wallet modes
- For miniapp users: Show username, fid, displayName from useUser()
- For browser users: Show ConnectWallet button and address from useUser()
- NEVER remove authentication logic even if user doesn't explicitly mention it
- Example pattern MUST be preserved:
  {isMiniApp ? (
    <div>Welcome @{username}</div>
  ) : (
    <ConnectWallet />
  )}


=== SMART CONTRACT PATTERNS ===
BLOCKCHAIN: Use pre-vetted templates (ERC20Template.sol, ERC721Template.sol, EscrowTemplate.sol), modify contracts/scripts/deploy.js, include ABI placeholders
- 🚨 CLIENT DIRECTIVE: ALWAYS start React component files with 'use client'; directive (CRITICAL - MISSING THIS CAUSES BUILD FAILURE)
- 🚨 CLIENT DIRECTIVE: This MUST be the first line of EVERY React component file
- 🚨 CLIENT DIRECTIVE: Pattern: 'use client'; (exactly this format, no variations)

NFT/TOKEN CONTRACTS:
- Multi-type tokens need: mapping(uint256 => uint256) public tokenToType; store on mint
- Soulbound: check per-token via tokenToType, allow mint/burn even if soulbound
- Track ownership: mapping(address => mapping(uint256 => bool)) userOwnsType
- Use counters for IDs, OpenZeppelin imports for standards

🚨 CRITICAL: CONTRACT ACCESS CONTROL PATTERNS (ANALYZE USER REQUIREMENT CAREFULLY):
PUBLIC MINTING (users can mint):
- User says: "free mint", "anyone can mint", "public minting", "one-click mint"
- Pattern: Remove 'onlyOwner' modifier from mint functions OR add separate public mint function
- Example: function publicMint(address to, string memory tokenUri) public { ... }
- Add minting limits: mapping(address => uint256) public mintCount; require(mintCount[msg.sender] < MAX_PER_WALLET)

OWNER-ONLY MINTING (admin controls):
- User says: "admin mints", "controlled minting", "airdrop only"
- Pattern: Keep 'onlyOwner' modifier on mint functions
- Example: function safeMint(address to, string memory tokenUri) public onlyOwner { ... }

PAID MINTING (users pay to mint):
- User says: "paid mint", "mint for 0.01 ETH", "selling NFTs"
- Pattern: function mint() public payable { require(msg.value >= MINT_PRICE); ... }
- Add withdraw function for owner to collect funds

ALWAYS CHECK: If user wants "free minting" or "gallery with mint buttons", use PUBLIC MINTING pattern!

SOLIDITY:
- Use require() with descriptive errors, comprehensive events with indexed params
- Gas optimize: appropriate types, pack structs, memory/calldata correctly
- Access control: Ownable/AccessControl, ReentrancyGuard for external calls
- Multi-return @return tags: @return id Token ID, @return owner Owner address (never generic)

DEPLOYMENT:
- Save JSON: {ContractName: "0x...", network, chainId, rpcUrl, deployer, timestamp, txHashes}
- try-catch, verify args, env vars for secrets, log progress clearly

FRONTEND INTEGRATION:
- TypeScript types from ABIs, wagmi hooks (useContractRead/Write/WaitForTransaction)
- Handle tx states: idle→loading→success/error, show progress, estimate gas, cache reads

BIGINT USAGE (tsconfig.json target is ES2020, BigInt is supported):
✅ Use BigInt literals for comparisons:
if (balance !== 0n) { ... }  // Correct: use 0n, 1n, 2n syntax
if (balance === 1n) { ... }

✅ Convert contract return values (already BigInt):
const amount = Number(contractData);  // For display only
const count = contractData.toString();  // For display

❌ Don't use BigInt() constructor for literals:
if (balance === BigInt(0)) { ... }  // Wrong: use 0n instead
if (balance !== BigInt(1)) { ... }  // Wrong: use 1n instead

BEST PRACTICES:
- Contract return values from wagmi are already BigInt type
- Use literal syntax (0n, 1n, etc.) for comparisons
- Convert to Number/String only for display purposes
- Always handle BigInt in TypeScript with proper type guards

WAGMI TYPE REQUIREMENTS (CRITICAL - BUILD WILL FAIL IF VIOLATED):
🚨 MANDATORY: Contract addresses MUST use \`0x\${string}\` type assertion
🚨 MANDATORY: ABIs MUST use 'as const' assertion
🚨 MANDATORY: Never spread config objects directly into wagmi hooks without proper types

CORRECT PATTERNS:
✅ Contract config with type assertions:
const CONTRACT_CONFIG = {
  address: '0x0000000000000000000000000000000000000000' as \`0x\${string}\`,
  abi: [...] as const,
  chainId: 84532
} as const;

✅ Using useReadContract with query config (IMPORTANT: use 'query' wrapper for enabled):
const { data } = useReadContract({
  address: CONTRACT_CONFIG.address,  // Already typed as \`0x\${string}\`
  abi: CONTRACT_CONFIG.abi,
  functionName: 'getData',
  query: {
    enabled: CONTRACT_CONFIG.address !== '0x0000000000000000000000000000000000000000',
  },
});

✅ Using useReadContract with args and conditional execution:
const { data } = useReadContract({
  address: contractAddress as \`0x\${string}\`,
  abi: CONTRACT_ABI,
  functionName: 'getUserData',
  args: userAddress ? [userAddress] : undefined,
  query: {
    enabled: !!contractAddress && !!userAddress,
  },
});

✅ Using useWriteContract:
const { writeContract } = useWriteContract();
const handleWrite = () => {
  writeContract({
    address: CONTRACT_ADDRESS as \`0x\${string}\`,
    abi: CONTRACT_ABI,
    functionName: 'myFunction',
    args: [arg1, arg2],
  });
};

INCORRECT PATTERNS (WILL CAUSE BUILD FAILURE):
❌ Missing type assertion on address:
const CONTRACT_CONFIG = {
  address: '0x...',  // Wrong: inferred as 'string', not '\`0x\${string}\`'
  abi: [...]
};

❌ Spreading config without types:
const { data } = useReadContract({
  ...CONTRACT_CONFIG,  // Wrong: address type doesn't match
  functionName: 'getData',
});

❌ Wrong query config - enabled at top level (WILL FAIL):
const { data } = useReadContract({
  address: CONTRACT_ADDRESS as \`0x\${string}\`,
  abi: CONTRACT_ABI,
  functionName: 'getData',
  enabled: true,  // Wrong: must be wrapped in 'query' object
});

❌ Missing query wrapper:
const { data } = useReadContract({
  address: CONTRACT_ADDRESS as \`0x\${string}\`,
  abi: CONTRACT_ABI,
  functionName: 'getData',
  args: [someArg],
  enabled: !!someArg,  // Wrong: must be inside query: { enabled: !!someArg }
});

ESLINT COMPLIANCE (CRITICAL - BUILD WILL FAIL IF VIOLATED):
- Remove unused variables from destructuring: const { used, unused } = hook() → const { used } = hook()
- IMPORT HANDLING: Only remove imports that are TRULY unused - check if imported items are used anywhere in the file
- IMPORT VALIDATION: Before removing any import, verify it's not used in: function calls, destructuring, JSX components, or hook calls
- Remove unused imports ONLY if imported items are not used anywhere: import { used, unused } from 'module' → import { used } from 'module'
- Include all dependencies in useEffect: useEffect(() => { fn(); }, [fn])
- Use useCallback for functions in useEffect deps: const fn = useCallback(() => {}, [deps])
- Include ALL dependencies in useCallback hooks: useCallback(() => { doSomething(dep1, dep2); }, [dep1, dep2])
- Never declare variables that aren't used in the component
- Never import modules that aren't used in the component
- CRITICAL: Always include imports for hooks that are called: if you use useTodos(), you MUST import useTodos
- CRITICAL: Always include imports for components that are rendered: if you use <TodoList />, you MUST import TodoList
- CRITICAL: Always include imports for functions that are called: if you call clearAll(), you MUST import the hook that provides it
- Always use all imported modules and declared variables
- NEVER call React hooks inside callbacks, loops, or conditions: use hooks only at the top level of components
- Use for loops instead of Array.from() when calling hooks: for (let i = 0; i < count; i++) { useHook() }
- Use const instead of let when variables are never reassigned: let x = 5 → const x = 5
- Escape JSX entities: use &apos; for apostrophes, &quot; for quotes, &amp; for ampersands
- NEVER use 'let' for variables that are never reassigned - ALWAYS use 'const' (prefer-const rule)
- React Hook dependencies: Include ALL values from component scope (props, state, context) that are used inside the callback
- NEVER use empty interfaces: export interface Props extends BaseProps {} → export type Props = BaseProps;
- Return valid JSON array only - NO EXPLANATIONS, NO TEXT, ONLY JSON

REMEMBER: Return ONLY the JSON array above surrounded by __START_JSON__ and __END_JSON__ markers. No other text, no explanations, no markdown formatting.
`;
  } else {
    // Follow-up changes - use diff-based approach
    return `
ROLE: Code Generator for Farcaster Miniapp - Follow-up Changes

INTENT: ${JSON.stringify(intentSpec, null, 2)}

DETAILED PATCH PLAN: ${JSON.stringify(patchPlan, null, 2)}

CURRENT FILES (with line numbers for accurate diff calculation):
${currentFiles.map((f) => {
  const lines = f.content.split('\n');
  const numberedContent = lines.map((line, index) => `${(index + 1).toString().padStart(3, ' ')}|${line}`).join('\n');
  return `---${f.filename}---\n${numberedContent}`;
}).join("\n\n")}

BOILERPLATE CONTEXT:
${JSON.stringify(FARCASTER_BOILERPLATE_CONTEXT, null, 2)}

TASK: Generate unified diff patches based on the detailed patch plan. Apply surgical changes using the provided diff hunks rather than rewriting entire files. For new files, generate complete content. For modifications, output only the unified diff patches.

DIFF-BASED APPROACH:
- Use the provided diffHunks and unifiedDiff from the patch plan
- Apply surgical changes to existing files using unified diff format
- Preserve existing code structure and only modify necessary lines
- For new files, generate complete file content
- Validate that diffs are minimal and precise

CRITICAL: 'use client' DIRECTIVE IN DIFFS:
- The 'use client' directive is ALREADY present in the original file
- DO NOT include 'use client' in your unified diff - it's already there
- Account for the 'use client' line when calculating line numbers
- If the original file starts with 'use client', your diff should start from line 2 (after the directive)
- Example: If you see "import { ... }" in the current file, it's actually line 2, not line 1

CRITICAL LINE NUMBER CALCULATION:
- ALWAYS calculate line numbers based on the ACTUAL current file content provided above (with line numbers)
- Count lines in the current file to determine correct oldStart, oldLines, newStart, newLines
- Use the numbered lines (e.g., "  5|import { useState }") to determine exact line positions
- REQUIRED: Include 2-3 context lines (unchanged lines with space prefix) before and after changes
- Verify line numbers by cross-referencing the numbered content in CURRENT FILES section
- oldLines = count of context lines + removed lines (lines with - prefix)
- newLines = count of context lines + added lines (lines with + prefix)
- DO NOT use example line numbers from this prompt - calculate them from the actual numbered content above

EXAMPLE LINE NUMBER CALCULATION:
If you want to modify line 10 and the numbered content shows:
  8|import React from 'react';
  9|import { Button } from './Button';
 10|import { Input } from './Input';
 11|
 12|export function Component() {

Then your diff hunk should be:
oldStart: 8, oldLines: 5, newStart: 8, newLines: 6
lines: [
  " import React from 'react';",
  " import { Button } from './Button';", 
  "-import { Input } from './Input';",
  "+import { Input, Select } from './Input';",
  " ",
  " export function Component() {"
]

CONTEXT LINE MATCHING RULES:
- Context lines (space prefix) MUST exactly match the numbered content
- Never use empty strings ("") as context lines unless the actual file has blank lines
- Always include the exact text after the pipe (|) symbol from numbered content
- Count blank lines correctly - they appear as numbered lines with nothing after the pipe

DIFF VALIDATION RULES:
- Every hunk MUST start and end with context lines (space prefix)  
- Line counts MUST match the actual number of lines in the hunk
- If adding 2 lines with 3 context lines: oldLines=3, newLines=5
- If removing 1 line with 3 context lines: oldLines=4, newLines=3
- NEVER use 0 for oldLines or newLines - always count actual lines

IMPLEMENTATION GUIDANCE FROM PATCH PLAN:
- Follow the "purpose" field for each file to understand the overall goal
- Use the "description" field in each change to understand exactly what to implement
- Use the "location" field to know where in the file to place the code
- Use the "dependencies" field to ensure all required imports and hooks are included
- Use the "contractInteraction" field to implement blockchain functionality correctly
- Follow the "implementationNotes" for overall implementation approach

FARCASTER REQUIREMENTS FOR MAIN PAGE:
- Mobile-first design (~375px width) with tab-based layout
- Single page app structure (all content in tab components within src/app/page.tsx)
- For contract interactions use wagmi hooks with address from useAccount hook from wagmi
- Do not change wagmi.ts file - it has everything you need
- Do not edit package.json unless absolutely necessary
- The app automatically works in both Farcaster miniapp and browser environments
- The Mini App SDK exposes an EIP-1193 Ethereum Provider API at sdk.wallet.getEthereumProvider()

CRITICAL: Return ONLY valid JSON. Surround the JSON with EXACT markers:
__START_JSON__
{ ... your JSON ... }
__END_JSON__
Nothing else before/after the markers. Do not include any explanatory text, comments, or additional content outside the JSON markers.

OUTPUT FORMAT - FOLLOW-UP CHANGES:
Generate a JSON array of file diffs and complete files:
__START_JSON__
[
  {
    "filename": "path/to/file",
    "operation": "modify",
    "unifiedDiff": "@@ -X,Y +X,Z @@\n context line before\n-old line to remove\n+new line to add\n context line after",
    "diffHunks": [
      {
        "oldStart": X,
        "oldLines": Y,
        "newStart": X,
        "newLines": Z,
        "lines": [" context line before", "-old line to remove", "+new line to add", " context line after"]
      }
    ]
  },
  {
    "filename": "path/to/newfile",
    "operation": "create",
    "content": "complete file content for new files"
  }
]
__END_JSON__
Nothing else before/after the markers. Do not include any explanatory text, comments, or additional content outside the JSON markers.

JSON FORMATTING REQUIREMENTS:
- Escape quotes as \\\" (backslash + quote, NOT double backslash + quote)
- Escape newlines as \\n (backslash + n)
- Escape backslashes as \\\\ (double backslash becomes single)
- Content must be a single-line string with proper escaping
- unifiedDiff content must also be properly escaped
- Example: "content": "const { ethers } = require(\\\"hardhat\\\");\\n\\nasync function main() {\\n  console.log(\\\"Hello\\\");\\n}"

🚨 CRITICAL - COMMON MISTAKE WITH JSON FILES:
When generating package.json or any .json file in the "content" field, use the SAME escaping as .ts/.tsx files.
❌ WRONG: {\\\\n  \\\\\\\"name\\\\\\\": ... (double-escaped)
✅ CORRECT: {\\n  \\\"name\\\": ... (single-escaped)
JSON files are plain text strings just like TypeScript files!

CODE GENERATION RULES:
- For existing files: Modify current content based on patch plan
- For new files: Generate complete file contents based on patch plan descriptions
- Use useUser hook: const { username, fid, isMiniApp, isLoading } = useUser()
- Use Tabs component from @/components/ui/Tabs for navigation
- Follow patch plan fields exactly (purpose, description, location, dependencies)
- Include all required imports and implement contract interactions when specified
- Preserve existing code structure when modifying files
- Prefer neutral colors with subtle accents, ensure good contrast and accessibility

CLIENT DIRECTIVE REQUIREMENTS (CRITICAL - BUILD WILL FAIL IF MISSING):
🚨 MANDATORY: Every React component file MUST start with 'use client'; directive
🚨 MANDATORY: This is the FIRST line of EVERY file that uses React features
🚨 MANDATORY: Without this directive, the build will fail with hydration errors

REQUIRED FILES:
- src/app/page.tsx (ALWAYS needs 'use client')
- src/components/*.tsx (ALL component files)
- src/components/ui/*.tsx (ALL UI component files)
- ANY file with React hooks: useState, useEffect, useCallback, useMemo, useRef, useContext, useReducer
- ANY file with event handlers: onClick, onChange, onSubmit, onFocus, onBlur, onKeyDown, onKeyUp
- ANY file with interactive JSX components

EXACT PATTERN REQUIRED:
'use client';

import { useState } from 'react';
// ... rest of component

CRITICAL VALIDATION:
- First line MUST be exactly: 'use client';
- NO quotes around the directive
- NO variations like "use client" or 'use client' without semicolon
- MUST be the very first line of the file
- NO empty lines before the directive

FARCASTER AUTHENTICATION (CRITICAL - MUST PRESERVE):
- ALWAYS import and keep ConnectWallet: import { ConnectWallet } from '@/components/wallet/ConnectWallet';
- ALWAYS render ConnectWallet for non-miniapp users: {!isMiniApp && <ConnectWallet />}
- ALWAYS use useUser hook to detect miniapp vs browser: const { isMiniApp, username, address } = useUser();
- ALWAYS show loading state: if (isLoading) return <div>Loading...</div>;
- ALWAYS handle both Farcaster miniapp AND browser wallet modes
- For miniapp users: Show username, fid, displayName from useUser()
- For browser users: Show ConnectWallet button and address from useUser()
- NEVER remove authentication logic even if user doesn't explicitly mention it
- NEVER delete or modify ConnectWallet import or rendering logic
- When modifying page.tsx, PRESERVE the conditional rendering pattern for miniapp vs browser
- Example pattern MUST be preserved:
  {isMiniApp ? (
    <div>Welcome @{username}</div>
  ) : (
    <ConnectWallet />
  )}

SOLIDITY DOCUMENTATION (CRITICAL):
- For functions with multiple return values, use separate @return tags for each parameter
- Example: @return id Poll ID, @return question Poll question, @return options Poll options array
- NEVER use generic @return descriptions like "@return Poll data" - always specify each return parameter
- Each @return tag must match the function's return parameters in order

ESLINT COMPLIANCE (CRITICAL - BUILD WILL FAIL IF VIOLATED):
- Remove unused variables from destructuring: const { used, unused } = hook() → const { used } = hook()
- IMPORT HANDLING: Only remove imports that are TRULY unused - check if imported items are used anywhere in the file
- IMPORT VALIDATION: Before removing any import, verify it's not used in: function calls, destructuring, JSX components, or hook calls
- Remove unused imports ONLY if imported items are not used anywhere: import { used, unused } from 'module' → import { used } from 'module'
- Include all dependencies in useEffect: useEffect(() => { fn(); }, [fn])
- Use useCallback for functions in useEffect deps: const fn = useCallback(() => {}, [deps])
- Include ALL dependencies in useCallback hooks: useCallback(() => { doSomething(dep1, dep2); }, [dep1, dep2])
- Never declare variables that aren't used in the component
- Never import modules that aren't used in the component
- CRITICAL: Always include imports for hooks that are called: if you use useTodos(), you MUST import useTodos
- CRITICAL: Always include imports for components that are rendered: if you use <TodoList />, you MUST import TodoList
- CRITICAL: Always include imports for functions that are called: if you call clearAll(), you MUST import the hook that provides it
- Always use all imported modules and declared variables
- NEVER call React hooks inside callbacks, loops, or conditions: use hooks only at the top level of components
- Use for loops instead of Array.from() when calling hooks: for (let i = 0; i < count; i++) { useHook() }
- Use const instead of let when variables are never reassigned: let x = 5 → const x = 5
- Escape JSX entities: use &apos; for apostrophes, &quot; for quotes, &amp; for ampersands
- NEVER use 'let' for variables that are never reassigned - ALWAYS use 'const' (prefer-const rule)
- React Hook dependencies: Include ALL values from component scope (props, state, context) that are used inside the callback
- NEVER use empty interfaces: export interface Props extends BaseProps {} → export type Props = BaseProps;
BLOCKCHAIN: Use pre-vetted templates (ERC20Template.sol, ERC721Template.sol, EscrowTemplate.sol), modify contracts/scripts/deploy.js, include ABI placeholders
- 🚨 CLIENT DIRECTIVE: ALWAYS start React component files with 'use client'; directive (CRITICAL - MISSING THIS CAUSES BUILD FAILURE)
- 🚨 CLIENT DIRECTIVE: This MUST be the first line of EVERY React component file
- 🚨 CLIENT DIRECTIVE: Pattern: 'use client'; (exactly this format, no variations)
- Return valid JSON array only - NO EXPLANATIONS, NO TEXT, ONLY JSON

REMEMBER: Return ONLY the JSON array above surrounded by __START_JSON__ and __END_JSON__ markers. No other text, no explanations, no markdown formatting.
`;
  }
}

// Stage 4: Validator Types and Prompts
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  fixes: {
    filename: string;
    content: string;
  }[];
}

export function getStage4ValidatorPrompt(
  generatedFiles: { filename: string; content: string }[],
  errors: string[],
  isInitialGeneration: boolean = false
): string {
  return `
ROLE: Code Validator for Next.js 15 + TypeScript + React

ERRORS FOUND:
${errors.join("\n")}

FILES TO REGENERATE:
${generatedFiles.map((f) => `---${f.filename}---\n${f.content}`).join("\n\n")}

TASK: Fix critical errors that would prevent the project from running. ${isInitialGeneration ? 'Generate complete corrected files for initial project generation.' : 'Generate unified diff patches for surgical fixes rather than rewriting entire files. PRESERVE the existing implementation from Stage 3 - only fix the specific validation errors mentioned.'}

BOILERPLATE CONTEXT:
${JSON.stringify(FARCASTER_BOILERPLATE_CONTEXT, null, 2)}

CRITICAL: Return ONLY a JSON array. Surround the JSON with EXACT markers:
__START_JSON__
{ ... your JSON ... }
__END_JSON__
Nothing else before/after the markers. Do not include any explanatory text, comments, or additional content outside the JSON markers.

OUTPUT FORMAT:
${isInitialGeneration ? `
__START_JSON__
[
  {
    "filename": "EXACT_SAME_FILENAME",
    "content": "Complete corrected file content with all fixes applied"
  }
]
__END_JSON__
` : `
__START_JSON__
[
  {
    "filename": "EXACT_SAME_FILENAME",
    "operation": "modify",
    "unifiedDiff": "@@ -1,3 +1,6 @@\n import { ConnectWallet } from '@/components/wallet/ConnectWallet';\n import { Tabs } from '@/components/ui/Tabs';\n+import { useReadContract } from 'wagmi';\n+import { useAccount } from 'wagmi';\n import { useUser } from '@/hooks';\n ",
    "diffHunks": [
      {
        "oldStart": 1,
        "oldLines": 3,
        "newStart": 1,
        "newLines": 6,
        "lines": [" import { ConnectWallet } from '@/components/wallet/ConnectWallet';", " import { Tabs } from '@/components/ui/Tabs';", "+import { useReadContract } from 'wagmi';", "+import { useAccount } from 'wagmi';", " import { useUser } from '@/hooks';", " "]
      }
    ]
  }
]
__END_JSON__
`}

CRITICAL FIXES ONLY - PRESERVE EXISTING IMPLEMENTATIONS:

🚨 CRITICAL: DO NOT rewrite entire components or functions
🚨 CRITICAL: Only fix the specific validation errors mentioned above
🚨 CRITICAL: Preserve all existing functionality and UI implementations
🚨 CRITICAL: If Stage 3 had a sophisticated implementation, keep it - don't simplify

1. SYNTAX ERRORS:
   - Fix missing semicolons, brackets, parentheses
   - Fix invalid JSX syntax
   - Fix import/export statements

2. TYPE ERRORS:
   - Fix missing 'use client' directive for client components
   - Fix basic TypeScript type errors
   - Fix React hook usage errors

3. BUILD ERRORS:
   - Fix missing imports
   - Fix circular dependencies
   - Fix invalid file structure

4. ESLINT ERRORS:
   - Fix unused variables (@typescript-eslint/no-unused-vars)
   - Fix unused imports (@typescript-eslint/no-unused-vars)
   - Fix missing useEffect dependencies (react-hooks/exhaustive-deps)
   - Fix React hooks rules violations (react-hooks/rules-of-hooks)
   - Fix unescaped entities in JSX (react/no-unescaped-entities)
   - Fix explicit any types (@typescript-eslint/no-explicit-any) - replace with proper types
   - Remove any unused destructured variables
   - Remove any unused imported modules
   - Replace Array.from() with for loops when calling hooks
   - Escape apostrophes (&apos;), quotes (&quot;), and ampersands (&amp;) in JSX
   - Fix duplicate 'use client' directives - keep only one at the very top

PRESERVATION RULES:
- If the original file had a Button component with Check icon, keep it
- If the original file had sophisticated styling, keep it
- If the original file had proper accessibility attributes, keep them
- Only add 'use client' directive if missing
- Only fix syntax errors, don't change the implementation approach

EXAMPLE - WHAT NOT TO DO:
❌ WRONG: Replace sophisticated Button+Check implementation with basic HTML checkbox
❌ WRONG: Simplify complex conditional styling to basic classes
❌ WRONG: Remove accessibility attributes or proper event handlers

EXAMPLE - WHAT TO DO:
✅ CORRECT: Add 'use client'; at the top if missing
✅ CORRECT: Fix unescaped quotes: 'text' → &apos;text&apos;
✅ CORRECT: Fix missing semicolons or brackets
✅ CORRECT: Keep all existing UI implementations exactly as they are

RULES:
- Return EXACTLY the same filenames provided
- Generate surgical diff patches for critical fixes
- DO NOT create new files beyond those provided
- DO NOT add markdown formatting
- Return ONLY the JSON array
- NO EXPLANATIONS, NO TEXT, NO CODE BLOCKS

CRITICAL: Return ONLY the JSON array above surrounded by __START_JSON__ and __END_JSON__ markers. No other text, comments, or explanatory content outside the markers.
`;
}

// Helper function to get boilerplate context
export function getBoilerplateContext() {
  return {
    structure: BOILERPLATE_STRUCTURE,
    context: FARCASTER_BOILERPLATE_CONTEXT,
  };
}

// Helper function to create user prompt with context
export function createOptimizedUserPrompt(
  userPrompt: string,
  currentFiles: { filename: string; content: string }[]
): string {
  return `USER REQUEST: ${userPrompt}

CURRENT PROJECT FILES:
${currentFiles.map((f) => `---${f.filename}---\n${f.content}`).join("\n\n")}

Follow the System Rules. First PLAN (files + imports), then output CODE as a single JSON array of files.`;
}

// Helper function to validate generated files
export function validateGeneratedFiles(
  files: { filename: string; content?: string; unifiedDiff?: string; operation?: string }[]
): {
  isValid: boolean;
  missingFiles: string[];
} {
  // Only validate that we have at least one file and it's not empty
  if (files.length === 0) {
    console.warn("No files generated");
    return {
      isValid: false,
      missingFiles: ["No files generated"],
    };
  }

  // Check for empty files - handle both content and diff-based files
  const emptyFiles = files.filter((file) => {
    if (file.operation === 'create') {
      return !file.content || file.content.trim() === "";
    } else if (file.operation === 'modify') {
      return !file.unifiedDiff || file.unifiedDiff.trim() === "";
    }
    // Fallback to content check for backward compatibility
    return !file.content || file.content.trim() === "";
  });
  
  if (emptyFiles.length > 0) {
    console.warn(
      "Empty files detected:",
      emptyFiles.map((f) => f.filename)
    );
    return {
      isValid: false,
      missingFiles: emptyFiles.map((f) => `Empty file: ${f.filename}`),
    };
  }

  // All files are valid
  return {
    isValid: true,
    missingFiles: [],
  };
}

// Helper function to check for missing imports/references
export function validateImportsAndReferences(
  files: { filename: string; content?: string; unifiedDiff?: string; operation?: string }[],
  currentFiles?: { filename: string; content: string }[]
): {
  hasAllImports: boolean;
  missingImports: { file: string; missingImport: string }[];
} {
  const createdFiles = new Set(files.map((f) => f.filename));
  const existingFiles = new Set(currentFiles?.map((f) => f.filename) || []);
  const allAvailableFiles = new Set([...createdFiles, ...existingFiles]);
  const missingImports: { file: string; missingImport: string }[] = [];

  // Common import patterns to check
  const importPatterns = [
    // Relative imports: ./path, ../path, @/path
    /import.*from\s+['"`]([./@][^'"`]+)['"`]/g,
    // Dynamic imports
    /import\(['"`]([./@][^'"`]+)['"`]\)/g,
    // Require statements
    /require\(['"`]([./@][^'"`]+)['"`]\)/g,
  ];

  files.forEach((file) => {
    // Get content to analyze - prefer content for create operations, unifiedDiff for modify
    const contentToAnalyze = file.operation === 'create' ? file.content : 
                            file.operation === 'modify' ? file.unifiedDiff : 
                            file.content || file.unifiedDiff;
    
    if (!contentToAnalyze) return; // Skip if no content to analyze
    
    importPatterns.forEach((pattern) => {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(contentToAnalyze)) !== null) {
        let importPath = match[1];

        // Handle different import path formats
        if (importPath.startsWith("@/")) {
          // Convert @/ to src/
          importPath = importPath.replace("@/", "src/");
        } else if (importPath.startsWith("./")) {
          // Relative to current file's directory
          const fileDir = file.filename.includes("/")
            ? file.filename.substring(0, file.filename.lastIndexOf("/"))
            : "";
          importPath = fileDir
            ? `${fileDir}/${importPath.substring(2)}`
            : importPath.substring(2);
        } else if (importPath.startsWith("../")) {
          // Handle parent directory imports (simplified)
          const fileDir = file.filename.includes("/")
            ? file.filename.substring(0, file.filename.lastIndexOf("/"))
            : "";
          // This is a simplified check - real resolution would be more complex
          if (fileDir) {
            const parentDir = fileDir.includes("/")
              ? fileDir.substring(0, fileDir.lastIndexOf("/"))
              : "";
            importPath = parentDir
              ? `${parentDir}/${importPath.substring(3)}`
              : importPath.substring(3);
          } else {
            importPath = importPath.substring(3);
          }
        }

        // Add common file extensions if missing
        const possibleExtensions = [".ts", ".tsx", ".js", ".jsx", ".sol"];
        let found = false;

        // Check exact path first
        if (allAvailableFiles.has(importPath)) {
          found = true;
        } else {
          // Check with extensions
          for (const ext of possibleExtensions) {
            if (allAvailableFiles.has(importPath + ext)) {
              found = true;
              break;
            }
          }
        }

        // Skip validation for known boilerplate imports that should exist
        const knownBoilerplateImports = [
          "@/components/ui/Button",
          "@/components/ui/Input",
          "@/components/ui/Tabs",
          "@/components/wallet/ConnectWallet",
          "@/hooks",
          "@/hooks/useUser",
          "@/lib/utils",
          "@/lib/wagmi",
          "@/types",
        ];

        const isKnownBoilerplateImport = knownBoilerplateImports.some(
          (known) =>
            importPath.includes(known.replace("@/", "src/")) ||
            (match && match[1] && match[1].includes(known))
        );

        if (
          !found &&
          !importPath.includes("node_modules") &&
          !importPath.startsWith("@/") &&
          !isKnownBoilerplateImport
        ) {
          missingImports.push({
            file: file.filename,
            missingImport: match[1],
          });
        }
      }
    });
  });

  if (missingImports.length > 0) {
    console.warn("Missing imported files:", missingImports);
  }

  return {
    hasAllImports: missingImports.length === 0,
    missingImports,
  };
}

// ========================================================================
// SHARED PIPELINE STAGES (Stage 1 & 2)
// ========================================================================

/**
 * Stage 1: Intent Parser - Shared by both pipelines
 * Parses user request into structured specification
 */
async function executeStage1IntentParser(
  userPrompt: string,
  callLLM: (
    systemPrompt: string,
    userPrompt: string,
    stageName: string,
    stageType?: keyof typeof STAGE_MODEL_CONFIG
  ) => Promise<string>,
  projectId?: string
): Promise<IntentSpec> {
  console.log("\n" + "=".repeat(50));
  console.log("📋 STAGE 1: Intent Parser");
  console.log("=".repeat(50));

  const intentPrompt = `USER REQUEST: ${userPrompt}`;
  console.log("📤 Sending to LLM (Stage 1):");
  console.log(
    "System Prompt Length:",
    getStage1IntentParserPrompt().length,
    "chars"
  );
  console.log("User Prompt:", intentPrompt);

  const startTime1 = Date.now();
  const intentResponse = await callLLM(
    getStage1IntentParserPrompt(),
    intentPrompt,
    "Stage 1: Intent Parser",
    "STAGE_1_INTENT_PARSER"
  );
  const endTime1 = Date.now();
  
  // Log Stage 1 response for debugging
  if (projectId) {
    logStageResponse(projectId, 'stage1-intent-parser', intentResponse, {
      systemPromptLength: getStage1IntentParserPrompt().length,
      userPromptLength: intentPrompt.length,
      responseTime: endTime1 - startTime1
    });
  }

  console.log("📥 Received from LLM (Stage 1):");
  console.log("Response Length:", intentResponse.length, "chars");
  console.log("Response Time:", endTime1 - startTime1, "ms");

  let intentSpec: IntentSpec;
  try {
    intentSpec = JSON.parse(intentResponse);
  } catch (error) {
    console.error("❌ Failed to parse Stage 1 response as JSON:");
    console.error("Raw response:", intentResponse);
    throw new Error(
      `Stage 1 JSON parsing failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  // Validate intent spec structure
  if (!intentSpec || typeof intentSpec !== "object") {
    throw new Error("Stage 1 response is not a valid object");
  }

  if (!intentSpec.feature || typeof intentSpec.feature !== "string") {
    throw new Error("Stage 1 response missing 'feature' field");
  }

  if (!Array.isArray(intentSpec.requirements)) {
    throw new Error("Stage 1 response missing 'requirements' array");
  }

  if (!Array.isArray(intentSpec.targetFiles)) {
    throw new Error("Stage 1 response missing 'targetFiles' array");
  }

  if (!Array.isArray(intentSpec.dependencies)) {
    throw new Error("Stage 1 response missing 'dependencies' array");
  }

  if (typeof intentSpec.needsChanges !== "boolean") {
    throw new Error("Stage 1 response missing 'needsChanges' boolean field");
  }

  console.log("✅ Stage 1 complete - Parsed Intent:");
  console.log("  Feature:", intentSpec.feature);
  console.log("  Requirements:", intentSpec.requirements.length);
  console.log("  Target Files:", intentSpec.targetFiles.length);
  console.log("  Dependencies:", intentSpec.dependencies.length);
  console.log("  Needs Changes:", intentSpec.needsChanges);
  console.log("  Reason:", intentSpec.reason);

  return intentSpec;
}

/**
 * Stage 2: Patch Planner - Shared by both pipelines
 * Creates detailed patch plan based on intent
 */
async function executeStage2PatchPlanner(
  userPrompt: string,
  intentSpec: IntentSpec,
  currentFiles: { filename: string; content: string }[],
  callLLM: (
    systemPrompt: string,
    userPrompt: string,
    stageName: string,
    stageType?: keyof typeof STAGE_MODEL_CONFIG
  ) => Promise<string>,
  isInitialGeneration: boolean,
  projectId?: string
): Promise<PatchPlan> {
  console.log("\n" + "=".repeat(50));
  console.log("📝 STAGE 2: Patch Planner");
  console.log("=".repeat(50));

  const patchPrompt = `USER REQUEST: ${userPrompt}`;
  console.log("📤 Sending to LLM (Stage 2):");
  console.log(
    "System Prompt Length:",
    getStage2PatchPlannerPrompt(intentSpec, currentFiles, isInitialGeneration).length,
    "chars"
  );
  console.log("User Prompt:", patchPrompt);
  console.log("Intent Spec:", JSON.stringify(intentSpec, null, 2));

  const startTime2 = Date.now();
  const patchResponse = await callLLM(
    getStage2PatchPlannerPrompt(intentSpec, currentFiles, isInitialGeneration),
    patchPrompt,
    "Stage 2: Patch Planner",
    "STAGE_2_PATCH_PLANNER"
  );
  const endTime2 = Date.now();
  
  // Log Stage 2 response for debugging
  if (projectId) {
    logStageResponse(projectId, 'stage2-patch-planner', patchResponse, {
      systemPromptLength: getStage2PatchPlannerPrompt(intentSpec, currentFiles, isInitialGeneration).length,
      userPromptLength: patchPrompt.length,
      responseTime: endTime2 - startTime2,
      intentSpec: intentSpec
    });
  }

  console.log("📥 Received from LLM (Stage 2):");
  console.log("Response Length:", patchResponse.length, "chars");
  console.log("Response Time:", endTime2 - startTime2, "ms");
  console.log("Raw Response:", patchResponse.substring(0, 500) + "...");

  const patchPlan: PatchPlan = parseStage2PatchResponse(patchResponse);

  // Check for potential truncation
  const isPotentiallyTruncated = isResponseTruncated(patchResponse);
  
  if (isPotentiallyTruncated) {
    console.warn("⚠️ Stage 2 response appears to be truncated. Retry logic is handled in callClaudeWithLogging.");
    console.warn("Response ends with:", patchResponse.slice(-100));
  }

  // Validate patch plan structure
  if (!patchPlan.patches || !Array.isArray(patchPlan.patches)) {
    throw new Error(
      "Invalid patch plan: patches array is missing or not an array"
    );
  }

  // Analyze patch plan
  let totalPatches = 0;
  let createPatches = 0;
  let modifyPatches = 0;
  let deletePatches = 0;

  patchPlan.patches.forEach((patch, index) => {
    // Validate each patch structure
    if (!patch || typeof patch !== "object") {
      console.warn(`⚠️ Invalid patch ${index + 1}: patch is not an object`);
      return;
    }

    if (!patch.filename || typeof patch.filename !== "string") {
      console.warn(
        `⚠️ Invalid patch ${index + 1}: filename is missing or not a string`
      );
      return;
    }

    if (
      !patch.operation ||
      !["create", "modify", "delete"].includes(patch.operation)
    ) {
      console.warn(
        `⚠️ Invalid patch ${index + 1}: operation is missing or invalid`
      );
      return;
    }

    if (!patch.changes || !Array.isArray(patch.changes)) {
      console.warn(
        `⚠️ Invalid patch ${
          index + 1
        }: changes array is missing or not an array`
      );
      return;
    }

    totalPatches++;
    if (patch.operation === 'create') createPatches++;
    else if (patch.operation === 'modify') modifyPatches++;
    else if (patch.operation === 'delete') deletePatches++;

    console.log(
      `  Patch ${index + 1}: ${patch.operation} ${patch.filename} (${
        patch.changes.length
      } changes)`
    );
  });

  console.log(`\n✅ Stage 2 complete - Generated ${totalPatches} patches`);
  console.log(`  - Create: ${createPatches}`);
  console.log(`  - Modify: ${modifyPatches}`);
  console.log(`  - Delete: ${deletePatches}`);

  return patchPlan;
}

// ========================================================================
// INITIAL GENERATION PIPELINE (Complete Files)
// ========================================================================

/**
 * Pipeline for initial project generation
 * Generates complete file contents from boilerplate
 */
export async function executeInitialGenerationPipeline(
  userPrompt: string,
  currentFiles: { filename: string; content: string }[],
  callLLM: (
    systemPrompt: string,
    userPrompt: string,
    stageName: string,
    stageType?: keyof typeof STAGE_MODEL_CONFIG
  ) => Promise<string>,
  projectId?: string,
  projectDir?: string
): Promise<{ files: { filename: string; content: string }[]; intentSpec: IntentSpec }> {
  try {
    console.log("🚀 Starting INITIAL GENERATION pipeline...");
    console.log("📝 User Prompt:", userPrompt);
    console.log("📁 Current Files Count:", currentFiles.length);

    // Stage 1: Intent Parser
    const intentSpec = await executeStage1IntentParser(userPrompt, callLLM, projectId);

    // Check if changes are needed
    if (!intentSpec.needsChanges) {
      console.log("\n" + "=".repeat(50));
      console.log("✅ NO CHANGES NEEDED - Using Boilerplate As-Is");
      console.log("=".repeat(50));
      console.log("📋 Reason:", intentSpec.reason);
      console.log("📁 Returning", currentFiles.length, "boilerplate files");
      console.log("🎉 Pipeline completed early - no modifications needed!");
      return { files: currentFiles, intentSpec };
    }

    // Stage 2: Patch Planner
    const patchPlan = await executeStage2PatchPlanner(
      userPrompt,
      intentSpec,
      currentFiles,
      callLLM,
      true, // isInitialGeneration = true
      projectId
    );

    // Stage 3: Code Generator (Complete Files)
    const generatedFiles = await executeStage3InitialGeneration(
      userPrompt,
      patchPlan,
      intentSpec,
      currentFiles,
      callLLM,
      projectId
    );

    // Stage 4: Validator (Complete Files)
    const validatedFiles = await executeStage4InitialValidation(
      generatedFiles,
      currentFiles,
      callLLM,
      projectId,
      projectDir
    );

    console.log("\n" + "=".repeat(50));
    console.log("🎉 INITIAL GENERATION PIPELINE COMPLETED!");
    console.log("=".repeat(50));
    console.log(`📁 Generated ${validatedFiles.length} files`);

    return { files: validatedFiles, intentSpec };
  } catch (error) {
    console.error("❌ Initial generation pipeline failed:");
    console.error("  Error:", error);
    console.error(
      "  Stack:",
      error instanceof Error ? error.stack : "No stack trace"
    );
    throw error;
  }
}

// ========================================================================
// FOLLOW-UP CHANGES PIPELINE (Diff-Based)
// ========================================================================

/**
 * Pipeline for follow-up changes to existing projects
 * Generates surgical diffs instead of complete files
 */
export async function executeFollowUpPipeline(
  userPrompt: string,
  currentFiles: { filename: string; content: string }[],
  callLLM: (
    systemPrompt: string,
    userPrompt: string,
    stageName: string,
    stageType?: keyof typeof STAGE_MODEL_CONFIG
  ) => Promise<string>,
  projectId?: string,
  projectDir?: string
): Promise<{ files: { filename: string; content: string }[]; intentSpec: IntentSpec }> {
  try {
    console.log("🚀 Starting FOLLOW-UP CHANGES pipeline...");
    console.log("📝 User Prompt:", userPrompt);
    console.log("📁 Current Files Count:", currentFiles.length);

    // Stage 1: Intent Parser
    const intentSpec = await executeStage1IntentParser(userPrompt, callLLM, projectId);

    // Check if changes are needed
    if (!intentSpec.needsChanges) {
      console.log("\n" + "=".repeat(50));
      console.log("✅ NO CHANGES NEEDED");
      console.log("=".repeat(50));
      console.log("📋 Reason:", intentSpec.reason);
      console.log("📁 Returning", currentFiles.length, "unchanged files");
      return { files: currentFiles, intentSpec };
    }

    // Stage 2: Patch Planner (with diffs)
    const patchPlan = await executeStage2PatchPlanner(
      userPrompt,
      intentSpec,
      currentFiles,
      callLLM,
      false, // isInitialGeneration = false
      projectId
    );

    // Stage 3: Code Generator (Diffs)
    const filesWithDiffs = await executeStage3FollowUpGeneration(
      userPrompt,
      patchPlan,
      intentSpec,
      currentFiles,
      callLLM,
      projectId
    );

    // Stage 4: Validator (Diffs)
    const validatedFiles = await executeStage4FollowUpValidation(
      filesWithDiffs,
      currentFiles,
      callLLM,
      projectId,
      projectDir
    );

    console.log("\n" + "=".repeat(50));
    console.log("🎉 FOLLOW-UP PIPELINE COMPLETED!");
    console.log("=".repeat(50));
    console.log(`📁 Generated ${validatedFiles.length} files`);

    return { files: validatedFiles, intentSpec };
  } catch (error) {
    console.error("❌ Follow-up pipeline failed:");
    console.error("  Error:", error);
    console.error(
      "  Stack:",
      error instanceof Error ? error.stack : "No stack trace"
    );
    throw error;
  }
}

// ========================================================================
// STAGE 3 & 4 IMPLEMENTATIONS
// ========================================================================

/**
 * Stage 3: Code Generator for Initial Generation
 * Generates complete file contents
 */
async function executeStage3InitialGeneration(
  userPrompt: string,
  patchPlan: PatchPlan,
  intentSpec: IntentSpec,
  currentFiles: { filename: string; content: string }[],
  callLLM: (
    systemPrompt: string,
    userPrompt: string,
    stageName: string,
    stageType?: keyof typeof STAGE_MODEL_CONFIG
  ) => Promise<string>,
  projectId?: string
): Promise<{ filename: string; content: string }[]> {
  console.log("\n" + "=".repeat(50));
  console.log("💻 STAGE 3: Code Generator (Initial Generation)");
  console.log("=".repeat(50));

  const codePrompt = `USER REQUEST: ${userPrompt}`;
  console.log("📤 Sending to LLM (Stage 3):");
  console.log(
    "System Prompt Length:",
    getStage3CodeGeneratorPrompt(patchPlan, intentSpec, currentFiles, true).length,
    "chars"
  );

  const startTime3 = Date.now();
  const codeResponse = await callLLM(
    getStage3CodeGeneratorPrompt(patchPlan, intentSpec, currentFiles, true),
    codePrompt,
    "Stage 3: Code Generator",
    "STAGE_3_CODE_GENERATOR"
  );
  const endTime3 = Date.now();
  
  // Log Stage 3 response
  if (projectId) {
    logStageResponse(projectId, 'stage3-code-generator', codeResponse, {
      systemPromptLength: getStage3CodeGeneratorPrompt(patchPlan, intentSpec, currentFiles, true).length,
      userPromptLength: codePrompt.length,
      responseTime: endTime3 - startTime3,
      patchPlan: patchPlan,
      intentSpec: intentSpec
    });
  }

  console.log("📥 Received from LLM (Stage 3):");
  console.log("Response Length:", codeResponse.length, "chars");
  console.log("Response Time:", endTime3 - startTime3, "ms");

  const generatedFiles = parseStage3CodeResponse(codeResponse);

  // Validate generated files structure
  if (!Array.isArray(generatedFiles)) {
    throw new Error("Stage 3 response is not an array");
  }

  // Convert to simple format for initial generation
  const completeFiles: { filename: string; content: string }[] = generatedFiles.map(file => ({
    filename: file.filename,
    content: file.content || ''
  }));

  console.log(`✅ Stage 3 complete - Generated ${completeFiles.length} complete files`);
  
  return completeFiles;
}

/**
 * Stage 3: Code Generator for Follow-Up Changes
 * Generates diffs and applies them to existing files
 */
async function executeStage3FollowUpGeneration(
  userPrompt: string,
  patchPlan: PatchPlan,
  intentSpec: IntentSpec,
  currentFiles: { filename: string; content: string }[],
  callLLM: (
    systemPrompt: string,
    userPrompt: string,
    stageName: string,
    stageType?: keyof typeof STAGE_MODEL_CONFIG
  ) => Promise<string>,
  projectId?: string
): Promise<{ filename: string; content: string }[]> {
  console.log("\n" + "=".repeat(50));
  console.log("💻 STAGE 3: Code Generator (Follow-Up Changes - Diff-Based)");
  console.log("=".repeat(50));

  const codePrompt = `USER REQUEST: ${userPrompt}`;
  console.log("📤 Sending to LLM (Stage 3):");
  console.log(
    "System Prompt Length:",
    getStage3CodeGeneratorPrompt(patchPlan, intentSpec, currentFiles, false).length,
    "chars"
  );

  const startTime3 = Date.now();
  const codeResponse = await callLLM(
    getStage3CodeGeneratorPrompt(patchPlan, intentSpec, currentFiles, false),
    codePrompt,
    "Stage 3: Code Generator",
    "STAGE_3_CODE_GENERATOR"
  );
  const endTime3 = Date.now();
  
  // Log Stage 3 response
  if (projectId) {
    logStageResponse(projectId, 'stage3-code-generator', codeResponse, {
      systemPromptLength: getStage3CodeGeneratorPrompt(patchPlan, intentSpec, currentFiles, false).length,
      userPromptLength: codePrompt.length,
      responseTime: endTime3 - startTime3,
      patchPlan: patchPlan,
      intentSpec: intentSpec
    });
  }

  console.log("📥 Received from LLM (Stage 3):");
  console.log("Response Length:", codeResponse.length, "chars");
  console.log("Response Time:", endTime3 - startTime3, "ms");

  const generatedFiles = parseStage3CodeResponse(codeResponse);

  // Process files: apply diffs for modifications, use content for new files
  const filesWithDiffs = generatedFiles.filter(file => file.operation === 'modify' && file.unifiedDiff);
  const filesWithContent = generatedFiles.filter(file => file.operation === 'create' && file.content);

  console.log(`📊 File processing breakdown:`);
  console.log(`  Files with diffs: ${filesWithDiffs.length}`);
  console.log(`  Files with content: ${filesWithContent.length}`);

  const processedFiles: { filename: string; content: string }[] = [];

  // Apply diffs to existing files
  if (filesWithDiffs.length > 0) {
    console.log(`🔄 Applying diffs to ${filesWithDiffs.length} files...`);
    
    const diffs = filesWithDiffs.map(file => {
      const hunks = parseUnifiedDiff(file.unifiedDiff!);
      return {
        filename: file.filename,
        hunks: hunks,
        unifiedDiff: file.unifiedDiff!
      };
    }).filter(diff => diff.hunks.length > 0);

    const filesWithAppliedDiffs = applyDiffsToFiles(currentFiles, diffs);
    processedFiles.push(...filesWithAppliedDiffs);
    console.log(`✅ Successfully applied diffs to ${filesWithAppliedDiffs.length} files`);
  }

  // Add new files with complete content
  if (filesWithContent.length > 0) {
    console.log(`📝 Adding ${filesWithContent.length} new files...`);
    filesWithContent.forEach(file => {
      processedFiles.push({
        filename: file.filename,
        content: file.content!
      });
    });
  }

  console.log(`✅ Stage 3 complete - Generated ${processedFiles.length} files`);
  
  return processedFiles;
}

/**
 * Stage 4: Compilation Validator for Initial Generation
 * Validates and fixes complete files using Railway's full compilation validation
 */
async function executeStage4InitialValidation(
  generatedFiles: { filename: string; content: string }[],
  currentFiles: { filename: string; content: string }[],
  callLLM: (
    systemPrompt: string,
    userPrompt: string,
    stageName: string,
    stageType?: keyof typeof STAGE_MODEL_CONFIG
  ) => Promise<string>,
  projectId?: string,
  projectDir?: string
): Promise<{ filename: string; content: string }[]> {
  console.log("\n" + "=".repeat(50));
  console.log("🔍 STAGE 4: Compilation Validation (Initial Generation)");
  console.log("=".repeat(50));
  console.log(`📊 Input Summary:`);
  console.log(`  - Generated files: ${generatedFiles.length}`);
  console.log(`  - Current files: ${currentFiles.length}`);
  console.log(`  - Project ID: ${projectId || 'None'}`);

  // Try Railway validation first (full validation)
  try {
    console.log("\n🚂 Attempting Railway validation (full compilation)...");
    const railwayClient = createRailwayValidationClient();
    
    // Check if Railway validation is available
    const isRailwayAvailable = await railwayClient.checkHealth();
    if (isRailwayAvailable) {
      console.log("✅ Railway validation available - using full compilation validation");
      
      const railwayResult = await railwayClient.validateProject(
        projectId || `validation-${Date.now()}`,
        generatedFiles,
        {
          enableTypeScript: true,
          enableSolidity: true,
          enableESLint: true,
          enableBuild: true,
          enableRuntimeChecks: true
        },
        projectDir // Pass the complete project directory
      );

      console.log("\n📊 Railway Validation Results Summary:");
      console.log("  ✅ Success:", railwayResult.success);
      console.log("  ❌ Errors:", railwayResult.errors.length);
      console.log("  ⚠️  Warnings:", railwayResult.warnings.length);
      console.log("  ℹ️  Info:", railwayResult.info.length);
      console.log("  ⏱️  Compilation Time:", railwayResult.compilationTime, "ms");
      console.log("  📋 Validation Summary:", railwayResult.validationSummary);

      if (railwayResult.success) {
        console.log("\n🎉 Railway validation successful - files are valid!");
        console.log(`📁 Returning ${railwayResult.files.length} validated files`);
        return railwayResult.files;
      }

      console.log("\n⚠️ Railway validation found errors - proceeding to error fixing...");
      return await fixRailwayCompilationErrors(railwayResult, callLLM, projectId, true);
    } else {
      console.log("⚠️ Railway validation not available - falling back to local validation");
    }
  } catch (railwayError) {
    console.warn("⚠️ Railway validation failed - falling back to local validation:", railwayError);
  }

  // Fallback to local validation (limited in serverless)
  console.log("\n🔧 Falling back to local CompilationValidator...");
  const validator = new CompilationValidator(process.cwd());
  
  // Convert to the format expected by CompilationValidator
  console.log("🔄 Converting files for validation...");
  const filesForValidation = generatedFiles.map(file => ({
    filename: file.filename,
    content: file.content,
    operation: 'create' as const
  }));
  console.log(`  ✅ Converted ${filesForValidation.length} files for validation`);

  console.log("\n🚀 Starting local compilation validation...");
  const compilationResult = await validator.validateProject(
    filesForValidation,
    currentFiles
  );

  console.log("\n📊 Local Compilation Results Summary:");
  console.log("  ✅ Success:", compilationResult.success);
  console.log("  ❌ Errors:", compilationResult.errors.length);
  console.log("  ⚠️  Warnings:", compilationResult.warnings.length);
  console.log("  ℹ️  Info:", compilationResult.info.length);
  console.log("  ⏱️  Compilation Time:", compilationResult.compilationTime, "ms");
  console.log("  📋 Validation Summary:", compilationResult.validationSummary);

  if (compilationResult.success) {
    console.log("\n🎉 Local validation successful - files are valid!");
    console.log(`📁 Returning ${compilationResult.files.length} validated files`);
    return compilationResult.files;
  }

  console.log("\n⚠️ Local validation found errors - proceeding to error fixing...");
  return await fixCompilationErrors(compilationResult, callLLM, projectId, true);
}

/**
 * Stage 4: Compilation Validator for Follow-Up Changes
 * Validates and fixes diff-based changes using Railway's full compilation validation
 */
async function executeStage4FollowUpValidation(
  generatedFiles: { filename: string; content: string }[],
  currentFiles: { filename: string; content: string }[],
  callLLM: (
    systemPrompt: string,
    userPrompt: string,
    stageName: string,
    stageType?: keyof typeof STAGE_MODEL_CONFIG
  ) => Promise<string>,
  projectId?: string,
  projectDir?: string
): Promise<{ filename: string; content: string }[]> {
  console.log("\n" + "=".repeat(50));
  console.log("🔍 STAGE 4: Compilation Validation (Follow-Up Changes)");
  console.log("=".repeat(50));
  console.log(`📊 Input Summary:`);
  console.log(`  - Generated files: ${generatedFiles.length}`);
  console.log(`  - Current files: ${currentFiles.length}`);
  console.log(`  - Project ID: ${projectId || 'None'}`);

  // Try Railway validation first (full validation)
  try {
    console.log("\n🚂 Attempting Railway validation (full compilation)...");
    const railwayClient = createRailwayValidationClient();
    
    // Check if Railway validation is available
    const isRailwayAvailable = await railwayClient.checkHealth();
    if (isRailwayAvailable) {
      console.log("✅ Railway validation available - using full compilation validation");
      
      const railwayResult = await railwayClient.validateProject(
        projectId || `validation-${Date.now()}`,
        generatedFiles,
        {
          enableTypeScript: true,
          enableSolidity: true,
          enableESLint: true,
          enableBuild: true,
          enableRuntimeChecks: true
        },
        projectDir // Pass the complete project directory
      );

      console.log("\n📊 Railway Validation Results Summary:");
      console.log("  ✅ Success:", railwayResult.success);
      console.log("  ❌ Errors:", railwayResult.errors.length);
      console.log("  ⚠️  Warnings:", railwayResult.warnings.length);
      console.log("  ℹ️  Info:", railwayResult.info.length);
      console.log("  ⏱️  Compilation Time:", railwayResult.compilationTime, "ms");
      console.log("  📋 Validation Summary:", railwayResult.validationSummary);

      if (railwayResult.success) {
        console.log("\n🎉 Railway validation successful - files are valid!");
        console.log(`📁 Returning ${railwayResult.files.length} validated files`);
        return railwayResult.files;
      }

      console.log("\n⚠️ Railway validation found errors - proceeding to surgical error fixing...");
      return await fixRailwayCompilationErrors(railwayResult, callLLM, projectId, false);
    } else {
      console.log("⚠️ Railway validation not available - falling back to local validation");
    }
  } catch (railwayError) {
    console.warn("⚠️ Railway validation failed - falling back to local validation:", railwayError);
  }

  // Fallback to local validation (limited in serverless)
  console.log("\n🔧 Falling back to local CompilationValidator...");
  const validator = new CompilationValidator(process.cwd());
  
  // Convert to the format expected by CompilationValidator
  console.log("🔄 Converting files for validation (follow-up mode)...");
  // For follow-up changes, we need to pass the actual file content for validation
  // The CompilationValidator will handle the diff application internally
  const filesForValidation = generatedFiles.map(file => ({
    filename: file.filename,
    content: file.content,
    operation: 'modify' as const
  }));
  console.log(`  ✅ Converted ${filesForValidation.length} files for validation`);

  console.log("\n🚀 Starting local compilation validation...");
  const compilationResult = await validator.validateProject(
    filesForValidation,
    currentFiles
  );

  console.log("\n📊 Local Compilation Results Summary:");
  console.log("  ✅ Success:", compilationResult.success);
  console.log("  ❌ Errors:", compilationResult.errors.length);
  console.log("  ⚠️  Warnings:", compilationResult.warnings.length);
  console.log("  ℹ️  Info:", compilationResult.info.length);
  console.log("  ⏱️  Compilation Time:", compilationResult.compilationTime, "ms");
  console.log("  📋 Validation Summary:", compilationResult.validationSummary);

  if (compilationResult.success) {
    console.log("\n🎉 Local validation successful - files are valid!");
    console.log(`📁 Returning ${compilationResult.files.length} validated files`);
    return compilationResult.files;
  }

  console.log("\n⚠️ Local validation found errors - proceeding to surgical error fixing...");
  return await fixCompilationErrors(compilationResult, callLLM, projectId, false);
}


/**
 * Fix Railway compilation errors using LLM-based error correction
 */
async function fixRailwayCompilationErrors(
  railwayResult: RailwayValidationResult,
  callLLM: (
    systemPrompt: string,
    userPrompt: string,
    stageName: string,
    stageType?: keyof typeof STAGE_MODEL_CONFIG
  ) => Promise<string>,
  projectId?: string,
  isInitialGeneration: boolean = false
): Promise<{ filename: string; content: string }[]> {
  console.log("\n" + "=".repeat(60));
  console.log("🔧 STAGE 4: Railway Compilation Error Fixing Process");
  console.log("=".repeat(60));
  console.log(`📊 Input Summary:`);
  console.log(`  - Total files: ${railwayResult.files.length}`);
  console.log(`  - Railway errors: ${railwayResult.errors.length}`);
  console.log(`  - Railway warnings: ${railwayResult.warnings.length}`);
  console.log(`  - Railway info: ${railwayResult.info.length}`);
  console.log(`  - Is Initial Generation: ${isInitialGeneration}`);
  
  // Use only Railway errors
  console.log("\n🔍 Step 1: Processing Railway compilation errors...");
  const allErrors = railwayResult.errors;
  console.log(`  ✅ Total errors to process: ${allErrors.length}`);
  
  // Group errors by file for easier processing
  console.log("\n🔍 Step 2: Grouping errors by file...");
  const errorsByFile = new Map<string, RailwayValidationError[]>();
  for (const error of allErrors) {
    if (!errorsByFile.has(error.file)) {
      errorsByFile.set(error.file, []);
    }
    errorsByFile.get(error.file)!.push(error);
  }
  console.log(`  ✅ Errors grouped into ${errorsByFile.size} files`);
  
  // Debug: Log error files and available files
  console.log("\n🔍 Step 3: File matching analysis...");
  console.log("  📋 Error files:", Array.from(errorsByFile.keys()));
  console.log("  📋 Available files:", railwayResult.files.map(f => f.filename));
  
  // Get files that need fixing - try multiple matching strategies
  console.log("\n🔍 Step 4: Finding files that need fixing...");
  let filesToFix = railwayResult.files.filter(file => 
    errorsByFile.has(file.filename)
  );
  console.log(`  📊 Exact matches found: ${filesToFix.length} files`);

  // If no exact matches, try to match by basename or relative path
  if (filesToFix.length === 0) {
    console.log("  🔍 No exact filename matches found, trying alternative matching strategies...");
    
    // Try matching by basename (filename without path)
    console.log("  🔍 Attempting basename matching...");
    const errorBasenames = new Map<string, RailwayValidationError[]>();
    for (const [errorFile, errors] of errorsByFile.entries()) {
      const basename = path.basename(errorFile);
      if (!errorBasenames.has(basename)) {
        errorBasenames.set(basename, []);
      }
      errorBasenames.get(basename)!.push(...errors);
    }
    console.log(`  📋 Error basenames: ${Array.from(errorBasenames.keys())}`);
    
    filesToFix = railwayResult.files.filter(file => {
      const fileBasename = path.basename(file.filename);
      return errorBasenames.has(fileBasename);
    });
    
    if (filesToFix.length > 0) {
      console.log(`  ✅ Found ${filesToFix.length} files using basename matching`);
      console.log(`  📋 Matched files: ${filesToFix.map(f => f.filename)}`);
      
      // Update errorsByFile to use the matched filenames
      const newErrorsByFile = new Map<string, RailwayValidationError[]>();
      for (const file of filesToFix) {
        const fileBasename = path.basename(file.filename);
        const errors = errorBasenames.get(fileBasename) || [];
        if (errors.length > 0) {
          newErrorsByFile.set(file.filename, errors);
          console.log(`  🔗 Mapped ${fileBasename} -> ${file.filename} (${errors.length} errors)`);
        }
      }
      // Replace the original errorsByFile
      for (const [key, value] of newErrorsByFile.entries()) {
        errorsByFile.set(key, value);
      }
    } else {
      console.log("  ❌ No basename matches found either");
    }
  }

  if (filesToFix.length === 0) {
    console.log("\n❌ CRITICAL: No files identified for fixing!");
    console.log("📋 This indicates a serious issue with error parsing or file mapping");
    console.log("📋 Error files:", Array.from(errorsByFile.keys()));
    console.log("📋 Available files:", railwayResult.files.map(f => f.filename));
    console.log("📋 Returning original files - manual review required");
    return railwayResult.files;
  }

  // Create detailed error messages for LLM
  console.log("\n🔍 Step 5: Creating error messages for LLM...");
  const errorMessages = Array.from(errorsByFile.entries()).map(([file, errors]) => {
    const errorList = errors.map(e => {
      const location = e.line ? `Line ${e.line}${e.column ? `:${e.column}` : ''}` : 'Unknown location';
      const suggestion = e.suggestion ? ` (Suggestion: ${e.suggestion})` : '';
      return `${location}: ${e.message} (${e.category})${suggestion}`;
    }).join('\n');
    return `${file}:\n${errorList}`;
  }).join('\n\n');

  console.log(`  ✅ Prepared error messages for ${filesToFix.length} files`);
  console.log(`  📋 Files to fix: ${filesToFix.map(f => f.filename)}`);
  console.log("  📋 Error summary:");
  filesToFix.forEach(file => {
    const errors = errorsByFile.get(file.filename) || [];
    console.log(`    - ${file.filename}: ${errors.length} errors`);
  });

  // Call LLM to fix errors
  console.log("\n🤖 Step 6: Calling LLM to fix errors...");
  console.log(`  📤 Preparing LLM prompt for ${filesToFix.length} files...`);
  
  const fixPrompt = getStage4CompilationFixPrompt(filesToFix, errorMessages, isInitialGeneration);
  console.log(`  📏 Prompt length: ${fixPrompt.length} characters`);
  console.log(`  🎯 Generation type: ${isInitialGeneration ? 'Complete files' : 'Surgical diffs'}`);
  
  console.log("  🚀 Calling LLM...");
  const fixResponse = await callLLM(
    fixPrompt,
    "Stage 4: Railway Compilation Error Fixes",
    "STAGE_4_VALIDATOR"
  );
  console.log(`  ✅ LLM response received: ${fixResponse.length} characters`);

  if (projectId) {
    console.log("  📝 Logging response for debugging...");
    logStageResponse(projectId, 'stage4-railway-compilation-fixes', fixResponse, {
      railwayErrors: railwayResult.errors,
      filesToFix: filesToFix.length,
      errorSummary: {
        totalErrors: railwayResult.errors.length,
        errorsByCategory: railwayResult.errors.reduce((acc, e) => {
          acc[e.category] = (acc[e.category] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      }
    });
  }

  // Parse and return fixed files
  console.log("\n🔍 Step 7: Parsing LLM response...");
  const fixedFiles = parseStage4ValidatorResponse(fixResponse);
  console.log(`  ✅ Parsed ${fixedFiles.length} fixed files from LLM response`);
  
  // Merge fixed files with unchanged files
  console.log("\n🔍 Step 8: Merging fixed and unchanged files...");
  const unchangedFiles = railwayResult.files.filter(file => 
    !errorsByFile.has(file.filename)
  );
  console.log(`  📊 Unchanged files: ${unchangedFiles.length}`);
  console.log(`  📊 Fixed files: ${fixedFiles.length}`);

  const finalFiles = [...unchangedFiles];
  
  // Add fixed files
  console.log("  🔄 Processing fixed files...");
  for (const fixedFile of fixedFiles) {
    if (fixedFile.content) {
      console.log(`    ✅ ${fixedFile.filename}: Complete content provided`);
      finalFiles.push({
        filename: fixedFile.filename,
        content: fixedFile.content
      });
    } else if (fixedFile.unifiedDiff) {
      console.log(`    🔧 ${fixedFile.filename}: Applying unified diff...`);
      // Apply diff to get final content
      const originalFile = railwayResult.files.find(f => f.filename === fixedFile.filename);
      if (originalFile) {
        try {
          const updatedContent = applyDiffToContent(originalFile.content, fixedFile.unifiedDiff);
          finalFiles.push({
            filename: fixedFile.filename,
            content: updatedContent
          });
          console.log(`    ✅ ${fixedFile.filename}: Diff applied successfully`);
        } catch (error) {
          console.warn(`    ⚠️ ${fixedFile.filename}: Failed to apply diff:`, error);
          finalFiles.push(originalFile);
        }
      } else {
        console.warn(`    ❌ ${fixedFile.filename}: Original file not found for diff application`);
      }
    } else {
      console.warn(`    ⚠️ ${fixedFile.filename}: No content or diff provided`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("🎉 STAGE 4: Railway Compilation Error Fixing Complete!");
  console.log("=".repeat(60));
  console.log(`📊 Final Results:`);
  console.log(`  - Total files: ${finalFiles.length}`);
  console.log(`  - Files fixed: ${fixedFiles.length}`);
  console.log(`  - Files unchanged: ${unchangedFiles.length}`);
  console.log(`  - Original errors: ${railwayResult.errors.length}`);
  console.log("=".repeat(60));
  
  return finalFiles;
}

/**
 * Fix compilation errors using LLM-based error correction
 */
async function fixCompilationErrors(
  compilationResult: CompilationResult,
  callLLM: (
    systemPrompt: string,
    userPrompt: string,
    stageName: string,
    stageType?: keyof typeof STAGE_MODEL_CONFIG
  ) => Promise<string>,
  projectId?: string,
  isInitialGeneration: boolean = false
): Promise<{ filename: string; content: string }[]> {
  console.log("\n" + "=".repeat(60));
  console.log("🔧 STAGE 4: Compilation Error Fixing Process");
  console.log("=".repeat(60));
  console.log(`📊 Input Summary:`);
  console.log(`  - Total files: ${compilationResult.files.length}`);
  console.log(`  - Compilation errors: ${compilationResult.errors.length}`);
  console.log(`  - Compilation warnings: ${compilationResult.warnings.length}`);
  console.log(`  - Compilation info: ${compilationResult.info.length}`);
  console.log(`  - Is Initial Generation: ${isInitialGeneration}`);
  
  // Use only compilation errors (common issues detection removed due to false positives)
  console.log("\n🔍 Step 1: Processing compilation errors...");
  const allErrors = compilationResult.errors;
  console.log(`  ✅ Total errors to process: ${allErrors.length}`);
  
  // Group errors by file for easier processing
  console.log("\n🔍 Step 2: Grouping errors by file...");
  const errorsByFile = CompilationErrorUtils.groupErrorsByFile(allErrors);
  console.log(`  ✅ Errors grouped into ${errorsByFile.size} files`);
  
  // Debug: Log error files and available files
  console.log("\n🔍 Step 3: File matching analysis...");
  console.log("  📋 Error files:", Array.from(errorsByFile.keys()));
  console.log("  📋 Available files:", compilationResult.files.map(f => f.filename));
  
  // Get files that need fixing - try multiple matching strategies
  console.log("\n🔍 Step 4: Finding files that need fixing...");
  let filesToFix = compilationResult.files.filter(file => 
    errorsByFile.has(file.filename)
  );
  console.log(`  📊 Exact matches found: ${filesToFix.length} files`);

  // If no exact matches, try to match by basename or relative path
  if (filesToFix.length === 0) {
    console.log("  🔍 No exact filename matches found, trying alternative matching strategies...");
    
    // Try matching by basename (filename without path)
    console.log("  🔍 Attempting basename matching...");
    const errorBasenames = new Map<string, CompilationError[]>();
    for (const [errorFile, errors] of errorsByFile.entries()) {
      const basename = path.basename(errorFile);
      if (!errorBasenames.has(basename)) {
        errorBasenames.set(basename, []);
      }
      errorBasenames.get(basename)!.push(...errors);
    }
    console.log(`  📋 Error basenames: ${Array.from(errorBasenames.keys())}`);
    
    filesToFix = compilationResult.files.filter(file => {
      const fileBasename = path.basename(file.filename);
      return errorBasenames.has(fileBasename);
    });
    
    if (filesToFix.length > 0) {
      console.log(`  ✅ Found ${filesToFix.length} files using basename matching`);
      console.log(`  📋 Matched files: ${filesToFix.map(f => f.filename)}`);
      
      // Update errorsByFile to use the matched filenames
      const newErrorsByFile = new Map<string, CompilationError[]>();
      for (const file of filesToFix) {
        const fileBasename = path.basename(file.filename);
        const errors = errorBasenames.get(fileBasename) || [];
        if (errors.length > 0) {
          newErrorsByFile.set(file.filename, errors);
          console.log(`  🔗 Mapped ${fileBasename} -> ${file.filename} (${errors.length} errors)`);
        }
      }
      // Replace the original errorsByFile
      for (const [key, value] of newErrorsByFile.entries()) {
        errorsByFile.set(key, value);
      }
    } else {
      console.log("  ❌ No basename matches found either");
    }
  }

  if (filesToFix.length === 0) {
    console.log("\n❌ CRITICAL: No files identified for fixing!");
    console.log("📋 This indicates a serious issue with error parsing or file mapping");
    console.log("📋 Error files:", Array.from(errorsByFile.keys()));
    console.log("📋 Available files:", compilationResult.files.map(f => f.filename));
    console.log("📋 Returning original files - manual review required");
    return compilationResult.files;
  }

  // Create detailed error messages for LLM
  console.log("\n🔍 Step 5: Creating error messages for LLM...");
  const errorMessages = Array.from(errorsByFile.entries()).map(([file, errors]) => {
    const errorList = errors.map(e => {
      const location = e.line ? `Line ${e.line}${e.column ? `:${e.column}` : ''}` : 'Unknown location';
      const suggestion = e.suggestion ? ` (Suggestion: ${e.suggestion})` : '';
      return `${location}: ${e.message} (${e.category})${suggestion}`;
    }).join('\n');
    return `${file}:\n${errorList}`;
  }).join('\n\n');

  console.log(`  ✅ Prepared error messages for ${filesToFix.length} files`);
  console.log(`  📋 Files to fix: ${filesToFix.map(f => f.filename)}`);
  console.log("  📋 Error summary:");
  filesToFix.forEach(file => {
    const errors = errorsByFile.get(file.filename) || [];
    console.log(`    - ${file.filename}: ${errors.length} errors`);
  });

  // Call LLM to fix errors
  console.log("\n🤖 Step 6: Calling LLM to fix errors...");
  console.log(`  📤 Preparing LLM prompt for ${filesToFix.length} files...`);
  
  const fixPrompt = getStage4CompilationFixPrompt(filesToFix, errorMessages, isInitialGeneration);
  console.log(`  📏 Prompt length: ${fixPrompt.length} characters`);
  console.log(`  🎯 Generation type: ${isInitialGeneration ? 'Complete files' : 'Surgical diffs'}`);
  
  console.log("  🚀 Calling LLM...");
  const fixResponse = await callLLM(
    fixPrompt,
    "Stage 4: Compilation Error Fixes",
    "STAGE_4_VALIDATOR"
  );
  console.log(`  ✅ LLM response received: ${fixResponse.length} characters`);

  if (projectId) {
    console.log("  📝 Logging response for debugging...");
    logStageResponse(projectId, 'stage4-compilation-fixes', fixResponse, {
      compilationErrors: compilationResult.errors,
      filesToFix: filesToFix.length,
      errorSummary: CompilationErrorUtils.getErrorSummary(compilationResult.errors)
    });
  }

  // Parse and return fixed files
  console.log("\n🔍 Step 7: Parsing LLM response...");
  const fixedFiles = parseStage4ValidatorResponse(fixResponse);
  console.log(`  ✅ Parsed ${fixedFiles.length} fixed files from LLM response`);
  
  // Merge fixed files with unchanged files
  console.log("\n🔍 Step 8: Merging fixed and unchanged files...");
  const unchangedFiles = compilationResult.files.filter(file => 
    !errorsByFile.has(file.filename)
  );
  console.log(`  📊 Unchanged files: ${unchangedFiles.length}`);
  console.log(`  📊 Fixed files: ${fixedFiles.length}`);

  const finalFiles = [...unchangedFiles];
  
  // Add fixed files
  console.log("  🔄 Processing fixed files...");
  for (const fixedFile of fixedFiles) {
    if (fixedFile.content) {
      console.log(`    ✅ ${fixedFile.filename}: Complete content provided`);
      finalFiles.push({
        filename: fixedFile.filename,
        content: fixedFile.content
      });
    } else if (fixedFile.unifiedDiff) {
      console.log(`    🔧 ${fixedFile.filename}: Applying unified diff...`);
      // Apply diff to get final content
      const originalFile = compilationResult.files.find(f => f.filename === fixedFile.filename);
      if (originalFile) {
        try {
          const updatedContent = applyDiffToContent(originalFile.content, fixedFile.unifiedDiff);
          finalFiles.push({
            filename: fixedFile.filename,
            content: updatedContent
          });
          console.log(`    ✅ ${fixedFile.filename}: Diff applied successfully`);
        } catch (error) {
          console.warn(`    ⚠️ ${fixedFile.filename}: Failed to apply diff:`, error);
          finalFiles.push(originalFile);
        }
      } else {
        console.warn(`    ❌ ${fixedFile.filename}: Original file not found for diff application`);
      }
    } else {
      console.warn(`    ⚠️ ${fixedFile.filename}: No content or diff provided`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("🎉 STAGE 4: Compilation Error Fixing Complete!");
  console.log("=".repeat(60));
  console.log(`📊 Final Results:`);
  console.log(`  - Total files: ${finalFiles.length}`);
  console.log(`  - Files fixed: ${fixedFiles.length}`);
  console.log(`  - Files unchanged: ${unchangedFiles.length}`);
  console.log(`  - Original errors: ${compilationResult.errors.length}`);
  console.log("=".repeat(60));
  
  return finalFiles;
}

/**
 * Generate Stage 4 compilation fix prompt
 */
function getStage4CompilationFixPrompt(
  filesToFix: { filename: string; content: string }[],
  errorMessages: string,
  isInitialGeneration: boolean
): string {
  return `
ROLE: Compilation Error Fixer for Next.js 15 + TypeScript + React + Solidity

COMPILATION ERRORS FOUND:
${errorMessages}

FILES TO FIX:
${filesToFix.map((f) => `---${f.filename}---\n${f.content}`).join("\n\n")}

TASK: Fix the compilation errors above. ${isInitialGeneration ? 'Generate complete corrected files.' : 'Generate surgical diff patches to fix only the specific compilation errors.'}

CRITICAL REQUIREMENTS:
- Fix ALL compilation errors listed above
- Preserve existing functionality and UI implementations
- Only fix the specific errors mentioned
- Do not introduce new errors
- Maintain code quality and best practices
- Ensure TypeScript compilation passes
- Ensure Solidity contracts compile successfully
- Follow ESLint rules and best practices

COMPILATION ERROR TYPES:
1. TypeScript Errors: Fix type mismatches, missing imports, interface violations, function signatures
2. Solidity Errors: Fix contract compilation issues, syntax errors, type mismatches
3. ESLint Errors: Fix code style and best practice violations
4. Build Errors: Fix Next.js build failures, missing dependencies
5. Runtime Errors: Fix potential runtime issues, memory leaks, error handling

${isInitialGeneration ? `
OUTPUT FORMAT - Complete Files:
__START_JSON__
[
  {
    "filename": "EXACT_SAME_FILENAME",
    "content": "Complete corrected file content with all compilation errors fixed"
  }
]
__END_JSON__
` : `
OUTPUT FORMAT - Surgical Diffs:
__START_JSON__
[
  {
    "filename": "EXACT_SAME_FILENAME",
    "operation": "modify",
    "unifiedDiff": "@@ -X,Y +X,Z @@\n context\n-old line\n+new line\n context",
    "diffHunks": [
      {
        "oldStart": X,
        "oldLines": Y,
        "newStart": X,
        "newLines": Z,
        "lines": [" context", "-old line", "+new line", " context"]
      }
    ]
  }
]
__END_JSON__
`}

CRITICAL: Return ONLY the JSON array above. No explanations, no text, no markdown formatting.
`;
}

// ========================================================================
// LEGACY UNIFIED PIPELINE (Backward Compatibility)
// ========================================================================

/**
 * @deprecated Use executeInitialGenerationPipeline or executeFollowUpPipeline instead
 * Legacy unified pipeline maintained for backward compatibility
 */
export async function executeMultiStagePipeline(
  userPrompt: string,
  currentFiles: { filename: string; content: string }[],
  callLLM: (
    systemPrompt: string,
    userPrompt: string,
    stageName: string,
    stageType?: keyof typeof STAGE_MODEL_CONFIG
  ) => Promise<string>,
  projectId?: string,
  isInitialGeneration: boolean = false
): Promise<{ files: { filename: string; content: string }[]; intentSpec: IntentSpec }> {
  // Delegate to the appropriate specialized pipeline
  console.log("⚠️ Using legacy executeMultiStagePipeline - consider using specialized pipelines");
  
  if (isInitialGeneration) {
    return executeInitialGenerationPipeline(userPrompt, currentFiles, callLLM, projectId);
  } else {
    return executeFollowUpPipeline(userPrompt, currentFiles, callLLM, projectId);
  }
}

// ========================================================================
// HELPER FUNCTIONS
// ========================================================================

// Helper function to log LLM calls with timing (Legacy - not used in new pipelines)
// Helper function to log LLM calls with timing
export async function callLLMWithLogging(
  systemPrompt: string,
  userPrompt: string,
  callLLM: (systemPrompt: string, userPrompt: string) => Promise<string>,
  stageName: string
): Promise<string> {
  console.log(`\n🤖 LLM Call - ${stageName}`);
  console.log("📤 Input:");
  console.log("  System Prompt Length:", systemPrompt.length, "chars");
  console.log("  User Prompt:", userPrompt);

  const startTime = Date.now();
  const response = await callLLM(systemPrompt, userPrompt);
  const endTime = Date.now();

  console.log("📥 Output:");
  console.log("  Response Length:", response.length, "chars");
  console.log("  Response Time:", endTime - startTime, "ms");
  console.log("  Raw Response Preview:", response.substring(0, 300) + "...");

  return response;
}
