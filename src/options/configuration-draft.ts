import { serializeCanonicalYaml } from '../config/canonical-yaml';
import {
  getConfigurationEditorFileName,
  type ConfigurationSourceIdentity,
} from '../catalog/persisted-catalog';
import { getCanonicalYamlFileName } from '../config/canonical-yaml-file-name';
import type { RooConfigDocument } from '../config/types';
import {
  prepareConfigImport,
  type ConfigImportCandidate,
} from '../import/prepare-config-import';
import type { CatalogMutationToken } from '../workspace/types';

export type ConfigurationDraftOrigin =
  | 'new'
  | 'upload'
  | 'edit';

export type ConfigurationStaleState =
  | {
      status: 'needs-refresh';
    }
  | {
      status: 'needs-review';
      latestCatalogToken: CatalogMutationToken;
    };

export interface ConfigurationDraft {
  origin: ConfigurationDraftOrigin;
  source: ConfigurationSourceIdentity;
  fileName: string;
  sourceText: string;
  expectedCatalogToken: CatalogMutationToken;
  staleState?: ConfigurationStaleState;
}

export function createNewConfigurationDraft(
  expectedCatalogToken: CatalogMutationToken,
): ConfigurationDraft {
  const candidate = prepareConfigImport('roo.yaml', 'version: 1\nprojects: {}\n');

  return {
    origin: 'new',
    source: { kind: 'created' },
    fileName: 'roo.yaml',
    sourceText: serializeCanonicalYaml(candidate.config),
    expectedCatalogToken,
  };
}

export function createUploadedConfigurationDraft(
  uploadedFileName: string,
  rawSourceText: string,
  expectedCatalogToken: CatalogMutationToken,
): ConfigurationDraft {
  const candidate = prepareConfigImport(uploadedFileName, rawSourceText);

  return {
    origin: 'upload',
    source: { kind: 'uploaded', fileName: uploadedFileName },
    fileName: getCanonicalYamlFileName(uploadedFileName),
    sourceText: serializeCanonicalYaml(candidate.config),
    expectedCatalogToken,
  };
}

export function createCurrentConfigurationDraft(
  config: RooConfigDocument,
  source: ConfigurationSourceIdentity,
  expectedCatalogToken: CatalogMutationToken,
): ConfigurationDraft {
  return {
    origin: 'edit',
    source,
    fileName: getConfigurationEditorFileName(source),
    sourceText: serializeCanonicalYaml(config),
    expectedCatalogToken,
  };
}

export function prepareConfigurationDraft(
  draft: ConfigurationDraft,
): ConfigImportCandidate {
  return prepareConfigImport(draft.fileName, draft.sourceText);
}

export function formatConfigurationDraft(
  draft: ConfigurationDraft,
): ConfigurationDraft {
  const candidate = prepareConfigurationDraft(draft);

  return {
    ...draft,
    sourceText: serializeCanonicalYaml(candidate.config),
  };
}

export function clearCreatedConfigurationDraft(
  draft: ConfigurationDraft,
): ConfigurationDraft {
  if (draft.origin !== 'edit' || draft.source.kind !== 'created') {
    throw new Error(
      'Clear is only available for an existing Roo-created configuration.',
    );
  }

  const candidate = prepareConfigImport(
    'roo.yaml',
    'version: 1\nprojects: {}\n',
  );

  return {
    ...draft,
    sourceText: serializeCanonicalYaml(candidate.config),
  };
}
