import { describe, expect, it } from 'vitest';
import type { ConfigurationSourceIdentity } from '../catalog/persisted-catalog';
import {
  cancelConfigurationDelete,
  canConfirmConfigurationDelete,
  createConfigurationDeleteState,
  markConfigurationDeleteFailure,
  markConfigurationDeleteStale,
  openConfigurationDelete,
  setConfigurationDeleteConfirmation,
} from './configuration-delete';

const created = { kind: 'created' } as const;
const uploaded = { kind: 'uploaded', fileName: 'roo.yaml' } as const;

function confirmationState(value: string) {
  return setConfigurationDeleteConfirmation(openConfigurationDelete(), value);
}

describe('configuration delete state', () => {
  it('never allows a created source to confirm delete', () => {
    expect(canConfirmConfigurationDelete(confirmationState('roo.yaml'), created)).toBe(false);
  });

  it('requires the confirmation to be open for an uploaded source', () => {
    const state = {
      ...createConfigurationDeleteState(),
      confirmation: 'roo.yaml',
    };

    expect(canConfirmConfigurationDelete(state, uploaded)).toBe(false);
  });

  it.each([
    ['roo.yaml', true],
    ['ROO.YAML', false],
    ['roo.yml', false],
    [' roo.yaml', false],
    ['roo.yaml ', false],
  ])('matches the exact uploaded filename %j', (confirmation, expected) => {
    expect(canConfirmConfigurationDelete(
      confirmationState(confirmation),
      uploaded,
    )).toBe(expected);
  });

  it('matches a different original uploaded filename exactly', () => {
    const source: ConfigurationSourceIdentity = {
      kind: 'uploaded',
      fileName: 'team.json',
    };

    expect(canConfirmConfigurationDelete(
      confirmationState('team.json'),
      source,
    )).toBe(true);
  });

  it('blocks a stale confirmation', () => {
    const state = markConfigurationDeleteStale(confirmationState('roo.yaml'));

    expect(state.confirmation).toBe('');
    expect(canConfirmConfigurationDelete(state, uploaded)).toBe(false);
  });

  it('cancel resets confirmation, error, and stale state', () => {
    const failed = markConfigurationDeleteFailure(confirmationState('roo.yaml'));
    const stale = markConfigurationDeleteStale(failed);

    expect(cancelConfigurationDelete(stale)).toEqual(createConfigurationDeleteState());
    expect(cancelConfigurationDelete(stale)).toEqual({
      open: false,
      confirmation: '',
      error: null,
      stale: false,
    });
  });
});
