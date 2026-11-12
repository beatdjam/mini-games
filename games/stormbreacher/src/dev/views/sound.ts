import { audioInit, setVolumes } from '@engine/audio/index.ts';
import { SOUND_NAMES, SOUND_DISTANCE, SOUND_VOLUME } from '../../data/sounds.ts';
import { createTunePanel } from '../tunePanel.ts';
import { playSound, soundMix } from '../../view/sound.ts';

// dev view: #view-sound lists every sound in the table with a button, and a distance knob (0..200 m) that applies the
// same gain and pitch the sortie does, so the far sounds can be judged too. The shared tuning panel turns the distance
// table itself (near, far, the quietest gain and pitch) and the effects bus level.
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

  createTunePanel({
    title: '音 #view-sound',
    zIndex: 100, // the sound list covers the page (#sbSound, z-index 99), so the panel has to sit above it
    groups: [
      {
        name: 'SOUND_DISTANCE',
        table: SOUND_DISTANCE,
        ranges: {
          near: { min: 0, max: 100, step: 1 },
          far: { min: 50, max: 400, step: 5 },
          minGain: { min: 0, max: 1, step: 0.01 },
          farPitch: { min: 0.1, max: 2, step: 0.01 },
        },
        labels: { near: '近い（m）', far: '遠い（m）', minGain: '遠くの音量', farPitch: '遠くの高さ' },
      },
      {
        name: 'SOUND_VOLUME',
        table: SOUND_VOLUME,
        ranges: { sfx: { min: 0, max: 1, step: 0.01 } },
        labels: { sfx: '効果音の音量' },
      },
    ],
    onChange: () => {
      audioInit();
      setVolumes(SOUND_VOLUME.sfx, SOUND_VOLUME.bgm);
    },
  });
}
