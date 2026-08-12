export const AWS_CONSOLE_ROLE_PATH_MAX_LENGTH = 64;

const AWS_CONSOLE_ROLE_NAME_PATTERN = /^[A-Za-z0-9_+=,.@-]+$/;

function isPrintableAsciiPathSegment(segment: string): boolean {
  for (const character of segment) {
    const codePoint = character.codePointAt(0);

    if (codePoint === undefined || codePoint < 0x21 || codePoint > 0x7e) {
      return false;
    }
  }

  return segment.length > 0;
}

export function isValidAwsConsoleRole(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > AWS_CONSOLE_ROLE_PATH_MAX_LENGTH) {
    return false;
  }

  const segments = value.split('/');

  if (value.startsWith('/') || value.endsWith('/') || segments.some((segment) => !isPrintableAsciiPathSegment(segment))) {
    return false;
  }

  const roleName = segments[segments.length - 1];

  return roleName !== undefined && AWS_CONSOLE_ROLE_NAME_PATTERN.test(roleName);
}
