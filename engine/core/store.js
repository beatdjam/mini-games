// engine: Saved data in localStorage. loadStore merges what was saved over fresh defaults, so fields added in a later
// version appear in old saves. Plain objects merge key by key (deeply); arrays and other values are replaced.
export function mergeDefaults(d, s) {
  for (const k of Object.keys(s)) {
    const a = d[k], b = s[k];
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) mergeDefaults(a, b);
    else d[k] = b;
  }
  return d;
}
// returns { data, raw }: data = defaults with the save merged in, raw = the save as stored (null if none / unreadable),
// so the game can convert data from older versions by looking at raw
export function loadStore(key, defaults) {
  const d = defaults();
  try {
    const s = JSON.parse(localStorage.getItem(key));
    if (s && typeof s === 'object') return { data: mergeDefaults(d, s), raw: s };
  } catch (e) {}
  return { data: d, raw: null };
}
export function saveStore(key, obj) { try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {} }
export function clearStore(key) { try { localStorage.removeItem(key); } catch (e) {} }
// small per-browser conveniences (a remembered tab and the like); never throws
export function prefGet(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; } }
export function prefSet(key, v) { try { localStorage.setItem(key, v); } catch (e) {} }
