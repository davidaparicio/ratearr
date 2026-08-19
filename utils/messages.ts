import type { Browser } from 'wxt/browser';
import type { MediaType, RatingsPanelData, TitleQuery } from './types';

export type PanelState = 'idle' | 'loading' | 'ready' | 'no-title' | 'error' | 'not-found';

export type Msg =
  | { kind: 'title-detected'; query: TitleQuery }
  | { kind: 'get-panel-data'; tabId: number }
  | { kind: 'refresh'; tabId: number }
  | { kind: 'select-alternative'; tabId: number; tmdbId: number; mediaType: MediaType }
  | { kind: 'panel-data'; data: RatingsPanelData | null; state: PanelState };

export function sendToBackground(msg: Msg): Promise<Msg> {
  return browser.runtime.sendMessage(msg);
}

export function onMessage(
  handler: (
    msg: Msg,
    sender: Browser.runtime.MessageSender,
  ) => Promise<Msg | undefined> | undefined,
): void {
  browser.runtime.onMessage.addListener(
    (message: unknown, sender: Browser.runtime.MessageSender) => {
      const msg = message as Msg;
      const result = handler(msg, sender);
      if (result instanceof Promise) return result;
      return undefined;
    },
  );
}
