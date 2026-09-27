'use strict';
// Sound effect recipes (the synth is js/audio.js)
const SFX = {
  // pistol: snappy — bright short body, light thump, short bright tail
  pistol: () => gunshot({ crack: 0.5, crackF: 6500, body: 0.06, bodyVol: 0.3, bodyF: 2800, bodyEnd: 0.7, thumpF: 220, thump: 0.05, thumpVol: 0.18, tail: 0.15, tailVol: 0.08, tailF: 3800 }),
  smg: () => gunshot({ crack: 0.22, body: 0.07, bodyVol: 0.22, bodyF: 2400, thumpF: 180, thump: 0.07, thumpVol: 0.2, tail: 0.14, tailVol: 0.06 }),
  shotgun: () => {
    gunshot({ crack: 0.45, body: 0.22, bodyVol: 0.55, bodyF: 1100, thumpF: 110, thump: 0.25, thumpVol: 0.6, tail: 0.5, tailVol: 0.22 });
    const t = actx.currentTime + 0.32; // pump: back and forward
    nz(t, 0.05, 0.25, 'bandpass', 1400, 900, 3); nz(t + 0.09, 0.06, 0.3, 'bandpass', 1900, 1200, 3);
  },
  rail: () => {
    const t = actx.currentTime;
    ot(t, 'sawtooth', 2600, 180, 0.45, 0.18); ot(t, 'square', 1300, 90, 0.3, 0.1);   // electric zap falling into a hum
    nz(t, 0.12, 0.35, 'highpass', 6000, 2500); nz(t, 0.6, 0.12, 'bandpass', 3000, 400, 4); // crackle and shimmer tail
    ot(t, 'sine', 90, 30, 0.35, 0.45);
  },
  launcher: () => {
    const t = actx.currentTime;
    ot(t, 'sine', 120, 40, 0.3, 0.55);                   // launch thump
    nz(t, 0.45, 0.35, 'bandpass', 500, 2500, 1.5);         // rising whoosh
    nz(t, 0.06, 0.3, 'highpass', 3000, 2000);
  },
  hit: () => { const t = actx.currentTime; nz(t, 0.03, 0.12, 'bandpass', 3200 * rand(0.9, 1.1), 2000, 4); ot(t, 'square', 1400, 900, 0.03, 0.03); },
  kill: () => { const t = actx.currentTime; nz(t, 0.18, 0.3, 'bandpass', 900, 250, 2); ot(t, 'square', 420, 90, 0.16, 0.1); nz(t, 0.05, 0.15, 'highpass', 4000, 2500); },
  boom: () => { const t = actx.currentTime; ot(t, 'sine', 90, 30, 0.5, 0.6); nz(t, 0.6, 0.5, 'lowpass', 1400, 120); nz(t, 0.08, 0.3, 'highpass', 3000, 1500); },
  bigboom: () => {
    const t = actx.currentTime;
    ot(t, 'sine', 70, 22, 1.0, 0.8); nz(t, 1.2, 0.7, 'lowpass', 1800, 80); nz(t, 0.1, 0.4, 'highpass', 3500, 1500);
    nz(t + 0.15, 0.9, 0.15, 'bandpass', 2500, 600, 2); // debris
  },
  hurt: () => { const t = actx.currentTime; ot(t, 'sine', 130, 50, 0.25, 0.5); nz(t, 0.2, 0.35, 'lowpass', 900, 200); ot(t, 'sawtooth', 220, 110, 0.18, 0.08); },
  pick: () => { const t = actx.currentTime; ot(t, 'sine', 900, 1500, 0.08, 0.14); nz(t, 0.03, 0.08, 'highpass', 5000, 5000); },
  chip: () => { tone(660, 0.1, 'triangle', 0.22, 1.5); tone(990, 0.16, 'triangle', 0.22, 1.3, 0.09); },
  eshot: () => { const t = actx.currentTime; ot(t, 'square', 520 * rand(0.9, 1.1), 180, 0.12, 0.05); nz(t, 0.06, 0.06, 'bandpass', 1500, 700, 2); },
  dash: () => { const t = actx.currentTime; nz(t, 0.22, 0.28, 'bandpass', 800, 3500, 1.2); ot(t, 'sine', 200, 90, 0.15, 0.12); },
  empty: () => { const t = actx.currentTime; nz(t, 0.025, 0.2, 'bandpass', 2800, 2600, 6); },
  reload: () => { const t = actx.currentTime; nz(t, 0.05, 0.25, 'bandpass', 1200, 800, 4); ot(t, 'square', 300, 180, 0.05, 0.06); },   // mag out
  reloaded: () => { const t = actx.currentTime; nz(t, 0.04, 0.3, 'bandpass', 1800, 1400, 5); nz(t + 0.07, 0.05, 0.35, 'bandpass', 2400, 1600, 5); ot(t + 0.07, 'square', 500, 300, 0.04, 0.05); }, // mag in, slide
  portal: () => tone(220, 0.9, 'sine', 0.28, 4),
  beam: () => { const t = actx.currentTime; ot(t, 'sawtooth', 70, 140, 0.6, 0.12, 0.3); nz(t, 0.6, 0.08, 'bandpass', 400, 1600, 6); },
  heal: () => { tone(500, 0.12, 'sine', 0.2, 1.5); tone(750, 0.2, 'sine', 0.2, 1.3, 0.1); },
};
