// The keys a dev view holds: which are down now and which went down this frame. The page's own shortcuts are stopped
// for the game keys, so space and the arrows do not scroll the page.
export interface HeldKeys {
  held: Set<string>; // every key down now (event.code)
  pressed: Set<string>; // the keys that went down since the caller last cleared it
}

// The keys the dev views use; their browser default (scrolling, text input) is stopped.
const GAME_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'KeyR',
  'KeyF',
  'KeyJ',
  'Space',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'ShiftLeft',
  'ShiftRight',
]);

// Listens to the window. The caller clears `pressed` once a frame, after reading it.
export function heldKeys(): HeldKeys {
  const held = new Set<string>();
  const pressed = new Set<string>();
  window.addEventListener('keydown', event => {
    if (!held.has(event.code)) pressed.add(event.code);
    held.add(event.code);
    if (GAME_KEYS.has(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', event => held.delete(event.code));
  window.addEventListener('blur', () => {
    held.clear();
    pressed.clear();
  });
  return { held, pressed };
}
