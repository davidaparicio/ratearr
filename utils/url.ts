/**
 * `raw` as an absolute https URL, or undefined. Links rendered in the popup
 * come from third-party API data, so anything else (javascript:, data:, or a
 * malformed value) must not become a link. With `base`, `raw` is resolved
 * against it and must stay on the same host.
 */
export function httpsUrl(raw: string, base?: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:') return undefined;
  if (base && url.host !== new URL(base).host) return undefined;
  return url.href;
}
