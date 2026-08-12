import { browser } from 'wxt/browser';
import {
  POPUP_BOOTSTRAP_REQUEST,
  parsePopupBootstrapResponse,
  type PopupBootstrap,
} from './bootstrap-protocol';

export type { PopupBootstrap } from './bootstrap-protocol';

export async function loadPopupBootstrap(): Promise<PopupBootstrap> {
  let response: unknown;

  try {
    response = await browser.runtime.sendMessage(POPUP_BOOTSTRAP_REQUEST);
  } catch {
    throw new Error('Unable to load Roo popup.');
  }

  const parsedResponse = parsePopupBootstrapResponse(response);

  if (!parsedResponse?.ok) {
    throw new Error('Unable to load Roo popup.');
  }

  return parsedResponse.bootstrap;
}
