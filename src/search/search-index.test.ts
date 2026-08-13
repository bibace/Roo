import { describe, expect, it } from 'vitest';
import type { JumpTarget } from '../domain/jump-target';
import { buildJumpTargetSearchIndex } from './search-index';

function makeTarget(overrides: Partial<JumpTarget> = {}): JumpTarget {
  return {
    accountId: '123456789012',
    accountName: 'Atlas-Prod',
    project: 'Project_Name',
    environment: 'staging/env',
    role: 'platform/security-readonly',
    roleShortName: 'security-readonly',
    ...overrides,
  };
}

describe('buildJumpTargetSearchIndex', () => {
  it('indexes every searchable field and role alias', () => {
    const index = buildJumpTargetSearchIndex([makeTarget()]);
    const indexedTarget = index[0];

    expect(indexedTarget?.terms).toEqual(expect.arrayContaining([
      '123456789012',
      'atlas-prod',
      'atlas',
      'prod',
      'project_name',
      'project',
      'name',
      'staging/env',
      'staging',
      'env',
      'platform/security-readonly',
      'platform',
      'security',
      'security-readonly',
      'readonly',
      'read',
      'ro',
    ]));
    expect(indexedTarget?.exactValues).toEqual(new Set([
      '123456789012',
      'atlas-prod',
      'project_name',
      'staging/env',
      'platform/security-readonly',
      'security-readonly',
      'readonly',
      'read',
      'ro',
    ]));
  });

  it('indexes aliases exactly once and removes duplicate terms', () => {
    const index = buildJumpTargetSearchIndex([makeTarget({
      accountName: 'security-readonly',
      project: 'security_readonly',
      roleShortName: 'security-readonly',
    })]);
    const terms = index[0]?.terms ?? [];

    expect(terms.filter((term) => term === 'readonly')).toHaveLength(1);
    expect(terms.filter((term) => term === 'read')).toHaveLength(1);
    expect(terms.filter((term) => term === 'ro')).toHaveLength(1);
    expect(new Set(terms).size).toBe(terms.length);
  });

  it('retains target references without mutating targets', () => {
    const first = Object.freeze(makeTarget({ accountName: 'atlas-dev' }));
    const second = Object.freeze(makeTarget({ accountName: 'atlas-prod' }));
    const targets = Object.freeze([first, second]);

    const index = buildJumpTargetSearchIndex(targets);

    expect(index.map(({ target }) => target)).toEqual([first, second]);
    expect(index[0]?.target).toBe(first);
    expect(index[1]?.target).toBe(second);
    expect(targets).toEqual([first, second]);
  });

  it('is deterministic and preserves target ordering', () => {
    const targets = [
      makeTarget({ accountId: '222222222222', accountName: 'zeta-prod' }),
      makeTarget({ accountId: '111111111111', accountName: 'atlas-dev' }),
    ];

    const firstIndex = buildJumpTargetSearchIndex(targets);
    const secondIndex = buildJumpTargetSearchIndex(targets);

    expect(firstIndex).toEqual(secondIndex);
    expect(firstIndex.map(({ target }) => target)).toEqual(targets);
  });
});
