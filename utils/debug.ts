let enabled = false;

export function setDebug(on: boolean) {
  enabled = on;
}

export function dbg(tag: string, ...args: unknown[]) {
  if (enabled) console.log(`[Ratearr:${tag}]`, ...args);
}
