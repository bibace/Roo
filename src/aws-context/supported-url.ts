export const SUPPORTED_AWS_CONSOLE_MATCH_PATTERNS = [
  'https://console.aws.amazon.com/*',
  'https://*.console.aws.amazon.com/*',
  'https://health.aws.amazon.com/*',
  'https://lightsail.aws.amazon.com/*',
] as const;

function matchesHostPattern(hostname: string, hostPattern: string): boolean {
  if (hostPattern.startsWith('*.')) {
    return hostname.endsWith(`.${hostPattern.slice(2)}`);
  }

  return hostname === hostPattern;
}

export function isSupportedAwsConsoleUrl(value: string): boolean {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') {
    return false;
  }

  const hostname = url.hostname.toLowerCase();

  return SUPPORTED_AWS_CONSOLE_MATCH_PATTERNS.some((matchPattern) => {
    const hostPattern = matchPattern.slice('https://'.length, -'/*'.length);
    return matchesHostPattern(hostname, hostPattern);
  });
}
