// engine: Checks without playing by hand, driven by the URL hash.
// devHook('view-x', rest => ...) runs when the hash starts with #view-x (rest = what follows, e.g. '-dead').
export function devHook(prefix: string, fn: (rest: string) => void, delay?: number) {
  if (!location.hash.startsWith('#' + prefix)) return;
  setTimeout(() => fn(location.hash.slice(prefix.length + 1)), delay ?? 300);
}
