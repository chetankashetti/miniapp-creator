// Railway validation client for minidev
// Handles communication with Railway's validation API

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
   * Validate project files using Railway's full compilation validation
   */
  async validateProject(
    projectId: string,
    files: { filename: string; content: string }[],
    validationConfig: RailwayValidationConfig = {
      enableTypeScript: true,
      enableSolidity: true,
      enableESLint: true,
      enableBuild: true,
      enableRuntimeChecks: true
    }
  ): Promise<RailwayValidationResult> {
    console.log(`🚂 Calling Railway validation API for project: ${projectId}`);
    console.log(`📁 Files to validate: ${files.length}`);
    console.log(`⚙️  Validation config:`, validationConfig);

    try {
      // Convert files array to object format expected by Railway
      const filesObject: { [filename: string]: string } = {};
      files.forEach(file => {
        filesObject[file.filename] = file.content;
      });

      const requestBody: RailwayValidationRequest = {
        projectId,
        files: filesObject,
        validationConfig
      };

      console.log(`📤 Sending validation request to: ${this.apiBase}/validate`);
      console.log(`📏 Request size: ${JSON.stringify(requestBody).length} characters`);

      const startTime = Date.now();
      
      // Make HTTP request to Railway validation API
      const response = await this.makeRequest('/validate', requestBody);
      
      const requestTime = Date.now() - startTime;
      console.log(`📥 Railway validation response received in ${requestTime}ms`);
      console.log(`✅ Success: ${response.success}`);
      console.log(`❌ Errors: ${response.errors?.length || 0}`);
      console.log(`⚠️  Warnings: ${response.warnings?.length || 0}`);

      return response as RailwayValidationResult;

    } catch (error) {
      console.error(`❌ Railway validation failed:`, error);
      throw new Error(`Railway validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
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
        throw new Error(`Railway API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
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

  // Set timeout based on environment
  const timeout = process.env.NODE_ENV === 'production' ? 60000 : 30000; // 60s prod, 30s dev

  console.log(`🚂 Railway validation client configured:`);
  console.log(`  API Base: ${apiBase}`);
  console.log(`  Timeout: ${timeout}ms`);
  console.log(`  Token: ${accessToken ? 'Present' : 'Missing'}`);

  return new RailwayValidationClient(apiBase, accessToken, timeout);
}
