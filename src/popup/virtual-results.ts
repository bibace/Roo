export interface VirtualResultWindow {
  firstVisibleIndex: number;
  lastVisibleIndex: number;
  startIndex: number;
  endIndex: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
}

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function getVirtualResultWindow(
  resultCount: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  overscan: number,
): VirtualResultWindow {
  const count = nonNegativeInteger(resultCount);
  const viewport = nonNegativeInteger(viewportHeight);
  const row = Math.max(1, nonNegativeInteger(rowHeight));
  const extraRows = nonNegativeInteger(overscan);
  const totalHeight = count * row;
  const maxScrollTop = Math.max(0, totalHeight - viewport);
  const normalizedScrollTop = Math.min(
    maxScrollTop,
    nonNegativeInteger(scrollTop),
  );

  if (count === 0) {
    return {
      firstVisibleIndex: 0,
      lastVisibleIndex: -1,
      startIndex: 0,
      endIndex: 0,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    };
  }

  const firstVisibleIndex = Math.min(count - 1, Math.floor(normalizedScrollTop / row));
  const lastVisibleIndex = Math.min(
    count - 1,
    Math.max(
      firstVisibleIndex,
      Math.ceil((normalizedScrollTop + viewport) / row) - 1,
    ),
  );
  const startIndex = Math.max(0, firstVisibleIndex - extraRows);
  const endIndex = Math.min(count, lastVisibleIndex + 1 + extraRows);

  return {
    firstVisibleIndex,
    lastVisibleIndex,
    startIndex,
    endIndex,
    topSpacerHeight: startIndex * row,
    bottomSpacerHeight: (count - endIndex) * row,
  };
}
