export type CatalogStorageErrorCode =
  | 'STALE'
  | 'FAILED';

export class CatalogStorageError extends Error {
  readonly code: CatalogStorageErrorCode;

  constructor(code: CatalogStorageErrorCode, message: string) {
    super(message);
    this.name = 'CatalogStorageError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
