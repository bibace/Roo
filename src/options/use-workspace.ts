import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { getWorkspace } from '../workspace/client';
import { hasRelevantWorkspaceStorageChange } from '../workspace/storage-change';
import type { WorkspaceView } from '../workspace/types';

export type WorkspaceLoadState =
  | { status: 'loading' }
  | { status: 'ready'; workspace: WorkspaceView }
  | { status: 'error' };

export function getWorkspaceRefreshFailureState(
  state: WorkspaceLoadState,
): WorkspaceLoadState {
  return state.status === 'ready' ? state : { status: 'error' };
}

export function useWorkspace() {
  const [state, setState] = useState<WorkspaceLoadState>({ status: 'loading' });
  const requestGenerationRef = useRef(0);

  const refresh = useCallback(async (): Promise<WorkspaceView> => {
    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;

    try {
      const workspace = await getWorkspace();

      if (requestGeneration === requestGenerationRef.current) {
        setState({ status: 'ready', workspace });
      }

      return workspace;
    } catch (error) {
      if (requestGeneration === requestGenerationRef.current) {
        setState(getWorkspaceRefreshFailureState);
      }

      throw error;
    }
  }, []);

  const acceptWorkspace = useCallback((workspace: WorkspaceView) => {
    requestGenerationRef.current += 1;
    setState({ status: 'ready', workspace });
  }, []);

  useEffect(() => {
    void refresh().catch(() => undefined);

    const handleStorageChange = (changes: { [key: string]: unknown }) => {
      if (hasRelevantWorkspaceStorageChange(changes)) {
        void refresh().catch(() => undefined);
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);

    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [refresh]);

  return { state, refresh, acceptWorkspace };
}
