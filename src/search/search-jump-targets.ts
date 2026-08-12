import type { JumpTarget } from '../domain/jump-target';
import { deriveRoleAliases } from './aliases';
import { normalizeQuery, normalizeSearchTerms, normalizeSearchValue } from './normalize';

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

function getSearchTerms(target: JumpTarget): { terms: string[]; exactValues: Set<string> } {
  const aliases = deriveRoleAliases(target.roleShortName);
  const searchableValues = [
    target.accountId,
    target.accountName,
    target.project,
    target.environment,
    target.role,
    target.roleShortName,
    ...aliases,
  ];
  const terms = new Set<string>();
  const exactValues = new Set<string>();

  for (const value of searchableValues) {
    const normalizedValue = normalizeSearchValue(value);

    if (normalizedValue.length > 0) {
      exactValues.add(normalizedValue);
    }

    for (const term of normalizeSearchTerms(value)) {
      terms.add(term);
    }
  }

  return { terms: [...terms], exactValues };
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

function rankTarget(target: JumpTarget, queryValue: string, queryTokens: readonly string[]): RankedTarget | undefined {
  const { terms, exactValues } = getSearchTerms(target);
  let exactCount = 0;
  let prefixCount = 0;

  for (const queryToken of queryTokens) {
    const matchType = getBestMatchType(queryToken, terms);

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
    target,
    wholeQueryExact: queryTokens.length === 1 && exactValues.has(queryValue),
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

export function searchJumpTargets(targets: readonly JumpTarget[], query: string): JumpTarget[] {
  const normalizedQuery = normalizeQuery(query);

  if (!normalizedQuery) {
    return [];
  }

  return targets
    .map((target) => rankTarget(target, normalizedQuery.value, normalizedQuery.tokens))
    .filter((rankedTarget): rankedTarget is RankedTarget => rankedTarget !== undefined)
    .sort(compareRankedTargets)
    .map(({ target }) => target);
}
