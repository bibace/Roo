import type { CatalogMutationToken } from '../workspace/types';
import type { ConfigurationStaleState } from './configuration-draft';

export interface StaleImportCandidateState {
  expectedCatalogToken: CatalogMutationToken;
  staleState?: ConfigurationStaleState;
}

export function markImportCandidateNeedsRefresh<T extends StaleImportCandidateState>(
  candidate: T,
): T {
  return {
    ...candidate,
    staleState: { status: 'needs-refresh' },
  };
}

export function markImportCandidateStale<T extends StaleImportCandidateState>(
  candidate: T,
  latestCatalogToken: CatalogMutationToken,
): T {
  return {
    ...candidate,
    staleState: { status: 'needs-review', latestCatalogToken },
  };
}

export function reviewImportCandidate<T extends StaleImportCandidateState>(candidate: T): T {
  if (candidate.staleState?.status !== 'needs-review') {
    return candidate;
  }

  return {
    ...candidate,
    expectedCatalogToken: candidate.staleState.latestCatalogToken,
    staleState: undefined,
  };
}
