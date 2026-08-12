import { browser } from 'wxt/browser';
import type { ConfigurationSourceIdentity } from '../catalog/persisted-catalog';
import { WorkspaceOperationError, type WorkspaceErrorCode } from './errors';
import {
  parseWorkspaceResponse,
  type WorkspaceRequest,
  type WorkspaceResponse,
} from './protocol';
import type { CatalogMutationToken, WorkspaceView } from './types';

async function sendWorkspaceRequest(request: WorkspaceRequest): Promise<WorkspaceView> {
  let response: WorkspaceResponse;

  try {
    response = await browser.runtime.sendMessage<WorkspaceRequest, WorkspaceResponse>(request);
  } catch {
    throw new WorkspaceOperationError('STORAGE_FAILED', 'Unable to load Roo workspace.');
  }

  const parsedResponse = parseWorkspaceResponse(response);

  if (!parsedResponse) {
    throw new WorkspaceOperationError('STORAGE_FAILED', 'Unable to load Roo workspace.');
  }

  if (!parsedResponse.ok) {
    throw new WorkspaceOperationError(parsedResponse.error.code, parsedResponse.error.message);
  }

  return parsedResponse.workspace;
}

export function getWorkspace(): Promise<WorkspaceView> {
  return sendWorkspaceRequest({ type: 'GET_WORKSPACE' });
}

export function importCatalog(request: {
  expectedCatalogToken: CatalogMutationToken;
  source: ConfigurationSourceIdentity;
  fileName: string;
  sourceText: string;
}): Promise<WorkspaceView> {
  return sendWorkspaceRequest({ type: 'IMPORT_CATALOG', ...request });
}

export function deleteConfiguration(request: {
  expectedCatalogToken: Extract<CatalogMutationToken, { kind: 'ready' }>;
  confirmationFileName: string;
}): Promise<WorkspaceView> {
  return sendWorkspaceRequest({ type: 'DELETE_CONFIGURATION', ...request });
}

export function getWorkspaceErrorCode(error: unknown): WorkspaceErrorCode | undefined {
  return error instanceof WorkspaceOperationError ? error.code : undefined;
}
