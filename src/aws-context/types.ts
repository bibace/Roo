export type AwsConsoleContextSource = 'console-nav' | 'dom';

export interface AwsConsoleContext {
  loginAccountIdOrAlias: string | null;
  currentAccountIdOrAlias: string | null;
  multiSession: boolean;
  source: AwsConsoleContextSource;
}

export type AwsConsoleContextResult =
  | {
      status: 'ready';
      context: AwsConsoleContext;
    }
  | {
      status: 'not-aws-console';
    }
  | {
      status: 'unavailable';
  };

export interface AwsConsoleContextProbe {
  tabId: number | null;
  result: AwsConsoleContextResult;
}

export interface RawAwsConsolePageSnapshot {
  loginDisplayNameAccount: string | null;
  roleDisplayNameAccount: string | null;
  multiSession: boolean;
  source: AwsConsoleContextSource;
}
