export type SelectionDirection = 'up' | 'down';

export function getInitialSelectedIndex(resultCount: number): number {
  return resultCount > 0 ? 0 : -1;
}

export function moveSelection(
  currentIndex: number,
  resultCount: number,
  direction: SelectionDirection,
): number {
  if (resultCount <= 0) {
    return -1;
  }

  if (currentIndex < 0) {
    return 0;
  }

  const lastIndex = resultCount - 1;
  const boundedIndex = Math.min(currentIndex, lastIndex);

  if (direction === 'down') {
    return Math.min(boundedIndex + 1, lastIndex);
  }

  return Math.max(boundedIndex - 1, 0);
}
