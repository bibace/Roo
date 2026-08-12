export type ConfigImportErrorCode =
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_READ_FAILED'
  | 'PARSE_FAILED'
  | 'VALIDATION_FAILED';

export interface ConfigValidationIssue {
  path: string;
  message: string;
}

export class ConfigImportError extends Error {
  readonly code: ConfigImportErrorCode;
  readonly issues: readonly ConfigValidationIssue[];

  constructor(
    code: ConfigImportErrorCode,
    message: string,
    issues: readonly ConfigValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'ConfigImportError';
    this.code = code;
    this.issues = issues;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
