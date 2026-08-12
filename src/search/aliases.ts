const ROLE_ALIASES = {
  readonly: ['readonly', 'read', 'ro'],
  admin: ['admin', 'adm'],
} as const;

export function deriveRoleAliases(roleShortName: string): string[] {
  const normalizedRoleShortName = roleShortName.trim().toLowerCase();

  if (normalizedRoleShortName === 'readonly' || normalizedRoleShortName.endsWith('readonly')) {
    return [...ROLE_ALIASES.readonly];
  }

  if (normalizedRoleShortName === 'admin' || normalizedRoleShortName.endsWith('admin')) {
    return [...ROLE_ALIASES.admin];
  }

  return [];
}
