import type { ConfigurationSourceIdentity } from '../catalog/persisted-catalog';

export interface ConfigurationDeleteState {
  open: boolean;
  confirmation: string;
  error: string | null;
  stale: boolean;
}

export function createConfigurationDeleteState(): ConfigurationDeleteState {
  return {
    open: false,
    confirmation: '',
    error: null,
    stale: false,
  };
}

export function openConfigurationDelete(): ConfigurationDeleteState {
  return {
    open: true,
    confirmation: '',
    error: null,
    stale: false,
  };
}

export function setConfigurationDeleteConfirmation(
  state: ConfigurationDeleteState,
  confirmation: string,
): ConfigurationDeleteState {
  return {
    ...state,
    confirmation,
    error: null,
  };
}

export function cancelConfigurationDelete(
  _state?: ConfigurationDeleteState,
): ConfigurationDeleteState {
  return createConfigurationDeleteState();
}

export function markConfigurationDeleteFailure(
  state: ConfigurationDeleteState,
): ConfigurationDeleteState {
  return {
    ...state,
    error: 'Unable to delete configuration.',
  };
}

export function markConfigurationDeleteStale(
  state: ConfigurationDeleteState,
): ConfigurationDeleteState {
  return {
    ...state,
    confirmation: '',
    error:
      'Configuration changed in another Roo window. Close this confirmation and try Delete again from the latest configuration.',
    stale: true,
  };
}

export function canConfirmConfigurationDelete(
  state: ConfigurationDeleteState,
  source: ConfigurationSourceIdentity,
): boolean {
  return source.kind === 'uploaded' &&
    state.open &&
    !state.stale &&
    state.confirmation === source.fileName;
}
