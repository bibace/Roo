import { describe, expect, it } from 'vitest';
import { getVirtualResultWindow } from './virtual-results';

const rowHeight = 34;
const viewportHeight = 100;
const overscan = 4;

describe('getVirtualResultWindow', () => {
  it('returns an empty window for zero results', () => {
    expect(getVirtualResultWindow(0, 0, 360, rowHeight, overscan)).toEqual({
      firstVisibleIndex: 0,
      lastVisibleIndex: -1,
      startIndex: 0,
      endIndex: 0,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    });
  });

  it('renders one result without spacers', () => {
    expect(getVirtualResultWindow(1, 0, 360, rowHeight, overscan)).toEqual({
      firstVisibleIndex: 0,
      lastVisibleIndex: 0,
      startIndex: 0,
      endIndex: 1,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    });
  });

  it('clips the visible window when the result count is smaller than the viewport', () => {
    expect(getVirtualResultWindow(5, 0, 360, rowHeight, overscan)).toEqual({
      firstVisibleIndex: 0,
      lastVisibleIndex: 4,
      startIndex: 0,
      endIndex: 5,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    });
  });

  it('clips overscan at the top of a long list', () => {
    expect(getVirtualResultWindow(100, 0, viewportHeight, rowHeight, overscan)).toEqual({
      firstVisibleIndex: 0,
      lastVisibleIndex: 2,
      startIndex: 0,
      endIndex: 7,
      topSpacerHeight: 0,
      bottomSpacerHeight: 3162,
    });
  });

  it('calculates the middle window and exact spacer heights', () => {
    expect(getVirtualResultWindow(100, 1000, viewportHeight, rowHeight, overscan)).toEqual({
      firstVisibleIndex: 29,
      lastVisibleIndex: 32,
      startIndex: 25,
      endIndex: 37,
      topSpacerHeight: 850,
      bottomSpacerHeight: 2142,
    });
  });

  it('clips overscan at the bottom and normalizes an excessive scrollTop', () => {
    expect(getVirtualResultWindow(100, 99999, viewportHeight, rowHeight, overscan)).toEqual({
      firstVisibleIndex: 97,
      lastVisibleIndex: 99,
      startIndex: 93,
      endIndex: 100,
      topSpacerHeight: 3162,
      bottomSpacerHeight: 0,
    });
  });

  it('normalizes a negative scrollTop to the top of the list', () => {
    expect(getVirtualResultWindow(100, -25, viewportHeight, rowHeight, overscan)).toEqual(
      getVirtualResultWindow(100, 0, viewportHeight, rowHeight, overscan),
    );
  });
});
