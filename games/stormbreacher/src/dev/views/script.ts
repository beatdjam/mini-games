// The mission script view (#view-script, SB-050): the M1 script driven by buttons, with the objective, the map marks,
// the cutscene, the flags, the radio band, the result and the time each cue fired. It draws no 3D of its own; the
// buttons stand in for the player, the map and the enemies, none of which exist yet.
import { addSystem, el, t } from '@engine/core/index.ts';
import { M1 } from '../../data/missions/m1.ts';
import { RADIO_TUNE } from '../../data/script.ts';
import { newScript, scriptInput, stepScript, type ScriptInput, type ScriptOut } from '../../logic/script.ts';

declare global {
  interface Window {
    sbScriptReport?: () => string;
  }
}

const PANEL = 'position:fixed;font:12px/1.4 monospace;color:#fff;background:rgba(6,12,18,.72);padding:6px 8px;';
const BUTTON =
  'pointer-events:auto;min-height:30px;padding:0 8px;border-radius:4px;font:inherit;font-size:12px;' +
  'border:1px solid rgba(255,207,106,.55);background:rgba(10,17,25,.85);color:#ffcf6a';

function button(parent: HTMLElement, id: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.id = id;
  b.textContent = label;
  b.style.cssText = BUTTON;
  b.addEventListener('click', onClick);
  parent.appendChild(b);
  return b;
}

// The text of one event for the log: what changed, without the time.
function eventText(event: ScriptOut): string {
  switch (event.kind) {
    case 'objective':
      return `objective ${event.id}`;
    case 'radio':
      return `radio ${event.line}`;
    case 'spawn':
      return `spawn ${event.wave}`;
    case 'ally':
      return `ally ${event.id} ${event.path}`;
    case 'allyMove':
      return `allyMove ${event.id} ${event.path}`;
    case 'cutscene':
      return `cutscene ${event.id}`;
    case 'cutsceneEnd':
      return `cutsceneEnd ${event.id}`;
    case 'checkpoint':
      return `checkpoint ${event.id}`;
    case 'flag':
      return `flag ${event.name}`;
    case 'map':
      return `map ${event.mark} ${event.on ? 'on' : 'off'}`;
    case 'end':
      return `end ${event.result}`;
  }
}

export function showScript(_hash: string) {
  el('#sbApp').hidden = true;

  const state = newScript(M1);
  const events: ScriptOut[] = [];
  const lines: string[] = [];
  const seenCues = new Set<string>();
  const radioQueue: string[] = [];
  let radioLeft = 0;
  let speed = 1;

  const status = document.createElement('div');
  status.id = 'sbScriptStatus';
  status.style.cssText = `${PANEL}left:8px;top:calc(env(safe-area-inset-top,0px) + 8px);white-space:pre;z-index:5`;
  document.body.appendChild(status);

  const radio = document.createElement('div');
  radio.id = 'sbScriptRadio';
  radio.style.cssText =
    `${PANEL}left:calc((100vw - 376px) / 2);bottom:40px;transform:translateX(-50%);max-width:60vw;` +
    'text-align:center;font-size:16px;z-index:7;pointer-events:none';
  document.body.appendChild(radio);

  const bar = document.createElement('div');
  bar.id = 'sbScriptBar';
  bar.style.cssText =
    'position:fixed;right:8px;top:calc(env(safe-area-inset-top,0px) + 8px);z-index:6;display:flex;' +
    'flex-direction:column;gap:4px;align-items:stretch;pointer-events:none';
  document.body.appendChild(bar);

  const log = document.createElement('div');
  log.id = 'sbScriptLog';
  log.style.cssText = `${PANEL}right:8px;bottom:8px;width:360px;max-height:40vh;overflow:auto;white-space:pre;z-index:5`;
  document.body.appendChild(log);

  const speedButtons: Record<number, HTMLButtonElement> = {};

  function setSpeed(next: number) {
    speed = next;
    for (const [value, b] of Object.entries(speedButtons)) {
      const on = Number(value) === speed;
      b.style.background = on ? 'rgba(255,207,106,.85)' : 'rgba(10,17,25,.85)';
      b.style.color = on ? '#10161d' : '#ffcf6a';
    }
  }

  function noteFired() {
    for (const [id, time] of Object.entries(state.fired)) {
      if (seenCues.has(id)) continue;
      seenCues.add(id);
      lines.push(`${id} ${time.toFixed(1)}s`);
    }
  }

  function noteOut(out: ScriptOut[]) {
    for (const event of out) {
      events.push(event);
      if (event.kind === 'radio') radioQueue.push(event.line);
      lines.push(`→ ${event.time.toFixed(1)}s ${eventText(event)}`);
    }
  }

  function send(input: ScriptInput) {
    const out = scriptInput(state, M1, input);
    noteFired();
    noteOut(out);
    render();
  }

  function render() {
    status.textContent =
      `目標  ${state.objective === null ? '—' : t(`obj.${state.objective}`)}\n` +
      `地図  ${state.marks.length > 0 ? state.marks.join(', ') : '—'}\n` +
      `演出  ${state.cutscene === null ? '—' : `${state.cutscene.id} ${state.cutscene.left.toFixed(1)}s`}\n` +
      `旗    ${state.flags.length > 0 ? state.flags.join(', ') : '—'}\n` +
      `結果  ${state.ended ?? '—'}`;
    // The cue log and the event log share the box; the newest lines are the ones in view.
    log.textContent = lines.slice(-40).join('\n');
    log.scrollTop = log.scrollHeight;
  }

  function stepRadio(dt: number) {
    if (radioLeft > 0) {
      radioLeft = Math.max(0, radioLeft - dt);
      if (radioLeft > 0) return;
    }
    const next = radioQueue.shift();
    radio.textContent = next === undefined ? '' : t(next);
    radioLeft = next === undefined ? 0 : RADIO_TUNE.minSec;
  }

  for (const area of Object.keys(M1.areas)) {
    button(bar, `sbScriptEnter-${area}`, `enter ${area}`, () => send({ kind: 'enter', area }));
  }
  for (const target of M1.targets) {
    button(bar, `sbScriptDestroy-${target}`, `destroyed ${target}`, () => send({ kind: 'destroyed', target }));
  }
  button(bar, 'sbScriptAshore', 'ashore', () => send({ kind: 'ashore' }));
  button(bar, 'sbScriptSkip', 'skip', () => send({ kind: 'skip' }));

  const speedRow = document.createElement('div');
  speedRow.style.cssText = 'display:flex;gap:4px;pointer-events:none';
  bar.appendChild(speedRow);
  speedButtons[1] = button(speedRow, 'sbScriptSpeed-1', '×1', () => setSpeed(1));
  speedButtons[4] = button(speedRow, 'sbScriptSpeed-4', '×4', () => setSpeed(4));
  setSpeed(1);

  window.sbScriptReport = () => JSON.stringify({ fired: state.fired, events });

  render();
  addSystem({
    name: 'sb-script',
    update: dt => {
      const out = stepScript(state, M1, dt * speed);
      noteFired();
      noteOut(out);
      stepRadio(dt);
      render();
    },
  });
}
