import type { ConfigImportCandidate } from '../import/prepare-config-import';
import { ConfigImportError } from '../import/config-import-error';
import {
  prepareConfigurationDraft,
  type ConfigurationDraft,
} from './configuration-draft';

export const CONFIGURATION_VALIDATION_DEBOUNCE_MS =
  200;

export type ConfigurationValidationResult =
  | {
      status: 'valid';
      sourceText: string;
      candidate: ConfigImportCandidate;
    }
  | {
      status: 'invalid';
      sourceText: string;
      error: ConfigImportError;
    };

export function validateConfigurationDraft(
  draft: ConfigurationDraft,
): ConfigurationValidationResult {
  try {
    return {
      status: 'valid',
      sourceText: draft.sourceText,
      candidate: prepareConfigurationDraft(draft),
    };
  } catch (error) {
    return {
      status: 'invalid',
      sourceText: draft.sourceText,
      error: error instanceof ConfigImportError
        ? error
        : new ConfigImportError('PARSE_FAILED', 'Unable to parse configuration.'),
    };
  }
}
