import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import ConfigurationEditorSession from './configuration-editor-session';
import type { ConfigurationDraft } from './configuration-draft';

const validDraft: ConfigurationDraft = {
  origin: 'edit',
  source: { kind: 'created' },
  fileName: 'roo.yaml',
  sourceText: 'version: 1\nprojects: {}\n',
  expectedCatalogToken: { kind: 'ready', catalogVersion: 1 },
};

function renderSession(draft: ConfigurationDraft): string {
  return renderToStaticMarkup(
    <ConfigurationEditorSession
      draft={draft}
      isMutating={false}
      saveError={null}
      saveValidationError={null}
      onDraftChange={vi.fn()}
      onCancel={vi.fn()}
      onSave={vi.fn()}
      onRetryLatest={vi.fn()}
      onReviewLatest={vi.fn()}
    />,
  );
}

describe('ConfigurationEditorSession stale surface', () => {
  it('shows Retry latest configuration and disables Save for needs-refresh', () => {
    const markup = renderSession({
      ...validDraft,
      staleState: { status: 'needs-refresh' },
    });

    expect(markup).toContain('Retry latest configuration');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Save configuration<\/button>/);
  });

  it('shows Review latest and disables Save for needs-review', () => {
    const markup = renderSession({
      ...validDraft,
      staleState: {
        status: 'needs-review',
        latestCatalogToken: { kind: 'ready', catalogVersion: 2 },
      },
    });

    expect(markup).toContain('Review latest');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Save configuration<\/button>/);
  });

  it('shows no stale recovery buttons for a normal valid draft', () => {
    const markup = renderSession(validDraft);

    expect(markup).not.toContain('Retry latest configuration');
    expect(markup).not.toContain('Review latest');
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>Save configuration<\/button>/);
  });
});

describe('ConfigurationEditorSession lifecycle surface', () => {
  it('shows Clear only for editing a Roo-created configuration', () => {
    expect(renderSession(validDraft)).toContain('Clear configuration');
    expect(renderSession({ ...validDraft, origin: 'new' })).not.toContain('Clear configuration');
  });

  it.each([
    { origin: 'upload' as const, fileName: 'team.json' },
    { origin: 'edit' as const, fileName: 'team.json' },
    { origin: 'edit' as const, fileName: 'roo.yaml' },
  ])('preserves uploaded provenance without Clear for $origin $fileName', ({ origin, fileName }) => {
    const markup = renderSession({
      ...validDraft,
      origin,
      source: { kind: 'uploaded', fileName },
      fileName: fileName.replace(/\.(json|yml)$/, '.yaml'),
    });

    expect(markup).toContain(`Uploaded from ${fileName}`);
    expect(markup).not.toContain('Clear configuration');
  });
});
