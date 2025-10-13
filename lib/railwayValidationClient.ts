// Railway validation client for minidev
// Handles communication with Railway's validation API

import * as fs from 'fs';
import * as path from 'path';

export interface RailwayValidationConfig {
  enableTypeScript: boolean;
  enableSolidity: boolean;
  enableESLint: boolean;
  enableBuild: boolean;
  enableRuntimeChecks: boolean;
}

export interface RailwayValidationResult {
  success: boolean;
  errors: RailwayValidationError[];
  warnings: RailwayValidationWarning[];
  info: RailwayValidationInfo[];
  files: { filename: string; content: string }[];
  compilationTime: number;
  validationSummary: {
    totalFiles: number;
    filesWithErrors: number;
    filesWithWarnings: number;
    criticalErrors: number;
  };
}

export interface RailwayValidationError {
  file: string;
  line: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning';
  category: 'typescript' | 'solidity' | 'eslint' | 'build' | 'react' | 'validation';
  suggestion?: string;
  rule?: string;
}

export type RailwayValidationWarning = RailwayValidationError;
export type RailwayValidationInfo = RailwayValidationError;

export interface RailwayValidationRequest {
  projectId: string;
  files: { [filename: string]: string };
  validationConfig: RailwayValidationConfig;
}

export class RailwayValidationClient {
  private apiBase: string;
  private accessToken: string;
  private timeout: number;

  constructor(apiBase: string, accessToken: string, timeout: number = 60000) {
    this.apiBase = apiBase;
    this.accessToken = accessToken;
    this.timeout = timeout;
  }

  /**
   * Validate project files using Railway's full compilation validation with retry logic
   */
  async validateProject(
    projectId: string,
    files: { filename: string; content: string }[],
    validationConfig: RailwayValidationConfig = {
      enableTypeScript: true,
      enableSolidity: true,
      enableESLint: false,
      enableBuild: true,
      enableRuntimeChecks: true
    },
    projectDir?: string // Optional: path to complete project directory (boilerplate + generated files)
  ): Promise<RailwayValidationResult> {
    console.log(`🚂 Calling Railway validation API for project: ${projectId}`);
    console.log(`📁 Generated files to validate: ${files.length}`);
    console.log(`⚙️  Validation config:`, validationConfig);

    // Use complete project directory if provided, otherwise build from scratch
    const completeFilesObject = projectDir 
      ? await this.buildCompleteProjectFilesFromDir(projectDir, files)
      : await this.buildCompleteProjectFiles(files);
    
    console.log(`📁 Complete project files: ${Object.keys(completeFilesObject).length}`);
    console.log(`📋 Files included:`, Object.keys(completeFilesObject).slice(0, 10).join(', ') + (Object.keys(completeFilesObject).length > 10 ? '...' : ''));

    const requestBody: RailwayValidationRequest = {
      projectId,
      files: completeFilesObject,
      validationConfig
    };

    console.log(`📤 Sending validation request to: ${this.apiBase}/validate`);
    console.log(`📏 Request size: ${JSON.stringify(requestBody).length} characters`);

    // Retry logic with exponential backoff
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Railway validation attempt ${attempt}/${maxRetries}`);
        
        const startTime = Date.now();
        const response = await this.makeRequest('/validate', requestBody);
        const requestTime = Date.now() - startTime;
        
        console.log(`📥 Railway validation response received in ${requestTime}ms`);
        console.log(`✅ Success: ${response.success}`);
        console.log(`❌ Errors: ${response.errors?.length || 0}`);
        console.log(`⚠️  Warnings: ${response.warnings?.length || 0}`);
        
        // Log detailed response for debugging
        console.log(`📋 Full validation response:`, JSON.stringify(response, null, 2));
        
        // Log error details if present
        if (response.errors && response.errors.length > 0) {
          console.log(`🔍 Error details:`);
          response.errors.forEach((error, index) => {
            console.log(`  ${index + 1}. ${error.file}:${error.line}:${error.column} - ${error.message}`);
            if (error.severity) console.log(`     Severity: ${error.severity}, Category: ${error.category}`);
          });
        }
        
        // Log warning details if present
        if (response.warnings && response.warnings.length > 0) {
          console.log(`⚠️  Warning details:`);
          response.warnings.forEach((warning, index) => {
            console.log(`  ${index + 1}. ${warning.file}:${warning.line}:${warning.column} - ${warning.message}`);
            if (warning.severity) console.log(`     Severity: ${warning.severity}, Category: ${warning.category}`);
          });
        }
        
        // Log validation summary if present
        if (response.validationSummary) {
          console.log(`📊 Validation summary:`, response.validationSummary);
        }
        
        // Log compilation time if present
        if (response.compilationTime) {
          console.log(`⏱️  Compilation time: ${response.compilationTime}ms`);
        }

        return response as RailwayValidationResult;

      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        
        console.error(`❌ Railway validation attempt ${attempt} failed:`, error);
        
        // Log detailed error information
        if (error instanceof Error) {
          console.error(`🔍 Error details:`, {
            message: error.message,
            stack: error.stack,
            name: error.name
          });
        } else {
          console.error(`🔍 Error object:`, error);
        }
        
        // Check if error has response data (HTTP error)
        if (error && typeof error === 'object' && 'response' in error) {
          const httpError = error as { response?: { status?: number; statusText?: string; data?: unknown } };
          console.error(`🌐 HTTP Error Response:`, {
            status: httpError.response?.status,
            statusText: httpError.response?.statusText,
            data: httpError.response?.data
          });
        }
        
        if (isLastAttempt) {
          console.error(`❌ All ${maxRetries} Railway validation attempts failed`);
          throw new Error(`Railway validation failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // Calculate delay with exponential backoff
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`⏳ Retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // This should never be reached, but TypeScript requires it
    throw new Error('Railway validation failed: Unexpected error in retry loop');
  }

  /**
   * Build complete project files from existing project directory + generated files
   */
  private async buildCompleteProjectFilesFromDir(projectDir: string, generatedFiles: { filename: string; content: string }[]): Promise<{ [filename: string]: string }> {
    const completeFiles: { [filename: string]: string } = {};
    
    console.log(`📁 Reading complete project from directory: ${projectDir}`);
    
    // Read all files from the project directory
    const readDirRecursive = async (dir: string, baseDir: string = dir): Promise<void> => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(baseDir, fullPath);
          
          // Skip common directories that shouldn't be included
          if (entry.isDirectory()) {
            if (!['node_modules', '.git', '.next', 'dist', 'build'].includes(entry.name)) {
              await readDirRecursive(fullPath, baseDir);
            }
          } else if (entry.isFile()) {
            // Skip common files that shouldn't be included
            if (!['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb'].includes(entry.name)) {
              try {
                const content = fs.readFileSync(fullPath, 'utf8');
                completeFiles[relativePath] = content;
                console.log(`✅ Included project file: ${relativePath}`);
              } catch (error) {
                console.warn(`⚠️ Failed to read project file ${relativePath}:`, error);
              }
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ Failed to read directory ${dir}:`, error);
      }
    };
    
    await readDirRecursive(projectDir);
    
    // Override with generated files (they take precedence)
    for (const file of generatedFiles) {
      completeFiles[file.filename] = file.content;
      console.log(`✅ Overrode with generated file: ${file.filename}`);
    }
    
    console.log(`📊 Complete project structure from directory:`);
    console.log(`  - Project files: ${Object.keys(completeFiles).length - generatedFiles.length}`);
    console.log(`  - Generated files: ${generatedFiles.length}`);
    console.log(`  - Total files: ${Object.keys(completeFiles).length}`);
    
    return completeFiles;
  }

  /**
   * Build complete project files by including boilerplate config files + generated files
   */
  private async buildCompleteProjectFiles(generatedFiles: { filename: string; content: string }[]): Promise<{ [filename: string]: string }> {
    const completeFiles: { [filename: string]: string } = {};
    
    // Essential boilerplate config files that Railway validation needs
    const boilerplateConfigFiles = [
      'package.json',
      'tsconfig.json', 
      'next.config.ts',
      'eslint.config.mjs',
      'postcss.config.mjs',
      'next-env.d.ts'
    ];
    
    // Try to read boilerplate files from common locations
    const possibleBoilerplatePaths = [
      path.join(process.cwd(), 'boilerplate'),
      path.join(process.cwd(), '..', 'boilerplate'),
      path.join(process.cwd(), 'minidev-preview-host', 'boilerplate'),
      path.join(process.cwd(), '..', 'minidev-preview-host', 'boilerplate')
    ];
    
    let boilerplatePath: string | null = null;
    for (const possiblePath of possibleBoilerplatePaths) {
      if (fs.existsSync(possiblePath)) {
        boilerplatePath = possiblePath;
        console.log(`📁 Found boilerplate at: ${boilerplatePath}`);
        break;
      }
    }
    
    if (boilerplatePath) {
      // Include boilerplate config files
      for (const configFile of boilerplateConfigFiles) {
        const configPath = path.join(boilerplatePath, configFile);
        if (fs.existsSync(configPath)) {
          try {
            const content = fs.readFileSync(configPath, 'utf8');
            completeFiles[configFile] = content;
            console.log(`✅ Included boilerplate file: ${configFile}`);
          } catch (error) {
            console.warn(`⚠️ Failed to read boilerplate file ${configFile}:`, error);
          }
        }
      }
    } else {
      console.warn(`⚠️ Boilerplate directory not found, using minimal config files`);
      
      // Fallback: Create minimal essential config files
      completeFiles['package.json'] = JSON.stringify({
        "name": "minidev-validation",
        "version": "0.1.0",
        "private": true,
        "scripts": {
          "dev": "next dev",
          "build": "next build",
          "start": "next start",
          "lint": "next lint"
        },
        "dependencies": {
          "@farcaster/miniapp-sdk": "^0.1.7",
          "@farcaster/miniapp-wagmi-connector": "^1.0.0",
          "@farcaster/quick-auth": "^0.0.7",
          "@rainbow-me/rainbowkit": "^2.0.0",
          "@tanstack/react-query": "^5.83.0",
          "class-variance-authority": "^0.7.0",
          "clsx": "^2.1.0",
          "ethers": "^6.11.0",
          "lucide-react": "^0.525.0",
          "next": "15.5.4",
          "react": "^19.0.0",
          "react-dom": "^19.0.0",
          "tailwind-merge": "^3.3.1",
          "viem": "^2.7.0",
          "wagmi": "^2.5.0"
        },
        "devDependencies": {
          "@eslint/eslintrc": "^3",
          "@tailwindcss/postcss": "^4",
          "@types/node": "^20",
          "@types/react": "^19",
          "@types/react-dom": "^19",
          "eslint": "^9",
          "eslint-config-next": "15.2.0",
          "tailwindcss": "^4",
          "typescript": "^5"
        }
      }, null, 2);
      
      completeFiles['tsconfig.json'] = JSON.stringify({
        "compilerOptions": {
          "target": "ES2017",
          "lib": ["dom", "dom.iterable", "esnext"],
          "allowJs": true,
          "skipLibCheck": true,
          "strict": true,
          "noEmit": true,
          "esModuleInterop": true,
          "module": "esnext",
          "moduleResolution": "bundler",
          "resolveJsonModule": true,
          "isolatedModules": true,
          "jsx": "preserve",
          "incremental": true,
          "plugins": [{ "name": "next" }],
          "paths": { "@/*": ["./src/*"] }
        },
        "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
        "exclude": ["node_modules"]
      }, null, 2);
      
      completeFiles['next.config.ts'] = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  assetPrefix: process.env.ASSET_PREFIX ?? "",
  images: {
    path: \`\${process.env.ASSET_PREFIX ?? ""}/_next/image\`,
  },
  async headers() {
    const frameAncestors = "frame-ancestors 'self' https://minidev.fun https://*.minidev.fun https://farcaster.xyz https://*.farcaster.xyz http://localhost:* http://127.0.0.1:* https://127.0.0.1:*";
    return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: frameAncestors }] }];
  },
};

export default nextConfig;`;
      
      completeFiles['eslint.config.mjs'] = `import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });
const eslintConfig = [...compat.extends("next/core-web-vitals", "next/typescript")];

export default eslintConfig;`;
      
      console.log(`✅ Created minimal config files as fallback`);
    }
    
    // Include all generated files
    for (const file of generatedFiles) {
      completeFiles[file.filename] = file.content;
    }
    
    console.log(`📊 Complete project structure:`);
    console.log(`  - Boilerplate config files: ${boilerplateConfigFiles.length}`);
    console.log(`  - Generated files: ${generatedFiles.length}`);
    console.log(`  - Total files: ${Object.keys(completeFiles).length}`);
    
    return completeFiles;
  }

  /**
   * Make HTTP request to Railway API
   */
  private async makeRequest(endpoint: string, body: RailwayValidationRequest): Promise<RailwayValidationResult> {
    const url = `${this.apiBase}${endpoint}`;
    
    // Use native fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log(`⏱️ Railway validation request timeout after ${this.timeout}ms`);
      controller.abort();
    }, this.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`🚨 Railway API HTTP Error:`);
        console.error(`  Status: ${response.status} ${response.statusText}`);
        console.error(`  URL: ${url}`);
        console.error(`  Response Body: ${errorText}`);
        throw new Error(`Railway API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      
      // Log successful response details
      console.log(`✅ Railway API request successful:`);
      console.log(`  Status: ${response.status} ${response.statusText}`);
      console.log(`  URL: ${url}`);
      console.log(`  Response size: ${JSON.stringify(result).length} characters`);
      
      return result;

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Railway validation request timed out after ${this.timeout}ms`);
      }
      
      throw error;
    }
  }

  /**
   * Check if Railway validation is available
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBase}/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (!response.ok) {
        return false;
      }

      const health = await response.json();
      return health.status === 'healthy' && health.validation?.available === true;

    } catch (error) {
      console.warn('Railway health check failed:', error);
      return false;
    }
  }
}

/**
 * Create Railway validation client with environment-aware configuration
 */
export function createRailwayValidationClient(): RailwayValidationClient {
  // Get Railway API base URL from environment
  const apiBase = process.env.RAILWAY_VALIDATION_API_BASE || 
                 process.env.PREVIEW_API_BASE || 
                 'https://miniapp-preview-host-production.up.railway.app';
  
  // Get access token from environment
  const accessToken = process.env.PREVIEW_AUTH_TOKEN || 
                     process.env.RAILWAY_VALIDATION_TOKEN || 
                     '';

  if (!accessToken) {
    throw new Error('Railway validation requires PREVIEW_AUTH_TOKEN or RAILWAY_VALIDATION_TOKEN environment variable');
  }

  // Set timeout based on environment - increased for better reliability
  const timeout = process.env.NODE_ENV === 'production' ? 300000 : 300000; // 2min prod, 1min dev

  console.log(`🚂 Railway validation client configured:`);
  console.log(`  API Base: ${apiBase}`);
  console.log(`  Timeout: ${timeout}ms`);
  console.log(`  Token: ${accessToken ? 'Present' : 'Missing'}`);

  return new RailwayValidationClient(apiBase, accessToken, timeout);
}
