export interface RooDefaults {
  enabled: boolean;
  roles: string[];
}

export interface RooAdditionalRole {
  environments?: string[];
}

export interface RooProject {
  accounts: Record<string, string>;
  roles: Record<string, RooAdditionalRole>;
}

export interface RooConfigV1 {
  version: 1;
  defaults: RooDefaults;
  projects: Record<string, RooProject>;
}

export type RooConfigVersion = 1 | 2;

export type RooConfigMode = 'simple' | 'organization';

export interface RooBaseAccount {
  accountId: string;
  accountAlias?: string;
}

export interface RooOrganization {
  baseAccounts: RooBaseAccount[];
  defaults: RooDefaults;
  projects: Record<string, RooProject>;
}

export interface RooConfigV2Simple {
  version: 2;
  defaults: RooDefaults;
  projects: Record<string, RooProject>;
}

export interface RooConfigV2Organizations {
  version: 2;
  organizations: Record<string, RooOrganization>;
}

export type RooConfigV2 = RooConfigV2Simple | RooConfigV2Organizations;

export type RooConfigDocument = RooConfigV1 | RooConfigV2;

export interface RooSimpleScope {
  kind: 'simple';
  configVersion: 1 | 2;
  defaults: RooDefaults;
  projects: Record<string, RooProject>;
}

export interface RooOrganizationScope {
  kind: 'organization';
  configVersion: 2;
  organizationId: string;
  baseAccounts: RooBaseAccount[];
  defaults: RooDefaults;
  projects: Record<string, RooProject>;
}

export type RooConfigScope = RooSimpleScope | RooOrganizationScope;
