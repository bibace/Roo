import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { JumpTarget } from '../domain/jump-target';
import ResultRow from './result-row';

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

function renderRow(target: JumpTarget, isActive = false, scrollAccountName = false): string {
  return renderToStaticMarkup(
    <ResultRow
      target={target}
      isActive={isActive}
      scrollAccountName={scrollAccountName}
      onActivate={() => undefined}
      onMouseMove={() => undefined}
    />,
  );
}

describe('ResultRow', () => {
  it('renders the account ID, account name, and short role name only', () => {
    const target = makeTarget();
    const markup = renderRow(target);

    expect(markup).toContain(target.accountId);
    expect(markup).toContain(target.accountName);
    expect(markup).toContain(target.roleShortName);
    expect(markup).not.toContain(target.role);
    expect(markup).toContain('type="button"');
  });

  it('exposes the complete account name through the native title', () => {
    const target = makeTarget({
      accountName: 'operations-platform-services-workspace-navigation-production',
    });
    const markup = renderRow(target);

    expect(markup).toContain('class="result-account-name" title="' + target.accountName + '"');
    expect(markup).toContain(target.accountName);
  });

  it('uses the active row state for the whole destination row', () => {
    const markup = renderRow(makeTarget(), true);

    expect(markup).toContain('class="result-row"');
    expect(markup).toContain('data-active="true"');
  });

  it('keeps account-name scrolling separate from row active state', () => {
    const markup = renderRow(makeTarget(), true, false);

    expect(markup).toContain('data-active="true"');
    expect(markup).toContain('data-scrolling="false"');
  });

  it('emphasizes role names normalized to an admin suffix', () => {
    const adminMarkup = renderRow(makeTarget({ roleShortName: 'Security-Admin' }));
    const ordinaryMarkup = renderRow(makeTarget({ roleShortName: 'security-readonly' }));

    expect(adminMarkup).toContain('result-role--admin');
    expect(adminMarkup).toContain('data-admin="true"');
    expect(ordinaryMarkup).not.toContain('result-role--admin');
    expect(ordinaryMarkup).toContain('data-admin="false"');
  });
});
