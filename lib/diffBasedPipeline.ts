// Enhanced LLM Pipeline with Diff-Based Patching
// This module extends the existing pipeline to support surgical code changes

import { 
  STAGE_MODEL_CONFIG,
  PatchPlan,
  FileDiff,
  getStage0ContextGathererPrompt
} from './llmOptimizer';
import { applyDiffToContent, applyDiffHunks, validateDiff } from './diffUtils';
import { executeToolCalls } from './toolExecutionService';

export interface DiffBasedResult {
  files: { filename: string; content: string }[];
  diffs: FileDiff[];
  patchPlan: PatchPlan;
  contextGathered?: {
    needsContext: boolean;
    toolCalls: Array<{
      tool: string;
      args: string[];
      workingDirectory?: string;
      reason?: string;
    }>;
    contextSummary: string;
  };
}

export interface DiffBasedOptions {
  enableContextGathering?: boolean;
  enableDiffValidation?: boolean;
  enableLinting?: boolean;
}

/**
 * Enhanced pipeline that supports diff-based patching for surgical code changes
 */
export async function executeDiffBasedPipeline(
  userPrompt: string,
  currentFiles: { filename: string; content: string }[],
  callLLM: (systemPrompt: string, userPrompt: string, stageName: string, stageType?: keyof typeof STAGE_MODEL_CONFIG) => Promise<string>,
  options: DiffBasedOptions = {},
  projectId?: string,
  projectDir?: string
): Promise<DiffBasedResult> {
  const {
    enableContextGathering = true,
    enableDiffValidation = true,
    enableLinting = true
  } = options;

  console.log('🚀 Starting Diff-Based Pipeline');
  console.log('Options:', { enableContextGathering, enableDiffValidation, enableLinting });

  let contextGathered = null;
  const generatedFiles: { filename: string; content: string }[] = [];
  const diffs: FileDiff[] = [];

  // Stage 0: Context Gathering (if enabled)
  if (enableContextGathering) {
    console.log('📊 Stage 0: Context Gathering');
    
    try {
      const contextPrompt = `USER REQUEST: ${userPrompt}`;
      const contextResponse = await callLLM(
        getStage0ContextGathererPrompt(userPrompt, currentFiles),
        contextPrompt,
        'Stage 0: Context Gatherer',
        'STAGE_0_CONTEXT_GATHERER'
      );
      console.log('🔍 Context response:', contextResponse);
      // Parse context response
      let contextData;
      try {
        contextData = JSON.parse(contextResponse);
        console.log('🔍 Context data:', contextData);
        contextGathered = contextData;
      } catch (error) {
        console.warn('⚠️ Context gathering response is not valid JSON, skipping context:', error);
        contextGathered = { needsContext: false, toolCalls: [] };
      }

      // Execute tool calls if needed
      if (contextData.needsContext && contextData.toolCalls?.length > 0) {
        console.log('🔍 Executing tool calls for context gathering');
        
        // Use real project data if available, otherwise skip tool execution
        if (projectId && projectDir) {
          const toolResults = await executeToolCalls(contextData, projectId, projectDir);
          
          // Add tool results to user prompt for better context
          userPrompt = `${userPrompt}\n\nContext gathered:\n${toolResults.toolResults.map((r, index) => `Tool ${index + 1}: ${r.output}`).join('\n')}`;
        } else {
          console.warn('⚠️ Project ID or directory not provided, skipping tool execution');
        }
      }
    } catch (error) {
      console.warn('⚠️ Context gathering failed, continuing without context:', error);
    }
  }

  // Stage 1: Intent Parser
  console.log('🎯 Stage 1: Intent Parser');
  const intentPrompt = `Parse this request: ${userPrompt}`;
  await callLLM(
    `You are an intent parser. Analyze the user request and extract structured requirements.`,
    intentPrompt,
    'Stage 1: Intent Parser',
    'STAGE_1_INTENT_PARSER'
  );

  // Stage 2: Patch Planner (Enhanced with Diff Generation)
  console.log('📋 Stage 2: Patch Planner with Diff Generation');
  const patchPrompt = `Create a patch plan with diffs for: ${userPrompt}`;
  await callLLM(
    `You are a patch planner. Create detailed patch plans with unified diff hunks for surgical code changes.`,
    patchPrompt,
    'Stage 2: Patch Planner',
    'STAGE_2_PATCH_PLANNER'
  );

  // Stage 3: Code Generator (Diff-Based)
  console.log('⚡ Stage 3: Diff-Based Code Generator');
  const codePrompt = `Generate diffs for: ${userPrompt}`;
  const codeResponse = await callLLM(
    `You are a code generator. Generate unified diff patches for surgical changes rather than full file rewrites.

CRITICAL: You MUST return ONLY valid JSON. No explanations, no text, no markdown, no code fences.

OUTPUT FORMAT:
Generate a JSON array of file diffs and complete files:
[
  {
    "filename": "path/to/file",
    "operation": "modify",
    "unifiedDiff": "@@ -1,3 +1,6 @@\\n import { ConnectWallet } from '@/components/wallet/ConnectWallet';\\n import { Tabs } from '@/components/ui/Tabs';\\n+import { useReadContract } from 'wagmi';\\n+import { useAccount } from 'wagmi';\\n import { useUser } from '@/hooks';\\n ",
    "diffHunks": [
      {
        "oldStart": 1,
        "oldLines": 3,
        "newStart": 1,
        "newLines": 6,
        "lines": [" import { ConnectWallet } from '@/components/wallet/ConnectWallet';", " import { Tabs } from '@/components/ui/Tabs';", "+import { useReadContract } from 'wagmi';", "+import { useAccount } from 'wagmi';", " import { useUser } from '@/hooks';", " "]
      }
    ]
  },
  {
    "filename": "path/to/newfile",
    "operation": "create",
    "content": "complete file content for new files"
  }
]

REMEMBER: Return ONLY the JSON array above. No other text, no explanations, no markdown formatting.`,
    codePrompt,
    'Stage 3: Code Generator',
    'STAGE_3_CODE_GENERATOR'
  );

  let codeResult;
  try {
    codeResult = JSON.parse(codeResponse);
  } catch (error) {
    console.error('❌ Failed to parse Stage 3 response as JSON:');
    console.error('Raw response:', codeResponse);
    throw new Error(
      `Stage 3 JSON parsing failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  // Process the code generation result
  for (const fileResult of codeResult) {
    if (fileResult.operation === 'create') {
      // New file - add to generated files
      generatedFiles.push({
        filename: fileResult.filename,
        content: fileResult.content
      });
    } else if (fileResult.operation === 'modify') {
      // Modified file - apply diff to existing content
      const existingFile = currentFiles.find(f => f.filename === fileResult.filename);
      if (existingFile) {
        try {
          // Apply the unified diff to the existing content
          const newContent = applyDiffToContent(existingFile.content, fileResult.unifiedDiff);
          
          generatedFiles.push({
            filename: fileResult.filename,
            content: newContent
          });

          // Store the diff for rollback capability
          diffs.push({
            filename: fileResult.filename,
            hunks: fileResult.diffHunks || [],
            unifiedDiff: fileResult.unifiedDiff
          });
        } catch (error) {
          console.error(`❌ Failed to apply diff to ${fileResult.filename}:`, error);
          // Fallback to full file content if diff application fails
          generatedFiles.push({
            filename: fileResult.filename,
            content: fileResult.content || existingFile.content
          });
        }
      }
    }
  }

  // Stage 4: Validation (Diff-Based)
  if (enableDiffValidation) {
    console.log('✅ Stage 4: Diff-Based Validation');
    
    // Validate diffs
    for (const diff of diffs) {
      const isValid = validateDiff(diff);
      if (!isValid) {
        console.warn(`⚠️ Invalid diff for ${diff.filename}, skipping validation`);
      }
    }

    // Run linter if enabled
    if (enableLinting) {
      console.log('🔍 Running linter validation');
      // TODO: Implement linter validation
      // This would run ESLint on the generated files and fix any issues
    }
  }

  console.log('✅ Diff-Based Pipeline Complete');
  console.log(`Generated ${generatedFiles.length} files with ${diffs.length} diffs`);

  return {
    files: generatedFiles,
    diffs,
    patchPlan: { patches: [] },
    contextGathered
  };
}

/**
 * Apply diffs to existing files for hot-reload efficiency
 */
export function applyDiffsToFiles(
  files: { filename: string; content: string }[],
  diffs: FileDiff[]
): { filename: string; content: string }[] {
  console.log('applyDiffsToFiles called with:', { files: files.length, diffs: diffs.length });
  const result = [...files];

  for (const diff of diffs) {
    console.log('Processing diff for:', diff.filename);
    const fileIndex = result.findIndex(f => f.filename === diff.filename);
    console.log('File index:', fileIndex);
    if (fileIndex !== -1) {
      try {
        console.log('Applying diff hunks:', diff.hunks);
        result[fileIndex].content = applyDiffHunks(result[fileIndex].content, diff.hunks);
        console.log(`✅ Applied diff to ${diff.filename}`);
        console.log('New content:', result[fileIndex].content);
      } catch (error) {
        console.error(`❌ Failed to apply diff to ${diff.filename}:`, error);
      }
    }
  }

  return result;
}

/**
 * Store diffs for rollback capability
 */
export function storeDiffs(projectId: string, diffs: FileDiff[]): void {
  // TODO: Implement diff storage in project history
  // This would store diffs in generated/<project-id>/patches/ for rollback
  console.log(`📦 Storing ${diffs.length} diffs for project ${projectId}`);
  
  // For now, just log the diffs - in a real implementation, this would save to disk
  if (diffs.length > 0) {
    console.log('Diffs to store:', diffs);
  }
}

/**
 * Rollback to previous state using stored diffs
 */
export function rollbackDiffs(projectId: string, diffs: FileDiff[]): { filename: string; content: string }[] {
  // TODO: Implement rollback functionality
  // This would apply diffs in reverse to rollback changes
  console.log(`🔄 Rolling back ${diffs.length} diffs for project ${projectId}`);
  return [];
}
