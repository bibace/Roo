import { describe, expect, it } from 'vitest';
import { normalizeRooConfig } from '../config/schema';
import { resolveCatalog } from './resolve-catalog';

function resolve(input: unknown) {
  return resolveCatalog(normalizeRooConfig(input));
}

describe('Roo convention resolution', () => {
  it('does not create default-role targets when defaults is omitted', () => {
    const targets = resolve({
      version: 1,
      projects: { atlas: { accounts: { prod: '111111111111' } } },
    });

    expect(targets).toEqual([]);
  });

  it('treats omitted defaults.enabled as true for configured roles', () => {
    const targets = resolve({
      version: 1,
      defaults: { roles: ['platform/security-readonly', 'platform/security-admin'] },
      projects: { atlas: { accounts: { prod: '111111111111' } } },
    });

    expect(targets.map((target) => target.role)).toEqual([
      'platform/security-admin',
      'platform/security-readonly',
    ]);
  });

  it('uses custom default roles exactly', () => {
    const targets = resolve({
      version: 1,
      defaults: { roles: ['platform/data-readonly'] },
      projects: { atlas: { accounts: { prod: '111111111111' } } },
    });

    expect(targets.map((target) => target.role)).toEqual(['platform/data-readonly']);
  });

  it('removes default-role targets when defaults are disabled', () => {
    const targets = resolve({
      version: 1,
      defaults: { enabled: false },
      projects: { atlas: { accounts: { prod: '111111111111' } } },
    });

    expect(targets).toEqual([]);
  });

  it('keeps project additional roles when defaults are disabled', () => {
    const targets = resolve({
      version: 1,
      defaults: { enabled: false },
      projects: {
        atlas: {
          accounts: { prod: '111111111111' },
          roles: { 'platform/data/data-engineer': {} },
        },
      },
    });

    expect(targets.map((target) => target.role)).toEqual(['platform/data/data-engineer']);
  });

  it('applies unrestricted additional roles to every project account', () => {
    const targets = resolve({
      version: 1,
      defaults: { enabled: false },
      projects: {
        atlas: {
          accounts: { dev: '111111111111', prod: '222222222222' },
          roles: { 'data-engineer': {} },
        },
      },
    });

    expect(targets.map((target) => target.accountName)).toEqual(['atlas-dev', 'atlas-prod']);
  });

  it('applies environment-scoped additional roles only to listed accounts', () => {
    const targets = resolve({
      version: 1,
      defaults: { enabled: false },
      projects: {
        atlas: {
          accounts: { dev: '111111111111', prod: '222222222222' },
          roles: { 'data-engineer': { environments: ['prod'] } },
        },
      },
    });

    expect(targets.map((target) => target.accountName)).toEqual(['atlas-prod']);
  });

  it('derives the short role name from the final path segment', () => {
    const [target] = resolve({
      version: 1,
      defaults: { enabled: false },
      projects: {
        atlas: {
          accounts: { prod: '111111111111' },
          roles: { 'platform/data/data-engineer': {} },
        },
      },
    });

    expect(target).toMatchObject({
      accountId: '111111111111',
      accountName: 'atlas-prod',
      project: 'atlas',
      environment: 'prod',
      role: 'platform/data/data-engineer',
      roleShortName: 'data-engineer',
    });
  });

  it('removes exact duplicate effective targets', () => {
    const targets = resolve({
      version: 1,
      defaults: { roles: ['platform/security-admin'] },
      projects: {
        atlas: {
          accounts: { prod: '111111111111' },
          roles: { 'platform/security-admin': {} },
        },
      },
    });

    expect(targets).toHaveLength(1);
  });

  it('sorts targets by account name and then role independent of input order', () => {
    const targets = resolve({
      version: 1,
      defaults: { roles: ['platform/z-role', 'platform/a-role'] },
      projects: {
        zebra: { accounts: { prod: '222222222222' } },
        atlas: { accounts: { prod: '111111111111' } },
      },
    });

    expect(targets.map((target) => `${target.accountName}|${target.role}`)).toEqual([
      'atlas-prod|platform/a-role',
      'atlas-prod|platform/z-role',
      'zebra-prod|platform/a-role',
      'zebra-prod|platform/z-role',
    ]);
  });
});
