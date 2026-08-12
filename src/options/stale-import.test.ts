import { describe, expect, it } from 'vitest';
import {
  markImportCandidateNeedsRefresh,
  markImportCandidateStale,
  reviewImportCandidate,
} from './stale-import';
import type { ConfigurationDraft } from './configuration-draft';

const candidate: ConfigurationDraft = {
  sourceText: 'version: 1\nprojects: {}\n',
  fileName: 'roo.yaml',
  origin: 'edit' as const,
  source: { kind: 'created' as const },
  expectedCatalogToken: { kind: 'ready' as const, catalogVersion: 1 },
};
const latestToken = { kind: 'ready' as const, catalogVersion: 2 };

describe('stale import candidate state', () => {
  it('marks needs-refresh while preserving source and the old expected token', () => {
    const stale = markImportCandidateNeedsRefresh(candidate);

    expect(stale.sourceText).toBe(candidate.sourceText);
    expect(stale.source).toBe(candidate.source);
    expect(stale.expectedCatalogToken).toBe(candidate.expectedCatalogToken);
    expect(stale.staleState).toEqual({ status: 'needs-refresh' });
  });

  it('marks needs-review while preserving source and the old expected token', () => {
    const stale = markImportCandidateStale(candidate, latestToken);

    expect(stale.sourceText).toBe(candidate.sourceText);
    expect(stale.source).toBe(candidate.source);
    expect(stale.expectedCatalogToken).toBe(candidate.expectedCatalogToken);
    expect(stale.staleState).toEqual({
      status: 'needs-review',
      latestCatalogToken: latestToken,
    });
  });

  it('adopts the latest token only from needs-review', () => {
    const stale = markImportCandidateStale(candidate, latestToken);
    const reviewed = reviewImportCandidate(stale);

    expect(reviewed.sourceText).toBe(candidate.sourceText);
    expect(reviewed.source).toBe(candidate.source);
    expect(reviewed.expectedCatalogToken).toBe(latestToken);
    expect(reviewed.staleState).toBeUndefined();
  });

  it('cannot bypass needs-refresh through review', () => {
    const stale = markImportCandidateNeedsRefresh(candidate);

    expect(reviewImportCandidate(stale)).toBe(stale);
    expect(reviewImportCandidate(stale).expectedCatalogToken).toBe(candidate.expectedCatalogToken);
  });
});
