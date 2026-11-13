export const REQUEST_TIMEOUT_MS = 6000;

/**
 * fetch that aborts the request after `timeoutMs`, so one hung host can't keep
 * a lookup (and its open connection) alive indefinitely.
 */
export function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}
