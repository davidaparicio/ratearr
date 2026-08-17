import type { TitleQuery, RatingsPanelData, MediaType } from './types';

export type PanelState = 'idle' | 'loading' | 'ready' | 'no-title';

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
  handler: (msg: Msg, sender: browser.Runtime.MessageSender) => Promise<Msg | void> | void,
): void {
  browser.runtime.onMessage.addListener(
    (message: unknown, sender: browser.Runtime.MessageSender) => {
      const msg = message as Msg;
      const result = handler(msg, sender);
      if (result instanceof Promise) return result;
      return undefined;
    },
  );
}
