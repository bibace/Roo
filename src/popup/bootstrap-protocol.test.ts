import { describe, expect, it } from 'vitest';
import {
  POPUP_BOOTSTRAP_REQUEST,
  parsePopupBootstrapRequest,
  parsePopupBootstrapResponse,
} from './bootstrap-protocol';

const validBootstrap = {
  targets: [],
  catalogStatus: 'ready',
  summary: { accounts: 1, roles: 2 },
  searchEnabled: true,
};

describe('Popup bootstrap protocol', () => {
  it('accepts only the exact request', () => {
    expect(parsePopupBootstrapRequest(POPUP_BOOTSTRAP_REQUEST)).toEqual(POPUP_BOOTSTRAP_REQUEST);
    expect(parsePopupBootstrapRequest({ ...POPUP_BOOTSTRAP_REQUEST, extra: true })).toBeUndefined();
  });

  it('accepts a valid success envelope', () => {
    expect(parsePopupBootstrapResponse({ ok: true, bootstrap: validBootstrap })).toEqual({
      ok: true,
      bootstrap: validBootstrap,
    });
  });

  it.each([
    { ...validBootstrap, catalogStatus: 'unknown' },
    { ...validBootstrap, summary: { accounts: -1, roles: 2 } },
    { ...validBootstrap, summary: { accounts: 1.5, roles: 2 } },
    { ...validBootstrap, summary: { accounts: 1, roles: '2' } },
    { ...validBootstrap, searchEnabled: 'yes' },
  ])('rejects an invalid success bootstrap: %j', (bootstrap) => {
    expect(parsePopupBootstrapResponse({ ok: true, bootstrap })).toBeUndefined();
  });

  it('accepts optional context and organization fields', () => {
    const bootstrap = {
      ...validBootstrap,
      contextMessage: 'Configuration needs attention.',
      organizationId: 'engineering',
    };
    expect(parsePopupBootstrapResponse({ ok: true, bootstrap })).toEqual({ ok: true, bootstrap });
  });

  it('accepts a ready zero-destination Configuration bootstrap', () => {
    const bootstrap = {
      targets: [],
      catalogStatus: 'ready',
      summary: { accounts: 0, roles: 0 },
      searchEnabled: true,
    };

    expect(parsePopupBootstrapResponse({ ok: true, bootstrap })).toEqual({
      ok: true,
      bootstrap,
    });
  });

  it('accepts a valid error envelope', () => {
    expect(parsePopupBootstrapResponse({
      ok: false,
      error: { message: 'Unable to load Roo popup.' },
    })).toEqual({ ok: false, error: { message: 'Unable to load Roo popup.' } });
  });

  it.each([
    undefined,
    null,
    {},
    { ok: true },
    { ok: true, bootstrap: { ...validBootstrap, extra: true } },
    { ok: false, error: {} },
    { ok: false, error: { message: 7 } },
    { ok: false, error: { message: 'failed', extra: true } },
  ])('rejects a malformed envelope: %j', (response) => {
    expect(parsePopupBootstrapResponse(response)).toBeUndefined();
  });
});
