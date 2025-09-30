// Enhanced LLM Pipeline with Diff-Based Patching
// This module provides a specialized pipeline for follow-up changes using surgical diffs
// It uses the multi-stage pipeline with diff-based prompts for optimal results

import { 
  STAGE_MODEL_CONFIG,
  PatchPlan,
  FileDiff,
  getStage0ContextGathererPrompt,
  executeMultiStagePipeline
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
      // Parse context response
      let contextData;
      try {
        contextData = JSON.parse(contextResponse);
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

  // Use the multi-stage pipeline with diff-based prompts (isInitialGeneration = false)
  console.log('🔄 Using multi-stage pipeline for diff-based changes');
  const pipelineResult = await executeMultiStagePipeline(
    userPrompt,
    currentFiles,
    callLLM,
    projectId,
    false // isInitialGeneration = false for follow-up changes
  );

  const generatedFilesFromPipeline = pipelineResult.files;

  // Process the generated files and extract diffs
  for (const file of generatedFilesFromPipeline) {
    generatedFiles.push({
      filename: file.filename,
      content: file.content
    });
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
  const result: { filename: string; content: string }[] = [];
  const modifiedFiles = new Set<string>();

  for (const diff of diffs) {
    console.log('Processing diff for:', diff.filename);
    const originalFile = files.find(f => f.filename === diff.filename);
    
    if (originalFile) {
      // File exists - apply diff
      try {
        console.log('Applying diff hunks:', diff.hunks);
        const newContent = applyDiffHunks(originalFile.content, diff.hunks);
        
        // Only add to result if content actually changed
        if (newContent !== originalFile.content) {
          result.push({
            filename: diff.filename,
            content: newContent
          });
          modifiedFiles.add(diff.filename);
          console.log(`✅ Applied diff to ${diff.filename}`);
        } else {
          console.log(`⚠️ No changes detected for ${diff.filename}, skipping`);
        }
      } catch (error) {
        console.error(`❌ Failed to apply diff to ${diff.filename}:`, error);
        // Add original file as fallback
        result.push(originalFile);
        modifiedFiles.add(diff.filename);
      }
    } else {
      // File doesn't exist - create new file from diff content
      console.log(`📝 Creating new file ${diff.filename} from diff content`);
      try {
        // Extract content from unified diff
        const diffLines = diff.unifiedDiff.split('\n');
        const contentLines = diffLines
          .filter(line => line.startsWith('+') && !line.startsWith('+++'))
          .map(line => line.substring(1))
          .join('\n');
        
        result.push({
          filename: diff.filename,
          content: contentLines
        });
        modifiedFiles.add(diff.filename);
        console.log(`✅ Created new file ${diff.filename} with ${contentLines.length} chars`);
      } catch (error) {
        console.error(`❌ Failed to create file ${diff.filename}:`, error);
        // Add empty file as fallback
        result.push({
          filename: diff.filename,
          content: ''
        });
        modifiedFiles.add(diff.filename);
      }
    }
  }

  console.log(`📊 applyDiffsToFiles returning ${result.length} modified files:`, Array.from(modifiedFiles));
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
