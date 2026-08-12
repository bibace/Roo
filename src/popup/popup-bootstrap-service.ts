import type { AwsConsoleContextProbe } from '../aws-context/types';
import { resolveActiveOrganization } from '../domain/resolve-active-organization';
import type { WorkspaceView } from '../workspace/types';
import type { PopupBootstrap } from './bootstrap-protocol';

export interface PopupBootstrapDependencies {
  getWorkspace: () => Promise<WorkspaceView>;
  getActiveAwsTabContextProbe: () => Promise<AwsConsoleContextProbe>;
}

function getSimpleBootstrap(workspace: WorkspaceView): PopupBootstrap {
  return {
    targets: workspace.targets,
    catalogStatus: workspace.catalog.status,
    summary: workspace.summary,
    searchEnabled: true,
  };
}

function getContextFailureBootstrap(
  message: string,
  catalogStatus: WorkspaceView['catalog']['status'],
): PopupBootstrap {
  return {
    targets: [],
    catalogStatus,
    summary: { accounts: 0, roles: 0 },
    searchEnabled: false,
    contextMessage: message,
  };
}

function getOrganizationBootstrap(
  workspace: WorkspaceView,
  organizationId: string,
): PopupBootstrap {
  const organization = workspace.organizations.find((candidate) =>
    candidate.organizationId === organizationId,
  );

  if (!organization) {
    return getContextFailureBootstrap(
      'Configuration needs attention.',
      workspace.catalog.status,
    );
  }

  const contextMessage = organization.targets.length > 0
    ? undefined
    : 'No destinations configured for this organization.';

  return {
    targets: organization.targets,
    catalogStatus: workspace.catalog.status,
    summary: organization.summary,
    searchEnabled: true,
    contextMessage,
    organizationId,
  };
}

export async function getPopupBootstrap(
  dependencies: PopupBootstrapDependencies,
): Promise<PopupBootstrap> {
  const workspace = await dependencies.getWorkspace();

  if (workspace.mode === 'simple') {
    return getSimpleBootstrap(workspace);
  }

  const config = workspace.catalog.config;

  if (!config || !('organizations' in config)) {
    return getContextFailureBootstrap(
      'Configuration needs attention.',
      workspace.catalog.status,
    );
  }

  const probe = await dependencies.getActiveAwsTabContextProbe();

  if (probe.result.status === 'not-aws-console') {
    return getContextFailureBootstrap(
      'Open Roo from a supported AWS Console tab.',
      workspace.catalog.status,
    );
  }

  if (probe.result.status === 'unavailable') {
    return getContextFailureBootstrap(
      'Unable to determine the current AWS account.',
      workspace.catalog.status,
    );
  }

  const resolution = resolveActiveOrganization(
    config,
    probe.result.context,
  );

  if (resolution.status !== 'resolved') {
    return getContextFailureBootstrap(
      resolution.status === 'conflict'
        ? 'AWS account context conflicts with Roo organization ownership.'
        : 'Current AWS account is not assigned to a Roo organization.',
      workspace.catalog.status,
    );
  }

  return getOrganizationBootstrap(workspace, resolution.organizationId);
}
