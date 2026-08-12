import { describe, expect, it } from 'vitest';
import { getRooActionStateForUrl } from './action-state';

describe('getRooActionStateForUrl', () => {
  it.each([
    'https://console.aws.amazon.com/console/home',
    'https://us-east-1.console.aws.amazon.com/console/home',
    'https://health.aws.amazon.com/health/home',
    'https://lightsail.aws.amazon.com/ls/webapp/home',
  ])('enables the action for a supported AWS URL: %s', (url) => {
    expect(getRooActionStateForUrl(url)).toBe('enabled');
  });

  it.each([
    undefined,
    'https://example.com/',
    'https://signin.aws.amazon.com/switchrole',
    'not a url',
  ])('disables the action for an unsupported URL: %s', (url) => {
    expect(getRooActionStateForUrl(url)).toBe('disabled');
  });
});
