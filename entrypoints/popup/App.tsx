import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import type { JumpTarget } from '../../src/domain/jump-target';
import { searchJumpTargets } from '../../src/search/search-jump-targets';
import { AwsJumpError, type AwsJumpClientFailureCode } from '../../src/navigation/aws-jump-error';
import { openJumpTarget } from '../../src/popup/open-jump-target';
import { openSettings } from '../../src/popup/open-settings';
import { getInitialSelectedIndex, moveSelection } from '../../src/popup/selection';
import ResultRow from '../../src/popup/result-row';

export type PopupCatalogStatus = 'ready' | 'empty' | 'invalid';

type SelectionSource =
  | 'automatic'
  | 'keyboard'
  | 'pointer';

export function ActivationErrorNotice({ code }: { code: AwsJumpClientFailureCode }) {
  return (
    <p className="activation-error">
      Unable to open AWS destination.<br />
      Diagnostic: {code}
    </p>
  );
}

export interface AppProps {
  query: string;
  onQueryChange: (query: string) => void;
  targets?: readonly JumpTarget[];
  catalogStatus?: PopupCatalogStatus;
  summary?: { accounts: number; roles: number };
  searchEnabled?: boolean;
  contextMessage?: string;
  loading?: boolean;
}

export async function activateJumpTarget(
  target: JumpTarget,
  onFailure?: (code: AwsJumpClientFailureCode) => void,
): Promise<boolean> {
  try {
    await openJumpTarget(target);
    window.close();
    return true;
  } catch (error) {
    const code = error instanceof AwsJumpError ? error.code : 'INVALID_REQUEST';
    onFailure?.(code);
    return false;
  }
}

export default function App({
  query,
  onQueryChange,
  targets = [],
  catalogStatus = 'empty',
  summary: bootstrapSummary,
  searchEnabled = true,
  contextMessage,
  loading = false,
}: AppProps) {
  const visibleTargets = loading ? [] : targets;
  const displayCatalogStatus = catalogStatus;
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [selectionSource, setSelectionSource] = useState<SelectionSource>('automatic');
  const [activationError, setActivationError] = useState<AwsJumpClientFailureCode | null>(null);
  const [settingsError, setSettingsError] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const activeRowRef = useRef<HTMLButtonElement>(null);
  const results = useMemo(
    () => searchEnabled ? searchJumpTargets(visibleTargets, query) : [],
    [visibleTargets, query, searchEnabled],
  );
  const summary = bootstrapSummary ?? {
    accounts: new Set(visibleTargets.map((target) => target.accountId)).size,
    roles: visibleTargets.length,
  };

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(getInitialSelectedIndex(results.length));
    setSelectionSource('automatic');
  }, [query, results]);

  useEffect(() => {
    if (selectedIndex < 0 || selectedIndex >= results.length) {
      return;
    }

    activeRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [results, selectedIndex]);

  const activate = async (target: JumpTarget): Promise<void> => {
    setActivationError(null);
    await activateJumpTarget(target, (code) => setActivationError(code));
  };

  const activateSettings = async (): Promise<void> => {
    setSettingsError(false);

    try {
      await openSettings();
    } catch {
      setSettingsError(true);
    }
  };

  const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value;
    onQueryChange(value);
    setActivationError(null);
    setSettingsError(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectionSource('keyboard');
      setSelectedIndex((currentIndex) => moveSelection(currentIndex, results.length, 'down'));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectionSource('keyboard');
      setSelectedIndex((currentIndex) => moveSelection(currentIndex, results.length, 'up'));
      return;
    }

    if (event.key !== 'Enter') {
      return;
    }

    const selectedTarget = results[selectedIndex];

    if (!selectedTarget) {
      return;
    }

    event.preventDefault();
    void activate(selectedTarget);
  };

  return (
    <main className="roo-popup">
      <input
        ref={searchInputRef}
        className="search-input"
        type="search"
        aria-label="Search AWS destinations"
        autoFocus
        placeholder="Search"
        value={query}
        onChange={handleQueryChange}
        onKeyDown={handleKeyDown}
        disabled={!loading && !searchEnabled}
      />

      {!loading && (
        <p className="catalog-statistics">
          {summary.accounts} accounts · {summary.roles} roles
        </p>
      )}

      {loading
        ? <p className="catalog-status">Loading…</p>
        : contextMessage
        ? <p className="catalog-status">{contextMessage}</p>
        : displayCatalogStatus === 'ready' && visibleTargets.length === 0
          ? <p className="catalog-status">No AWS destinations configured.</p>
        : displayCatalogStatus === 'empty'
          ? <p className="catalog-status">No configuration imported.</p>
          : displayCatalogStatus === 'invalid'
            ? <p className="catalog-status">Configuration needs attention.</p>
            : null}

      <div className="result-region">
        {results.map((target, index) => (
          <ResultRow
            key={`${target.accountId}:${target.role}`}
            ref={index === selectedIndex ? activeRowRef : undefined}
            target={target}
            isActive={index === selectedIndex}
            scrollAccountName={index === selectedIndex && selectionSource !== 'pointer'}
            onActivate={activate}
            onMouseMove={() => {
              setSelectionSource('pointer');
              setSelectedIndex(index);
            }}
          />
        ))}
      </div>

      {activationError && <ActivationErrorNotice code={activationError} />}
      {settingsError && <p className="settings-error">Unable to open Settings.</p>}
      <button className="settings-action" type="button" onClick={() => void activateSettings()}>
        Settings
      </button>
    </main>
  );
}
