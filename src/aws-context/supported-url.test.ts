import { describe, expect, it } from 'vitest';
import {
  isSupportedAwsConsoleUrl,
  SUPPORTED_AWS_CONSOLE_MATCH_PATTERNS,
} from './supported-url';

describe('isSupportedAwsConsoleUrl', () => {
  it.each([
    'https://console.aws.amazon.com',
    'https://us-east-1.console.aws.amazon.com',
    'https://123456789012-abc.us-east-1.console.aws.amazon.com',
    'https://health.aws.amazon.com',
    'https://lightsail.aws.amazon.com',
    'https://CONSOLE.AWS.AMAZON.COM',
  ])('accepts an allowed AWS Console host: %s', (value) => {
    expect(isSupportedAwsConsoleUrl(value)).toBe(true);
  });

  it.each([
    'https://evilconsole.aws.amazon.com',
    'https://console.aws.amazon.com.evil.example',
    'https://signin.aws.amazon.com',
    'https://aws.amazon.com',
    'http://console.aws.amazon.com',
    'https://example.com',
    'not a url',
    'https://user:password@console.aws.amazon.com',
    'https://us-gov-west-1.console.amazonaws-us-gov.com/',
    'https://cn-north-1.console.amazonaws.cn/',
    'https://eusc-de-east-1.console.amazonaws-eusc.eu/',
  ])('rejects an unsupported or unsafe URL: %s', (value) => {
    expect(isSupportedAwsConsoleUrl(value)).toBe(false);
  });

  it('exports the exact static content-script match patterns', () => {
    expect(SUPPORTED_AWS_CONSOLE_MATCH_PATTERNS).toEqual([
      'https://console.aws.amazon.com/*',
      'https://*.console.aws.amazon.com/*',
      'https://health.aws.amazon.com/*',
      'https://lightsail.aws.amazon.com/*',
    ]);
  });
});
