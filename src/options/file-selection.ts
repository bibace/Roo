export function nextFileSelectionGeneration(currentGeneration: number): number {
  return currentGeneration + 1;
}

export function isCurrentFileSelection(
  selectionGeneration: number,
  latestGeneration: number,
): boolean {
  return selectionGeneration === latestGeneration;
}
