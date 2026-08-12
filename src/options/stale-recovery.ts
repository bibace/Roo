import type { WorkspaceView } from '../workspace/types';
import type { ConfigurationDraft } from './configuration-draft';
import {
  markImportCandidateNeedsRefresh,
  markImportCandidateStale,
} from './stale-import';

export async function recoverStaleConfigurationDraft(
  draft: ConfigurationDraft,
  refresh: () => Promise<WorkspaceView>,
): Promise<ConfigurationDraft> {
  const needsRefresh = markImportCandidateNeedsRefresh(draft);

  try {
    const workspace = await refresh();
    return markImportCandidateStale(needsRefresh, workspace.catalogToken);
  } catch {
    return needsRefresh;
  }
}
