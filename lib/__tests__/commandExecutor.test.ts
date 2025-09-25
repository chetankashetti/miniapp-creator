import { SecureCommandExecutor, parseToolCall, formatCommandResult } from '../commandExecutor';

describe('SecureCommandExecutor', () => {
  const projectId = 'test-project';
  const baseDir = '/tmp/test-project';

  beforeEach(() => {
    // Mock fs-extra
    jest.mock('fs-extra');
  });

  describe('validateCommand', () => {
    it('should allow whitelisted commands', async () => {
      const executor = new SecureCommandExecutor(projectId, baseDir);
      
      const result = await executor.executeCommand({
        command: 'grep',
        args: ['pattern', 'file.txt'],
        workingDirectory: '.'
      });

      // Should not throw an error for allowed commands
      expect(result).toBeDefined();
    });

    it('should reject non-whitelisted commands', async () => {
      const executor = new SecureCommandExecutor(projectId, baseDir);
      
      const result = await executor.executeCommand({
        command: 'rm',
        args: ['-rf', '/'],
        workingDirectory: '.'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    it('should reject commands with too many arguments', async () => {
      const executor = new SecureCommandExecutor(projectId, baseDir);
      
      const result = await executor.executeCommand({
        command: 'grep',
        args: new Array(15).fill('arg'),
        workingDirectory: '.'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Too many arguments');
    });

    it('should reject commands with dangerous patterns', async () => {
      const executor = new SecureCommandExecutor(projectId, baseDir);
      
      const result = await executor.executeCommand({
        command: 'grep',
        args: ['pattern; rm -rf /'],
        workingDirectory: '.'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Dangerous pattern detected');
    });
  });
});

describe('parseToolCall', () => {
  it('should parse valid tool call JSON', () => {
    const response = 'Here is the result: {"tool": "grep", "args": ["useState", "src"], "workingDirectory": "src", "reason": "Find useState usage"}';
    
    const result = parseToolCall(response);
    
    expect(result).toEqual({
      command: 'grep',
      args: ['useState', 'src'],
      workingDirectory: 'src',
      timeout: undefined
    });
  });

  it('should return null for invalid JSON', () => {
    const response = 'This is not a tool call';
    
    const result = parseToolCall(response);
    
    expect(result).toBeNull();
  });

  it('should return null for missing tool or args', () => {
    const response = '{"tool": "grep"}';
    
    const result = parseToolCall(response);
    
    expect(result).toBeNull();
  });
});

describe('formatCommandResult', () => {
  it('should format successful command result', () => {
    const result = {
      success: true,
      output: 'Found 5 matches',
      exitCode: 0,
      executionTime: 100
    };

    const formatted = formatCommandResult(result, 'grep');
    
    expect(formatted).toContain("Command 'grep' completed successfully");
    expect(formatted).toContain('Found 5 matches');
  });

  it('should format failed command result', () => {
    const result = {
      success: false,
      output: '',
      error: 'File not found',
      exitCode: 1,
      executionTime: 50
    };

    const formatted = formatCommandResult(result, 'grep');
    
    expect(formatted).toContain("Command 'grep' failed");
    expect(formatted).toContain('File not found');
  });
});
