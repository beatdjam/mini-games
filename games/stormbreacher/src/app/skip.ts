// Skipping a cutscene (SB-180): a click, a tap, Enter, Space or Esc asks for it, and the sortie's update takes the
// request once a frame. Only a press that comes after the sortie began counts, so the click or Enter that started it
// does not skip its own cutscene, and a key held down (auto-repeat) does not either.
const SKIP_KEYS = ['Enter', 'Space', 'Escape'];

let armedAt = 0; // the time (ms, as Event.timeStamp) the sortie began; earlier presses are not requests
let requested = false; // a press came since the last take
let ready = false; // the listeners are set up (a second call does nothing)

function request(event: Event): void {
  if (event.timeStamp > armedAt) requested = true;
}

// Starts a sortie's listening: forgets any earlier request and ignores presses from before now. The listeners go up
// the first time.
export function armSkip(): void {
  armedAt = performance.now();
  requested = false;
  if (ready) return;
  ready = true;
  window.addEventListener('click', request);
  window.addEventListener('pointerdown', request);
  window.addEventListener('keydown', event => {
    if (!event.repeat && SKIP_KEYS.includes(event.code)) request(event);
  });
}

// Whether a skip was asked for since the last call.
export function takeSkip(): boolean {
  const was = requested;
  requested = false;
  return was;
}
