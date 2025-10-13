import fs from "fs-extra";
import path from "path";
import {
  parseContractAddressesFromDeployment,
  updateFilesWithContractAddresses
} from "./contractAddressInjector";

// Store active previews for management
const activePreviews = new Map<string, PreviewResponse>();

// Preview API configuration
const PREVIEW_API_BASE = process.env.PREVIEW_API_BASE || 'https://minidev.fun';

// Helper functions for path resolution
function getProjectBaseDir(projectId: string): string {
  return process.env.NODE_ENV === 'production'
    ? path.join("/tmp/generated", projectId)
    : path.join(process.cwd(), "generated", projectId);
}

function getProjectPatchesDir(projectId: string): string {
  return path.join(getProjectBaseDir(projectId), "patches");
}

export interface PreviewResponse {
  url: string;
  status: string;
  port: number;
  previewUrl?: string;
  vercelUrl?: string;
  aliasSuccess?: boolean;
  isNewDeployment?: boolean;
  hasPackageChanges?: boolean;
  contractAddresses?: { [contractName: string]: string }; // Deployed contract addresses
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
  console.log(`📁 Files count: ${files.length}`);
  console.log(`🔑 Access token: ${accessToken ? 'Present' : 'Missing'}`);
  console.log(`🌐 Preview API Base: ${PREVIEW_API_BASE}`);

  try {
    // Convert files array to object format expected by the API
    const filesObject: { [key: string]: string } = {};
    files.forEach((file) => {
      filesObject[file.filename] = file.content;
    });

    console.log(`📦 Converted ${Object.keys(filesObject).length} files to object format`);

    const requestBody = {
      hash: projectId,
      files: filesObject,
      deployToExternal: "vercel",
    };

    console.log(`📤 Sending request to: ${PREVIEW_API_BASE}/deploy`);
    console.log(`📤 Request body keys: ${Object.keys(requestBody)}`);

    // Make API request to create preview with extended timeout for Vercel deployment
    // Vercel deployments can take 5-10 minutes
    // Note: Using keepalive and no timeout on fetch itself since we want to wait
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log(`⏱️ Request timeout after 10 minutes, aborting...`);
      controller.abort();
    }, 600000); // 10 minute timeout

    try {
      console.log(`⏱️ Starting long-running Vercel deployment request (max 10 min)...`);

      // Use native http module for better timeout control
      const http = await import('http');
      const https = await import('https');
      const url = new URL(`${PREVIEW_API_BASE}/deploy`);

      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 600000, // 10 minutes
      };

      const requestData = JSON.stringify(requestBody);

      const response: { success: boolean; error?: string; previewUrl?: string; vercelUrl?: string; [key: string]: unknown } = await new Promise((resolve, reject) => {
        const protocol = url.protocol === 'https:' ? https : http;
        const req = protocol.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            clearTimeout(timeoutId);
            const success = res.statusCode! >= 200 && res.statusCode! < 300;
            try {
              const responseData = JSON.parse(data);
              resolve({
                success,
                ...responseData,
                status: res.statusCode,
                statusText: res.statusMessage,
              });
            } catch (parseError) {
              resolve({
                success,
                error: `Failed to parse response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
                status: res.statusCode,
                statusText: res.statusMessage,
              });
            }
          });
        });

        req.on('error', (error) => {
          clearTimeout(timeoutId);
          reject(error);
        });

        req.on('timeout', () => {
          clearTimeout(timeoutId);
          req.destroy();
          reject(new Error('Request timeout'));
        });

        req.write(requestData);
        req.end();
      });

      console.log(`✅ Received response from deploy endpoint`);

      console.log(`📥 Response status: ${response.status}`);
      console.log(`📥 Response statusText: ${response.statusText}`);

      if (!response.success) {
        console.error(`❌ Preview API returned error: ${response.status}`);
        console.error(`❌ Error details: ${response.error || 'Unknown error'}`);
        throw new Error(
          `Failed to create preview: ${response.status} ${response.error || 'Unknown error'}`
        );
      }

      const apiResponse = response;

      console.log("📦 API Response:", JSON.stringify(apiResponse, null, 2));

      // Parse contract addresses from deployment response
      const contractAddresses = parseContractAddressesFromDeployment(apiResponse);

      // If contract addresses were deployed, inject them into the files and re-save
      if (contractAddresses && Object.keys(contractAddresses).length > 0) {
        console.log(`\n${"=".repeat(60)}`);
        console.log(`📝 CONTRACT ADDRESSES DETECTED - INJECTING INTO PROJECT`);
        console.log(`${"=".repeat(60)}`);
        console.log(`Deployed contracts:`, contractAddresses);

        // Update files with contract addresses
        const updatedFiles = updateFilesWithContractAddresses(files, contractAddresses);

        // Save updated files to generated directory
        try {
          await saveFilesToGenerated(projectId, updatedFiles);
          console.log(`✅ Updated files saved with contract addresses`);
        } catch (saveError) {
          console.error(`⚠️  Failed to save updated files:`, saveError);
        }
      }

      // Map the API response to our PreviewResponse format
      const previewData: PreviewResponse = {
        url:
          apiResponse.previewUrl ||
          apiResponse.vercelUrl ||
          `http://localhost:8080/p/${projectId}`,
        status: (apiResponse.status as string) || (apiResponse.isNewDeployment ? "deployed" : "updated"),
        port: (apiResponse.port as number) || 3000, // Use port from response or default to 3000
        previewUrl: apiResponse.previewUrl as string,
        vercelUrl: apiResponse.vercelUrl as string,
        aliasSuccess: apiResponse.aliasSuccess as boolean,
        isNewDeployment: apiResponse.isNewDeployment as boolean,
        hasPackageChanges: apiResponse.hasPackageChanges as boolean,
        contractAddresses: contractAddresses || undefined,
      };

      // Store the preview info
      activePreviews.set(projectId, previewData);

      console.log(`✅ Preview created successfully!`);
      console.log(`   URL: ${previewData.url}`);
      console.log(`   Preview URL: ${previewData.previewUrl}`);
      console.log(`   Vercel URL: ${previewData.vercelUrl}`);
      console.log(`   Status: ${previewData.status}`);
      console.log(`   Port: ${previewData.port}`);

      return previewData;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  } catch (error) {
    console.error(`❌ Failed to create preview for ${projectId}:`, error);
    console.error(`❌ Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
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
    // This will update the same deployment and handle Vercel updates automatically
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
    
    // Update the stored preview info with the Vercel URL if it was updated
    if (updateResponse.vercelUrl) {
      const existingPreview = activePreviews.get(projectId);
      if (existingPreview) {
        existingPreview.vercelUrl = updateResponse.vercelUrl;
        existingPreview.url = updateResponse.vercelUrl;
        activePreviews.set(projectId, existingPreview);
        console.log(`🌐 Updated Vercel URL: ${updateResponse.vercelUrl}`);
      }
    }
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
  const generatedDir = getProjectBaseDir(projectId);

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
  const generatedDir = getProjectBaseDir(projectId);

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
  const generatedDir = getProjectBaseDir(projectId);
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
  const generatedDir = getProjectBaseDir(projectId);
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
  const generatedDir = getProjectBaseDir(projectId);
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
  const patchesDir = getProjectPatchesDir(projectId);
  
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
  const patchesDir = getProjectPatchesDir(projectId);
  
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
