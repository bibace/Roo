import { describe, expect, it } from 'vitest';
import { getInitialSelectedIndex, moveSelection } from './selection';

describe('popup selection', () => {
  it('uses no active result for an empty result set', () => {
    expect(getInitialSelectedIndex(0)).toBe(-1);
    expect(moveSelection(0, 0, 'up')).toBe(-1);
    expect(moveSelection(0, 0, 'down')).toBe(-1);
  });

  it('activates the first result when results are available', () => {
    expect(getInitialSelectedIndex(2)).toBe(0);
  });

  it('moves within the result set without wrapping', () => {
    expect(moveSelection(0, 3, 'up')).toBe(0);
    expect(moveSelection(0, 3, 'down')).toBe(1);
    expect(moveSelection(2, 3, 'down')).toBe(2);
    expect(moveSelection(2, 3, 'up')).toBe(1);
  });
});
