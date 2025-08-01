import fs from "fs-extra";
import path from "path";

// Store active previews for management
const activePreviews = new Map<
  string,
  { url: string; status: string; port: number }
>();

// Preview API configuration
const PREVIEW_API_BASE = "https://preview.minidev.fun";
const PREVIEW_API_TOKEN =
  "3c4249784fcbd545c5322185e2e64a8c270005ae7c0729b0cf3ffb13023ba396";

export interface PreviewResponse {
  url: string;
  status: string;
  port: number;
}

export interface PreviewFile {
  path: string;
  content: string;
}

// Create a preview using the external API
export async function createPreview(
  projectId: string,
  files: { filename: string; content: string }[]
): Promise<PreviewResponse> {
  console.log(`🚀 Creating preview for project: ${projectId}`);

  try {
    // Convert files to the format expected by the API
    const apiFiles: PreviewFile[] = files.map((file) => ({
      path: file.filename,
      content: file.content,
    }));

    // Make API request to create preview
    const response = await fetch(`${PREVIEW_API_BASE}/previews`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PREVIEW_API_TOKEN}`,
      },
      body: JSON.stringify({
        id: projectId,
        files: apiFiles,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create preview: ${response.status} ${errorText}`
      );
    }

    const previewData: PreviewResponse = await response.json();

    // Store the preview info
    activePreviews.set(projectId, previewData);

    console.log(`✅ Preview created successfully: ${previewData.url}`);
    console.log(`📊 Status: ${previewData.status}, Port: ${previewData.port}`);

    return previewData;
  } catch (error) {
    console.error(`❌ Failed to create preview for ${projectId}:`, error);
    throw error;
  }
}

// Update files in an existing preview
export async function updatePreviewFiles(
  projectId: string,
  changedFiles: { filename: string; content: string }[]
): Promise<void> {
  console.log(
    `🔄 Updating ${changedFiles.length} files in preview for project: ${projectId}`
  );

  try {
    // Convert files to the format expected by the API
    const apiFiles: PreviewFile[] = changedFiles.map((file) => ({
      path: file.filename,
      content: file.content,
    }));

    // Make API request to update preview (uses POST with same endpoint)
    const response = await fetch(`${PREVIEW_API_BASE}/previews`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PREVIEW_API_TOKEN}`,
      },
      body: JSON.stringify({
        id: projectId,
        files: apiFiles,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to update preview: ${response.status} ${errorText}`
      );
    }

    console.log(`✅ Preview files updated successfully for ${projectId}`);
  } catch (error) {
    console.error(`❌ Failed to update preview files for ${projectId}:`, error);
    throw error;
  }
}

// Get preview status
export async function getPreviewStatus(
  projectId: string
): Promise<PreviewResponse | null> {
  try {
    const response = await fetch(`${PREVIEW_API_BASE}/previews/${projectId}`, {
      headers: {
        Authorization: `Bearer ${PREVIEW_API_TOKEN}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Preview doesn't exist
      }
      throw new Error(`Failed to get preview status: ${response.status}`);
    }

    const previewData: PreviewResponse = await response.json();
    activePreviews.set(projectId, previewData);
    return previewData;
  } catch (error) {
    console.error(`❌ Failed to get preview status for ${projectId}:`, error);
    return null;
  }
}

// Delete a preview
export async function deletePreview(projectId: string): Promise<void> {
  console.log(`🗑️ Deleting preview for project: ${projectId}`);

  try {
    const response = await fetch(`${PREVIEW_API_BASE}/previews/${projectId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${PREVIEW_API_TOKEN}`,
      },
    });

    if (!response.ok && response.status !== 404) {
      const errorText = await response.text();
      throw new Error(
        `Failed to delete preview: ${response.status} ${errorText}`
      );
    }

    activePreviews.delete(projectId);
    console.log(`✅ Preview deleted successfully for ${projectId}`);
  } catch (error) {
    console.error(`❌ Failed to delete preview for ${projectId}:`, error);
    throw error;
  }
}

// Get the full preview URL
export function getPreviewUrl(projectId: string): string | null {
  const preview = activePreviews.get(projectId);
  if (!preview) {
    return null;
  }

  return `${PREVIEW_API_BASE}${preview.url}`;
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
