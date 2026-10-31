import { SFX, audioInit } from '@engine/audio/audio.ts';
import { SFX_NEW, SFX_OLD } from '../../data/sfx.ts';
// dev view: #sfx lists every sound effect, the new set and the old (?sfx1) side by side, a button each, to listen to them
export function showSfx() {
  setTimeout(() => {
    const box = document.createElement('div'),
      names = [...new Set([...Object.keys(SFX), ...Object.keys(SFX_NEW), ...Object.keys(SFX_OLD)])].sort();
    box.style.cssText =
      'position:fixed;inset:0;z-index:99;overflow:auto;padding:16px;background:#0a0b0b;color:#ddd;font:14px sans-serif';
    box.innerHTML =
      '<p>sound effects: new / old (?sfx1). A blank: the same in both sets, or none in the old</p>' +
      names
        .map(
          n =>
            `<div style="display:flex;gap:8px;align-items:center;margin:4px 0"><b style="width:90px">${n}</b>` +
            `<button data-s="new:${n}">new</button>` +
            (SFX_OLD[n] && SFX_NEW[n] ? `<button data-s="old:${n}">old</button>` : '') +
            '</div>',
        )
        .join('');
    box.addEventListener('click', e => {
      const s = (e.target as HTMLElement).dataset.s;
      if (!s) return;
      audioInit();
      const [set, n] = s.split(':') as [string, string];
      (set === 'old' ? SFX_OLD[n] : (SFX_NEW[n] ?? SFX[n]))?.();
    });
    document.body.appendChild(box);
  }, 300);
}
