export function getRoleShortName(role: string): string {
  const segments = role.split('/');
  return segments[segments.length - 1] ?? role;
}
