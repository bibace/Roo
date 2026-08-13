import type { JumpTarget } from '../domain/jump-target';
import { deriveRoleAliases } from './aliases';
import { normalizeSearchTerms, normalizeSearchValue } from './normalize';

export interface IndexedJumpTarget {
  target: JumpTarget;
  terms: readonly string[];
  exactValues: ReadonlySet<string>;
}

export function buildJumpTargetSearchIndex(
  targets: readonly JumpTarget[],
): readonly IndexedJumpTarget[] {
  return targets.map((target) => {
    const searchableValues = [
      target.accountId,
      target.accountName,
      target.project,
      target.environment,
      target.role,
      target.roleShortName,
      ...deriveRoleAliases(target.roleShortName),
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

    return {
      target,
      terms: [...terms],
      exactValues,
    };
  });
}
