import { describe, expect, it } from 'vitest';
import type { PopupBootstrap } from './bootstrap-protocol';
import {
  initialPopupBootstrapState,
  popupBootstrapReducer,
} from './popup-bootstrap-state';

const bootstrap: PopupBootstrap = {
  targets: [],
  catalogStatus: 'ready',
  summary: { accounts: 0, roles: 0 },
  searchEnabled: true,
};

describe('Popup bootstrap state', () => {
  it('preserves a pre-bootstrap query when bootstrap loads', () => {
    const queried = popupBootstrapReducer(initialPopupBootstrapState, {
      type: 'QUERY_CHANGED',
      query: 'atlas',
    });

    expect(queried).toMatchObject({ query: 'atlas', bootstrap: null });

    const loaded = popupBootstrapReducer(queried, {
      type: 'BOOTSTRAP_LOADED',
      bootstrap,
    });

    expect(loaded).toEqual({ bootstrap, failed: false, query: 'atlas' });
  });

  it('preserves an already typed query when bootstrap fails', () => {
    const queried = { ...initialPopupBootstrapState, query: 'atlas' };

    expect(popupBootstrapReducer(queried, { type: 'BOOTSTRAP_FAILED' })).toEqual({
      bootstrap: null,
      failed: true,
      query: 'atlas',
    });
  });
});
