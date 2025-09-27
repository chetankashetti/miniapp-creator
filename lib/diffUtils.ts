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
 * Apply unified diff string to original content
 */
export function applyDiffToContent(
  originalContent: string,
  unifiedDiff: string
): string {
  try {
    // Parse the unified diff string into hunks
    const hunks = parseUnifiedDiff(unifiedDiff);
    return applyDiffHunks(originalContent, hunks);
  } catch (error) {
    console.error('Error applying unified diff:', error);
    throw new Error(`Failed to apply unified diff: ${error}`);
  }
}

/**
 * Parse unified diff string into hunks
 */
export function parseUnifiedDiff(unifiedDiff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = unifiedDiff.split('\n');
  
  let currentHunk: DiffHunk | null = null;
  
  for (const line of lines) {
    if (line.startsWith('@@')) {
      // Save previous hunk if exists
      if (currentHunk) {
        hunks.push(currentHunk);
      }
      
      // Parse hunk header: @@ -oldStart,oldLines +newStart,newLines @@
      const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      if (match) {
        currentHunk = {
          oldStart: parseInt(match[1]),
          oldLines: parseInt(match[2]) || 0,
          newStart: parseInt(match[3]),
          newLines: parseInt(match[4]) || 0,
          lines: []
        };
      }
    } else if (currentHunk) {
      currentHunk.lines.push(line);
    }
  }
  
  // Add the last hunk
  if (currentHunk) {
    hunks.push(currentHunk);
  }
  
  return hunks;
}

/**
 * Find the best contextual match for a line when exact match fails
 */
function findBestContextualMatch(
  lines: string[],
  targetLine: string,
  expectedIndex: number,
  contextLines: string[]
): { index: number; reason: string } {
  const targetTrimmed = targetLine.trim();
  
  // Strategy 1: Look for exact content match within reasonable distance
  const searchRadius = Math.min(50, lines.length / 4); // Search within 50 lines or 25% of file
  const searchStart = Math.max(0, expectedIndex - searchRadius);
  const searchEnd = Math.min(lines.length, expectedIndex + searchRadius);
  
  for (let i = searchStart; i < searchEnd; i++) {
    if (lines[i] && lines[i].trim() === targetTrimmed) {
      const distance = Math.abs(i - expectedIndex);
      return { index: i, reason: `exact content match (distance: ${distance})` };
    }
  }
  
  // Strategy 2: Look for partial content match (key-based) within reasonable distance
  const keyToReplace = targetLine.split(':')[0].trim() || targetLine.split('=')[0].trim() || targetLine.split(' ')[0].trim();
  
  let bestKeyMatch = { index: -1, distance: Infinity, reason: '' };
  
  for (let i = searchStart; i < searchEnd; i++) {
    if (lines[i] && lines[i].includes(keyToReplace)) {
      const distance = Math.abs(i - expectedIndex);
      if (distance < bestKeyMatch.distance) {
        bestKeyMatch = { index: i, distance, reason: `key match "${keyToReplace}" (distance: ${distance})` };
      }
    }
  }
  
  if (bestKeyMatch.index !== -1) {
    return bestKeyMatch;
  }
  
  // Strategy 3: Look for context-based match using surrounding lines
  // Extract context from the diff hunk
  const contextBefore = contextLines.filter(line => !line.startsWith('+') && !line.startsWith('-')).slice(0, 2);
  const contextAfter = contextLines.filter(line => !line.startsWith('+') && !line.startsWith('-')).slice(-2);
  
  let bestContextMatch = { index: -1, score: 0, reason: '' };
  
  for (let i = 0; i < lines.length - contextBefore.length - contextAfter.length; i++) {
    let score = 0;
    
    // Check context before
    for (let j = 0; j < contextBefore.length; j++) {
      if (lines[i + j] && lines[i + j].trim() === contextBefore[j].trim()) {
        score += 1;
      }
    }
    
    // Check context after
    for (let j = 0; j < contextAfter.length; j++) {
      if (lines[i + contextBefore.length + 1 + j] && 
          lines[i + contextBefore.length + 1 + j].trim() === contextAfter[j].trim()) {
        score += 1;
      }
    }
    
    if (score > bestContextMatch.score) {
      bestContextMatch = { 
        index: i + contextBefore.length, 
        score, 
        reason: `context match (score: ${score}/${contextBefore.length + contextAfter.length})` 
      };
    }
  }
  
  if (bestContextMatch.score > 0) {
    return bestContextMatch;
  }
  
  return { index: -1, reason: 'no suitable match found' };
}

/**
 * Apply diff hunks to original content
 */
export function applyDiffHunks(
  originalContent: string,
  diffHunks: DiffHunk[]
): string {
  try {
    const lines = originalContent.split('\n');
    const result: string[] = [...lines];
    
    // Process hunks in reverse order to maintain line numbers
    const sortedHunks = [...diffHunks].sort((a, b) => b.oldStart - a.oldStart);
    
    for (let hunkIndex = 0; hunkIndex < sortedHunks.length; hunkIndex++) {
      const hunk = sortedHunks[hunkIndex];
      const startIndex = hunk.oldStart - 1; // Convert to 0-based index
      
      // Process lines in order to build the replacement
      const linesToRemove: string[] = [];
      const linesToAdd: string[] = [];
      
      for (const line of hunk.lines) {
        if (line.startsWith('-')) {
          // Mark line for removal
          const lineToRemove = line.substring(1);
          linesToRemove.push(lineToRemove);
        } else if (line.startsWith('+')) {
          // Add new line
          const lineToAdd = line.substring(1);
          linesToAdd.push(lineToAdd);
        }
      }
      
      // Find the exact lines to remove and replace them
      if (linesToRemove.length > 0) {
        // Find the first occurrence of the line to remove
        let removeIndex = -1;
        for (let i = startIndex; i < Math.min(startIndex + linesToRemove.length, result.length); i++) {
          const currentLine = result[i] || '';
          const targetLine = linesToRemove[0];
          const match = currentLine.trim() === targetLine.trim();
          
          if (match) {
            removeIndex = i;
            break;
          }
        }
        
        if (removeIndex !== -1) {
          // Remove the old lines
          result.splice(removeIndex, linesToRemove.length);
          
          // Insert new lines at the same position
          if (linesToAdd.length > 0) {
            result.splice(removeIndex, 0, ...linesToAdd);
          }
        } else {
          // Enhanced fallback: find the best contextual match
          let bestMatch = findBestContextualMatch(result, linesToRemove[0], startIndex, hunk.lines);
          
          if (bestMatch.index !== -1) {
            // Remove the matched line
            result.splice(bestMatch.index, 1);
            // Insert new lines at the same position
            if (linesToAdd.length > 0) {
              result.splice(bestMatch.index, 0, ...linesToAdd);
            }
          } else {
            if (linesToAdd.length > 0) {
              result.splice(startIndex, 0, ...linesToAdd);
            }
          }
        }
      } else if (linesToAdd.length > 0) {
        // No lines to remove, just add new lines after the specified position
        result.splice(startIndex + 1, 0, ...linesToAdd);
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

