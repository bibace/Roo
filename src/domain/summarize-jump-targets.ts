import type { JumpTarget } from './jump-target';

export interface JumpTargetSummary {
  accounts: number;
  roles: number;
}

export function summarizeJumpTargets(targets: readonly JumpTarget[]): JumpTargetSummary {
  return {
    accounts: new Set(targets.map((target) => target.accountId)).size,
    roles: targets.length,
  };
}
