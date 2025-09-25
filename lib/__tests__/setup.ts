// Jest setup file
import { jest } from '@jest/globals';

// Mock fs-extra
jest.mock('fs-extra', () => ({
  pathExists: jest.fn(),
  ensureDir: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
  readdir: jest.fn(),
  stat: jest.fn(),
  rm: jest.fn(),
  mkdir: jest.fn(),
}));

// Mock child_process
jest.mock('child_process', () => ({
  execSync: jest.fn(),
  spawn: jest.fn(),
}));

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Set up test environment variables
Object.defineProperty(process.env, 'NODE_ENV', {
  value: 'test',
  writable: true
});
process.env.PREVIEW_API_BASE = 'http://localhost:8080';
