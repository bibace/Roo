import { isSupportedAwsConsoleUrl } from './supported-url';

export type RooActionState =
  | 'enabled'
  | 'disabled';

export function getRooActionStateForUrl(
  url: string | undefined,
): RooActionState {
  return typeof url === 'string' && isSupportedAwsConsoleUrl(url)
    ? 'enabled'
    : 'disabled';
}
