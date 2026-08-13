import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import type { JumpTarget } from '../../src/domain/jump-target';
import { searchJumpTargetIndex } from '../../src/search/search-jump-targets';
import { buildJumpTargetSearchIndex } from '../../src/search/search-index';
import { AwsJumpError, type AwsJumpClientFailureCode } from '../../src/navigation/aws-jump-error';
import { openJumpTarget } from '../../src/popup/open-jump-target';
import { openSettings } from '../../src/popup/open-settings';
import { getInitialSelectedIndex, moveSelection } from '../../src/popup/selection';
import ResultRow from '../../src/popup/result-row';
import { getVirtualResultWindow } from '../../src/popup/virtual-results';

export type PopupCatalogStatus = 'ready' | 'empty' | 'invalid';

type SelectionSource =
  | 'automatic'
  | 'keyboard'
  | 'pointer';

const EMPTY_TARGETS: readonly JumpTarget[] = [];
const RESULT_ROW_HEIGHT = 34;
const RESULT_OVERSCAN = 4;
const DEFAULT_RESULT_VIEWPORT_HEIGHT = 360;

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
  targets = EMPTY_TARGETS,
  catalogStatus = 'empty',
  summary: bootstrapSummary,
  searchEnabled = true,
  contextMessage,
  loading = false,
}: AppProps) {
  const visibleTargets = loading ? EMPTY_TARGETS : targets;
  const displayCatalogStatus = catalogStatus;
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [selectionSource, setSelectionSource] = useState<SelectionSource>('automatic');
  const [activationError, setActivationError] = useState<AwsJumpClientFailureCode | null>(null);
  const [settingsError, setSettingsError] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultRegionRef = useRef<HTMLDivElement>(null);
  const [resultScrollTop, setResultScrollTop] = useState(0);
  const [resultViewportHeight, setResultViewportHeight] = useState(DEFAULT_RESULT_VIEWPORT_HEIGHT);
  const searchIndex = useMemo(
    () => buildJumpTargetSearchIndex(visibleTargets),
    [visibleTargets],
  );
  const results = useMemo(
    () => searchEnabled ? searchJumpTargetIndex(searchIndex, query) : [],
    [searchIndex, query, searchEnabled],
  );
  const virtualWindow = useMemo(
    () => getVirtualResultWindow(
      results.length,
      resultScrollTop,
      resultViewportHeight,
      RESULT_ROW_HEIGHT,
      RESULT_OVERSCAN,
    ),
    [results.length, resultScrollTop, resultViewportHeight],
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
    setResultScrollTop(0);
    if (resultRegionRef.current && resultRegionRef.current.scrollTop !== 0) {
      resultRegionRef.current.scrollTop = 0;
    }
  }, [query, results]);

  useEffect(() => {
    if (selectedIndex < 0 || selectedIndex >= results.length) {
      return;
    }

    const resultRegion = resultRegionRef.current;

    if (!resultRegion) {
      return;
    }

    const viewportHeight = resultRegion.clientHeight || resultViewportHeight;
    const selectedTop = selectedIndex * RESULT_ROW_HEIGHT;
    const selectedBottom = selectedTop + RESULT_ROW_HEIGHT;
    const currentScrollTop = resultRegion.scrollTop;
    let nextScrollTop = currentScrollTop;

    if (selectedTop < currentScrollTop) {
      nextScrollTop = selectedTop;
    } else if (selectedBottom > currentScrollTop + viewportHeight) {
      nextScrollTop = selectedBottom - viewportHeight;
    }

    const maxScrollTop = Math.max(0, results.length * RESULT_ROW_HEIGHT - viewportHeight);
    nextScrollTop = Math.max(0, Math.min(maxScrollTop, nextScrollTop));

    if (nextScrollTop !== currentScrollTop) {
      resultRegion.scrollTop = nextScrollTop;
      setResultScrollTop(nextScrollTop);
    }
  }, [results.length, resultViewportHeight, selectedIndex]);

  useEffect(() => {
    const resultRegion = resultRegionRef.current;

    if (!resultRegion || resultRegion.clientHeight === 0) {
      return;
    }

    setResultViewportHeight(resultRegion.clientHeight);
  }, [results.length]);

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

      <div
        ref={resultRegionRef}
        className="result-region"
        onScroll={(event) => setResultScrollTop(event.currentTarget.scrollTop)}
      >
        <div
          className="result-spacer"
          aria-hidden="true"
          style={{ height: virtualWindow.topSpacerHeight }}
        />
        {results.slice(virtualWindow.startIndex, virtualWindow.endIndex).map((target, offset) => {
          const index = virtualWindow.startIndex + offset;

          return (
            <ResultRow
              key={`${target.accountId}:${target.role}`}
              target={target}
              isActive={index === selectedIndex}
              scrollAccountName={index === selectedIndex && selectionSource !== 'pointer'}
              onActivate={activate}
              onMouseMove={() => {
                setSelectionSource('pointer');
                setSelectedIndex(index);
              }}
            />
          );
        })}
        <div
          className="result-spacer"
          aria-hidden="true"
          style={{ height: virtualWindow.bottomSpacerHeight }}
        />
      </div>

      {activationError && <ActivationErrorNotice code={activationError} />}
      {settingsError && <p className="settings-error">Unable to open Settings.</p>}
      <button className="settings-action" type="button" onClick={() => void activateSettings()}>
        Settings
      </button>
    </main>
  );
}
