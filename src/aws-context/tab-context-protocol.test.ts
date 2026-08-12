import { describe, expect, it } from 'vitest';
import {
  parseAwsTabContextRequest,
  parseAwsTabContextResponse,
} from './tab-context-protocol';

const readyProbe = {
  tabId: 7,
  result: {
    status: 'ready' as const,
    context: {
      loginAccountIdOrAlias: '111111111111',
      currentAccountIdOrAlias: 'engineering-prod',
      multiSession: true,
      source: 'console-nav' as const,
    },
  },
};

describe('AWS tab context protocol', () => {
  it.each([
    { type: 'AWS_TAB_CONTEXT_REFRESH' },
    { type: 'GET_ACTIVE_AWS_TAB_CONTEXT' },
  ])('accepts the exact request %j', (request) => {
    expect(parseAwsTabContextRequest(request)).toEqual(request);
  });

  it.each([
    null,
    [],
    {},
    { type: 'UNKNOWN' },
    { type: 'AWS_TAB_CONTEXT_REFRESH', tabId: 7 },
    { type: 'GET_ACTIVE_AWS_TAB_CONTEXT', extra: true },
    { type: 'GET_ACTIVE_AWS_TAB_CONTEXT', tabId: 7 },
  ])('rejects a malformed request %j', (request) => {
    expect(parseAwsTabContextRequest(request)).toBeUndefined();
  });

  it('accepts a ready response without internal state fields', () => {
    expect(parseAwsTabContextResponse({
      ok: true,
      probe: readyProbe,
    })).toEqual({
      ok: true,
      probe: readyProbe,
    });
  });

  it.each([
    { tabId: 7, result: { status: 'unavailable' } },
    { tabId: null, result: { status: 'unavailable' } },
    { tabId: 7, result: { status: 'not-aws-console' } },
  ])('accepts a non-ready probe %j', (probe) => {
    expect(parseAwsTabContextResponse({ ok: true, probe })).toEqual({ ok: true, probe });
  });

  it.each([
    { ok: true, probe: readyProbe, generation: 1 },
    { ok: true, probe: readyProbe, extra: true },
    { ok: true, probe: { tabId: -1, result: { status: 'unavailable' } } },
    { ok: true, probe: { tabId: 1.5, result: { status: 'unavailable' } } },
    { ok: true, probe: { tabId: 7, result: { status: 'unknown' } } },
    { ok: true, probe: { tabId: 7, result: { status: 'ready', context: null } } },
    { ok: true, probe: { tabId: 7, result: { status: 'ready', context: [], extra: true } } },
  ])('rejects malformed success payloads', (response) => {
    expect(parseAwsTabContextResponse(response)).toBeUndefined();
  });

  it('accepts a generic protocol failure', () => {
    expect(parseAwsTabContextResponse({
      ok: false,
      error: { code: 'TAB_UNAVAILABLE', message: 'AWS tab context is unavailable.' },
    })).toEqual({
      ok: false,
      error: { code: 'TAB_UNAVAILABLE', message: 'AWS tab context is unavailable.' },
    });
  });

  it.each([
    { ok: false, error: { code: 'UNKNOWN', message: 'safe' } },
    { ok: false, error: { code: 'TAB_UNAVAILABLE', message: '' } },
    { ok: false, error: { code: 'TAB_UNAVAILABLE', message: 7 } },
    { ok: false, error: { code: 'TAB_UNAVAILABLE', message: 'safe', extra: true } },
    { ok: false, error: { code: 'TAB_UNAVAILABLE', message: 'safe' }, extra: true },
    { ok: 'yes', error: { code: 'TAB_UNAVAILABLE', message: 'safe' } },
  ])('rejects malformed failure payloads', (response) => {
    expect(parseAwsTabContextResponse(response)).toBeUndefined();
  });

  it.each([undefined, null, {}, { ok: 'yes' }, { type: 'GET_ACTIVE_AWS_TAB_CONTEXT' }])(
    'rejects an unknown top-level response shape %j',
    (response) => {
      expect(parseAwsTabContextResponse(response)).toBeUndefined();
    },
  );
});
