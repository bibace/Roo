import { describe, expect, it } from 'vitest';
import type { JumpTarget } from '../domain/jump-target';
import {
  searchJumpTargetIndex,
  searchJumpTargets,
} from './search-jump-targets';
import { buildJumpTargetSearchIndex } from './search-index';

function makeTarget(overrides: Partial<JumpTarget> = {}): JumpTarget {
  return {
    accountId: '111111111111',
    accountName: 'atlas-dev',
    project: 'atlas',
    environment: 'dev',
    role: 'platform/security-readonly',
    roleShortName: 'security-readonly',
    ...overrides,
  };
}

type SearchFunction = (targets: readonly JumpTarget[], query: string) => JumpTarget[];

const searchFunctions: readonly SearchFunction[] = [
  searchJumpTargets,
  (targets, query) => searchJumpTargetIndex(buildJumpTargetSearchIndex(targets), query),
];

function resultNames(
  targets: readonly JumpTarget[],
  query: string,
  search: SearchFunction,
): string[] {
  return search(targets, query).map((target) => `${target.accountName}|${target.role}`);
}

function expectSearchResults(
  targets: readonly JumpTarget[],
  query: string,
  expected: readonly JumpTarget[],
) {
  for (const search of searchFunctions) {
    expect(search(targets, query)).toEqual(expected);
  }
}

function expectResultNames(
  targets: readonly JumpTarget[],
  query: string,
  expected: readonly string[],
) {
  for (const search of searchFunctions) {
    expect(resultNames(targets, query, search)).toEqual(expected);
  }
}

describe('searchJumpTargets', () => {
  it('returns no results below three characters and searches at exactly three', () => {
    const targets = [makeTarget({ accountName: 'atlas-prod', environment: 'prod' })];

    expectSearchResults(targets, 'a', []);
    expectSearchResults(targets, 'at', []);
    expectSearchResults(targets, 'atl', targets);
  });

  it('trims, collapses whitespace, and matches case-insensitively', () => {
    const targets = [makeTarget({ accountName: 'atlas-prod', environment: 'prod' })];

    expectSearchResults(targets, '  ATL   PROD  ', targets);
    expectSearchResults(targets, 'atlas prod', targets);
  });

  it('does not modify the input target array or targets', () => {
    const targets = [makeTarget({ accountName: 'atlas-prod', environment: 'prod' })];
    const originalTargets = targets.map((target) => ({ ...target }));

    searchJumpTargets(targets, 'atlas prod');

    expect(targets).toEqual(originalTargets);
  });

  it('matches project, environment, account name, account ID, full role, and short role name', () => {
    const targets = [
      makeTarget({
        accountId: '222222222222',
        accountName: 'atlas-prod',
        environment: 'prod',
        role: 'platform/data/data-engineer',
        roleShortName: 'data-engineer',
      }),
    ];

    expectSearchResults(targets, 'atlas', targets);
    expectSearchResults(targets, 'prod', targets);
    expectSearchResults(targets, 'atlas-prod', targets);
    expectSearchResults(targets, '222222', targets);
    expectSearchResults(targets, 'platform/data', targets);
    expectSearchResults(targets, 'data-engineer', targets);
    expectSearchResults(targets, 'atlas data', targets);
  });

  it('supports readonly and admin aliases only for matching role suffixes', () => {
    const targets = [
      makeTarget({ accountName: 'atlas-data-readonly', role: 'platform/data-readonly', roleShortName: 'data-readonly' }),
      makeTarget({ accountName: 'atlas-security-readonly', role: 'platform/security-readonly', roleShortName: 'security-readonly' }),
      makeTarget({ accountName: 'atlas-data-admin', role: 'platform/data-admin', roleShortName: 'data-admin' }),
      makeTarget({ accountName: 'atlas-security-admin', role: 'platform/security-admin', roleShortName: 'security-admin' }),
      makeTarget({ accountName: 'atlas-data', role: 'platform/data/data-engineer', roleShortName: 'data-engineer' }),
    ];

    expectResultNames(targets, 'atlas readonly', [
      'atlas-data-readonly|platform/data-readonly',
      'atlas-security-readonly|platform/security-readonly',
    ]);
    expectResultNames(targets, 'atlas read', [
      'atlas-data-readonly|platform/data-readonly',
      'atlas-security-readonly|platform/security-readonly',
    ]);
    expectResultNames(targets, 'atlas ro', [
      'atlas-data-readonly|platform/data-readonly',
      'atlas-security-readonly|platform/security-readonly',
    ]);
    expectResultNames(targets, 'atlas admin', [
      'atlas-data-admin|platform/data-admin',
      'atlas-security-admin|platform/security-admin',
    ]);
    expectResultNames(targets, 'atlas adm', [
      'atlas-data-admin|platform/data-admin',
      'atlas-security-admin|platform/security-admin',
    ]);
    for (const search of searchFunctions) {
      expect(resultNames(targets, 'atlas adm', search)).not.toContain('atlas-data|platform/data/data-engineer');
      expect(resultNames(targets, 'atlas ro', search)).not.toContain('atlas-data|platform/data/data-engineer');
    }
  });

  it('requires every query token and is independent of token order', () => {
    const targets = [
      makeTarget({ accountName: 'atlas-prod', environment: 'prod', role: 'platform/security-admin', roleShortName: 'security-admin' }),
      makeTarget({ accountName: 'atlas-prod', environment: 'prod', role: 'platform/security-readonly', roleShortName: 'security-readonly' }),
      makeTarget({ accountName: 'atlas-dev', environment: 'dev', role: 'platform/security-admin', roleShortName: 'security-admin' }),
    ];

    expectResultNames(targets, 'atlas prod admin', ['atlas-prod|platform/security-admin']);
    for (const search of searchFunctions) {
      expect(resultNames(targets, 'atlas prod admin', search)).toEqual(
        resultNames(targets, 'admin atlas prod', search),
      );
    }
    expectResultNames(targets, 'atlas prod', [
      'atlas-prod|platform/security-admin',
      'atlas-prod|platform/security-readonly',
    ]);
  });

  it('keeps multi-token exact ranking independent of token order for internal spaces', () => {
    const targets = [
      makeTarget({
        accountName: 'atlas prod-dev',
        project: 'atlas prod',
        environment: 'dev',
      }),
      makeTarget({
        accountName: 'a-atlas-prod',
        project: 'a-atlas',
        environment: 'prod',
        role: 'platform/security-admin',
        roleShortName: 'security-admin',
      }),
    ];

    const expectedOrder = [
      'a-atlas-prod|platform/security-admin',
      'atlas prod-dev|platform/security-readonly',
    ];

    expectResultNames(targets, 'atlas prod', expectedOrder);
    expectResultNames(targets, 'prod atlas', expectedOrder);
  });

  it('ranks whole-query exact matches first', () => {
    const targets = [
      makeTarget({ accountName: 'atlas-production', environment: 'production' }),
      makeTarget({ accountName: 'atlas-prod', environment: 'prod' }),
    ];

    expectResultNames(targets, 'atlas-prod', [
      'atlas-prod|platform/security-readonly',
      'atlas-production|platform/security-readonly',
    ]);
  });

  it('ranks more exact token matches before fewer exact matches', () => {
    const targets = [
      makeTarget({ accountName: 'atlas-production', environment: 'production' }),
      makeTarget({ accountName: 'atlas-prod', environment: 'prod' }),
    ];

    for (const search of searchFunctions) {
      expect(resultNames(targets, 'atlas prod', search)[0]).toBe('atlas-prod|platform/security-readonly');
    }
  });

  it('excludes internal substring matches while retaining exact and prefix matches', () => {
    const targets = [
      makeTarget({ accountName: 'atlas-prod', environment: 'prod', project: 'atlas' }),
      makeTarget({ accountName: 'atlas-production', environment: 'production', project: 'atlas' }),
      makeTarget({ accountName: 'atlas-nonprod', environment: 'nonprod', project: 'atlas' }),
      makeTarget({ accountName: 'atlas-preprod', environment: 'preprod', project: 'atlas' }),
      makeTarget({ accountName: 'atlas-myprod', environment: 'myprod', project: 'atlas' }),
    ];

    expectResultNames(targets, 'prod', [
      'atlas-prod|platform/security-readonly',
      'atlas-production|platform/security-readonly',
    ]);
  });

  it('excludes internal substring matches in account names', () => {
    const targets = [
      makeTarget({ accountName: 'atlas-prod', project: 'atlas', environment: 'prod' }),
      makeTarget({ accountName: 'atlas-nonprod', project: 'atlas', environment: 'nonprod' }),
      makeTarget({ accountName: 'atlas-preprod', project: 'atlas', environment: 'preprod' }),
      makeTarget({ accountName: 'atlas-myprod', project: 'atlas', environment: 'myprod' }),
    ];

    expectResultNames(targets, 'prod', ['atlas-prod|platform/security-readonly']);
  });

  it('uses account name, role, and account ID for deterministic ties', () => {
    const accountNameTargets = [
      makeTarget({ accountName: 'zeta-prod', project: 'zeta' }),
      makeTarget({ accountName: 'atlas-prod' }),
    ];
    const roleTargets = [
      makeTarget({ role: 'platform/z-role', roleShortName: 'z-role' }),
      makeTarget({ role: 'platform/a-role', roleShortName: 'a-role' }),
    ];
    const accountIdTargets = [
      makeTarget({ accountId: '222222222222' }),
      makeTarget({ accountId: '111111111111' }),
    ];

    expectResultNames(accountNameTargets, 'prod', [
      'atlas-prod|platform/security-readonly',
      'zeta-prod|platform/security-readonly',
    ]);
    expectResultNames(roleTargets, 'plat', [
      'atlas-dev|platform/a-role',
      'atlas-dev|platform/z-role',
    ]);
    for (const search of searchFunctions) {
      expect(search(accountIdTargets, 'atlas').map((target) => target.accountId)).toEqual([
        '111111111111',
        '222222222222',
      ]);
    }
  });

  it('does not depend on input target order', () => {
    const first = makeTarget({ accountName: 'atlas-prod', role: 'platform/z-role', roleShortName: 'z-role' });
    const second = makeTarget({ accountName: 'atlas-dev', role: 'platform/a-role', roleShortName: 'a-role' });

    for (const search of searchFunctions) {
      expect(resultNames([first, second], 'atl', search)).toEqual(
        resultNames([second, first], 'atl', search),
      );
    }
  });
});
