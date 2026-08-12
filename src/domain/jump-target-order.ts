import type { JumpTarget } from './jump-target';

function compareStrings(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

export function compareJumpTargets(left: JumpTarget, right: JumpTarget): number {
  return (
    compareStrings(left.accountName, right.accountName) ||
    compareStrings(left.role, right.role) ||
    compareStrings(left.accountId, right.accountId) ||
    compareStrings(left.project, right.project) ||
    compareStrings(left.environment, right.environment) ||
    compareStrings(left.roleShortName, right.roleShortName)
  );
}

export function getJumpTargetKey(target: Pick<JumpTarget, 'accountId' | 'role'>): string {
  return JSON.stringify([target.accountId, target.role]);
}
