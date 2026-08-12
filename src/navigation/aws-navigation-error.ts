export type AwsNavigationErrorCode = 'INVALID_ACCOUNT_ID' | 'INVALID_ROLE';

export class AwsNavigationError extends Error {
  readonly code: AwsNavigationErrorCode;

  constructor(code: AwsNavigationErrorCode, message: string) {
    super(message);
    this.name = 'AwsNavigationError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
