import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { db, users, projects, projectFiles } from '../../db';
import { eq } from 'drizzle-orm';
import { saveProjectFiles, getProjectFiles, createProject, deleteProject } from '../database';

describe('Database Operations', () => {
  let testProjectId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Create a test user first
    const testUser = await db.insert(users).values({
      privyUserId: 'test-user-123',
      email: 'test@example.com',
      displayName: 'Test User'
    }).returning();
    testUserId = testUser[0].id;
  });

  afterAll(async () => {
    // Clean up test data
    if (testProjectId) {
      await deleteProject(testProjectId);
    }
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  describe('saveProjectFiles', () => {
    it('should save files with normal content successfully', async () => {
      // Create a test project
      const project = await createProject(
        testUserId,
        'Test Project',
        'Test Description',
        'http://localhost:3000/test',
        'test-project-123'
      );
      testProjectId = project.id;

      // Test files with normal content
      const testFiles = [
        {
          filename: 'package.json',
          content: JSON.stringify({
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
              'react': '^18.0.0'
            }
          })
        },
        {
          filename: 'src/app/page.tsx',
          content: `'use client';

import React from 'react';

export default function HomePage() {
  return (
    <div>
      <h1>Hello World</h1>
    </div>
  );
}`
        },
        {
          filename: 'tsconfig.json',
          content: JSON.stringify({
            compilerOptions: {
              target: 'es5',
              lib: ['dom', 'dom.iterable', 'esnext'],
              allowJs: true,
              skipLibCheck: true,
              strict: true,
              noEmit: true,
              esModuleInterop: true,
              module: 'esnext',
              moduleResolution: 'node',
              resolveJsonModule: true,
              isolatedModules: true,
              jsx: 'preserve',
              incremental: true
            },
            include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'],
            exclude: ['node_modules']
          })
        }
      ];

      // Save files
      const result = await saveProjectFiles(testProjectId, testFiles);

      // Verify files were saved
      expect(result).toBeDefined();
      expect(result.length).toBe(3);

      // Verify we can retrieve the files
      const savedFiles = await getProjectFiles(testProjectId);
      expect(savedFiles).toHaveLength(3);
      expect(savedFiles.map(f => f.filename)).toEqual([
        'package.json',
        'src/app/page.tsx',
        'tsconfig.json'
      ]);

      // Verify content is correct
      const packageJsonFile = savedFiles.find(f => f.filename === 'package.json');
      expect(packageJsonFile).toBeDefined();
      expect(JSON.parse(packageJsonFile!.content)).toEqual({
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          'react': '^18.0.0'
        }
      });
    });

    it('should handle files with special characters correctly', async () => {
      const testFiles = [
        {
          filename: 'src/components/Button.tsx',
          content: `import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export function Button({ children, onClick, className }: ButtonProps) {
  return (
    <button 
      className={\`px-4 py-2 bg-blue-500 text-white rounded \${className || ''}\`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}`
        },
        {
          filename: 'README.md',
          content: `# Test Project

This is a test project with **markdown** content.

## Features

- Feature 1
- Feature 2
- Feature 3

\`\`\`typescript
const example = "Hello World";
console.log(example);
\`\`\`
`
        }
      ];

      // Save files
      const result = await saveProjectFiles(testProjectId, testFiles);

      // Verify files were saved
      expect(result).toBeDefined();
      expect(result.length).toBe(2);

      // Verify we can retrieve the files
      const savedFiles = await getProjectFiles(testProjectId);
      expect(savedFiles).toHaveLength(5); // 3 from previous test + 2 new ones

      const buttonFile = savedFiles.find(f => f.filename === 'src/components/Button.tsx');
      expect(buttonFile).toBeDefined();
      expect(buttonFile!.content).toContain('interface ButtonProps');
      expect(buttonFile!.content).toContain('className={`px-4 py-2 bg-blue-500');
    });

    it('should filter out files with null bytes', async () => {
      const testFiles = [
        {
          filename: 'normal-file.ts',
          content: 'export const normal = "hello";'
        },
        {
          filename: 'file-with-null.ts',
          content: 'export const withNull = "hello\0world";' // Contains null byte
        },
        {
          filename: 'another-normal.ts',
          content: 'export const another = "world";'
        }
      ];

      // This should not throw an error and should filter out the file with null bytes
      const result = await saveProjectFiles(testProjectId, testFiles);

      // Should only save 2 files (the ones without null bytes)
      expect(result).toBeDefined();
      expect(result.length).toBe(2);

      // Verify the correct files were saved
      const savedFiles = await getProjectFiles(testProjectId);
      const filenames = savedFiles.map(f => f.filename);
      expect(filenames).toContain('normal-file.ts');
      expect(filenames).toContain('another-normal.ts');
      expect(filenames).not.toContain('file-with-null.ts');
    });

    it('should handle empty files', async () => {
      const testFiles = [
        {
          filename: 'empty-file.ts',
          content: ''
        },
        {
          filename: 'whitespace-file.ts',
          content: '   \n\t  \n  '
        }
      ];

      const result = await saveProjectFiles(testProjectId, testFiles);

      expect(result).toBeDefined();
      expect(result.length).toBe(2);

      const savedFiles = await getProjectFiles(testProjectId);
      const emptyFile = savedFiles.find(f => f.filename === 'empty-file.ts');
      const whitespaceFile = savedFiles.find(f => f.filename === 'whitespace-file.ts');

      expect(emptyFile).toBeDefined();
      expect(emptyFile!.content).toBe('');
      expect(whitespaceFile).toBeDefined();
      expect(whitespaceFile!.content).toBe('   \n\t  \n  ');
    });

    it('should update existing files correctly', async () => {
      // First, save some files
      const initialFiles = [
        {
          filename: 'src/app/page.tsx',
          content: 'export default function Page() { return <div>Initial</div>; }'
        }
      ];

      await saveProjectFiles(testProjectId, initialFiles);

      // Then update with new content
      const updatedFiles = [
        {
          filename: 'src/app/page.tsx',
          content: 'export default function Page() { return <div>Updated</div>; }'
        },
        {
          filename: 'src/app/layout.tsx',
          content: 'export default function Layout() { return <div>Layout</div>; }'
        }
      ];

      await saveProjectFiles(testProjectId, updatedFiles);

      // Verify the update
      const savedFiles = await getProjectFiles(testProjectId);
      const pageFile = savedFiles.find(f => f.filename === 'src/app/page.tsx');
      const layoutFile = savedFiles.find(f => f.filename === 'src/app/layout.tsx');

      expect(pageFile).toBeDefined();
      expect(pageFile!.content).toContain('Updated');
      expect(layoutFile).toBeDefined();
      expect(layoutFile!.content).toContain('Layout');
    });
  });
});
