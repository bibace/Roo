import type { AwsJumpFailureCode } from './aws-jump-result';

export type AwsJumpClientFailureCode =
  | AwsJumpFailureCode
  | 'ACTIVE_TAB_NOT_FOUND'
  | 'ACTIVE_TAB_UNSUPPORTED'
  | 'SCRIPTING_FAILED'
  | 'EXECUTOR_RESULT_INVALID';

export class AwsJumpError extends Error {
  readonly code: AwsJumpClientFailureCode;

  constructor(code: AwsJumpClientFailureCode) {
    super(code);
    this.name = 'AwsJumpError';
    this.code = code;
  }
}
