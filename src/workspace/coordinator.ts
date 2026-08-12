import { loadPersistedCatalog, type PersistedCatalogLoadResult } from '../catalog/load-persisted-catalog';
import {
  getConfigurationEditorFileName,
  type ConfigurationSourceIdentity,
} from '../catalog/persisted-catalog';
import {
  deletePersistedConfiguration,
  savePersistedCatalog,
} from '../catalog/catalog-storage';
import { CatalogStorageError } from '../catalog/catalog-storage-error';
import type { ConfigImportCandidate } from '../import/prepare-config-import';
import { prepareConfigImport } from '../import/prepare-config-import';
import { ConfigImportError } from '../import/config-import-error';
import { WorkspaceOperationError } from './errors';
import { WorkspaceSnapshotCache } from './workspace-snapshot-cache';
import { buildWorkspaceView } from './workspace-view';
import {
  isSameCatalogMutationToken,
  type CatalogMutationToken,
  type WorkspaceView,
} from './types';
import type { WorkspaceRequest } from './protocol';

export interface WorkspacePersistence {
  loadCatalog: () => Promise<PersistedCatalogLoadResult>;
  saveCatalog: (
    candidate: ConfigImportCandidate,
    source: ConfigurationSourceIdentity,
    expectedCatalogToken: CatalogMutationToken,
  ) => Promise<unknown>;
  deleteConfiguration: (
    expectedCatalogToken: Extract<CatalogMutationToken, { kind: 'ready' }>,
  ) => Promise<void>;
}

const defaultPersistence: WorkspacePersistence = {
  loadCatalog: loadPersistedCatalog,
  saveCatalog: savePersistedCatalog,
  deleteConfiguration: deletePersistedConfiguration,
};

function assertCatalogToken(view: WorkspaceView, expected: CatalogMutationToken): void {
  if (!isSameCatalogMutationToken(view.catalogToken, expected)) {
    throw new WorkspaceOperationError(
      'STALE_WORKSPACE',
      'Configuration changed in another Roo window. Review and try again.',
    );
  }
}

export class WorkspaceCoordinator {
  private readonly persistence: WorkspacePersistence;
  private readonly workspaceCache = new WorkspaceSnapshotCache();
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(persistence: WorkspacePersistence = defaultPersistence) {
    this.persistence = persistence;
  }

  handle(request: WorkspaceRequest): Promise<WorkspaceView> {
    const operation = this.mutationQueue.then(
      () => this.execute(request),
      () => this.execute(request),
    );
    this.mutationQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  invalidateWorkspaceCache(): void {
    this.workspaceCache.invalidate();
  }

  async warmWorkspaceCache(): Promise<void> {
    await this.handle({ type: 'GET_WORKSPACE' });
  }

  private async loadWorkspaceFresh(): Promise<WorkspaceView> {
    const catalog = await this.persistence.loadCatalog();
    return buildWorkspaceView(catalog);
  }

  private async loadWorkspaceAfterMutation(): Promise<WorkspaceView> {
    const workspace = await this.loadWorkspaceFresh();
    this.workspaceCache.replace(workspace);
    return workspace;
  }

  private async execute(request: WorkspaceRequest): Promise<WorkspaceView> {
    try {
      if (request.type === 'GET_WORKSPACE') {
        return await this.workspaceCache.getOrLoad(() => this.loadWorkspaceFresh());
      }

      if (request.type === 'IMPORT_CATALOG') {
        return await this.executeImport(request);
      }

      return await this.executeDelete(request);
    } catch (error) {
      if (error instanceof WorkspaceOperationError) {
        throw error;
      }

      if (error instanceof ConfigImportError) {
        throw new WorkspaceOperationError('INVALID_CATALOG', error.message);
      }

      if (error instanceof CatalogStorageError) {
        throw new WorkspaceOperationError(
          error.code === 'STALE' ? 'STALE_WORKSPACE' : 'STORAGE_FAILED',
          error.message,
        );
      }

      throw new WorkspaceOperationError('STORAGE_FAILED', 'Unable to complete Roo workspace operation.');
    }
  }

  private async executeImport(
    request: Extract<WorkspaceRequest, { type: 'IMPORT_CATALOG' }>,
  ): Promise<WorkspaceView> {
    const currentCatalog = await this.persistence.loadCatalog();
    const currentWorkspace = buildWorkspaceView(currentCatalog);
    assertCatalogToken(currentWorkspace, request.expectedCatalogToken);

    if (request.fileName !== getConfigurationEditorFileName(request.source)) {
      throw new WorkspaceOperationError(
        'INVALID_REQUEST',
        'Configuration source metadata is invalid.',
      );
    }

    let candidate: ConfigImportCandidate;

    try {
      candidate = prepareConfigImport(request.fileName, request.sourceText);
    } catch (error) {
      if (error instanceof ConfigImportError) {
        throw new WorkspaceOperationError('INVALID_CATALOG', error.message);
      }

      throw new WorkspaceOperationError('INVALID_CATALOG', 'Configuration is invalid.');
    }

    await this.persistence.saveCatalog(candidate, request.source, request.expectedCatalogToken);
    return this.loadWorkspaceAfterMutation();
  }

  private async executeDelete(
    request: Extract<WorkspaceRequest, { type: 'DELETE_CONFIGURATION' }>,
  ): Promise<WorkspaceView> {
    const currentCatalog = await this.persistence.loadCatalog();
    const currentWorkspace = buildWorkspaceView(currentCatalog);
    assertCatalogToken(currentWorkspace, request.expectedCatalogToken);

    if (
      currentWorkspace.catalog.status !== 'ready' ||
      currentWorkspace.catalog.source?.kind !== 'uploaded'
    ) {
      throw new WorkspaceOperationError(
        'INVALID_REQUEST',
        'Roo-created configuration cannot be deleted.',
      );
    }

    if (request.confirmationFileName !== currentWorkspace.catalog.source.fileName) {
      throw new WorkspaceOperationError(
        'INVALID_REQUEST',
        'Confirmation filename does not match the uploaded configuration.',
      );
    }

    await this.persistence.deleteConfiguration(request.expectedCatalogToken);
    return this.loadWorkspaceAfterMutation();
  }
}
