import {
  lazy,
  Suspense,
  useRef,
  useState,
} from 'react';
import type { ChangeEvent } from 'react';
import { ConfigImportError } from '../../src/import/config-import-error';
import type { ConfigurationDraft } from '../../src/options/configuration-draft';
import {
  cancelConfigurationDelete,
  canConfirmConfigurationDelete,
  createConfigurationDeleteState,
  markConfigurationDeleteFailure,
  markConfigurationDeleteStale,
  openConfigurationDelete,
  setConfigurationDeleteConfirmation,
} from '../../src/options/configuration-delete';
import { getCurrentCatalogMessage } from '../../src/options/current-catalog-status';
import {
  isCurrentFileSelection,
  nextFileSelectionGeneration,
} from '../../src/options/file-selection';
import { recoverStaleConfigurationDraft } from '../../src/options/stale-recovery';
import { markImportCandidateNeedsRefresh } from '../../src/options/stale-import';
import { useWorkspace } from '../../src/options/use-workspace';
import {
  deleteConfiguration,
  getWorkspaceErrorCode,
  importCatalog,
} from '../../src/workspace/client';
import type { WorkspaceView } from '../../src/workspace/types';

const ConfigurationEditorSession = lazy(
  () => import(
    '../../src/options/configuration-editor-session'
  ),
);

const ConfigurationGuide = lazy(
  () => import('../../src/options/configuration-guide'),
);

function loadConfigurationDraftTools() {
  return import(
    '../../src/options/configuration-draft'
  );
}

function getPreparationError(error: unknown): ConfigImportError {
  if (error instanceof ConfigImportError) {
    return error;
  }

  return new ConfigImportError('PARSE_FAILED', 'Unable to parse configuration.');
}

function getConfigurationSaveErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to save configuration.';
}

function SettingsFallback() {
  return (
    <main className="roo-settings" role="alert">
      <h1>Roo Settings encountered an unexpected error.</h1>
      <button type="button" onClick={() => window.location.reload()}>Reload</button>
    </main>
  );
}

export default function App() {
  const { state: workspaceState, acceptWorkspace, refresh } = useWorkspace();
  const [configurationGuideOpen, setConfigurationGuideOpen] = useState(false);
  const [configurationDraft, setConfigurationDraft] = useState<ConfigurationDraft | null>(null);
  const [configurationError, setConfigurationError] = useState<ConfigImportError | null>(null);
  const [configurationSaveError, setConfigurationSaveError] = useState<string | null>(null);
  const [configurationValidationError, setConfigurationValidationError] =
    useState<ConfigImportError | null>(null);
  const [configurationSaved, setConfigurationSaved] = useState(false);
  const [configurationDeleted, setConfigurationDeleted] = useState(false);
  const [deleteState, setDeleteState] = useState(createConfigurationDeleteState);
  const [isMutating, setIsMutating] = useState(false);
  const [isPreparingDraft, setIsPreparingDraft] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileSelectionGenerationRef = useRef(0);
  const mutationInFlightRef = useRef(false);
  const draftPreparationInFlightRef = useRef(false);
  const deleteWorkspaceRef = useRef<WorkspaceView | null>(null);

  if (workspaceState.status === 'error') {
    return <SettingsFallback />;
  }

  const workspace = workspaceState.status === 'ready' ? workspaceState.workspace : undefined;
  const currentCatalogMessage = workspace
    ? getCurrentCatalogMessage(workspace.catalog.status)
    : 'Loading…';

  const beginDraftPreparation = (): boolean => {
    if (draftPreparationInFlightRef.current || mutationInFlightRef.current) {
      return false;
    }

    draftPreparationInFlightRef.current = true;
    setIsPreparingDraft(true);
    return true;
  };

  const endDraftPreparation = () => {
    draftPreparationInFlightRef.current = false;
    setIsPreparingDraft(false);
  };

  const resetEditorMessages = () => {
    setConfigurationError(null);
    setConfigurationSaveError(null);
    setConfigurationValidationError(null);
    setConfigurationSaved(false);
    setConfigurationDeleted(false);
  };

  const openFilePicker = () => {
    const input = fileInputRef.current;

    if (
      !input ||
      !workspace ||
      mutationInFlightRef.current ||
      draftPreparationInFlightRef.current
    ) {
      return;
    }

    fileSelectionGenerationRef.current = nextFileSelectionGeneration(
      fileSelectionGenerationRef.current,
    );
    input.value = '';
    input.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];

    if (!file || !workspace || !beginDraftPreparation()) {
      return;
    }

    const fileName = file.name;
    const selectionGeneration = fileSelectionGenerationRef.current;
    const expectedCatalogToken = workspace.catalogToken;
    resetEditorMessages();

    void (async () => {
      let sourceText: string;

      try {
        sourceText = await file.text();
      } catch {
        if (isCurrentFileSelection(selectionGeneration, fileSelectionGenerationRef.current)) {
          setConfigurationDraft(null);
          setConfigurationError(
            new ConfigImportError('FILE_READ_FAILED', 'Unable to read configuration file.'),
          );
        }
        return;
      }

      let draftTools: Awaited<ReturnType<typeof loadConfigurationDraftTools>>;

      try {
        draftTools = await loadConfigurationDraftTools();
      } catch {
        if (isCurrentFileSelection(selectionGeneration, fileSelectionGenerationRef.current)) {
          setConfigurationSaveError('Unable to open configuration editor.');
        }
        return;
      }

      if (!isCurrentFileSelection(selectionGeneration, fileSelectionGenerationRef.current)) {
        return;
      }

      try {
        setConfigurationDraft(draftTools.createUploadedConfigurationDraft(
          fileName,
          sourceText,
          expectedCatalogToken,
        ));
        resetEditorMessages();
      } catch (error) {
        setConfigurationDraft(null);
        setConfigurationError(getPreparationError(error));
      }
    })().finally(endDraftPreparation);
  };

  const beginMutation = (): boolean => {
    if (mutationInFlightRef.current || draftPreparationInFlightRef.current) {
      return false;
    }

    mutationInFlightRef.current = true;
    setIsMutating(true);
    return true;
  };

  const endMutation = () => {
    mutationInFlightRef.current = false;
    setIsMutating(false);
  };

  const beginNewConfiguration = () => {
    if (workspace?.catalog.status !== 'empty' || !beginDraftPreparation()) {
      return;
    }

    resetEditorMessages();
    void loadConfigurationDraftTools().then(
      ({ createNewConfigurationDraft }) => {
        setConfigurationDraft(createNewConfigurationDraft(workspace.catalogToken));
        resetEditorMessages();
      },
      () => setConfigurationSaveError('Unable to open configuration editor.'),
    ).finally(endDraftPreparation);
  };

  const beginEditConfiguration = () => {
    if (
      !workspace ||
      workspace.catalog.status !== 'ready' ||
      !workspace.catalog.config ||
      !workspace.catalog.source ||
      !beginDraftPreparation()
    ) {
      return;
    }

    const { config, source } = workspace.catalog;
    const expectedCatalogToken = workspace.catalogToken;

    resetEditorMessages();
    void loadConfigurationDraftTools().then(
      ({ createCurrentConfigurationDraft }) => {
        setConfigurationDraft(createCurrentConfigurationDraft(
          config,
          source,
          expectedCatalogToken,
        ));
        resetEditorMessages();
      },
      () => setConfigurationSaveError('Unable to open configuration editor.'),
    ).finally(endDraftPreparation);
  };

  const handleDraftChange = (draft: ConfigurationDraft) => {
    if (!mutationInFlightRef.current) {
      setConfigurationDraft(draft);
      setConfigurationSaveError(null);
      setConfigurationValidationError(null);
    }
  };

  const handleCancelConfiguration = () => {
    if (mutationInFlightRef.current) {
      return;
    }

    setConfigurationDraft(null);
    setConfigurationError(null);
    setConfigurationSaveError(null);
    setConfigurationValidationError(null);
  };

  const handleSaveConfiguration = async (submittedDraft: ConfigurationDraft) => {
    if (
      !workspace ||
      submittedDraft.staleState !== undefined ||
      !beginMutation()
    ) {
      return;
    }

    setConfigurationSaveError(null);
    setConfigurationValidationError(null);
    setConfigurationSaved(false);

    try {
      const { prepareConfigurationDraft } = await loadConfigurationDraftTools();

      try {
        prepareConfigurationDraft(submittedDraft);
      } catch (error) {
        setConfigurationValidationError(getPreparationError(error));
        return;
      }

      try {
        const nextWorkspace = await importCatalog({
          expectedCatalogToken: submittedDraft.expectedCatalogToken,
          source: submittedDraft.source,
          fileName: submittedDraft.fileName,
          sourceText: submittedDraft.sourceText,
        });
        acceptWorkspace(nextWorkspace);
        setConfigurationDraft(null);
        setConfigurationError(null);
        setConfigurationSaveError(null);
        setConfigurationSaved(true);
      } catch (error) {
        if (getWorkspaceErrorCode(error) === 'STALE_WORKSPACE') {
          const needsRefresh = markImportCandidateNeedsRefresh(submittedDraft);
          setConfigurationDraft(needsRefresh);
          const recoveredDraft = await recoverStaleConfigurationDraft(needsRefresh, refresh);
          setConfigurationDraft(recoveredDraft);
        } else {
          setConfigurationSaveError(getConfigurationSaveErrorMessage(error));
        }
      }
    } catch {
      setConfigurationSaveError('Unable to save configuration.');
    } finally {
      endMutation();
    }
  };

  const handleRetryLatest = async (draft: ConfigurationDraft) => {
    if (draft.staleState?.status !== 'needs-refresh' || !beginMutation()) {
      return;
    }

    try {
      setConfigurationDraft(await recoverStaleConfigurationDraft(draft, refresh));
    } finally {
      endMutation();
    }
  };

  const handleReviewLatest = (draft: ConfigurationDraft) => {
    if (mutationInFlightRef.current) {
      return;
    }

    setConfigurationDraft(draft);
    setConfigurationSaveError(null);
  };

  const handleOpenDelete = () => {
    if (
      !workspace ||
      workspace.catalog.status !== 'ready' ||
      workspace.catalog.source?.kind !== 'uploaded' ||
      workspace.catalogToken.kind !== 'ready' ||
      mutationInFlightRef.current
    ) {
      return;
    }

    deleteWorkspaceRef.current = workspace;
    setDeleteState(openConfigurationDelete());
    setConfigurationDeleted(false);
  };

  const handleCancelDelete = () => {
    if (mutationInFlightRef.current) {
      return;
    }

    deleteWorkspaceRef.current = null;
    setDeleteState(cancelConfigurationDelete());
  };

  const handleDeleteConfiguration = async () => {
    const deleteWorkspace = deleteWorkspaceRef.current;

    if (
      !deleteWorkspace ||
      deleteWorkspace.catalog.status !== 'ready' ||
      deleteWorkspace.catalog.source?.kind !== 'uploaded' ||
      deleteWorkspace.catalogToken.kind !== 'ready' ||
      !canConfirmConfigurationDelete(deleteState, deleteWorkspace.catalog.source) ||
      !beginMutation()
    ) {
      return;
    }

    setConfigurationDeleted(false);

    try {
      const nextWorkspace = await deleteConfiguration({
        expectedCatalogToken: deleteWorkspace.catalogToken,
        confirmationFileName: deleteWorkspace.catalog.source.fileName,
      });
      acceptWorkspace(nextWorkspace);
      deleteWorkspaceRef.current = null;
      setDeleteState(cancelConfigurationDelete());
      setConfigurationSaved(false);
      setConfigurationDeleted(true);
    } catch (error) {
      if (getWorkspaceErrorCode(error) === 'STALE_WORKSPACE') {
        setDeleteState(markConfigurationDeleteStale);
        await refresh().catch(() => undefined);
      } else {
        setDeleteState(markConfigurationDeleteFailure);
      }
    } finally {
      endMutation();
    }
  };

  const editorUnavailable = isPreparingDraft || isMutating || deleteState.open;
  const deleteSource = deleteWorkspaceRef.current?.catalog.source;

  return (
    <main className="roo-settings">
      <div className="settings-title">
        <img
          src="/icons/48.png"
          width={48}
          height={48}
          alt=""
          aria-hidden="true"
          className="settings-logo"
        />
        <h1>Roo Settings</h1>
      </div>
      <p>Create, upload, or edit the Roo configuration used by the search popup.</p>

      <section>
        <h2>Configuration</h2>
        <input
          ref={fileInputRef}
          id="configuration-file"
          type="file"
          accept=".yaml,.yml,.json"
          onChange={handleFileChange}
          hidden
        />

        {!configurationDraft && (
          <>
            {currentCatalogMessage && <p>{currentCatalogMessage}</p>}
            {workspace?.catalog.status === 'ready' && workspace.catalog.summary && (
              <div className="configuration-summary">
                <div className="configuration-identity">
                  <p>
                    {workspace.catalog.source?.kind === 'uploaded'
                      ? workspace.catalog.source.fileName
                      : 'roo.yaml'}
                  </p>
                  <p>
                    {workspace.catalog.source?.kind === 'uploaded'
                      ? 'Uploaded'
                      : 'Created in Roo'}
                  </p>
                </div>
                {deleteState.open && deleteSource?.kind === 'uploaded' && (
                  <div className="configuration-confirmation">
                    <h3>Delete imported configuration?</h3>
                    <p>This removes {deleteSource.fileName} from Roo.</p>
                    <p>The original file on your computer is not affected.</p>
                    <p>Type {deleteSource.fileName} to confirm.</p>
                    <input
                      aria-label="Confirmation uploaded filename"
                      autoComplete="off"
                      spellCheck={false}
                      value={deleteState.confirmation}
                      disabled={isMutating || deleteState.stale}
                      onChange={(event) => {
                        const confirmation = event.currentTarget.value;
                        setDeleteState((state) => (
                          setConfigurationDeleteConfirmation(state, confirmation)
                        ));
                      }}
                    />
                    {deleteState.error && (
                      <p className="import-error" role="alert">{deleteState.error}</p>
                    )}
                    <div className="configuration-entry-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={isMutating}
                        onClick={handleCancelDelete}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={
                          isMutating ||
                          !canConfirmConfigurationDelete(deleteState, deleteSource)
                        }
                        onClick={() => void handleDeleteConfiguration()}
                      >
                        Delete permanently
                      </button>
                    </div>
                  </div>
                )}
                <p>
                  {workspace.catalog.summary.projects} projects ·{' '}
                  {workspace.catalog.summary.accounts} accounts ·{' '}
                  {workspace.catalog.summary.destinations} roles
                </p>
              </div>
            )}
            {workspace?.catalog.status === 'empty' && (
              <div className="configuration-entry-actions">
                <button
                  type="button"
                  disabled={editorUnavailable}
                  onClick={beginNewConfiguration}
                >
                  New configuration
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={editorUnavailable}
                  onClick={openFilePicker}
                >
                  Upload YAML / JSON
                </button>
              </div>
            )}
            {workspace?.catalog.status === 'ready' && (
              <div className="configuration-entry-actions">
                <button
                  type="button"
                  disabled={editorUnavailable}
                  onClick={beginEditConfiguration}
                >
                  Edit configuration
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={editorUnavailable}
                  onClick={openFilePicker}
                >
                  Replace file
                </button>
                {workspace.catalog.source?.kind === 'uploaded' && (
                  <button
                    type="button"
                    className="secondary-button destructive-action"
                    disabled={editorUnavailable || deleteState.open}
                    onClick={handleOpenDelete}
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
            {workspace?.catalog.status === 'invalid' && (
              <div className="configuration-entry-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={editorUnavailable}
                  onClick={openFilePicker}
                >
                  Replace file
                </button>
              </div>
            )}
            {isPreparingDraft && (
              <div className="configuration-editor-loading">
                Loading configuration editor…
              </div>
            )}
            {configurationError && (
              <div className="import-error" role="alert">
                {configurationError.issues.length > 0
                  ? configurationError.issues.map((issue) => (
                      <p key={`${issue.path}:${issue.message}`}>
                        {issue.path}: {issue.message}
                      </p>
                    ))
                  : <p>{configurationError.message}</p>}
              </div>
            )}
            {configurationSaveError && (
              <p className="import-error" role="alert">{configurationSaveError}</p>
            )}
            {configurationSaved && <p className="import-success">Configuration saved.</p>}
            {configurationDeleted && <p className="import-success">Configuration deleted.</p>}
          </>
        )}

        {configurationDraft && (
          <Suspense
            fallback={
              <div className="configuration-editor-loading">
                Loading configuration editor…
              </div>
            }
          >
            <ConfigurationEditorSession
              draft={configurationDraft}
              isMutating={isMutating}
              saveError={configurationSaveError}
              saveValidationError={configurationValidationError}
              onDraftChange={handleDraftChange}
              onCancel={handleCancelConfiguration}
              onSave={(draft) => void handleSaveConfiguration(draft)}
              onRetryLatest={(draft) => void handleRetryLatest(draft)}
              onReviewLatest={handleReviewLatest}
            />
          </Suspense>
        )}
      </section>

      <section>
        <h2>Help</h2>

        <details
          onToggle={(event) => {
            setConfigurationGuideOpen(event.currentTarget.open);
          }}
        >
          <summary>Configuration Guide</summary>

          {configurationGuideOpen && (
            <Suspense fallback={<p>Loading guide…</p>}>
              <ConfigurationGuide />
            </Suspense>
          )}
        </details>
      </section>

      <section>
        <h2>About Roo</h2>
        <dl className="about-metadata">
          <dt>Author</dt>
          <dd>nova</dd>
          <dt>Repository</dt>
          <dd>
            <a
              href="https://github.com/bibace/Roo"
              target="_blank"
              rel="noreferrer"
            >
              github.com/bibace/Roo
            </a>
          </dd>
        </dl>
      </section>
    </main>
  );
}
