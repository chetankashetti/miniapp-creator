import {
  generateDiff,
  applyDiffToContent,
  applyDiffHunks,
  parseUnifiedDiff,
  validateDiff,
  createMinimalDiff,
  getDiffStats,
  DiffHunk
} from '../diffUtils';

describe('diffUtils', () => {
  describe('applyDiffHunks', () => {
    it('should add a line in the middle of content', () => {
      const original = 'line1\nline2\nline3';
      const hunks: DiffHunk[] = [
        {
          oldStart: 1,
          oldLines: 3,
          newStart: 1,
          newLines: 4,
          lines: [
            ' line1',
            '+line1.5',
            ' line2',
            ' line3'
          ]
        }
      ];

      const result = applyDiffHunks(original, hunks);

      expect(result).toBe('line1\nline1.5\nline2\nline3');
    });

    it('should remove a line from content', () => {
      const original = 'line1\nline2\nline3';
      const hunks: DiffHunk[] = [
        {
          oldStart: 1,
          oldLines: 3,
          newStart: 1,
          newLines: 2,
          lines: [
            ' line1',
            '-line2',
            ' line3'
          ]
        }
      ];

      const result = applyDiffHunks(original, hunks);

      expect(result).toBe('line1\nline3');
    });

    it('should replace a line in content', () => {
      const original = 'line1\nline2\nline3';
      const hunks: DiffHunk[] = [
        {
          oldStart: 1,
          oldLines: 3,
          newStart: 1,
          newLines: 3,
          lines: [
            ' line1',
            '-line2',
            '+new line2',
            ' line3'
          ]
        }
      ];

      const result = applyDiffHunks(original, hunks);

      expect(result).toBe('line1\nnew line2\nline3');
    });

    it('should handle TodoList import diff correctly', () => {
      const original = `import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTodos } from '@/hooks/useTodos';
import { Trash2, Plus } from 'lucide-react';`;

      const hunks: DiffHunk[] = [
        {
          oldStart: 1,
          oldLines: 5,
          newStart: 1,
          newLines: 5,
          lines: [
            ' import React, { useState } from \'react\';',
            ' import { Button } from \'@/components/ui/Button\';',
            ' import { Input } from \'@/components/ui/Input\';',
            ' import { useTodos } from \'@/hooks/useTodos\';',
            '-import { Trash2, Plus } from \'lucide-react\';',
            '+import { Trash2, Plus, Check, Circle } from \'lucide-react\';'
          ]
        }
      ];

      const result = applyDiffHunks(original, hunks);

      expect(result).toContain('import { Trash2, Plus, Check, Circle } from \'lucide-react\';');
      expect(result).not.toContain('import { Trash2, Plus } from \'lucide-react\';');
    });

    it('should handle multi-line addition with context', () => {
      const original = `export function TodoList() {
  const [newTodoText, setNewTodoText] = useState('');
  const { todos, addTodo, deleteTodo } = useTodos();

  const handleAddTodo = () => {`;

      const hunks: DiffHunk[] = [
        {
          oldStart: 2,
          oldLines: 3,
          newStart: 2,
          newLines: 7,
          lines: [
            '   const [newTodoText, setNewTodoText] = useState(\'\');',
            '-  const { todos, addTodo, deleteTodo } = useTodos();',
            '+  const { todos, addTodo, deleteTodo, toggleTodo } = useTodos();',
            '+',
            '+  const handleToggleTodo = (id: string) => {',
            '+    toggleTodo(id);',
            '+  };',
            ' ',
            '   const handleAddTodo = () => {'
          ]
        }
      ];

      const result = applyDiffHunks(original, hunks);

      expect(result).toContain('const { todos, addTodo, deleteTodo, toggleTodo } = useTodos();');
      expect(result).toContain('const handleToggleTodo = (id: string) => {');
      expect(result).toContain('toggleTodo(id);');
    });

    it('should skip hunk when context does not match', () => {
      const original = 'line1\nline2 modified\nline3';
      const hunks: DiffHunk[] = [
        {
          oldStart: 1,
          oldLines: 3,
          newStart: 1,
          newLines: 4,
          lines: [
            ' line1',
            ' line2', // This won't match because actual file has "line2 modified"
            '+line2.5',
            ' line3'
          ]
        }
      ];

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = applyDiffHunks(original, hunks);

      // Should skip the hunk and return original content
      expect(result).toBe('line1\nline2 modified\nline3');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Context mismatch'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping hunk'));

      consoleSpy.mockRestore();
    });

    it('should handle multiple hunks in reverse order', () => {
      const original = 'line1\nline2\nline3\nline4\nline5';
      const hunks: DiffHunk[] = [
        {
          oldStart: 1,
          oldLines: 2,
          newStart: 1,
          newLines: 3,
          lines: [
            ' line1',
            '+line1.5',
            ' line2'
          ]
        },
        {
          oldStart: 4,
          oldLines: 2,
          newStart: 5,
          newLines: 3,
          lines: [
            ' line4',
            '+line4.5',
            ' line5'
          ]
        }
      ];

      const result = applyDiffHunks(original, hunks);

      expect(result).toBe('line1\nline1.5\nline2\nline3\nline4\nline4.5\nline5');
    });

    it('should handle incorrect line numbers by searching for context', () => {
      const original = `'use client';

import React, { useState } from 'react';
export function TodoList() {
  const [newTodoText, setNewTodoText] = useState('');
  const { todos, addTodo, deleteTodo } = useTodos();

  return <div>Hello</div>;
}`;

      // Hunk says oldStart: 3, but actual matching line is at line 4
      const hunks: DiffHunk[] = [
        {
          oldStart: 3,  // Wrong line number!
          oldLines: 3,
          newStart: 3,
          newLines: 3,
          lines: [
            ' export function TodoList() {',
            '   const [newTodoText, setNewTodoText] = useState(\'\');',
            '-  const { todos, addTodo, deleteTodo } = useTodos();',
            '+  const { todos, addTodo, deleteTodo, toggleTodo } = useTodos();'
          ]
        }
      ];

      const result = applyDiffHunks(original, hunks);

      // Should still find and apply the change correctly
      expect(result).toContain('const { todos, addTodo, deleteTodo, toggleTodo } = useTodos();');
      expect(result).not.toContain('const { todos, addTodo, deleteTodo } = useTodos();');
    });

    it('should handle JSX replacement correctly', () => {
      const original = `              <div
                key={todo.id}
                className="flex items-center"
              >
                <div className="flex-1">
                  <p className="text-white">
                    {todo.text}
                  </p>
                </div>
              </div>`;

      const hunks: DiffHunk[] = [
        {
          oldStart: 1,
          oldLines: 10,
          newStart: 1,
          newLines: 12,
          lines: [
            '               <div',
            '                 key={todo.id}',
            '-                className="flex items-center"',
            '+                className={`flex items-center ${todo.completed ? \'opacity-70\' : \'\'}`}',
            '               >',
            '+                <Button onClick={() => handleToggleTodo(todo.id)}>',
            '+                  {todo.completed ? <Check /> : <Circle />}',
            '+                </Button>',
            '                 <div className="flex-1">',
            '                   <p className="text-white">',
            '                     {todo.text}',
            '                   </p>',
            '                 </div>',
            '               </div>'
          ]
        }
      ];

      const result = applyDiffHunks(original, hunks);

      expect(result).toContain('Button');
      expect(result).toContain('handleToggleTodo');
      expect(result).toContain('Check');
      expect(result).toContain('Circle');
      expect(result).toContain('className={`flex items-center ${todo.completed ? \'opacity-70\' : \'\'}`}');
    });
  });

  describe('parseUnifiedDiff', () => {
    it('should parse a simple unified diff', () => {
      const unifiedDiff = `@@ -1,3 +1,4 @@
 line1
+line1.5
 line2
 line3`;

      const hunks = parseUnifiedDiff(unifiedDiff);

      expect(hunks).toHaveLength(1);
      expect(hunks[0].oldStart).toBe(1);
      expect(hunks[0].oldLines).toBe(3);
      expect(hunks[0].newStart).toBe(1);
      expect(hunks[0].newLines).toBe(4);
      expect(hunks[0].lines).toEqual([
        ' line1',
        '+line1.5',
        ' line2',
        ' line3'
      ]);
    });

    it('should parse multiple hunks', () => {
      const unifiedDiff = `@@ -1,2 +1,3 @@
 line1
+line1.5
 line2
@@ -10,2 +11,3 @@
 line10
+line10.5
 line11`;

      const hunks = parseUnifiedDiff(unifiedDiff);

      expect(hunks).toHaveLength(2);
      expect(hunks[0].oldStart).toBe(1);
      expect(hunks[1].oldStart).toBe(10);
    });
  });

  describe('generateDiff', () => {
    it('should generate diff for simple addition', () => {
      const original = 'line1\nline2\nline3';
      const modified = 'line1\nline2\nline3\nline4';
      const filename = 'test.txt';

      const diff = generateDiff(original, modified, filename);

      expect(diff.filename).toBe(filename);
      expect(diff.hunks).toHaveLength(1);
      expect(diff.hunks[0].lines).toContain('+line4');
    });

    it('should generate diff for simple deletion', () => {
      const original = 'line1\nline2\nline3';
      const modified = 'line1\nline3';
      const filename = 'test.txt';

      const diff = generateDiff(original, modified, filename);

      expect(diff.filename).toBe(filename);
      expect(diff.hunks).toHaveLength(1);
      expect(diff.hunks[0].lines).toContain('-line2');
    });

    it('should generate diff for modification', () => {
      const original = 'line1\nline2\nline3';
      const modified = 'line1\nmodified line2\nline3';
      const filename = 'test.txt';

      const diff = generateDiff(original, modified, filename);

      expect(diff.filename).toBe(filename);
      expect(diff.hunks).toHaveLength(1);
      expect(diff.hunks[0].lines).toContain('-line2');
      expect(diff.hunks[0].lines).toContain('+modified line2');
    });
  });

  describe('applyDiffToContent', () => {
    it('should apply diff with addition', () => {
      const original = 'line1\nline2\nline3';
      const unifiedDiff = '@@ -3,1 +3,2 @@\n line3\n+line4';

      const result = applyDiffToContent(original, unifiedDiff);

      expect(result).toBe('line1\nline2\nline3\nline4');
    });

    it('should apply diff with deletion', () => {
      const original = 'line1\nline2\nline3';
      const unifiedDiff = '@@ -2,1 +2,0 @@\n-line2';

      const result = applyDiffToContent(original, unifiedDiff);

      expect(result).toBe('line1\nline3');
    });

    it('should apply diff with modification', () => {
      const original = 'line1\nline2\nline3';
      const unifiedDiff = '@@ -2,1 +2,1 @@\n-line2\n+modified line2';

      const result = applyDiffToContent(original, unifiedDiff);

      expect(result).toBe('line1\nmodified line2\nline3');
    });
  });

  describe('validateDiff', () => {
    it('should validate correct diff', () => {
      const diff = {
        filename: 'test.txt',
        hunks: [{
          oldStart: 1,
          oldLines: 1,
          newStart: 1,
          newLines: 1,
          lines: ['+test']
        }],
        unifiedDiff: 'test'
      };

      expect(validateDiff(diff)).toBe(true);
    });

    it('should reject diff with invalid hunks', () => {
      const diff = {
        filename: 'test.txt',
        hunks: [{
          oldStart: 0, // Invalid: should be > 0
          oldLines: 1,
          newStart: 1,
          newLines: 1,
          lines: ['+test']
        }],
        unifiedDiff: 'test'
      };

      expect(validateDiff(diff)).toBe(false);
    });

    it('should reject diff with non-array hunks', () => {
      const diff = {
        filename: 'test.txt',
        hunks: 'not an array',
        unifiedDiff: 'test'
      } as unknown as { filename: string; hunks: DiffHunk[]; unifiedDiff: string }; // Type assertion matching FileDiff interface

      expect(validateDiff(diff)).toBe(false);
    });
  });

  describe('createMinimalDiff', () => {
    it('should create minimal diff with context', () => {
      const original = 'line1\nline2\nline3\nline4\nline5';
      const modified = 'line1\nline2\nmodified line3\nline4\nline5';
      const filename = 'test.txt';

      const diff = createMinimalDiff(original, modified, filename, 1);

      expect(diff.filename).toBe(filename);
      expect(diff.hunks).toHaveLength(1);
      expect(diff.hunks[0].lines).toContain('-line3');
      expect(diff.hunks[0].lines).toContain('+modified line3');
    });
  });

  describe('getDiffStats', () => {
    it('should calculate correct statistics', () => {
      const diff = {
        filename: 'test.txt',
        hunks: [{
          oldStart: 1,
          oldLines: 2,
          newStart: 1,
          newLines: 3,
          lines: ['+added1', '-removed1', '+added2', ' context']
        }],
        unifiedDiff: 'test'
      };

      const stats = getDiffStats(diff);

      expect(stats.additions).toBe(2);
      expect(stats.deletions).toBe(1);
      expect(stats.hunks).toBe(1);
    });
  });
});
