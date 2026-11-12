import { audioInit } from '@engine/audio/index.ts';
import { SOUND_NAMES, SOUND_DISTANCE } from '../../data/sounds.ts';
import { playSound, soundMix } from '../../view/sound.ts';

// dev view: #view-sound lists every sound in the table with a button, and a distance knob (0..200 m) that applies the
// same gain and pitch the sortie does, so the far sounds can be judged too.
export function showSound(): void {
  document.getElementById('sbSound')?.remove();
  const box = document.createElement('div');
  box.id = 'sbSound';
  box.style.cssText =
    'position:fixed;inset:0;z-index:99;overflow:auto;padding:16px;background:#0a0b0b;color:#ddd;font:14px sans-serif';
  const minDistance = 0;
  const maxDistance = Math.round(SOUND_DISTANCE.far);
  box.innerHTML =
    `<p>sound effects: ${SOUND_NAMES.length}. distance ${minDistance}-${maxDistance} m</p>` +
    `<p><label>distance <input id="sbSoundDistance" type="range" min="${minDistance}" max="${maxDistance}" step="10" value="${minDistance}"> <output id="sbSoundOut">${minDistance} m</output></label></p>` +
    SOUND_NAMES.map(
      name =>
        `<div style="display:flex;gap:8px;align-items:center;margin:4px 0"><b style="width:130px">${name}</b><button data-sound="${name}">play</button></div>`,
    ).join('');
  const range = box.querySelector<HTMLInputElement>('#sbSoundDistance');
  const out = box.querySelector<HTMLOutputElement>('#sbSoundOut');
  range?.addEventListener('input', () => {
    if (out) out.textContent = `${range.value} m`;
  });
  box.addEventListener('click', e => {
    const button = e.target;
    if (!(button instanceof HTMLButtonElement)) return;
    const name = SOUND_NAMES.find(candidate => candidate === button.dataset.sound);
    if (!name) return;
    audioInit();
    playSound({ name, ...soundMix(Number(range?.value ?? minDistance)) });
  });
  document.body.appendChild(box);
}
