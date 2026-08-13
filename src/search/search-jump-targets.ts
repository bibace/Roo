import type { JumpTarget } from '../domain/jump-target';
import { buildJumpTargetSearchIndex } from './search-index';
import type { IndexedJumpTarget } from './search-index';
import { normalizeQuery } from './normalize';

const NO_MATCH = 0;
const PREFIX = 1;
const EXACT = 2;

interface RankedTarget {
  target: JumpTarget;
  wholeQueryExact: boolean;
  exactCount: number;
  prefixCount: number;
}

function compareStrings(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

function getBestMatchType(queryToken: string, searchTerms: readonly string[]): number {
  let bestMatch = NO_MATCH;

  for (const searchTerm of searchTerms) {
    if (searchTerm === queryToken) {
      return EXACT;
    }

    if (searchTerm.startsWith(queryToken)) {
      bestMatch = Math.max(bestMatch, PREFIX);
    }
  }

  return bestMatch;
}

function rankTarget(
  indexedTarget: IndexedJumpTarget,
  queryValue: string,
  queryTokens: readonly string[],
): RankedTarget | undefined {
  let exactCount = 0;
  let prefixCount = 0;

  for (const queryToken of queryTokens) {
    const matchType = getBestMatchType(queryToken, indexedTarget.terms);

    if (matchType === NO_MATCH) {
      return undefined;
    }

    if (matchType === EXACT) {
      exactCount += 1;
    } else {
      prefixCount += 1;
    }
  }

  return {
    target: indexedTarget.target,
    wholeQueryExact: queryTokens.length === 1 && indexedTarget.exactValues.has(queryValue),
    exactCount,
    prefixCount,
  };
}

function compareRankedTargets(left: RankedTarget, right: RankedTarget): number {
  return (
    Number(right.wholeQueryExact) - Number(left.wholeQueryExact) ||
    right.exactCount - left.exactCount ||
    right.prefixCount - left.prefixCount ||
    compareStrings(left.target.accountName, right.target.accountName) ||
    compareStrings(left.target.role, right.target.role) ||
    compareStrings(left.target.accountId, right.target.accountId) ||
    compareStrings(left.target.project, right.target.project) ||
    compareStrings(left.target.environment, right.target.environment) ||
    compareStrings(left.target.roleShortName, right.target.roleShortName)
  );
}

export function searchJumpTargetIndex(
  index: readonly IndexedJumpTarget[],
  query: string,
): JumpTarget[] {
  const normalizedQuery = normalizeQuery(query);

  if (!normalizedQuery) {
    return [];
  }

  return index
    .map((indexedTarget) => rankTarget(indexedTarget, normalizedQuery.value, normalizedQuery.tokens))
    .filter((rankedTarget): rankedTarget is RankedTarget => rankedTarget !== undefined)
    .sort(compareRankedTargets)
    .map(({ target }) => target);
}

export function searchJumpTargets(targets: readonly JumpTarget[], query: string): JumpTarget[] {
  return searchJumpTargetIndex(buildJumpTargetSearchIndex(targets), query);
}
