import { parseDocument } from 'yaml';
import { ConfigImportError } from './config-import-error';
import type { RooConfigFormat } from './config-format';

function parseJsonSource(sourceText: string): unknown {
  try {
    return JSON.parse(sourceText) as unknown;
  } catch {
    throw new ConfigImportError('PARSE_FAILED', 'Unable to parse configuration.');
  }
}

function parseYamlSource(sourceText: string): unknown {
  try {
    const document = parseDocument(sourceText, {
      version: '1.2',
      schema: 'core',
      strict: true,
      stringKeys: true,
      uniqueKeys: true,
      prettyErrors: false,
      customTags: [],
    });

    if (document.errors.length > 0 || document.warnings.length > 0) {
      throw new ConfigImportError('PARSE_FAILED', 'Unable to parse configuration.');
    }

    return document.toJS({ maxAliasCount: 0 }) as unknown;
  } catch (error) {
    if (error instanceof ConfigImportError) {
      throw error;
    }

    throw new ConfigImportError('PARSE_FAILED', 'Unable to parse configuration.');
  }
}

export function parseConfigSource(format: RooConfigFormat, sourceText: string): unknown {
  return format === 'json' ? parseJsonSource(sourceText) : parseYamlSource(sourceText);
}
