import { z } from '../validation/zod';
import { normalizeRooConfigDocument } from '../config/schema';
import type { RooConfigDocument } from '../config/types';
import { resolveConfigScopes, type ResolvedCatalogScope } from '../domain/resolve-config-scopes';
import { summarizeCatalog, type CatalogSummary } from '../catalog/catalog-summary';
import { ConfigImportError, type ConfigValidationIssue } from './config-import-error';
import { getRooConfigFormat, type RooConfigFormat } from './config-format';
import { parseConfigSource } from './parse-config-source';

export interface ConfigImportCandidate {
  fileName: string;
  format: RooConfigFormat;
  config: RooConfigDocument;
  scopes: ResolvedCatalogScope[];
  summary: CatalogSummary;
}

function formatIssuePath(path: readonly (string | number | symbol)[]): string {
  return path.length > 0 ? path.map(String).join('.') : 'configuration';
}

function toValidationIssues(error: z.ZodError): ConfigValidationIssue[] {
  return error.issues.map((issue) => ({
    path: formatIssuePath(issue.path),
    message: issue.message,
  }));
}

function normalizeImportedConfig(input: unknown): RooConfigDocument {
  try {
    return normalizeRooConfigDocument(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ConfigImportError(
        'VALIDATION_FAILED',
        'Configuration is invalid.',
        toValidationIssues(error),
      );
    }

    throw new ConfigImportError('VALIDATION_FAILED', 'Configuration is invalid.');
  }
}

export function prepareConfigImport(fileName: string, sourceText: string): ConfigImportCandidate {
  const format = getRooConfigFormat(fileName);
  const parsedConfig = parseConfigSource(format, sourceText);
  const config = normalizeImportedConfig(parsedConfig);
  const scopes = resolveConfigScopes(config);

  return {
    fileName,
    format,
    config,
    scopes,
    summary: summarizeCatalog(config, scopes),
  };
}
