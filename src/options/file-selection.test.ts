import { describe, expect, it } from 'vitest';
import { isCurrentFileSelection, nextFileSelectionGeneration } from './file-selection';

describe('file selection generations', () => {
  it('ignores an older read after a newer selection starts', () => {
    const generationA = nextFileSelectionGeneration(0);
    const generationB = nextFileSelectionGeneration(generationA);

    expect(isCurrentFileSelection(generationA, generationB)).toBe(false);
    expect(isCurrentFileSelection(generationB, generationB)).toBe(true);
  });

  it('gives repeated selections, including the same file, a new generation', () => {
    const firstSelection = nextFileSelectionGeneration(4);
    const secondSelection = nextFileSelectionGeneration(firstSelection);

    expect(secondSelection).not.toBe(firstSelection);
    expect(isCurrentFileSelection(firstSelection, secondSelection)).toBe(false);
    expect(isCurrentFileSelection(secondSelection, secondSelection)).toBe(true);
  });
});
