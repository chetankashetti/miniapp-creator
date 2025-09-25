import { createPatch, parsePatch } from 'diff';

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface FileDiff {
  filename: string;
  hunks: DiffHunk[];
  unifiedDiff: string;
}

/**
 * Generate a unified diff between original and new content
 */
export function generateDiff(
  originalContent: string,
  newContent: string,
  filename: string
): FileDiff {
  try {
    const unifiedDiff = createPatch(filename, originalContent, newContent);
    const parsedPatches = parsePatch(unifiedDiff);
    const hunks = parsedPatches?.[0]?.hunks || [];
    
    return {
      filename,
      hunks,
      unifiedDiff
    };
  } catch (error) {
    console.error('Error generating diff:', error);
    throw new Error(`Failed to generate diff for ${filename}: ${error}`);
  }
}

/**
 * Apply diff hunks to original content
 */
export function applyDiffToContent(
  originalContent: string,
  diffHunks: DiffHunk[]
): string {
  try {
    const lines = originalContent.split('\n');
    const result: string[] = [...lines];
    
    // Process hunks in reverse order to maintain line numbers
    const sortedHunks = [...diffHunks].sort((a, b) => b.oldStart - a.oldStart);
    
    for (const hunk of sortedHunks) {
      const startIndex = hunk.oldStart - 1; // Convert to 0-based index
      
      // Process lines in order
      let linesToRemove = 0;
      const linesToAdd: string[] = [];
      
      for (const line of hunk.lines) {
        if (line.startsWith('-')) {
          // Mark line for removal
          linesToRemove++;
        } else if (line.startsWith('+')) {
          // Add new line
          linesToAdd.push(line.substring(1));
        } else {
          // Context line - no action needed
        }
      }
      
      // Remove old lines
      if (linesToRemove > 0) {
        result.splice(startIndex, linesToRemove);
      }
      
      // Add new lines - if oldLines is 0, insert after the start position
      if (linesToAdd.length > 0) {
        const insertIndex = hunk.oldLines === 0 ? startIndex + 1 : startIndex;
        result.splice(insertIndex, 0, ...linesToAdd);
      }
    }
    
    return result.join('\n');
  } catch (error) {
    console.error('Error applying diff:', error);
    throw new Error(`Failed to apply diff: ${error}`);
  }
}

/**
 * Validate diff structure and syntax
 */
export function validateDiff(diff: FileDiff): boolean {
  try {
    // Check if hunks array exists and is valid
    if (!Array.isArray(diff.hunks)) {
      return false;
    }

    // Validate each hunk
    return diff.hunks.every(hunk => 
      typeof hunk.oldStart === 'number' && hunk.oldStart > 0 &&
      typeof hunk.newStart === 'number' && hunk.newStart > 0 &&
      typeof hunk.oldLines === 'number' && hunk.oldLines >= 0 &&
      typeof hunk.newLines === 'number' && hunk.newLines >= 0 &&
      Array.isArray(hunk.lines)
    );
  } catch (error) {
    console.error('Error validating diff:', error);
    return false;
  }
}

/**
 * Create a minimal diff with context lines
 */
export function createMinimalDiff(
  originalContent: string,
  newContent: string,
  filename: string,
  contextLines: number = 3
): FileDiff {
  const lines = originalContent.split('\n');
  const newLines = newContent.split('\n');
  
  // Find the differences
  const changes: Array<{
    type: 'add' | 'remove' | 'context';
    line: string;
    lineNumber: number;
  }> = [];

  let i = 0, j = 0;
  while (i < lines.length || j < newLines.length) {
    if (i >= lines.length) {
      // Addition
      changes.push({
        type: 'add',
        line: newLines[j],
        lineNumber: j + 1
      });
      j++;
    } else if (j >= newLines.length) {
      // Removal
      changes.push({
        type: 'remove',
        line: lines[i],
        lineNumber: i + 1
      });
      i++;
    } else if (lines[i] === newLines[j]) {
      // Context
      changes.push({
        type: 'context',
        line: lines[i],
        lineNumber: i + 1
      });
      i++;
      j++;
    } else {
      // Find the best match
      let found = false;
      for (let k = 1; k <= 10 && j + k < newLines.length; k++) {
        if (lines[i] === newLines[j + k]) {
          // Additions
          for (let l = 0; l < k; l++) {
            changes.push({
              type: 'add',
              line: newLines[j + l],
              lineNumber: j + l + 1
            });
          }
          j += k;
          found = true;
          break;
        }
      }
      
      if (!found) {
        // Removal
        changes.push({
          type: 'remove',
          line: lines[i],
          lineNumber: i + 1
        });
        i++;
      }
    }
  }

  // Group changes into hunks
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let contextCount = 0;

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    
    if (change.type === 'context') {
      contextCount++;
      if (contextCount > contextLines * 2 && currentHunk) {
        // End current hunk
        hunks.push(currentHunk);
        currentHunk = null;
        contextCount = 0;
      }
    } else {
      if (!currentHunk) {
        // Start new hunk
        const startLine = Math.max(1, change.lineNumber - contextLines);
        currentHunk = {
          oldStart: startLine,
          oldLines: 0,
          newStart: startLine,
          newLines: 0,
          lines: []
        };
      }
      
      if (change.type === 'remove') {
        currentHunk.lines.push(`-${change.line}`);
        currentHunk.oldLines++;
      } else if (change.type === 'add') {
        currentHunk.lines.push(`+${change.line}`);
        currentHunk.newLines++;
      }
      
      contextCount = 0;
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return {
    filename,
    hunks,
    unifiedDiff: createPatch(filename, originalContent, newContent)
  };
}

/**
 * Get diff statistics
 */
export function getDiffStats(diff: FileDiff): {
  additions: number;
  deletions: number;
  hunks: number;
} {
  let additions = 0;
  let deletions = 0;

  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith('+')) {
        additions++;
      } else if (line.startsWith('-')) {
        deletions++;
      }
    }
  }

  return {
    additions,
    deletions,
    hunks: diff.hunks.length
  };
}
