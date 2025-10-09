import {
  executeInitialGenerationPipeline,
  executeFollowUpPipeline,
  STAGE_MODEL_CONFIG,
  ContextGatheringResult
} from './llmOptimizer';
import { gatherContextWithTools } from './toolExecutionService';
import { generateDiff, applyDiffToContent, validateDiff, FileDiff, DiffHunk } from './diffUtils';

export interface EnhancedPipelineResult {
  success: boolean;
  files: { filename: string; content: string; diff?: FileDiff }[];
  contextData?: string;
  intentSpec?: { feature: string; reason?: string };
  error?: string;
}

/**
 * Enhanced pipeline with context gathering
 * - For initial generation: Uses full file generation (no diffs)
 * - For follow-up changes: Uses diff-based patching for surgical changes
 */
export async function executeEnhancedPipeline(
  userPrompt: string,
  currentFiles: { filename: string; content: string }[],
  projectId: string,
  accessToken: string,
  callLLM: (
    systemPrompt: string,
    userPrompt: string,
    stageName: string,
    stageType?: keyof typeof STAGE_MODEL_CONFIG
  ) => Promise<string>,
  isInitialGeneration: boolean = false,
  projectDir?: string
): Promise<EnhancedPipelineResult> {
  try {
    console.log("🚀 Starting enhanced pipeline...");

    let contextResult: ContextGatheringResult;
    let contextData = '';
    let enhancedFiles = currentFiles;

    if (isInitialGeneration) {
      console.log("📝 Initial generation - skipping context gathering");
      contextResult = {
        needsContext: false,
        toolCalls: [],
        contextSummary: 'Initial generation - no existing code to analyze'
      };
    } else {
      console.log("🔍 Follow-up changes - gathering context...");
      // Step 1: Gather context with tools if needed
      const contextGatheringResult = await gatherContextWithTools(
        userPrompt,
        currentFiles,
        projectId,
        accessToken,
        callLLM,
        projectDir
      );
      
      contextResult = contextGatheringResult.contextResult;
      contextData = contextGatheringResult.contextData;
      enhancedFiles = contextGatheringResult.enhancedFiles;
    }

    console.log("📊 Context gathering result:");
    console.log("- Needs context:", contextResult.needsContext);
    console.log("- Tool calls:", contextResult.toolCalls?.length || 0);
    console.log("- Context data length:", contextData.length);

    // Step 2: Execute the appropriate specialized pipeline
    let pipelineResult;
    if (isInitialGeneration) {
      pipelineResult = await executeInitialGenerationPipeline(
        userPrompt,
        enhancedFiles,
        callLLM,
        projectId,
        projectDir
      );
    } else {
      pipelineResult = await executeFollowUpPipeline(
        userPrompt,
        enhancedFiles,
        callLLM,
        projectId,
        projectDir
      );
    }

    const generatedFiles = pipelineResult.files;

    // Step 3: Handle file processing based on generation type
    let filesWithDiffs: { filename: string; content: string; diff?: FileDiff }[];
    
    if (isInitialGeneration) {
      // For initial generation, no diffs needed - just return the generated files
      console.log("📝 Initial generation - skipping diff generation");
      filesWithDiffs = generatedFiles.map(file => ({
        filename: file.filename,
        content: file.content,
        diff: undefined
      }));
    } else {
      // For follow-up changes, generate diffs for each file
      console.log("🔧 Follow-up changes - generating diffs");
      filesWithDiffs = generatedFiles.map(file => {
        const originalFile = currentFiles.find(f => f.filename === file.filename);
        
        if (!originalFile) {
          // New file - no diff needed
          return {
            filename: file.filename,
            content: file.content,
            diff: undefined
          };
        }

        // Generate diff for modified file
        try {
          const diff = generateDiff(originalFile.content, file.content, file.filename);
          
          if (validateDiff(diff)) {
            return {
              filename: file.filename,
              content: file.content,
              diff
            };
          } else {
            console.warn(`⚠️ Invalid diff generated for ${file.filename}, using full content`);
            return {
              filename: file.filename,
              content: file.content,
              diff: undefined
            };
          }
        } catch (error) {
          console.error(`❌ Failed to generate diff for ${file.filename}:`, error);
          return {
            filename: file.filename,
            content: file.content,
            diff: undefined
          };
        }
      });
    }

    // Note: Syntax validation removed due to false positives with TypeScript generics
    // Files will be validated by TypeScript compiler during build/preview
    console.log("✅ Enhanced pipeline completed successfully");
    console.log(`📁 Generated ${filesWithDiffs.length} files`);
    console.log(`🔧 Context data: ${contextData ? 'Yes' : 'No'}`);

    return {
      success: true,
      files: filesWithDiffs,
      contextData: contextData,
      intentSpec: pipelineResult.intentSpec
    };

  } catch (error) {
    console.error("❌ Enhanced pipeline failed:", error);
    return {
      success: false,
      files: [],
      intentSpec: undefined,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Apply diffs to files for preview updates
 */
export function applyDiffsToFiles(
  originalFiles: { filename: string; content: string }[],
  filesWithDiffs: { filename: string; content: string; diff?: FileDiff }[]
): { filename: string; content: string }[] {
  const result: { filename: string; content: string }[] = [];

  for (const fileWithDiff of filesWithDiffs) {
    if (fileWithDiff.diff) {
      // Apply diff to original content
      const originalFile = originalFiles.find(f => f.filename === fileWithDiff.filename);
      if (originalFile) {
        try {
          const hunksAsString = JSON.stringify(fileWithDiff.diff.hunks);
          const newContent = applyDiffToContent(originalFile.content, hunksAsString);
          result.push({
            filename: fileWithDiff.filename,
            content: newContent
          });
        } catch (error) {
          console.error(`Failed to apply diff to ${fileWithDiff.filename}:`, error);
          result.push({
            filename: fileWithDiff.filename,
            content: fileWithDiff.content
          });
        }
      } else {
        // New file
        result.push({
          filename: fileWithDiff.filename,
          content: fileWithDiff.content
        });
      }
    } else {
      // No diff, use full content
      result.push({
        filename: fileWithDiff.filename,
        content: fileWithDiff.content
      });
    }
  }

  return result;
}

/**
 * Get diff statistics for monitoring
 */
export function getDiffStatistics(filesWithDiffs: { filename: string; content: string; diff?: FileDiff }[]) {
  const stats = {
    totalFiles: filesWithDiffs.length,
    newFiles: 0,
    modifiedFiles: 0,
    totalAdditions: 0,
    totalDeletions: 0,
    totalHunks: 0
  };

  for (const file of filesWithDiffs) {
    if (file.diff) {
      stats.modifiedFiles++;
      stats.totalAdditions += file.diff.hunks.reduce((acc: number, hunk: DiffHunk) => 
        acc + hunk.lines.filter((line: string) => line.startsWith('+')).length, 0);
      stats.totalDeletions += file.diff.hunks.reduce((acc: number, hunk: DiffHunk) => 
        acc + hunk.lines.filter((line: string) => line.startsWith('-')).length, 0);
      stats.totalHunks += file.diff.hunks.length;
    } else {
      stats.newFiles++;
    }
  }

  return stats;
}
