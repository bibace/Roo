import { z } from '../validation/zod';
import { getCanonicalYamlFileName } from '../config/canonical-yaml-file-name';
import { normalizeRooConfigDocument } from '../config/schema';
import type { RooConfigDocument } from '../config/types';
import type { ConfigImportCandidate } from '../import/prepare-config-import';
import { getRooConfigFormat } from '../import/config-format';

export const PERSISTED_CONFIGURATION_STORAGE_KEY = 'local:roo-configuration-v1';

export type ConfigurationSourceIdentity =
  | { kind: 'created' }
  | { kind: 'uploaded'; fileName: string };

export function getConfigurationEditorFileName(
  source: ConfigurationSourceIdentity,
): string {
  return source.kind === 'created'
    ? 'roo.yaml'
    : getCanonicalYamlFileName(source.fileName);
}

export interface PersistedConfigurationV1 {
  storageVersion: 1;
  catalogVersion: number;
  source: ConfigurationSourceIdentity;
  config: RooConfigDocument;
}

const sourceFileNameSchema = z
  .string()
  .refine((value) => value.trim().length > 0)
  .refine((value) => !value.includes('/') && !value.includes('\\'))
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value))
  .refine((value) => {
    try {
      getRooConfigFormat(value);
      return true;
    } catch {
      return false;
    }
  });

export const configurationSourceIdentitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('created') }).strict(),
  z.object({
    kind: z.literal('uploaded'),
    fileName: sourceFileNameSchema,
  }).strict(),
]);

const persistedConfigurationV1EnvelopeSchema = z
  .object({
    storageVersion: z.literal(1),
    catalogVersion: z.number().int().positive(),
    source: configurationSourceIdentitySchema,
    config: z.unknown(),
  })
  .strict();

export function createPersistedCatalog(
  candidate: ConfigImportCandidate,
  source: ConfigurationSourceIdentity,
  catalogVersion: number,
): PersistedConfigurationV1 {
  return {
    storageVersion: 1,
    catalogVersion,
    source,
    config: candidate.config,
  };
}

export function validatePersistedCatalog(
  value: unknown,
): PersistedConfigurationV1 | undefined {
  const envelope = persistedConfigurationV1EnvelopeSchema.safeParse(value);

  if (!envelope.success) {
    return undefined;
  }

  try {
    return {
      ...envelope.data,
      config: normalizeRooConfigDocument(envelope.data.config),
    };
  } catch {
    return undefined;
  }
}
