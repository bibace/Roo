import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JumpTarget } from '../../src/domain/jump-target';
import { AwsJumpError } from '../../src/navigation/aws-jump-error';

const { openJumpTarget } = vi.hoisted(() => ({
  openJumpTarget: vi.fn(),
}));

vi.mock('../../src/popup/open-jump-target', () => ({
  openJumpTarget,
}));

import App, { activateJumpTarget, ActivationErrorNotice } from '../../entrypoints/popup/App';

const controlledQueryProps = {
  query: '',
  onQueryChange: vi.fn(),
};

function makeTarget(overrides: Partial<JumpTarget> = {}): JumpTarget {
  return {
    accountId: '123456789012',
    accountName: 'atlas-prod',
    project: 'atlas',
    environment: 'prod',
    role: 'platform/security-readonly',
    roleShortName: 'security-readonly',
    ...overrides,
  };
}

describe('popup App', () => {
  beforeEach(() => {
    openJumpTarget.mockReset();
  });

  it('starts with a focused search surface and no placeholder copy', () => {
    const markup = renderToStaticMarkup(
      <App {...controlledQueryProps} catalogStatus="ready" targets={[]} />,
    );

    expect(markup).toContain('aria-label="Search AWS destinations"');
    expect(markup).toContain('placeholder="Search"');
    expect(markup).toContain('autofocus=""');
    expect(markup).toContain('Settings');
    expect(markup).toContain('0 accounts · 0 roles');
    expect(markup).not.toContain('<h1');
    expect(markup).not.toContain('Extension foundation ready.');
    expect(markup).not.toContain('No configuration imported.');
    expect(markup).not.toContain('Configuration needs attention.');
  });

  it('keeps Search interactive and hides final catalog content while loading', () => {
    const markup = renderToStaticMarkup(
      <App
        {...controlledQueryProps}
        loading
        catalogStatus="empty"
        targets={[]}
        summary={{ accounts: 0, roles: 0 }}
        searchEnabled
      />,
    );

    expect(markup).toContain('autofocus=""');
    expect(markup).not.toContain('disabled=""');
    expect(markup).toContain('Loading…');
    expect(markup).not.toContain('0 accounts · 0 roles');
    expect(markup).not.toContain('No configuration imported.');
    expect(markup).not.toContain('Configuration needs attention.');
  });

  it('shows the empty catalog status and keeps Settings available', () => {
    const markup = renderToStaticMarkup(
      <App {...controlledQueryProps} catalogStatus="empty" targets={[]} />,
    );

    expect(markup).toContain('No configuration imported.');
    expect(markup).toContain('Settings');
    expect(markup).not.toContain('Configuration needs attention.');
    expect(markup).not.toContain('<h1');
  });

  it('distinguishes a ready Configuration with zero destinations from no Configuration', () => {
    const markup = renderToStaticMarkup(
      <App
        {...controlledQueryProps}
        catalogStatus="ready"
        targets={[]}
        summary={{ accounts: 0, roles: 0 }}
        searchEnabled
      />,
    );

    expect(markup).toContain('0 accounts · 0 roles');
    expect(markup).toContain('No AWS destinations configured.');
    expect(markup).not.toContain('No configuration imported.');
  });

  it('preserves the organization-specific zero-destination message', () => {
    const markup = renderToStaticMarkup(
      <App
        {...controlledQueryProps}
        catalogStatus="ready"
        targets={[]}
        summary={{ accounts: 0, roles: 0 }}
        contextMessage="No destinations configured for this organization."
      />,
    );

    expect(markup).toContain('No destinations configured for this organization.');
    expect(markup).not.toContain('No AWS destinations configured.');
    expect(markup).not.toContain('No configuration imported.');
  });

  it('shows the invalid catalog status and keeps Settings available', () => {
    const markup = renderToStaticMarkup(
      <App {...controlledQueryProps} catalogStatus="invalid" targets={[]} />,
    );

    expect(markup).toContain('Configuration needs attention.');
    expect(markup).toContain('Settings');
    expect(markup).not.toContain('No configuration imported.');
    expect(markup).not.toContain('<h1');
  });

  it('shows effective account and role statistics below the Search input', () => {
    const markup = renderToStaticMarkup(
      <App
        {...controlledQueryProps}
        catalogStatus="ready"
        targets={[
          makeTarget(),
          makeTarget({ role: 'platform/security-admin', roleShortName: 'security-admin' }),
          makeTarget({ accountId: '222222222222', accountName: 'nova-prod' }),
        ]}
      />,
    );

    expect(markup).toContain('2 accounts · 3 roles');
    expect(markup.indexOf('search-input')).toBeLessThan(markup.indexOf('catalog-statistics'));
    expect(markup).not.toContain('<h1');
  });

  it('includes supplied effective targets in statistics without requiring an imported catalog', () => {
    const markup = renderToStaticMarkup(
      <App
        {...controlledQueryProps}
        catalogStatus="ready"
        targets={[makeTarget({ accountName: 'local-dev' })]}
      />,
    );

    expect(markup).toContain('1 accounts · 1 roles');
    expect(markup).not.toContain('No configuration imported.');
  });

  it('disables search and hides rows when organization context is unavailable', () => {
    const markup = renderToStaticMarkup(
      <App
        {...controlledQueryProps}
        catalogStatus="ready"
        targets={[makeTarget()]}
        summary={{ accounts: 0, roles: 0 }}
        searchEnabled={false}
        contextMessage="Unable to determine the current AWS account."
      />,
    );

    expect(markup).toContain('disabled=""');
    expect(markup).toContain('0 accounts · 0 roles');
    expect(markup).toContain('Unable to determine the current AWS account.');
    expect(markup).not.toContain('result-row');
    expect(markup).toContain('Settings');
  });

  it('successful keyboard activation closes the Popup without an activation error', async () => {
    const close = vi.fn();
    vi.stubGlobal('window', { close });
    openJumpTarget.mockResolvedValue(undefined);

    await expect(activateJumpTarget(makeTarget())).resolves.toBe(true);

    expect(openJumpTarget).toHaveBeenCalledWith(makeTarget());
    expect(close).toHaveBeenCalledTimes(1);
    expect(renderToStaticMarkup(
      <App {...controlledQueryProps} catalogStatus="ready" targets={[makeTarget()]} />,
    )).not.toContain(
      'Unable to open AWS destination.',
    );
    vi.unstubAllGlobals();
  });

  it('successful mouse activation closes the Popup', async () => {
    const close = vi.fn();
    vi.stubGlobal('window', { close });
    openJumpTarget.mockResolvedValue(undefined);

    await expect(activateJumpTarget(makeTarget({ role: 'platform/security-admin' }))).resolves.toBe(true);

    expect(openJumpTarget).toHaveBeenCalledWith(
      makeTarget({ role: 'platform/security-admin' }),
    );
    expect(close).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('failed activation keeps the Popup open and exposes the activation error contract', async () => {
    const close = vi.fn();
    const setActivationError = vi.fn();
    vi.stubGlobal('window', { close });
    openJumpTarget.mockRejectedValue(new AwsJumpError('PRISM_HTTP_FAILED'));

    await expect(activateJumpTarget(makeTarget(), setActivationError)).resolves.toBe(false);

    expect(openJumpTarget).toHaveBeenCalledWith(makeTarget());
    expect(close).not.toHaveBeenCalled();
    expect(setActivationError).toHaveBeenCalledWith('PRISM_HTTP_FAILED');
    expect(setActivationError).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('renders a generic failure message with only the safe diagnostic code', () => {
    const markup = renderToStaticMarkup(<ActivationErrorNotice code="PRISM_RESPONSE_INVALID" />);

    expect(markup).toContain('Unable to open AWS destination.');
    expect(markup).toContain('Diagnostic: PRISM_RESPONSE_INVALID');
    expect(markup).not.toContain('https://');
    expect(markup).not.toContain('account');
    expect(markup).not.toContain('role');
  });
});
