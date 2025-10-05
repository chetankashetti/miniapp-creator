/**
 * Centralized logging utility for Vercel deployment
 * Handles both development (file-based) and production (console-based) logging
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
  projectId?: string;
  stage?: string;
}

class Logger {
  private isProduction = process.env.NODE_ENV === 'production';

  private formatLog(level: LogLevel, message: string, metadata?: Record<string, unknown>, projectId?: string, stage?: string): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata,
      projectId,
      stage
    };
  }

  private outputLog(logEntry: LogEntry): void {
    const formattedMessage = `[${logEntry.level}] ${logEntry.message}`;
    
    if (this.isProduction) {
      // In production, use structured JSON logging for better parsing
      console.log(JSON.stringify({
        ...logEntry,
        formattedMessage
      }));
    } else {
      // In development, use readable format
      console.log(`${logEntry.timestamp} ${formattedMessage}`);
      if (logEntry.metadata) {
        console.log('  Metadata:', JSON.stringify(logEntry.metadata, null, 2));
      }
    }
  }

  debug(message: string, metadata?: Record<string, unknown>, projectId?: string, stage?: string): void {
    this.outputLog(this.formatLog(LogLevel.DEBUG, message, metadata, projectId, stage));
  }

  info(message: string, metadata?: Record<string, unknown>, projectId?: string, stage?: string): void {
    this.outputLog(this.formatLog(LogLevel.INFO, message, metadata, projectId, stage));
  }

  warn(message: string, metadata?: Record<string, unknown>, projectId?: string, stage?: string): void {
    this.outputLog(this.formatLog(LogLevel.WARN, message, metadata, projectId, stage));
  }

  error(message: string, metadata?: Record<string, unknown>, projectId?: string, stage?: string): void {
    this.outputLog(this.formatLog(LogLevel.ERROR, message, metadata, projectId, stage));
  }

  // Special method for LLM stage responses
  logStageResponse(projectId: string, stageName: string, response: string, metadata?: Record<string, unknown>): void {
    this.info(`Stage ${stageName} completed`, {
      ...metadata,
      responseLength: response.length,
      responsePreview: response.substring(0, 200) + (response.length > 200 ? '...' : ''),
      fullResponse: response // Include full response for debugging
    }, projectId, stageName);
  }

  // Special method for API requests
  logApiRequest(method: string, url: string, metadata?: Record<string, unknown>): void {
    this.info(`API Request: ${method} ${url}`, metadata);
  }

  // Special method for errors with stack traces
  logError(error: Error, context?: string, projectId?: string, stage?: string): void {
    this.error(`Error${context ? ` in ${context}` : ''}: ${error.message}`, {
      stack: error.stack,
      name: error.name
    }, projectId, stage);
  }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience functions
export const logDebug = logger.debug.bind(logger);
export const logInfo = logger.info.bind(logger);
export const logWarn = logger.warn.bind(logger);
export const logError = logger.error.bind(logger);
export const logStageResponse = logger.logStageResponse.bind(logger);
export const logApiRequest = logger.logApiRequest.bind(logger);
export const logErrorWithContext = logger.logError.bind(logger);
