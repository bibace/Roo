export type WorkspaceErrorCode =
  | 'STALE_WORKSPACE'
  | 'INVALID_CATALOG'
  | 'STORAGE_FAILED'
  | 'INVALID_REQUEST';

export class WorkspaceOperationError extends Error {
  readonly code: WorkspaceErrorCode;

  constructor(code: WorkspaceErrorCode, message: string) {
    super(message);
    this.name = 'WorkspaceOperationError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
