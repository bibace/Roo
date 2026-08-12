import { stringify } from 'yaml';
import type {
  RooAdditionalRole,
  RooBaseAccount,
  RooConfigDocument,
  RooDefaults,
  RooOrganization,
  RooProject,
} from './types';

export {
  getCanonicalYamlFileName,
} from './canonical-yaml-file-name';

interface PublicBaseAccount {
  account_id: string;
  account_alias?: string;
}

interface PublicOrganization {
  base_accounts: PublicBaseAccount[];
  defaults: RooDefaults;
  projects: Record<string, RooProject>;
}

function copyDefaults(defaults: RooDefaults): RooDefaults {
  return {
    enabled: defaults.enabled,
    roles: [...defaults.roles],
  };
}

function copyAdditionalRole(role: RooAdditionalRole): RooAdditionalRole {
  return role.environments === undefined
    ? {}
    : { environments: [...role.environments] };
}

function copyProjects(projects: Record<string, RooProject>): Record<string, RooProject> {
  return Object.fromEntries(
    Object.entries(projects).map(([projectName, project]) => [
      projectName,
      {
        accounts: { ...project.accounts },
        roles: Object.fromEntries(
          Object.entries(project.roles).map(([roleName, role]) => [
            roleName,
            copyAdditionalRole(role),
          ]),
        ),
      },
    ]),
  );
}

function toPublicBaseAccount(baseAccount: RooBaseAccount): PublicBaseAccount {
  return {
    account_id: baseAccount.accountId,
    ...(baseAccount.accountAlias === undefined
      ? {}
      : { account_alias: baseAccount.accountAlias }),
  };
}

function toPublicOrganization(organization: RooOrganization): PublicOrganization {
  return {
    base_accounts: organization.baseAccounts.map(toPublicBaseAccount),
    defaults: copyDefaults(organization.defaults),
    projects: copyProjects(organization.projects),
  };
}

function toPublicDocument(config: RooConfigDocument): object {
  if ('organizations' in config) {
    return {
      version: config.version,
      organizations: Object.fromEntries(
        Object.entries(config.organizations).map(([organizationId, organization]) => [
          organizationId,
          toPublicOrganization(organization),
        ]),
      ),
    };
  }

  return {
    version: config.version,
    defaults: copyDefaults(config.defaults),
    projects: copyProjects(config.projects),
  };
}

export function serializeCanonicalYaml(config: RooConfigDocument): string {
  const sourceText = stringify(toPublicDocument(config), {
    indent: 2,
    lineWidth: 0,
    collectionStyle: 'block',
    aliasDuplicateObjects: false,
    sortMapEntries: false,
    directives: false,
  });

  return `${sourceText.replace(/\n+$/, '')}\n`;
}
