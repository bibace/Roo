import { describe, expect, it } from 'vitest';
import { isValidAwsConsoleRole } from './aws-console-role';

describe('isValidAwsConsoleRole', () => {
  it.each([
    'security-admin',
    'platform/security-admin',
    'division_abc/subdivision_efg/role_XYZ',
    'Role_01',
    'Role+Blue',
    'Role=Admin',
    'Role,Prod',
    'Role.Read',
    'Role@Team',
    'division?team/security&ops/security-admin',
    'r'.repeat(64),
  ])('accepts %s', (role) => {
    expect(isValidAwsConsoleRole(role)).toBe(true);
  });

  it.each([
    '',
    '   ',
    ' platform/admin',
    'platform/admin ',
    'platform/security admin',
    '/platform/admin',
    'platform/admin/',
    'platform//admin',
    'platform/role?name',
    'platform/role#name',
    'platform/role&name',
    'platform/role\u0000name',
    'división/security-admin',
    'platform/security-admín',
    'r'.repeat(65),
  ])('rejects %s', (role) => {
    expect(isValidAwsConsoleRole(role)).toBe(false);
  });

  it('rejects non-string runtime input', () => {
    expect(isValidAwsConsoleRole(null)).toBe(false);
    expect(isValidAwsConsoleRole(42)).toBe(false);
  });
});
