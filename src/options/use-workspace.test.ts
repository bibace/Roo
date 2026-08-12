import { describe, expect, it } from 'vitest';
import type { WorkspaceView } from '../workspace/types';
import {
  getWorkspaceRefreshFailureState,
  type WorkspaceLoadState,
} from './use-workspace';

describe('Workspace refresh failure transition', () => {
  it('moves loading to error', () => {
    expect(getWorkspaceRefreshFailureState({ status: 'loading' })).toEqual({ status: 'error' });
  });

  it('preserves the same ready state', () => {
    const ready: WorkspaceLoadState = {
      status: 'ready',
      workspace: { status: 'ready' } as WorkspaceView,
    };

    expect(getWorkspaceRefreshFailureState(ready)).toBe(ready);
  });

  it('keeps error as error', () => {
    expect(getWorkspaceRefreshFailureState({ status: 'error' })).toEqual({ status: 'error' });
  });
});
