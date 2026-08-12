import type { JumpTarget } from '../domain/jump-target';
import type { JumpTargetSummary } from '../domain/summarize-jump-targets';

export const POPUP_BOOTSTRAP_REQUEST = {
  type: 'GET_POPUP_BOOTSTRAP',
} as const;

export type PopupCatalogStatus =
  | 'ready'
  | 'empty'
  | 'invalid';

export interface PopupBootstrap {
  targets: JumpTarget[];
  catalogStatus: PopupCatalogStatus;
  summary: JumpTargetSummary;
  searchEnabled: boolean;
  contextMessage?: string;
  organizationId?: string;
}

export type PopupBootstrapResponse =
  | {
      ok: true;
      bootstrap: PopupBootstrap;
    }
  | {
      ok: false;
      error: {
        message: string;
      };
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && keys.every((key) => actualKeys.includes(key));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function parseBootstrap(value: unknown): PopupBootstrap | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const requiredKeys = ['targets', 'catalogStatus', 'summary', 'searchEnabled'];
  const optionalKeys = ['contextMessage', 'organizationId'];
  const actualKeys = Object.keys(value);

  if (
    !requiredKeys.every((key) => actualKeys.includes(key)) ||
    actualKeys.some((key) => !requiredKeys.includes(key) && !optionalKeys.includes(key)) ||
    !Array.isArray(value.targets) ||
    (value.catalogStatus !== 'ready' && value.catalogStatus !== 'empty' && value.catalogStatus !== 'invalid') ||
    !isObject(value.summary) ||
    !hasExactKeys(value.summary, ['accounts', 'roles']) ||
    !isNonNegativeInteger(value.summary.accounts) ||
    !isNonNegativeInteger(value.summary.roles) ||
    typeof value.searchEnabled !== 'boolean' ||
    (value.contextMessage !== undefined && typeof value.contextMessage !== 'string') ||
    (value.organizationId !== undefined && typeof value.organizationId !== 'string')
  ) {
    return undefined;
  }

  return value as unknown as PopupBootstrap;
}

export function parsePopupBootstrapRequest(
  value: unknown,
): typeof POPUP_BOOTSTRAP_REQUEST | undefined {
  return isObject(value) && hasExactKeys(value, ['type']) && value.type === POPUP_BOOTSTRAP_REQUEST.type
    ? POPUP_BOOTSTRAP_REQUEST
    : undefined;
}

export function parsePopupBootstrapResponse(
  value: unknown,
): PopupBootstrapResponse | undefined {
  if (!isObject(value) || typeof value.ok !== 'boolean') {
    return undefined;
  }

  if (value.ok) {
    if (!hasExactKeys(value, ['ok', 'bootstrap'])) {
      return undefined;
    }

    const bootstrap = parseBootstrap(value.bootstrap);
    return bootstrap === undefined ? undefined : { ok: true, bootstrap };
  }

  if (
    !hasExactKeys(value, ['ok', 'error']) ||
    !isObject(value.error) ||
    !hasExactKeys(value.error, ['message']) ||
    typeof value.error.message !== 'string'
  ) {
    return undefined;
  }

  return { ok: false, error: { message: value.error.message } };
}
