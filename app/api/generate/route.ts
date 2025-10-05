import { NextRequest, NextResponse } from "next/server";
import fs from "fs-extra";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { exec } from "child_process";
import { promisify } from "util";
import { createProject, saveProjectFiles, savePatch, getUserById, createUser, getProjectById } from "../../../lib/database";
import { authenticateRequest } from "../../../lib/auth";
import { logger, logApiRequest, logErrorWithContext } from "../../../lib/logger";

const execAsync = promisify(exec);
import {
  createPreview,
  updatePreviewFiles,
  saveFilesToGenerated,
  getPreviewUrl,
} from "../../../lib/previewManager";

// Import the API base URL
const PREVIEW_API_BASE = process.env.PREVIEW_API_BASE || 'https://minidev.fun';
import {
  // getOptimizedSystemPrompt,
  // createOptimizedUserPrompt,
  STAGE_MODEL_CONFIG,
  ANTHROPIC_MODELS,
} from "../../../lib/llmOptimizer";
import { executeEnhancedPipeline } from "../../../lib/enhancedPipeline";
import { executeDiffBasedPipeline } from "../../../lib/diffBasedPipeline";
// import { headers } from "next/headers"; // Removed unused import

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
      entry.name === ".DS_Store" || // Exclude macOS system files
      entry.name.startsWith(".")
    ) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    const relPath = base ? path.join(base, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await readAllFiles(fullPath, relPath)));
    } else {
      try {
        // Try to read as text first
        const content = await fs.readFile(fullPath, "utf8");
        
        // Check for null bytes and other binary content
        if (content.includes('\0') || content.includes('\x00')) {
          console.log(`⚠️ Skipping binary file: ${relPath}`);
          continue;
        }
        
        // Sanitize content for database storage
        const sanitizedContent = content
          .replace(/\0/g, '') // Remove null bytes
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // Remove other control characters
        
        files.push({ filename: relPath, content: sanitizedContent });
      } catch (error) {
        // If reading as UTF-8 fails, it's likely a binary file
        console.log(`⚠️ Skipping binary file: ${relPath} (${error})`);
        continue;
      }
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
  let modelConfig = stageType
    ? STAGE_MODEL_CONFIG[stageType]
    : STAGE_MODEL_CONFIG.LEGACY_SINGLE_STAGE;
    
  // Check if this is a retry with increased token limit
  if (stageName.includes('(Retry)') && stageType === 'STAGE_3_CODE_GENERATOR') {
    const increasedTokens = Math.min(modelConfig.maxTokens * 2, 40000);
    modelConfig = {
      ...modelConfig,
      maxTokens: increasedTokens
    } as typeof modelConfig;
  }

  console.log(`\n🤖 LLM Call - ${stageName}`);
  console.log("📤 Input:");
  console.log("  System Prompt Length:", systemPrompt.length, "chars");
  console.log("  User Prompt:", userPrompt);
  console.log("  Model:", modelConfig.model);
  console.log("  Max Tokens:", modelConfig.maxTokens);
  console.log("  Reason:", modelConfig.reason);
  
  // Warn about large prompts that might cause rate limiting
  if (systemPrompt.length > 50000) {
    console.warn(`⚠️ Large system prompt (${systemPrompt.length} chars) may cause rate limiting`);
  }

  const body = {
    model: modelConfig.model,
    max_tokens: modelConfig.maxTokens,
    temperature: modelConfig.temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  };

  // Retry logic with exponential backoff and request throttling
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Add small delay between requests to prevent rate limiting
    if (attempt > 1) {
      const throttleDelay = Math.min(500 * attempt, 2000); // Max 2 seconds
      console.log(`⏱️ Throttling request (attempt ${attempt}), waiting ${throttleDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, throttleDelay));
    }
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
      
      // Extract actual token usage from API response
      const inputTokens = responseData.usage?.input_tokens || 0;
      const outputTokens = responseData.usage?.output_tokens || 0;
      const totalTokens = inputTokens + outputTokens;
      
      // Calculate actual cost based on real token usage
      const actualCost = calculateActualCost(inputTokens, outputTokens, modelConfig.model);

      console.log("📥 Output:");
      console.log("  Response Length:", responseText.length, "chars");
      console.log("  Response Time:", endTime - startTime, "ms");
      console.log("  Token Usage:");
      console.log("    Input Tokens:", inputTokens);
      console.log("    Output Tokens:", outputTokens);
      console.log("    Total Tokens:", totalTokens);
      console.log("  Actual Cost:", actualCost);
      console.log(
        "  Raw Response Preview:",
        responseText.substring(0, 100) + "..."
      );

      // Log token usage summary for analysis
      console.log("📊 Token Usage Summary:");
      console.log(`    Model: ${modelConfig.model}`);
      console.log(`    Stage: ${stageName}`);
      console.log(`    Input/Output Ratio: ${inputTokens > 0 ? (outputTokens / inputTokens).toFixed(2) : 'N/A'}`);
      console.log(`    Efficiency: ${totalTokens > 0 ? ((responseText.length / totalTokens) * 4).toFixed(2) : 'N/A'} chars/token`);

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

// Cost calculation helper using actual token counts from API response
function calculateActualCost(
  inputTokens: number,
  outputTokens: number,
  model: string
): string {
  let costPer1MInput = 0;
  let costPer1MOutput = 0;

  switch (model) {
    case ANTHROPIC_MODELS.FAST:
      costPer1MInput = 0.25; // $0.25 per 1M input tokens
      costPer1MOutput = 1.25; // $1.25 per 1M output tokens
      break;
    case ANTHROPIC_MODELS.BALANCED:
      costPer1MInput = 3; // $3 per 1M input tokens
      costPer1MOutput = 15; // $15 per 1M output tokens
      break;
    case ANTHROPIC_MODELS.POWERFUL:
      costPer1MInput = 15; // $15 per 1M input tokens
      costPer1MOutput = 75; // $75 per 1M output tokens
      break;
  }

  const inputCost = (inputTokens / 1000000) * costPer1MInput;
  const outputCost = (outputTokens / 1000000) * costPer1MOutput;
  const totalCost = inputCost + outputCost;
  
  return `$${totalCost.toFixed(6)} (Input: $${inputCost.toFixed(6)}, Output: $${outputCost.toFixed(6)})`;
}

// Legacy cost estimation helper (kept for backward compatibility)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function estimateCost(
  inputChars: number,
  outputChars: number,
  model: string
): string {
  // Rough estimation: 1 token ≈ 4 characters
  const estimatedInputTokens = Math.ceil(inputChars / 4);
  const estimatedOutputTokens = Math.ceil(outputChars / 4);
  
  return calculateActualCost(estimatedInputTokens, estimatedOutputTokens, model);
}

function generateProjectName(intentSpec: { feature: string; reason?: string }): string {
  // Use the LLM-generated feature name as the base
  let projectName = intentSpec.feature;
  
  // Clean up the feature name
  projectName = projectName
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  // Capitalize words
  const words = projectName.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  );
  
  projectName = words.join(' ');
  
  // Add "App" suffix if it doesn't already contain common app-related terms
  const appTerms = ['app', 'application', 'miniapp', 'mini app', 'dashboard', 'platform', 'tool', 'game', 'player', 'gallery', 'blog', 'store', 'shop'];
  const hasAppTerm = appTerms.some(term => projectName.toLowerCase().includes(term));
  
  if (!hasAppTerm) {
    projectName += ' App';
  }
  
  // Handle special cases for better naming
  if (projectName.toLowerCase().includes('bootstrap') || projectName.toLowerCase().includes('template')) {
    const now = new Date();
    const timeStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `Miniapp ${timeStr}`;
  }
  
  return projectName;
}

export async function POST(request: NextRequest) {
  const requestId = uuidv4();
  const startTime = Date.now();
  
  try {
    logApiRequest('POST', '/api/generate', { requestId, startTime });
    
    // Check for auth bypass (testing only)
    const bypassAuth = request.headers.get("X-Bypass-Auth") === "true";
    const testUserId = request.headers.get("X-Test-User-Id");

    let user;
    let isAuthorized;

    if (bypassAuth && testUserId) {
      logger.warn("AUTH BYPASS ENABLED FOR TESTING", { requestId, testUserId });

      // Check if test user exists in database, create if not
      try {
        let dbUser = await getUserById(testUserId);
        if (!dbUser) {
          logger.info("Creating test user in database", { requestId, testUserId });
          dbUser = await createUser(
            testUserId, // Use UUID as privyUserId too
            "test@example.com",
            "Test User",
            undefined
          );
          logger.info("Test user created", { requestId, userId: dbUser.id });
        }

        user = {
          id: dbUser.id,
          privyUserId: dbUser.privyUserId,
          email: dbUser.email ?? "test@example.com",
          displayName: dbUser.displayName ?? "Test User",
        };
      } catch (dbError) {
        console.error("⚠️ Failed to create/get test user:", dbError);
        // Fallback to mock user (database save will be skipped)
        user = {
          id: testUserId,
          privyUserId: testUserId,
          email: "test@example.com",
          displayName: "Test User",
        };
      }

      isAuthorized = true;
    } else {
      const authResult = await authenticateRequest(request);
      user = authResult.user;
      isAuthorized = authResult.isAuthorized;

      if (!isAuthorized || !user) {
        return NextResponse.json(
          { error: authResult.error || "Authentication required" },
          { status: 401 }
        );
      }
    }

    const { prompt, useMultiStage = true } = await request.json();
    const accessToken = process.env.PREVIEW_AUTH_TOKEN;
    console.log("🔑 Preview auth token:", accessToken);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Missing preview auth token" },
        { status: 401 }
      );
    }

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
    // Comment out GitHub clone since it's not working
    console.log("📋 Cloning boilerplate from GitHub...");
    try {
      await execAsync(
        `git clone https://github.com/chetankashetti/minidev-boilerplate.git "${boilerplateDir}"`
      );
      console.log("✅ Boilerplate cloned successfully");
    } catch (error) {
      console.error("❌ Failed to clone boilerplate:", error);
      throw new Error(`Failed to clone boilerplate: ${error}`);
    }

    // Copy from local minidev-boilerplate folder instead
    // console.log("📋 Copying from local minidev-boilerplate folder...");
    // try {
    //   await fs.copy("../minidev-boilerplate", boilerplateDir);
    //   console.log("✅ Boilerplate copied successfully");
    // } catch (error) {
    //   console.error("❌ Failed to copy boilerplate:", error);
    //   throw new Error(`Failed to copy boilerplate: ${error}`);
    // }

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

    // Use enhanced pipeline with context gathering for initial generation
    const enhancedResult = await executeEnhancedPipeline(
      prompt,
      boilerplateFiles,
      projectId,
      accessToken,
      callLLM,
      true, // isInitialGeneration = true for POST requests
      userDir // projectDir
    );

    if (!enhancedResult.success) {
      throw new Error(enhancedResult.error || "Enhanced pipeline failed");
    }

    const generatedFiles = enhancedResult.files.map(f => ({
      filename: f.filename,
      content: f.content
    }));

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
    let previewData;
    let projectUrl;

    try {
      previewData = await createPreview(
        projectId,
        generatedFiles,
        accessToken
      );
      console.log("✅ Preview created successfully");

      // Get the full preview URL
      const previewUrl = getPreviewUrl(projectId);
      console.log(`🌐 Preview URL: ${previewUrl}`);
      console.log(
        `📊 Preview Status: ${previewData.status}, Port: ${previewData.port}`
      );

      projectUrl = getPreviewUrl(projectId) || `https://${projectId}.${PREVIEW_API_BASE}`;
      console.log(`🎉 Project ready at: ${projectUrl}`);
    } catch (previewError) {
      console.error("❌ Failed to create preview:", previewError);
      console.error("❌ Preview error details:", previewError instanceof Error ? previewError.message : String(previewError));

      // Create a fallback preview data object
      previewData = {
        url: `http://localhost:8080/p/${projectId}`,
        status: "error",
        port: 3000,
        previewUrl: `http://localhost:8080/p/${projectId}`,
      };

      projectUrl = `http://localhost:8080/p/${projectId}`;

      console.log("⚠️ Using fallback preview URL:", projectUrl);
      console.log("⚠️ Continuing with project creation despite preview error");
    }

    // Handle package.json changes (dependencies will be handled by preview server)
    const packageJsonChanged = generatedFiles.some(
      (f) => f.filename === "package.json"
    );

    if (packageJsonChanged) {
      console.log(
        "📦 Package.json changed - dependencies will be handled by the preview server"
      );
    }

    // Save project to database
    try {
      console.log("💾 Saving project to database...");
      
      // Generate meaningful project name based on LLM-generated intent
      const projectName = enhancedResult.intentSpec 
        ? generateProjectName(enhancedResult.intentSpec)
        : `Project ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      
      const project = await createProject(
        user.id, // Use actual user ID from authentication
        projectName,
        `AI-generated project: ${userRequest.substring(0, 100)}...`,
        projectUrl,
        projectId // Pass the custom project ID
      );
      
      // Save ALL project files to database (boilerplate + generated)
      const allFiles = await readAllFiles(userDir);
      console.log(`📁 Found ${allFiles.length} files to save to database`);
      
      // Filter out any files that might cause encoding issues
      const safeFiles = allFiles.filter(file => {
        // Check for potential encoding issues
        if (file.content.includes('\0') || file.content.includes('\x00')) {
          console.log(`⚠️ Skipping file with null bytes: ${file.filename}`);
          return false;
        }
        return true;
      });
      
      console.log(`📁 Saving ${safeFiles.length} safe files to database`);
      await saveProjectFiles(project.id, safeFiles);
      
      console.log("✅ Project saved to database successfully");
    } catch (dbError) {
      console.error("⚠️ Failed to save project to database:", dbError);
      // Don't fail the request if database save fails
    }

    return NextResponse.json({
      projectId,
      url: projectUrl,
      port: previewData.port || 3000,
      success: true,
      generatedFiles: generatedFiles.map((f) => f.filename),
      pipeline: useMultiStage ? "multi-stage" : "single-stage",
      changesApplied: pipelineResult.needsChanges,
      reason: pipelineResult.reason,
      totalFiles: generatedFiles.length,
      previewUrl: previewData.previewUrl || projectUrl,
      vercelUrl: previewData.vercelUrl,
      aliasSuccess: previewData.aliasSuccess,
      isNewDeployment: previewData.isNewDeployment,
      hasPackageChanges: previewData.hasPackageChanges,
    });
  } catch (err) {
    const duration = Date.now() - startTime;
    logErrorWithContext(err as Error, 'Project generation request', requestId);
    logger.error("Project generation failed", { 
      requestId, 
      duration, 
      error: err instanceof Error ? err.message : String(err) 
    });
    
    return NextResponse.json(
      {
        error: "Failed to generate project",
        details: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error && err.stack ? err.stack : undefined,
        requestId,
        duration
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const requestId = uuidv4();
  const startTime = Date.now();
  
  try {
    logApiRequest('PATCH', '/api/generate', { requestId, startTime });
    // Check for auth bypass (testing only)
    const bypassAuth = request.headers.get("X-Bypass-Auth") === "true";
    const testUserId = request.headers.get("X-Test-User-Id");

    let user;
    let isAuthorized;

    if (bypassAuth && testUserId) {
      console.log("⚠️ AUTH BYPASS ENABLED FOR TESTING");

      // Check if test user exists in database, create if not
      try {
        let dbUser = await getUserById(testUserId);
        if (!dbUser) {
          console.log("🔧 Creating test user in database...");
          try {
            dbUser = await createUser(
              testUserId, // Use UUID as privyUserId too
              "test@example.com",
              "Test User",
              undefined
            );
            console.log(`✅ Test user created with ID: ${dbUser.id}`);
          } catch (createError: unknown) {
            // Handle duplicate key error gracefully
            if (createError && typeof createError === 'object' && 'code' in createError && 'constraint' in createError && 
                createError.code === '23505' && createError.constraint === 'users_privy_user_id_unique') {
              console.log("ℹ️ Test user already exists, fetching from database...");
              dbUser = await getUserById(testUserId);
            } else {
              throw createError;
            }
          }
        }

        user = {
          id: dbUser.id,
          privyUserId: dbUser.privyUserId,
          email: dbUser.email ?? "test@example.com",
          displayName: dbUser.displayName ?? "Test User",
        };
      } catch (dbError) {
        console.error("⚠️ Failed to create/get test user:", dbError);
        // Fallback to mock user (database save will be skipped)
        user = {
          id: testUserId,
          privyUserId: testUserId,
          email: "test@example.com",
          displayName: "Test User",
        };
      }

      isAuthorized = true;
    } else {
      const authResult = await authenticateRequest(request);
      user = authResult.user;
      isAuthorized = authResult.isAuthorized;

      if (!isAuthorized || !user) {
        return NextResponse.json(
          { error: authResult.error || "Authentication required" },
          { status: 401 }
        );
      }
    }

    const { projectId, prompt, stream = false, useDiffBased = true } = await request.json();
    const accessToken = process.env.PREVIEW_AUTH_TOKEN;
    console.log("🔑 Preview auth token:", accessToken);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Missing preview auth token" },
        { status: 401 }
      );
    }

    if (!projectId || !prompt) {
      return NextResponse.json(
        { error: "Missing projectId or prompt" },
        { status: 400 }
      );
    }

    const userDir = path.join(process.cwd(), "generated", projectId);

    // Read all files in the project (excluding node_modules, .next, etc.)
    const currentFiles = await readAllFiles(userDir);

    if (currentFiles.length === 0) {
      return NextResponse.json(
        { error: "No existing files found for project" },
        { status: 404 }
      );
    }

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
          model: "claude-3-7-sonnet-20250219",
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
    } else if (useDiffBased) {
      // Handle diff-based updates
      console.log(`🔄 Diff-based update for project ${projectId}`);
      console.log("User prompt:", prompt);

      // Execute diff-based pipeline
      const result = await executeDiffBasedPipeline(
        prompt,
        currentFiles,
        callClaudeWithLogging,
        {
          enableContextGathering: true,
          enableDiffValidation: true,
          enableLinting: true
        },
        projectId,
        userDir
      );

      console.log(`✅ Generated ${result.files.length} files with ${result.diffs.length} diffs`);

      // Write changes to generated directory
      await writeFilesToDir(userDir, result.files);

      // Update files in the preview
      console.log("Updating files in preview...");
      await updatePreviewFiles(projectId, result.files, accessToken);
      console.log("Preview files updated successfully");

      // Update project files in database
      try {
        console.log("💾 Updating project files in database...");
        
        // First, check if the project exists in the database
        const existingProject = await getProjectById(projectId);
        if (!existingProject) {
          console.log(`⚠️ Project ${projectId} not found in database, creating it...`);
          
          // Create the project in the database
          await createProject(
            user.id,
            `Project ${projectId.substring(0, 8)}`,
            `AI-generated project updated via PATCH`,
            getPreviewUrl(projectId) || undefined,
            projectId
          );
          console.log(`✅ Created project ${projectId} in database`);
        }
        
        // Read all files from the updated directory and save them
        const allFiles = await readAllFiles(userDir);
        console.log(`📁 Found ${allFiles.length} files to save to database`);
        
        // Filter out any files that might cause encoding issues
        const safeFiles = allFiles.filter(file => {
          // Check for potential encoding issues
          if (file.content.includes('\0') || file.content.includes('\x00')) {
            console.log(`⚠️ Skipping file with null bytes: ${file.filename}`);
            return false;
          }
          return true;
        });
        
        console.log(`📁 Saving ${safeFiles.length} safe files to database`);
        await saveProjectFiles(projectId, safeFiles);
        console.log("✅ Project files updated in database successfully");
      } catch (dbError) {
        console.error("⚠️ Failed to update project files in database:", dbError);
        // Don't fail the request if database update fails
      }

      // Store patch in database for rollback capability
      let savedPatch = null;
      if (result.diffs.length > 0) {
        try {
          console.log(`📦 Storing patch with ${result.diffs.length} diffs for rollback`);

          // Create a descriptive summary of changes
          const changedFiles = result.diffs.map(d => d.filename);
          const description = `Updated ${changedFiles.length} file(s): ${changedFiles.join(', ')}`;

          // Save patch data
          savedPatch = await savePatch(projectId, {
            prompt,
            diffs: result.diffs,
            changedFiles,
            timestamp: new Date().toISOString(),
          }, description);

          console.log(`✅ Patch saved with ID: ${savedPatch.id}`);
        } catch (patchError) {
          console.error("⚠️ Failed to save patch to database:", patchError);
          // Don't fail the request if patch save fails
        }
      }

      // Get the updated preview URL (should be Vercel URL now)
      const updatedPreviewUrl = getPreviewUrl(projectId);

      return NextResponse.json({
        success: true,
        projectId,
        files: result.files,
        diffs: result.diffs,
        changed: result.files.map(f => f.filename), // Add changedFiles for frontend compatibility
        previewUrl: updatedPreviewUrl || `http://localhost:8080/p/${projectId}`,
        vercelUrl: updatedPreviewUrl, // Include Vercel URL
        message: "Project updated with diff-based changes",
        patchId: savedPatch?.id, // Include patch ID for tracking
        patchDescription: savedPatch?.description,
      });
    } else {
      // Handle non-streaming response with enhanced pipeline
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

      // Use the enhanced pipeline with context gathering for follow-up changes
      console.log(
        "🔄 Starting enhanced pipeline with context gathering..."
      );
      const enhancedResult = await executeEnhancedPipeline(
        prompt,
        currentFiles,
        projectId,
        accessToken,
        callLLM,
        false, // isInitialGeneration = false for PATCH requests
        userDir // projectDir
      );

      if (!enhancedResult.success) {
        throw new Error(enhancedResult.error || "Enhanced pipeline failed");
      }

      const generatedFiles = enhancedResult.files.map(f => ({
        filename: f.filename,
        content: f.content
      }));

      // Write changes to generated directory
      await writeFilesToDir(userDir, generatedFiles);

      // Update files in the preview
      console.log("Updating files in preview...");
      await updatePreviewFiles(projectId, generatedFiles, accessToken);
      console.log("Preview files updated successfully");

      // Update project files in database
      try {
        console.log("💾 Updating project files in database...");
        // Read all files from the updated directory and save them
        const allFiles = await readAllFiles(userDir);
        console.log(`📁 Found ${allFiles.length} files to save to database`);
        
        // Filter out any files that might cause encoding issues
        const safeFiles = allFiles.filter(file => {
          // Check for potential encoding issues
          if (file.content.includes('\0') || file.content.includes('\x00')) {
            console.log(`⚠️ Skipping file with null bytes: ${file.filename}`);
            return false;
          }
          return true;
        });
        
        console.log(`📁 Saving ${safeFiles.length} safe files to database`);
        await saveProjectFiles(projectId, safeFiles);
        console.log("✅ Project files updated in database successfully");
      } catch (dbError) {
        console.error("⚠️ Failed to update project files in database:", dbError);
        // Don't fail the request if database update fails
      }

      // Handle package.json changes (just log for now since we're not managing dependencies in preview)
      const packageJsonChanged = generatedFiles.some(
        (f) => f.filename === "package.json"
      );

      if (packageJsonChanged) {
        console.log(
          "Package.json changed - dependencies will be handled by the preview server"
        );
      }

      // Get the updated preview URL (should be Vercel URL now)
      const updatedPreviewUrl = getPreviewUrl(projectId);
      
      // Return summary
      return NextResponse.json({
        success: true,
        changed: generatedFiles.map((f) => f.filename),
        previewUrl: updatedPreviewUrl || `http://localhost:8080/p/${projectId}`,
        vercelUrl: updatedPreviewUrl, // Include Vercel URL
      });
    }
  } catch (err) {
    const duration = Date.now() - startTime;
    logErrorWithContext(err as Error, 'LLM PATCH request', requestId);
    logger.error("Request failed", { 
      requestId, 
      duration, 
      error: err instanceof Error ? err.message : String(err) 
    });
    
    return NextResponse.json(
      {
        error: "Failed to apply LLM changes",
        details: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error && err.stack ? err.stack : undefined,
        requestId,
        duration
      },
      { status: 500 }
    );
  }
}
