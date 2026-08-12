import { useEffect, useRef, useState } from 'react';
import { ConfigImportError } from '../import/config-import-error';
import {
  clearCreatedConfigurationDraft,
  formatConfigurationDraft,
  type ConfigurationDraft,
} from './configuration-draft';
import { ConfigurationEditor } from './configuration-editor';
import { reviewImportCandidate } from './stale-import';
import {
  CONFIGURATION_VALIDATION_DEBOUNCE_MS,
  validateConfigurationDraft,
  type ConfigurationValidationResult,
} from './configuration-validation';

type EditorValidationState =
  | ConfigurationValidationResult
  | {
      status: 'pending';
      sourceText: string;
    };

interface ConfigurationEditorSessionProps {
  draft: ConfigurationDraft;
  isMutating: boolean;
  saveError: string | null;
  saveValidationError: ConfigImportError | null;
  onDraftChange: (draft: ConfigurationDraft) => void;
  onCancel: () => void;
  onSave: (draft: ConfigurationDraft) => void;
  onRetryLatest: (draft: ConfigurationDraft) => void;
  onReviewLatest: (draft: ConfigurationDraft) => void;
}

function ValidationError({ error }: { error: ConfigImportError }) {
  return (
    <div className="import-error" role="alert">
      {error.issues.length > 0
        ? error.issues.map((issue) => (
            <p key={`${issue.path}:${issue.message}`}>
              {issue.path}: {issue.message}
            </p>
          ))
        : <p>{error.message}</p>}
    </div>
  );
}

export default function ConfigurationEditorSession({
  draft,
  isMutating,
  saveError,
  saveValidationError,
  onDraftChange,
  onCancel,
  onSave,
  onRetryLatest,
  onReviewLatest,
}: ConfigurationEditorSessionProps) {
  const [validation, setValidation] = useState<EditorValidationState>(
    () => validateConfigurationDraft(draft),
  );
  const [clearConfirmationOpen, setClearConfirmationOpen] = useState(false);
  const validationGenerationRef = useRef(0);
  const validatedSourceRef = useRef(draft.sourceText);

  useEffect(() => {
    if (draft.sourceText === validatedSourceRef.current) {
      return;
    }

    const validationGeneration = validationGenerationRef.current + 1;
    validationGenerationRef.current = validationGeneration;
    const validationDraft = draft;
    setValidation({ status: 'pending', sourceText: draft.sourceText });

    const timeout = setTimeout(() => {
      const result = validateConfigurationDraft(validationDraft);

      if (validationGeneration === validationGenerationRef.current) {
        validatedSourceRef.current = validationDraft.sourceText;
        setValidation(result);
      }
    }, CONFIGURATION_VALIDATION_DEBOUNCE_MS);

    return () => {
      clearTimeout(timeout);
    };
  }, [draft.sourceText]);

  const currentValidation = validation.sourceText === draft.sourceText
    ? validation
    : { status: 'pending' as const, sourceText: draft.sourceText };
  const currentCandidate = saveValidationError === null && currentValidation.status === 'valid'
    ? currentValidation.candidate
    : undefined;
  const hasStaleGate = draft.staleState !== undefined;

  const handleSourceChange = (sourceText: string) => {
    if (isMutating || sourceText === draft.sourceText) {
      return;
    }

    validationGenerationRef.current += 1;
    setValidation({ status: 'pending', sourceText });
    onDraftChange({ ...draft, sourceText });
  };

  const handleFormat = () => {
    if (!currentCandidate || isMutating) {
      return;
    }

    try {
      const formattedDraft = formatConfigurationDraft(draft);
      validationGenerationRef.current += 1;
      validatedSourceRef.current = formattedDraft.sourceText;
      setValidation({
        status: 'valid',
        sourceText: formattedDraft.sourceText,
        candidate: currentCandidate,
      });
      onDraftChange(formattedDraft);
    } catch (error) {
      const validationError = error instanceof ConfigImportError
        ? error
        : new ConfigImportError('PARSE_FAILED', 'Unable to parse configuration.');
      validatedSourceRef.current = draft.sourceText;
      setValidation({
        status: 'invalid',
        sourceText: draft.sourceText,
        error: validationError,
      });
    }
  };

  const handleClear = () => {
    if (isMutating) {
      return;
    }

    const clearedDraft = clearCreatedConfigurationDraft(draft);
    const clearedValidation = validateConfigurationDraft(clearedDraft);
    validationGenerationRef.current += 1;
    validatedSourceRef.current = clearedDraft.sourceText;
    setValidation(clearedValidation);
    setClearConfirmationOpen(false);
    onDraftChange(clearedDraft);
  };

  const canClear = draft.origin === 'edit' && draft.source.kind === 'created';

  return (
    <>
      <div className="configuration-editor-heading">
        <h3>Configuration editor</h3>
        <p>{draft.fileName}</p>
        <p>Canonical YAML</p>
        {draft.source.kind === 'uploaded' && (
          <p>Uploaded from {draft.source.fileName}</p>
        )}
      </div>
      <ConfigurationEditor
        value={draft.sourceText}
        readOnly={isMutating}
        onChange={handleSourceChange}
      />
      {currentCandidate && (
        <dl className="candidate-preview">
          <dt>Projects</dt>
          <dd>{currentCandidate.summary.projects}</dd>
          <dt>Accounts</dt>
          <dd>{currentCandidate.summary.accounts}</dd>
          <dt>Roles</dt>
          <dd>{currentCandidate.summary.destinations}</dd>
        </dl>
      )}
      {currentValidation.status === 'pending' && (
        <p>Checking configuration…</p>
      )}
      {currentValidation.status === 'invalid' && (
        <ValidationError error={currentValidation.error} />
      )}
      {currentValidation.status === 'valid' && saveValidationError === null && (
        <p className="import-success">Configuration is valid.</p>
      )}
      {saveValidationError && <ValidationError error={saveValidationError} />}
      {draft.staleState?.status === 'needs-refresh' && (
        <div className="import-error" role="alert">
          <p>Configuration changed in another Roo window.</p>
          <p>Unable to load the latest configuration. Retry to continue.</p>
          <button
            type="button"
            className="secondary-button"
            disabled={isMutating}
            onClick={() => onRetryLatest(draft)}
          >
            Retry latest configuration
          </button>
        </div>
      )}
      {draft.staleState?.status === 'needs-review' && (
        <div className="import-error" role="alert">
          <p>Configuration changed in another Roo window. Review and try again.</p>
          <button
            type="button"
            className="secondary-button"
            disabled={isMutating}
            onClick={() => onReviewLatest(reviewImportCandidate(draft))}
          >
            Review latest
          </button>
        </div>
      )}
      {saveError && !hasStaleGate && (
        <p className="import-error" role="alert">{saveError}</p>
      )}
      {canClear && !clearConfirmationOpen && (
        <button
          type="button"
          className="secondary-button destructive-action"
          disabled={isMutating}
          onClick={() => setClearConfirmationOpen(true)}
        >
          Clear configuration
        </button>
      )}
      {canClear && clearConfirmationOpen && (
        <div className="configuration-confirmation">
          <h4>Clear configuration?</h4>
          <p>This removes all projects, accounts, and roles from this configuration.</p>
          <p>The configuration itself remains in Roo.</p>
          <div className="configuration-entry-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={isMutating}
              onClick={() => setClearConfirmationOpen(false)}
            >
              Cancel clear
            </button>
            <button
              type="button"
              disabled={isMutating}
              onClick={handleClear}
            >
              Clear configuration
            </button>
          </div>
        </div>
      )}
      <div className="editor-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={!currentCandidate || isMutating}
          onClick={handleFormat}
        >
          Format YAML
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={isMutating}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={
            !currentCandidate ||
            hasStaleGate ||
            isMutating ||
            saveValidationError !== null
          }
          onClick={() => onSave(draft)}
        >
          Save configuration
        </button>
      </div>
    </>
  );
}
