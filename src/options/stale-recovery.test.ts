import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceView } from '../workspace/types';
import { recoverStaleConfigurationDraft } from './stale-recovery';
import { reviewImportCandidate } from './stale-import';

const draft = {
  sourceText: 'version: 1\nprojects: {}\n',
  fileName: 'roo.yaml',
  origin: 'edit' as const,
  source: { kind: 'created' as const },
  expectedCatalogToken: { kind: 'ready' as const, catalogVersion: 1 },
};
const latestToken = { kind: 'ready' as const, catalogVersion: 2 };

describe('stale configuration recovery', () => {
  it('stores the latest token for review after one successful refresh', async () => {
    const refresh = vi.fn().mockResolvedValue({
      catalogToken: latestToken,
    } as WorkspaceView);

    const recovered = await recoverStaleConfigurationDraft(draft, refresh);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(recovered.sourceText).toBe(draft.sourceText);
    expect(recovered.source).toBe(draft.source);
    expect(recovered.expectedCatalogToken).toBe(draft.expectedCatalogToken);
    expect(recovered.staleState).toEqual({
      status: 'needs-review',
      latestCatalogToken: latestToken,
    });
    expect(reviewImportCandidate(recovered).expectedCatalogToken).toBe(latestToken);
  });

  it('keeps needs-refresh and the old token after one failed refresh', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('unavailable'));

    const recovered = await recoverStaleConfigurationDraft(draft, refresh);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(recovered.sourceText).toBe(draft.sourceText);
    expect(recovered.source).toBe(draft.source);
    expect(recovered.expectedCatalogToken).toBe(draft.expectedCatalogToken);
    expect(recovered.staleState).toEqual({ status: 'needs-refresh' });
  });
});
