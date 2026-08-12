export type AwsJumpFailureCode =
  | 'INVALID_REQUEST'
  | 'SESSION_METADATA_INVALID'
  | 'SIGNIN_ENDPOINT_INVALID'
  | 'PRISM_SESSION_MISSING'
  | 'PRISM_REQUEST_FAILED'
  | 'PRISM_HTTP_FAILED'
  | 'PRISM_RESPONSE_INVALID'
  | 'PRISM_DESTINATION_INVALID'
  | 'LEGACY_CSRF_UNAVAILABLE'
  | 'DOCUMENT_BODY_UNAVAILABLE';

export type AwsSwitchRoleSubmissionResult =
  | {
      status: 'submitted';
      mode: 'legacy' | 'prism';
    }
  | {
      status: 'unavailable';
      reason: AwsJumpFailureCode;
    };
