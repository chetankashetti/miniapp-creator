import { SecureCommandExecutor, formatCommandResult } from './commandExecutor';
import { ContextGatheringResult, STAGE_MODEL_CONFIG } from './llmOptimizer';

export interface ToolExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  executionTime: number;
}

export interface ContextExecutionResult {
  success: boolean;
  contextData: string;
  toolResults: ToolExecutionResult[];
  error?: string;
}

/**
 * Execute tool calls from context gathering result
 */
export async function executeToolCalls(
  contextResult: ContextGatheringResult,
  projectId: string,
  projectDir: string
): Promise<ContextExecutionResult> {
  if (!contextResult.needsContext || !contextResult.toolCalls?.length) {
    return {
      success: true,
      contextData: '',
      toolResults: []
    };
  }

  const executor = new SecureCommandExecutor(projectId, projectDir);
  const toolResults: ToolExecutionResult[] = [];
  let contextData = '';

  console.log(`🔧 Executing ${contextResult.toolCalls.length} tool calls for context gathering`);

  for (const toolCall of contextResult.toolCalls) {
    try {
      console.log(`🔧 Executing: ${toolCall.tool} ${toolCall.args.join(' ')}`);
      
      const result = await executor.executeCommand({
        command: toolCall.tool,
        args: toolCall.args,
        workingDirectory: toolCall.workingDirectory || '.'
      });

      const toolResult: ToolExecutionResult = {
        success: result.success,
        output: result.output,
        error: result.error,
        executionTime: result.executionTime
      };

      toolResults.push(toolResult);

      if (result.success) {
        const formattedOutput = formatCommandResult(result, toolCall.tool);
        contextData += `\n\n## ${toolCall.tool} ${toolCall.args.join(' ')}\n${formattedOutput}`;
      } else {
        console.warn(`⚠️ Tool call failed: ${toolCall.tool}`, result.error);
        contextData += `\n\n## ${toolCall.tool} ${toolCall.args.join(' ')} (FAILED)\n${result.error}`;
      }

    } catch (error) {
      console.error(`❌ Tool execution error:`, error);
      const toolResult: ToolExecutionResult = {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        executionTime: 0
      };
      toolResults.push(toolResult);
    }
  }

  return {
    success: toolResults.some(r => r.success),
    contextData: contextData.trim(),
    toolResults
  };
}

/**
 * Execute tool calls via preview host API
 */
export async function executeToolCallsViaAPI(
  contextResult: ContextGatheringResult,
  projectId: string,
  accessToken: string,
  previewApiBase: string = process.env.PREVIEW_API_BASE || 'https://minidev.fun'
): Promise<ContextExecutionResult> {
  if (!contextResult.needsContext || !contextResult.toolCalls?.length) {
    return {
      success: true,
      contextData: '',
      toolResults: []
    };
  }

  const toolResults: ToolExecutionResult[] = [];
  let contextData = '';

  console.log(`🔧 Executing ${contextResult.toolCalls.length} tool calls via API`);

  for (const toolCall of contextResult.toolCalls) {
    try {
      console.log(`🔧 Executing via API: ${toolCall.tool} ${toolCall.args.join(' ')}`);
      
      const response = await fetch(`${previewApiBase}/previews/${projectId}/execute`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          command: toolCall.tool,
          args: toolCall.args,
          workingDirectory: toolCall.workingDirectory || '.'
        })
      });

      const result = await response.json();

      const toolResult: ToolExecutionResult = {
        success: result.success,
        output: result.output || '',
        error: result.error,
        executionTime: result.executionTime || 0
      };

      toolResults.push(toolResult);

      if (result.success) {
        const formattedOutput = formatCommandResult({
          success: true,
          output: result.output || '',
          exitCode: 0,
          executionTime: result.executionTime || 0
        }, toolCall.tool);
        contextData += `\n\n## ${toolCall.tool} ${toolCall.args.join(' ')}\n${formattedOutput}`;
      } else {
        console.warn(`⚠️ Tool call failed: ${toolCall.tool}`, result.error);
        contextData += `\n\n## ${toolCall.tool} ${toolCall.args.join(' ')} (FAILED)\n${result.error}`;
      }

    } catch (error) {
      console.error(`❌ Tool execution error:`, error);
      const toolResult: ToolExecutionResult = {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        executionTime: 0
      };
      toolResults.push(toolResult);
    }
  }

  return {
    success: toolResults.some(r => r.success),
    contextData: contextData.trim(),
    toolResults
  };
}

/**
 * Enhanced context gathering with tool execution
 */
export async function gatherContextWithTools(
  userPrompt: string,
  currentFiles: { filename: string; content: string }[],
  projectId: string,
  accessToken: string,
  callLLM: (systemPrompt: string, userPrompt: string, stageName: string, stageType?: keyof typeof STAGE_MODEL_CONFIG) => Promise<string>
): Promise<{
  contextResult: ContextGatheringResult;
  contextData: string;
  enhancedFiles: { filename: string; content: string }[];
}> {
  // First, determine if context is needed
  const contextPrompt = `USER REQUEST: ${userPrompt}`;
  const contextResponse = await callLLM(
    `ROLE: Context Gatherer for Farcaster Miniapp

TASK: Analyze if additional context is needed before processing the user request.

USER REQUEST: ${userPrompt}

CURRENT FILES AVAILABLE:
${currentFiles.map(f => `- ${f.filename}`).join('\n')}

AVAILABLE TOOLS:
- grep: Search for patterns in files
- find: Find files by name or type
- tree: Show directory structure
- cat: Read file contents

CRITICAL: Return ONLY valid JSON.

OUTPUT FORMAT:
{
  "needsContext": boolean,
  "toolCalls": [{"tool": "grep", "args": ["pattern", "src"], "workingDirectory": "src", "reason": "..."}],
  "contextSummary": "Brief summary"
}

Return ONLY the JSON object.`,
    contextPrompt,
    "Context Gatherer",
    "STAGE_0_CONTEXT_GATHERER"
  );

  let contextResult: ContextGatheringResult;
  try {
    contextResult = JSON.parse(contextResponse);
  } catch (error) {
    console.error('Failed to parse context gathering result:', error);
    return {
      contextResult: { needsContext: false, toolCalls: [] },
      contextData: '',
      enhancedFiles: currentFiles
    };
  }

  if (!contextResult.needsContext) {
    return {
      contextResult,
      contextData: '',
      enhancedFiles: currentFiles
    };
  }

  // Execute tool calls
  const executionResult = await executeToolCallsViaAPI(
    contextResult,
    projectId,
    accessToken
  );

  // Enhance current files with context data
  const enhancedFiles = [...currentFiles];
  if (executionResult.contextData) {
    enhancedFiles.push({
      filename: '_context.md',
      content: `# Context Gathered\n\n${executionResult.contextData}`
    });
  }

  return {
    contextResult,
    contextData: executionResult.contextData,
    enhancedFiles
  };
}
