import { NextRequest, NextResponse } from "next/server";
import fs from "fs-extra";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
import {
  createPreview,
  updatePreviewFiles,
  saveFilesToGenerated,
  getPreviewUrl,
  deletePreview,
} from "../../../lib/previewManager";

// Import the API base URL
const PREVIEW_API_BASE = "https://preview.minidev.fun";
import {
  // getOptimizedSystemPrompt,
  // createOptimizedUserPrompt,
  executeMultiStagePipeline,
  STAGE_MODEL_CONFIG,
  ANTHROPIC_MODELS,
} from "../../../lib/llmOptimizer";

// Utility: Recursively read all files in a directory, excluding node_modules, .next, and other build artifacts
async function readAllFiles(
  dir: string,
  base = ""
): Promise<{ filename: string; content: string }[]> {
  const files: { filename: string; content: string }[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    // Exclude node_modules, .next, .git, and other build artifacts
    if (
      entry.name === "node_modules" ||
      entry.name === ".next" ||
      entry.name === ".git" ||
      entry.name === "dist" ||
      entry.name === "build" ||
      entry.name === "pnpm-lock.yaml" ||
      entry.name === "package-lock.json" ||
      entry.name === "yarn.lock" ||
      entry.name === "bun.lockb" ||
      entry.name === "pnpm-workspace.yaml" ||
      entry.name === "pnpm-workspace.yaml" ||
      entry.name.startsWith(".")
    ) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    const relPath = base ? path.join(base, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await readAllFiles(fullPath, relPath)));
    } else {
      const content = await fs.readFile(fullPath, "utf8");
      files.push({ filename: relPath, content });
    }
  }
  return files;
}

// Utility: Write files to disk
async function writeFilesToDir(
  baseDir: string,
  files: { filename: string; content: string }[]
) {
  for (const file of files) {
    const filePath = path.join(baseDir, file.filename);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, file.content, "utf8");
  }
}

// Enhanced LLM caller with stage-specific model selection and retry logic
async function callClaudeWithLogging(
  systemPrompt: string,
  userPrompt: string,
  stageName: string,
  stageType?: keyof typeof STAGE_MODEL_CONFIG
): Promise<string> {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error("Claude API key not set in environment");

  // Select model based on stage type
  const modelConfig = stageType
    ? STAGE_MODEL_CONFIG[stageType]
    : STAGE_MODEL_CONFIG.LEGACY_SINGLE_STAGE;

  console.log(`\n🤖 LLM Call - ${stageName}`);
  console.log("📤 Input:");
  console.log("  System Prompt Length:", systemPrompt.length, "chars");
  console.log("  User Prompt:", userPrompt);
  console.log("  Model:", modelConfig.model);
  console.log("  Max Tokens:", modelConfig.maxTokens);
  console.log("  Reason:", modelConfig.reason);

  const body = {
    model: modelConfig.model,
    max_tokens: modelConfig.maxTokens,
    temperature: modelConfig.temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  };

  // Retry logic with exponential backoff
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const startTime = Date.now();

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();

        // Handle specific error types
        if (response.status === 529 || response.status === 429) {
          // Overloaded or rate limited - retry with exponential backoff
          if (attempt < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff

            // Try fallback model on last retry
            if (attempt === maxRetries - 1 && modelConfig.fallbackModel) {
              console.log(
                `⚠️ API ${response.status} error (attempt ${attempt}/${maxRetries}), switching to fallback model: ${modelConfig.fallbackModel}`
              );
              body.model = modelConfig.fallbackModel;
            } else {
              console.log(
                `⚠️ API ${response.status} error (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`
              );
            }

            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          } else {
            console.error(
              `❌ LLM API Error (${stageName}): Max retries exceeded`
            );
            throw new Error(
              `Claude API overloaded after ${maxRetries} attempts. Please try again later.`
            );
          }
        } else if (response.status >= 500) {
          // Server errors - retry
          if (attempt < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempt - 1);

            // Try fallback model on last retry
            if (attempt === maxRetries - 1 && modelConfig.fallbackModel) {
              console.log(
                `⚠️ Server error ${response.status} (attempt ${attempt}/${maxRetries}), switching to fallback model: ${modelConfig.fallbackModel}`
              );
              body.model = modelConfig.fallbackModel;
            } else {
              console.log(
                `⚠️ Server error ${response.status} (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`
              );
            }

            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          } else {
            console.error(
              `❌ LLM API Error (${stageName}): Max retries exceeded`
            );
            throw new Error(
              `Claude API server error after ${maxRetries} attempts. Please try again later.`
            );
          }
        } else {
          // Client errors - don't retry
          console.error(
            `❌ LLM API Error (${stageName}):`,
            response.status,
            errorText
          );
          throw new Error(`Claude API error: ${response.status} ${errorText}`);
        }
      }

      const responseData = await response.json();
      const endTime = Date.now();

      const responseText = responseData.content[0]?.text || "";

      console.log("📥 Output:");
      console.log("  Response Length:", responseText.length, "chars");
      console.log("  Response Time:", endTime - startTime, "ms");
      console.log(
        "  Cost Estimate:",
        estimateCost(
          systemPrompt.length,
          responseText.length,
          modelConfig.model
        )
      );
      console.log(
        "  Raw Response Preview:",
        responseText.substring(0, 300) + "..."
      );

      return responseText;
    } catch (error) {
      if (attempt === maxRetries) {
        console.error(
          `❌ LLM API Error (${stageName}) after ${maxRetries} attempts:`,
          error
        );
        throw error;
      }

      // For network errors, retry
      if (
        error instanceof TypeError ||
        (error instanceof Error && error.message.includes("fetch"))
      ) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(
          `⚠️ Network error (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // For other errors, don't retry
      throw error;
    }
  }

  throw new Error(
    `Failed to get response from Claude API after ${maxRetries} attempts`
  );
}

// Cost estimation helper (rough estimates based on Anthropic pricing)
function estimateCost(
  inputTokens: number,
  outputTokens: number,
  model: string
): string {
  const inputCost = inputTokens / 1000; // Rough token count
  const outputCost = outputTokens / 1000;

  let costPer1kInput = 0;
  let costPer1kOutput = 0;

  switch (model) {
    case ANTHROPIC_MODELS.FAST:
      costPer1kInput = 0.25; // $0.25 per 1M input tokens
      costPer1kOutput = 1.25; // $1.25 per 1M output tokens
      break;
    case ANTHROPIC_MODELS.BALANCED:
      costPer1kInput = 3; // $3 per 1M input tokens
      costPer1kOutput = 15; // $15 per 1M output tokens
      break;
    case ANTHROPIC_MODELS.POWERFUL:
      costPer1kInput = 15; // $15 per 1M input tokens
      costPer1kOutput = 75; // $75 per 1M output tokens
      break;
  }

  const totalCost =
    (inputCost * costPer1kInput + outputCost * costPer1kOutput) / 1000;
  return `~$${totalCost.toFixed(4)}`;
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, useMultiStage = true } = await request.json();
    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    console.log(`🚀 Starting project generation for prompt: ${prompt}`);
    console.log(
      `🔧 Using ${useMultiStage ? "multi-stage" : "single-stage"} pipeline`
    );

    // Extract the core user request from the comprehensive prompt
    const lines = prompt.split("\n");
    let userRequest = prompt;

    // Check if this is a confirmed project prompt
    if (prompt.includes("BUILD THIS MINIAPP:")) {
      const buildMatch = prompt.match(/BUILD THIS MINIAPP:\s*(.+?)(?:\n|$)/);
      if (buildMatch) {
        userRequest = buildMatch[1].trim();
      }
      console.log(`📋 Confirmed Project Request: ${userRequest}`);
      console.log(`📋 Full Confirmed Prompt: ${prompt.substring(0, 300)}...`);
    } else {
      const userMatch = lines.find((line: string) =>
        line.startsWith("User wants to create:")
      );
      if (userMatch) {
        userRequest = userMatch;
      }
      console.log(`📋 User Request: ${userRequest}`);
      console.log(`📋 Full Prompt: ${prompt.substring(0, 200)}...`);
    }

    // Generate unique project ID
    const projectId = uuidv4();
    const userDir = path.join(process.cwd(), "generated", projectId);
    const boilerplateDir = path.join(
      process.cwd(),
      "generated",
      `${projectId}-boilerplate`
    );

    console.log(`📁 Project ID: ${projectId}`);
    console.log(`📁 User directory: ${userDir}`);
    console.log(`📁 Boilerplate directory: ${boilerplateDir}`);

    // Clone boilerplate from GitHub
    console.log("📋 Cloning boilerplate from GitHub...");
    try {
      await execAsync(
        `git clone https://github.com/earnkitai/minidev-boilerplate.git "${boilerplateDir}"`
      );
      console.log("✅ Boilerplate cloned successfully");
    } catch (error) {
      console.error("❌ Failed to clone boilerplate:", error);
      throw new Error(`Failed to clone boilerplate: ${error}`);
    }

    // Copy boilerplate to user directory
    console.log("📋 Copying boilerplate to user directory...");
    await fs.copy(boilerplateDir, userDir, {
      filter: (src) => {
        const excludePatterns = [
          "node_modules",
          ".git",
          ".next",
          "pnpm-lock.yaml",
          "package-lock.json",
          "yarn.lock",
          "bun.lockb",
          "pnpm-workspace.yaml",
        ];
        return !excludePatterns.some((pattern) => src.includes(pattern));
      },
    });
    console.log("✅ Boilerplate copied successfully");

    // Clean up cloned boilerplate directory
    console.log("🧹 Cleaning up boilerplate directory...");
    try {
      await fs.remove(boilerplateDir);
      console.log("✅ Boilerplate directory cleaned up");
    } catch (error) {
      console.warn("⚠️ Failed to clean up boilerplate directory:", error);
    }

    // Read boilerplate files
    console.log("📖 Reading boilerplate files...");
    const boilerplateFiles = await readAllFiles(userDir);
    console.log(`📁 Found ${boilerplateFiles.length} boilerplate files`);

    // Generate files using selected pipeline
    console.log("🔄 Using multi-stage pipeline...");

    // Create LLM caller function for multi-stage pipeline
    const callLLM = async (
      systemPrompt: string,
      userPrompt: string,
      stageName: string,
      stageType?: keyof typeof STAGE_MODEL_CONFIG
    ): Promise<string> => {
      return callClaudeWithLogging(
        systemPrompt,
        userPrompt,
        stageName,
        stageType
      );
    };

    const generatedFiles = await executeMultiStagePipeline(
      prompt,
      boilerplateFiles,
      callLLM
    );

    // Check if the pipeline returned boilerplate files as-is (no changes needed)
    let pipelineResult: { needsChanges: boolean; reason?: string } = {
      needsChanges: true,
    };

    // Check if the pipeline returned boilerplate files as-is (no changes needed)
    const isBoilerplateOnly =
      generatedFiles.length === boilerplateFiles.length &&
      generatedFiles.every((file) =>
        boilerplateFiles.some(
          (bf) => bf.filename === file.filename && bf.content === file.content
        )
      );

    if (isBoilerplateOnly) {
      pipelineResult = {
        needsChanges: false,
        reason:
          "Basic miniapp requested, boilerplate provides all needed functionality",
      };
      console.log("📋 No changes needed - using boilerplate as-is");
    } else {
      pipelineResult = {
        needsChanges: true,
        reason: "Custom functionality requested, modifications applied",
      };
      console.log("📋 Changes applied - custom functionality added");
    }

    console.log(`✅ Successfully generated ${generatedFiles.length} files`);
    console.log(
      `📋 Pipeline Result: ${
        pipelineResult.needsChanges ? "Changes Applied" : "No Changes Needed"
      }`
    );
    if (pipelineResult.reason) {
      console.log(`📝 Reason: ${pipelineResult.reason}`);
    }

    // Validate generated files
    if (!Array.isArray(generatedFiles) || generatedFiles.length === 0) {
      throw new Error("LLM returned invalid or empty file array");
    }

    for (const file of generatedFiles) {
      if (!file.filename || !file.content) {
        throw new Error(`Invalid file object: ${JSON.stringify(file)}`);
      }
    }

    // Write files to disk
    console.log("💾 Writing generated files to disk...");
    await writeFilesToDir(userDir, generatedFiles);
    console.log("✅ Files written successfully");

    // Save files to generated directory
    console.log("💾 Saving files to generated directory...");
    await saveFilesToGenerated(projectId, generatedFiles);
    console.log("✅ Files saved to generated directory");

    // Create preview with all generated files
    console.log("🚀 Creating preview with generated files...");
    const previewData = await createPreview(projectId, generatedFiles);
    console.log("✅ Preview created successfully");

    // Get the full preview URL
    const previewUrl = getPreviewUrl(projectId);
    console.log(`🌐 Preview URL: ${previewUrl}`);
    console.log(
      `📊 Preview Status: ${previewData.status}, Port: ${previewData.port}`
    );

    // Handle package.json changes (dependencies will be handled by preview server)
    const packageJsonChanged = generatedFiles.some(
      (f) => f.filename === "package.json"
    );

    if (packageJsonChanged) {
      console.log(
        "📦 Package.json changed - dependencies will be handled by the preview server"
      );
    }

    const projectUrl =
      getPreviewUrl(projectId) || `${PREVIEW_API_BASE}/p/${projectId}`;
    console.log(`🎉 Project ready at: ${projectUrl}`);

    return NextResponse.json({
      projectId,
      url: projectUrl,
      success: true,
      generatedFiles: generatedFiles.map((f) => f.filename),
      pipeline: useMultiStage ? "multi-stage" : "single-stage",
      changesApplied: pipelineResult.needsChanges,
      reason: pipelineResult.reason,
      totalFiles: generatedFiles.length,
    });
  } catch (err) {
    console.error("❌ Error generating project:", err);
    return NextResponse.json(
      {
        error: "Failed to generate project",
        details: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error && err.stack ? err.stack : undefined,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { projectId } = await request.json();
    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }
    await deletePreview(projectId);
    const userDir = path.join(process.cwd(), "generated", projectId);
    await fs.remove(userDir);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error cleaning up project:", err);
    return NextResponse.json(
      {
        error: "Failed to cleanup project",
        details: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error && err.stack ? err.stack : undefined,
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { projectId, prompt, stream = false } = await request.json();
    if (!projectId || !prompt) {
      return NextResponse.json(
        { error: "Missing projectId or prompt" },
        { status: 400 }
      );
    }

    const userDir = path.join(process.cwd(), "generated", projectId);

    // Read all files in the project (excluding node_modules, .next, etc.)
    const boilerplateFiles = await readAllFiles(userDir);

    if (stream) {
      // Handle streaming response for chat-like interaction
      const systemPrompt = `You are an AI assistant helping to modify a Farcaster miniapp. 
      
      IMPORTANT: Respond ONLY in natural, conversational language. Do NOT mention technical programming details, file names, code structure, or technical implementation details. The user doesn't understand programming, so describe everything in plain English.
      
      Your role is to:
      1. **Understand the user's request** and analyze what they want to achieve
      2. **Propose a complete solution** in simple terms
      3. **Explain what the changes will do** for users
      4. **Provide context** about why these changes are beneficial
      
      Guidelines:
      - **Use natural language only**: No technical jargon, programming terms, or file references
      - **Focus on user experience**: Describe what users will see and do
      - **Explain in simple terms**: Use everyday language to describe features
      - **Be helpful**: Explain the benefits and reasoning behind your approach
      - **Be conversational**: Write as if you're explaining to a friend
      
      Example response:
      "I'll help you add user login to your miniapp. Here's what I'll add:
      - A simple login button that connects to users' wallets
      - A user profile section showing their wallet address
      - A logout option to disconnect their wallet
      - Protection for certain features so only logged-in users can access them
      
      This will give users a secure way to sign in with their crypto wallet. Should I proceed with these changes?"
      
      The user wants to make changes to their project. Provide a conversational response about what changes you'll make.`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.CLAUDE_API_KEY!,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 2000,
          temperature: 0.7,
          system: systemPrompt,
          messages: [{ role: "user", content: prompt }],
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`);
      }

      return new Response(response.body, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Transfer-Encoding": "chunked",
        },
      });
    } else {
      // Handle non-streaming response (existing logic)
      const callLLM = async (
        systemPrompt: string,
        userPrompt: string,
        stageName: string,
        stageType?: keyof typeof STAGE_MODEL_CONFIG
      ): Promise<string> => {
        return callClaudeWithLogging(
          systemPrompt,
          userPrompt,
          stageName,
          stageType
        );
      };

      // Use the multi-stage pipeline to generate changes
      // Pass the full comprehensive prompt to get better context
      console.log(
        "🔄 Starting multi-stage pipeline with confirmed project requirements..."
      );
      const generatedFiles = await executeMultiStagePipeline(
        prompt, // Use full prompt with AI analysis for better context
        boilerplateFiles,
        callLLM
      );

      // Write changes to generated directory
      await writeFilesToDir(userDir, generatedFiles);

      // Update files in the preview
      console.log("Updating files in preview...");
      await updatePreviewFiles(projectId, generatedFiles);
      console.log("Preview files updated successfully");

      // Handle package.json changes (just log for now since we're not managing dependencies in preview)
      const packageJsonChanged = generatedFiles.some(
        (f) => f.filename === "package.json"
      );

      if (packageJsonChanged) {
        console.log(
          "Package.json changed - dependencies will be handled by the preview server"
        );
      }

      // Return summary
      return NextResponse.json({
        success: true,
        changed: generatedFiles.map((f) => f.filename),
      });
    }
  } catch (err) {
    console.error("Error in LLM PATCH:", err);
    return NextResponse.json(
      {
        error: "Failed to apply LLM changes",
        details: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error && err.stack ? err.stack : undefined,
      },
      { status: 500 }
    );
  }
}
