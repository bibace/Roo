import { z } from '../validation/zod';
import { configurationSourceIdentitySchema } from '../catalog/persisted-catalog';
import type { WorkspaceView } from './types';
import type { WorkspaceErrorCode } from './errors';

const catalogMutationTokenSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ready'), catalogVersion: z.number().int().positive() }).strict(),
  z.object({ kind: z.literal('empty') }).strict(),
  z.object({ kind: z.literal('invalid') }).strict(),
]);

const readyCatalogMutationTokenSchema = z.object({
  kind: z.literal('ready'),
  catalogVersion: z.number().int().positive(),
}).strict();

const workspaceRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('GET_WORKSPACE') }).strict(),
  z.object({
    type: z.literal('IMPORT_CATALOG'),
    expectedCatalogToken: catalogMutationTokenSchema,
    source: configurationSourceIdentitySchema,
    fileName: z.string().min(1),
    sourceText: z.string(),
  }).strict(),
  z.object({
    type: z.literal('DELETE_CONFIGURATION'),
    expectedCatalogToken: readyCatalogMutationTokenSchema,
    confirmationFileName: z.string().min(1),
  }).strict(),
]);

const workspaceErrorCodes = new Set<WorkspaceErrorCode>([
  'STALE_WORKSPACE',
  'INVALID_CATALOG',
  'STORAGE_FAILED',
  'INVALID_REQUEST',
]);

export type WorkspaceRequest = z.infer<typeof workspaceRequestSchema>;

export interface WorkspaceErrorResponse {
  code: WorkspaceErrorCode;
  message: string;
}

export type WorkspaceResponse =
  | { ok: true; workspace: WorkspaceView }
  | { ok: false; error: WorkspaceErrorResponse };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && keys.every((key) => actualKeys.includes(key));
}

export function parseWorkspaceRequest(value: unknown): WorkspaceRequest | undefined {
  const result = workspaceRequestSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function parseWorkspaceResponse(value: unknown): WorkspaceResponse | undefined {
  if (!isObject(value) || typeof value.ok !== 'boolean') {
    return undefined;
  }

  if (value.ok) {
    if (!hasExactKeys(value, ['ok', 'workspace']) || !isObject(value.workspace)) {
      return undefined;
    }

    return { ok: true, workspace: value.workspace as unknown as WorkspaceView };
  }

  if (!hasExactKeys(value, ['ok', 'error']) || !isObject(value.error)) {
    return undefined;
  }

  if (
    !hasExactKeys(value.error, ['code', 'message']) ||
    typeof value.error.code !== 'string' ||
    !workspaceErrorCodes.has(value.error.code as WorkspaceErrorCode) ||
    typeof value.error.message !== 'string'
  ) {
    return undefined;
  }

  return {
    ok: false,
    error: {
      code: value.error.code as WorkspaceErrorCode,
      message: value.error.message,
    },
  };
}
