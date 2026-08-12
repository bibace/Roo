import type { PopupBootstrap } from './bootstrap-protocol';

export interface PopupBootstrapState {
  bootstrap: PopupBootstrap | null;
  failed: boolean;
  query: string;
}

type PopupBootstrapAction =
  | { type: 'QUERY_CHANGED'; query: string }
  | { type: 'BOOTSTRAP_LOADED'; bootstrap: PopupBootstrap }
  | { type: 'BOOTSTRAP_FAILED' };

export const initialPopupBootstrapState: PopupBootstrapState = {
  bootstrap: null,
  failed: false,
  query: '',
};

export function popupBootstrapReducer(
  state: PopupBootstrapState,
  action: PopupBootstrapAction,
): PopupBootstrapState {
  switch (action.type) {
    case 'QUERY_CHANGED':
      return { ...state, query: action.query };
    case 'BOOTSTRAP_LOADED':
      return { ...state, bootstrap: action.bootstrap, failed: false };
    case 'BOOTSTRAP_FAILED':
      return { ...state, failed: true };
  }
}
