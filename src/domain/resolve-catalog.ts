import type { RooConfigScope, RooConfigV1 } from '../config/types';
import type { JumpTarget } from './jump-target';
import { compareJumpTargets } from './jump-target-order';
import { getRoleShortName } from './role';

export function resolveScopeCatalog(scope: RooConfigScope): JumpTarget[] {
  const targets: JumpTarget[] = [];
  const seenTargets = new Set<string>();

  const addTarget = (
    accountId: string,
    accountName: string,
    project: string,
    environment: string,
    role: string,
  ) => {
    const target: JumpTarget = {
      accountId,
      accountName,
      project,
      environment,
      role,
      roleShortName: getRoleShortName(role),
    };
    const targetKey = JSON.stringify(target);

    if (!seenTargets.has(targetKey)) {
      seenTargets.add(targetKey);
      targets.push(target);
    }
  };

  for (const project of Object.keys(scope.projects)) {
    const projectConfig = scope.projects[project];

    if (!projectConfig) {
      continue;
    }

    for (const environment of Object.keys(projectConfig.accounts)) {
      const accountId = projectConfig.accounts[environment];

      if (!accountId) {
        continue;
      }

      const accountName = `${project}-${environment}`;

      if (scope.defaults.enabled) {
        for (const role of scope.defaults.roles) {
          addTarget(accountId, accountName, project, environment, role);
        }
      }

      for (const [role, roleConfig] of Object.entries(projectConfig.roles)) {
        if (roleConfig.environments === undefined || roleConfig.environments.includes(environment)) {
          addTarget(accountId, accountName, project, environment, role);
        }
      }
    }
  }

  return targets.sort(compareJumpTargets);
}

export function resolveCatalog(config: RooConfigV1): JumpTarget[] {
  return resolveScopeCatalog({
    kind: 'simple',
    configVersion: 1,
    defaults: config.defaults,
    projects: config.projects,
  });
}
