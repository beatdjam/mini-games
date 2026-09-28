// engine: Saved data in localStorage. loadStore merges what was saved over fresh defaults, so fields added in a later
// version appear in old saves. Plain objects merge key by key (deeply); arrays and other values are replaced.
type Obj = Record<string, any>;
export function mergeDefaults<T extends Obj>(d: T, s: Obj): T {
  for (const k of Object.keys(s)) {
    const a = d[k], b = s[k];
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) mergeDefaults(a, b);
    else (d as Obj)[k] = b;
  }
  return d;
}
// returns { data, raw }: data = defaults with the save merged in, raw = the save as stored (null if none / unreadable),
// so the game can convert data from older versions by looking at raw
export function loadStore<T extends Obj>(key: string, defaults: () => T): { data: T; raw: Obj | null } {
  const d = defaults();
  try {
    const s = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (s && typeof s === 'object') return { data: mergeDefaults(d, s), raw: s };
  } catch (e) {}
  return { data: d, raw: null };
}
export function saveStore(key: string, obj: unknown) { try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {} }
export function clearStore(key: string) { try { localStorage.removeItem(key); } catch (e) {} }
// small per-browser conveniences (a remembered tab and the like); never throws
export function prefGet(key: string, fallback: string): string { try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; } }
export function prefSet(key: string, v: string) { try { localStorage.setItem(key, v); } catch (e) {} }

// Save codes: a save as one line of text, to move it to another device. Not encryption: it only keeps the JSON
// from being read or edited by hand at a glance (XOR with a key from the tag, then base64), and a checksum of the
// JSON catches hand edits and copy-paste damage. Format: <tag>:<base64url>.<checksum, 8 hex digits>
const utf8 = new TextEncoder(), fromUtf8 = new TextDecoder();
function checksum(bytes: Uint8Array): string {
  let h = 0x811c9dc5; // FNV-1a 32-bit
  for (const b of bytes) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
function scramble(bytes: Uint8Array, tag: string): Uint8Array {
  const k = utf8.encode(tag + '/save-code');
  return bytes.map((b, i) => b ^ k[i % k.length]! ^ ((i * 131) & 255)); // the same call undoes it
}
export function encodeStore(tag: string, obj: unknown): string {
  const raw = utf8.encode(JSON.stringify(obj));
  let bin = '';
  scramble(raw, tag).forEach(b => { bin += String.fromCharCode(b); });
  return `${tag}:${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.${checksum(raw)}`;
}
// the object, or null when the code is not a valid code for this tag (wrong game, edited, cut off)
export function decodeStore(tag: string, code: string): unknown {
  const m = code.replace(/\s+/g, '').match(/^([^:]+):([A-Za-z0-9_-]+)\.([0-9a-f]{8})$/);
  if (!m || m[1] !== tag) return null;
  try {
    let b64 = m[2]!.replace(/-/g, '+').replace(/_/g, '/');
    b64 += '='.repeat((4 - b64.length % 4) % 4);
    const raw = scramble(Uint8Array.from(atob(b64), c => c.charCodeAt(0)), tag);
    if (checksum(raw) !== m[3]) return null;
    return JSON.parse(fromUtf8.decode(raw));
  } catch (e) { return null; }
}
