import { describe, expect, it, vi } from 'vitest';
import * as draftTools from './configuration-draft';
import {
  CONFIGURATION_VALIDATION_DEBOUNCE_MS,
  validateConfigurationDraft,
} from './configuration-validation';

const draft = {
  origin: 'new' as const,
  source: { kind: 'created' as const },
  fileName: 'roo.yaml',
  sourceText: 'version: 1\nprojects: {}\n',
  expectedCatalogToken: { kind: 'empty' as const },
};

describe('configuration validation', () => {
  it('uses the 200 ms debounce contract and prepares a valid draft exactly once', () => {
    const prepare = vi.spyOn(draftTools, 'prepareConfigurationDraft');

    expect(CONFIGURATION_VALIDATION_DEBOUNCE_MS).toBe(200);
    expect(validateConfigurationDraft(draft)).toMatchObject({
      status: 'valid',
      sourceText: draft.sourceText,
    });
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('preserves known validation errors and maps unexpected errors to parse failure', () => {
    expect(validateConfigurationDraft({ ...draft, sourceText: 'version: [' })).toMatchObject({
      status: 'invalid',
      error: { message: 'Unable to parse configuration.' },
    });

    vi.spyOn(draftTools, 'prepareConfigurationDraft').mockImplementationOnce(() => {
      throw new Error('unexpected');
    });
    expect(validateConfigurationDraft(draft)).toMatchObject({
      status: 'invalid',
      error: {
        code: 'PARSE_FAILED',
        message: 'Unable to parse configuration.',
      },
    });
  });
});
