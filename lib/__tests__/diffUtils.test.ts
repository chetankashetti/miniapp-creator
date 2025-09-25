import { generateDiff, applyDiffToContent, validateDiff, createMinimalDiff, getDiffStats } from '../diffUtils';

describe('diffUtils', () => {
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
      const hunks = [{
        oldStart: 3,
        oldLines: 0,
        newStart: 3,
        newLines: 1,
        lines: ['+line4']
      }];

      const result = applyDiffToContent(original, hunks);

      expect(result).toBe('line1\nline2\nline3\nline4');
    });

    it('should apply diff with deletion', () => {
      const original = 'line1\nline2\nline3';
      const hunks = [{
        oldStart: 2,
        oldLines: 1,
        newStart: 2,
        newLines: 0,
        lines: ['-line2']
      }];

      const result = applyDiffToContent(original, hunks);

      expect(result).toBe('line1\nline3');
    });

    it('should apply diff with modification', () => {
      const original = 'line1\nline2\nline3';
      const hunks = [{
        oldStart: 2,
        oldLines: 1,
        newStart: 2,
        newLines: 1,
        lines: ['-line2', '+modified line2']
      }];

      const result = applyDiffToContent(original, hunks);

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
      } as unknown as Diff; // Type assertion to test invalid input

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
