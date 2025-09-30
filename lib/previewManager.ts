import fs from "fs-extra";
import path from "path";

// Store active previews for management
const activePreviews = new Map<string, PreviewResponse>();

// Preview API configuration
const PREVIEW_API_BASE = process.env.PREVIEW_API_BASE || 'https://minidev.fun';

export interface PreviewResponse {
  url: string;
  status: string;
  port: number;
  previewUrl?: string;
  vercelUrl?: string;
  aliasSuccess?: boolean;
  isNewDeployment?: boolean;
  hasPackageChanges?: boolean;
}

export interface PreviewFile {
  path: string;
  content: string;
}

// Create a preview using the external API
export async function createPreview(
  projectId: string,
  files: { filename: string; content: string }[],
  accessToken: string
): Promise<PreviewResponse> {
  console.log(`🚀 Creating preview for project: ${projectId}`);

  try {
    // Convert files array to object format expected by the API
    const filesObject: { [key: string]: string } = {};
    files.forEach((file) => {
      filesObject[file.filename] = file.content;
    });

    // Make API request to create preview
    const response = await fetch(`${PREVIEW_API_BASE}/deploy`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        // Authorization: `Bearer ${PREVIEW_API_TOKEN}`,
      },
      body: JSON.stringify({
        hash: projectId,
        files: filesObject,
        deployToExternal: "vercel",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create preview: ${response.status} ${errorText}`
      );
    }

    const apiResponse = await response.json();

    // Map the API response to our PreviewResponse format
    const previewData: PreviewResponse = {
      url:
        apiResponse.previewUrl ||
        apiResponse.vercelUrl ||
        `https://${projectId}.minidev.fun`,
      status: apiResponse.isNewDeployment ? "deployed" : "updated",
      port: 3000, // Default port for Next.js apps
      previewUrl: apiResponse.previewUrl,
      vercelUrl: apiResponse.vercelUrl,
      aliasSuccess: apiResponse.aliasSuccess,
      isNewDeployment: apiResponse.isNewDeployment,
      hasPackageChanges: apiResponse.hasPackageChanges,
    };

    // Store the preview info
    activePreviews.set(projectId, previewData);

    console.log(`✅ Vercel deployment created successfully: ${previewData.url}`);
    console.log(`📊 Preview URL: ${previewData.previewUrl}`);
    console.log(`🌐 Vercel URL: ${previewData.vercelUrl}`);
    console.log(`📦 Package Changes: ${previewData.hasPackageChanges}`);
    console.log(`🆕 New Deployment: ${previewData.isNewDeployment}`);

    return previewData;
  } catch (error) {
    console.error(`❌ Failed to create preview for ${projectId}:`, error);
    throw error;
  }
}

// Update files in an existing preview
export async function updatePreviewFiles(
  projectId: string,
  changedFiles: { filename: string; content: string }[],
  accessToken: string
): Promise<void> {
  console.log(
    `🔄 Updating ${changedFiles.length} files in preview for project: ${projectId}`
  );

  try {
    // Convert files array to the format expected by the /previews endpoint
    const filesArray = changedFiles.map(file => ({
      path: file.filename,
      content: file.content
    }));

    // Make API request to update preview using the /previews endpoint
    const response = await fetch(`${PREVIEW_API_BASE}/previews`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: projectId,
        files: filesArray,
        wait: false, // Don't wait for readiness on updates
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to update preview: ${response.status} ${errorText}`
      );
    }

    // Handle the response from the update API
    const updateResponse = await response.json();
    console.log(`✅ Preview files updated successfully for ${projectId}`);
    console.log(`📊 Update Response:`, updateResponse);
  } catch (error) {
    console.error(`❌ Failed to update preview files for ${projectId}:`, error);
    throw error;
  }
}

// Get the full preview URL
export function getPreviewUrl(projectId: string): string | null {
  const preview = activePreviews.get(projectId);
  if (!preview) {
    return null;
  }

  // Use the previewUrl from the API response if available, otherwise fallback to the url field
  return preview.previewUrl || preview.url;
}

// Save files to local generated directory
export async function saveFilesToGenerated(
  projectId: string,
  files: { filename: string; content: string }[]
): Promise<void> {
  const generatedDir = path.join(process.cwd(), "generated", projectId);

  console.log(
    `💾 Saving ${files.length} files to generated directory: ${generatedDir}`
  );

  try {
    // Ensure the directory exists
    await fs.ensureDir(generatedDir);

    // Write each file
    for (const file of files) {
      const filePath = path.join(generatedDir, file.filename);
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, file.content, "utf8");
      console.log(`✅ Saved: ${file.filename}`);
    }

    console.log(`✅ All files saved to generated directory`);
  } catch (error) {
    console.error(`❌ Failed to save files to generated directory:`, error);
    throw error;
  }
}

// List files from generated directory
export async function listGeneratedFiles(projectId: string): Promise<string[]> {
  const generatedDir = path.join(process.cwd(), "generated", projectId);

  try {
    if (!(await fs.pathExists(generatedDir))) {
      return [];
    }

    const files: string[] = [];

    async function scanDirectory(dir: string, basePath: string = "") {
      const items = await fs.readdir(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const relativePath = path.join(basePath, item);
        const stat = await fs.stat(fullPath);

        if (stat.isDirectory()) {
          // Skip node_modules, .next, etc.
          if (
            item === "node_modules" ||
            item === ".next" ||
            item === "dist" ||
            item === "build" ||
            item === ".git"
          ) {
            continue;
          }
          await scanDirectory(fullPath, relativePath);
        } else {
          // Only include relevant file types
          const ext = path.extname(item);
          if (
            [
              ".tsx",
              ".ts",
              ".jsx",
              ".js",
              ".json",
              ".css",
              ".html",
              ".md",
            ].includes(ext)
          ) {
            files.push(relativePath);
          }
        }
      }
    }

    await scanDirectory(generatedDir);
    return files.sort();
  } catch (error) {
    console.error(`❌ Failed to list generated files for ${projectId}:`, error);
    return [];
  }
}

// Get file content from generated directory
export async function getGeneratedFile(
  projectId: string,
  filePath: string
): Promise<string | null> {
  const generatedDir = path.join(process.cwd(), "generated", projectId);
  const fullPath = path.join(generatedDir, filePath);

  try {
    if (await fs.pathExists(fullPath)) {
      return await fs.readFile(fullPath, "utf8");
    }
    return null;
  } catch (error) {
    console.error(`❌ Failed to read generated file ${filePath}:`, error);
    return null;
  }
}

// Update a file in generated directory
export async function updateGeneratedFile(
  projectId: string,
  filename: string,
  content: string
): Promise<void> {
  const generatedDir = path.join(process.cwd(), "generated", projectId);
  const filePath = path.join(generatedDir, filename);

  try {
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, "utf8");
    console.log(`✅ Updated generated file: ${filename}`);
  } catch (error) {
    console.error(`❌ Failed to update generated file ${filename}:`, error);
    throw error;
  }
}

// Delete a file from generated directory
export async function deleteGeneratedFile(
  projectId: string,
  filename: string
): Promise<void> {
  const generatedDir = path.join(process.cwd(), "generated", projectId);
  const filePath = path.join(generatedDir, filename);

  try {
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
      console.log(`✅ Deleted generated file: ${filename}`);
    }
  } catch (error) {
    console.error(`❌ Failed to delete generated file ${filename}:`, error);
    throw error;
  }
}

// Diff-based preview update for surgical changes
export async function updatePreviewWithDiffs(
  projectId: string,
  files: { filename: string; content: string }[],
  accessToken: string,
  diffs?: Array<{ filename: string; hunks: unknown[]; unifiedDiff: string }>
): Promise<PreviewResponse> {
  console.log(`🔄 Updating preview with diffs for project ${projectId}`);
  console.log(`📁 Files to update: ${files.length}`);
  console.log(`🔧 Diffs to apply: ${diffs?.length || 0}`);

  try {
    // Use the existing updatePreviewFiles function
    await updatePreviewFiles(projectId, files, accessToken);
    
    // Since updatePreviewFiles returns void, we need to create a PreviewResponse
    const previewResponse: PreviewResponse = {
      url: `${PREVIEW_API_BASE}/preview/${projectId}`,
      status: 'updated',
      port: 3000 // Default port
    };
    console.log(`✅ Preview updated with diffs: ${previewResponse.url}`);
    return previewResponse;
  } catch (error) {
    console.error(`❌ Failed to update preview with diffs:`, error);
    throw error;
  }
}

// Store diffs for rollback capability
export async function storeDiffs(
  projectId: string,
  diffs: Array<{ filename: string; hunks: unknown[]; unifiedDiff: string }>
): Promise<void> {
  const patchesDir = path.join(process.cwd(), "generated", projectId, "patches");
  
  try {
    await fs.ensureDir(patchesDir);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const diffFile = path.join(patchesDir, `diff-${timestamp}.json`);
    
    await fs.writeFile(diffFile, JSON.stringify(diffs, null, 2));
    console.log(`📦 Stored ${diffs.length} diffs for project ${projectId}`);
  } catch (error) {
    console.error(`❌ Failed to store diffs:`, error);
    throw error;
  }
}

// Get stored diffs for rollback
export async function getStoredDiffs(projectId: string): Promise<Array<{ filename: string; hunks: unknown[]; unifiedDiff: string }>> {
  const patchesDir = path.join(process.cwd(), "generated", projectId, "patches");
  
  try {
    if (!(await fs.pathExists(patchesDir))) {
      return [];
    }
    
    const files = await fs.readdir(patchesDir);
    const diffFiles = files.filter(f => f.startsWith('diff-') && f.endsWith('.json'));
    
    if (diffFiles.length === 0) {
      return [];
    }
    
    // Get the most recent diff file
    const latestDiffFile = diffFiles.sort().pop();
    const diffPath = path.join(patchesDir, latestDiffFile!);
    
    const diffContent = await fs.readFile(diffPath, 'utf8');
    return JSON.parse(diffContent);
  } catch (error) {
    console.error(`❌ Failed to get stored diffs:`, error);
    return [];
  }
}
