import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { prepareConfigImport } from '../import/prepare-config-import';
import ConfigurationGuide, {
  ORGANIZATION_CONFIGURATION_EXAMPLE,
  SIMPLE_CONFIGURATION_EXAMPLE,
} from './configuration-guide';

describe('ConfigurationGuide', () => {
  it('keeps both public examples valid at the real import boundary', () => {
    const simple = prepareConfigImport('simple.yaml', SIMPLE_CONFIGURATION_EXAMPLE);
    const organization = prepareConfigImport(
      'organization.yaml',
      ORGANIZATION_CONFIGURATION_EXAMPLE,
    );

    expect(simple.config).toMatchObject({
      version: 1,
      projects: {
        atlas: {
          accounts: {
            dev: '111111111111',
            prod: '222222222222',
          },
        },
      },
    });
    expect(organization.config).toMatchObject({
      version: 2,
      organizations: {
        engineering: {
          baseAccounts: [{
            accountId: '111111111111',
            accountAlias: 'engineering-root',
          }],
          projects: {
            atlas: {
              accounts: { prod: '222222222222' },
            },
          },
        },
      },
    });
  });

  it('renders the public Configuration contract without alternate version wording', () => {
    const markup = renderToStaticMarkup(<ConfigurationGuide />);

    for (const expectedText of [
      'Configuration YAML Reference',
      'Version 1 — Simple Mode',
      'Version 2 — Organization Mode',
      'base_accounts',
      'account_id',
      'account_alias',
      'environments',
      '12',
      '64',
    ]) {
      expect(markup).toContain(expectedText);
    }

    expect(markup).not.toContain('v2 Simple');
    expect(markup).not.toContain('Version 2 Simple');
    expect(markup).not.toContain('Version 2 — Simple Mode');
  });
});
