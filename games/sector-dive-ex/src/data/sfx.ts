import { rand } from '@engine/core/util.ts';
import { SFX, audioNow, gunshot, noiseBurst, sweepTone, tone } from '@engine/audio/audio.ts';
// Sound effect recipes, added to the engine's SFX table (the synth is engine/src/audio/audio.ts)

// ---- the sounds of the field kit (2026-10-18): the beeps and little tunes of the old set were a game's sounds, out of
// place in an abandoned site. What the player handles sounds like hardware (clicks, latches, a slide racked, a hiss),
// what happens around them like the building (a door slamming shut, a low hum). The guns, the blasts, the dash, the
// beam and the dry fire stay as they were. ?sfx1 plays the old set (dev: to compare); #sfx lists them all (src/dev/dev.ts)
export const sfxOld = new URLSearchParams(location.search).has('sfx1');

// the same in both sets
const SHARED: Record<string, () => void> = {
  // pistol: snappy — bright short body, light thump, short bright tail
  pistol: () =>
    gunshot({
      crack: 0.5,
      crackF: 6500,
      body: 0.06,
      bodyVol: 0.3,
      bodyF: 2800,
      bodyEnd: 0.7,
      thumpF: 220,
      thump: 0.05,
      thumpVol: 0.18,
      tail: 0.15,
      tailVol: 0.08,
      tailF: 3800,
    }),
  smg: () =>
    gunshot({
      crack: 0.22,
      body: 0.07,
      bodyVol: 0.22,
      bodyF: 2400,
      thumpF: 180,
      thump: 0.07,
      thumpVol: 0.2,
      tail: 0.14,
      tailVol: 0.06,
    }),
  shotgun: () => {
    gunshot({
      crack: 0.45,
      body: 0.22,
      bodyVol: 0.55,
      bodyF: 1100,
      thumpF: 110,
      thump: 0.25,
      thumpVol: 0.6,
      tail: 0.5,
      tailVol: 0.22,
    });
    const t = audioNow() + 0.32; // pump: back and forward
    noiseBurst(t, 0.05, 0.25, 'bandpass', 1400, 900, 3);
    noiseBurst(t + 0.09, 0.06, 0.3, 'bandpass', 1900, 1200, 3);
  },
  rail: () => {
    const t = audioNow();
    sweepTone(t, 'sawtooth', 2600, 180, 0.45, 0.18);
    sweepTone(t, 'square', 1300, 90, 0.3, 0.1); // electric zap falling into a hum
    noiseBurst(t, 0.12, 0.35, 'highpass', 6000, 2500);
    noiseBurst(t, 0.6, 0.12, 'bandpass', 3000, 400, 4); // crackle and shimmer tail
    sweepTone(t, 'sine', 90, 30, 0.35, 0.45);
  },
  launcher: () => {
    const t = audioNow();
    sweepTone(t, 'sine', 120, 40, 0.3, 0.55); // launch thump
    noiseBurst(t, 0.45, 0.35, 'bandpass', 500, 2500, 1.5); // rising whoosh
    noiseBurst(t, 0.06, 0.3, 'highpass', 3000, 2000);
  },
  boom: () => {
    const t = audioNow();
    sweepTone(t, 'sine', 90, 30, 0.5, 0.6);
    noiseBurst(t, 0.6, 0.5, 'lowpass', 1400, 120);
    noiseBurst(t, 0.08, 0.3, 'highpass', 3000, 1500);
  },
  bigboom: () => {
    const t = audioNow();
    sweepTone(t, 'sine', 70, 22, 1.0, 0.8);
    noiseBurst(t, 1.2, 0.7, 'lowpass', 1800, 80);
    noiseBurst(t, 0.1, 0.4, 'highpass', 3500, 1500);
    noiseBurst(t + 0.15, 0.9, 0.15, 'bandpass', 2500, 600, 2); // debris
  },
  dash: () => {
    const t = audioNow();
    noiseBurst(t, 0.22, 0.28, 'bandpass', 800, 3500, 1.2);
    sweepTone(t, 'sine', 200, 90, 0.15, 0.12);
  },
  empty: () => {
    const t = audioNow();
    noiseBurst(t, 0.025, 0.2, 'bandpass', 2800, 2600, 6);
  },
  beam: () => {
    const t = audioNow();
    sweepTone(t, 'sawtooth', 70, 140, 0.6, 0.12, 0.3);
    noiseBurst(t, 0.6, 0.08, 'bandpass', 400, 1600, 6);
  },
  // HOIST's magnet pulling: a low hum that swells and a thin whine over it
  hum: () => {
    const t = audioNow();
    sweepTone(t, 'sawtooth', 55, 72, 0.9, 0.1, 0.3);
    sweepTone(t, 'sine', 110, 140, 0.9, 0.08, 0.3);
    noiseBurst(t, 0.8, 0.05, 'bandpass', 300, 500, 3);
  },
};

// the old set (Sector Dive's): ?sfx1
export const SFX_OLD: Record<string, () => void> = {
  hit: () => {
    const t = audioNow();
    noiseBurst(t, 0.03, 0.12, 'bandpass', 3200 * rand(0.9, 1.1), 2000, 4);
    sweepTone(t, 'square', 1400, 900, 0.03, 0.03);
  },
  kill: () => {
    const t = audioNow();
    noiseBurst(t, 0.18, 0.3, 'bandpass', 900, 250, 2);
    sweepTone(t, 'square', 420, 90, 0.16, 0.1);
    noiseBurst(t, 0.05, 0.15, 'highpass', 4000, 2500);
  },
  hurt: () => {
    const t = audioNow();
    sweepTone(t, 'sine', 130, 50, 0.25, 0.5);
    noiseBurst(t, 0.2, 0.35, 'lowpass', 900, 200);
    sweepTone(t, 'sawtooth', 220, 110, 0.18, 0.08);
  },
  pick: () => {
    const t = audioNow();
    sweepTone(t, 'sine', 900, 1500, 0.08, 0.14);
    noiseBurst(t, 0.03, 0.08, 'highpass', 5000, 5000);
  },
  chip: () => {
    tone(660, 0.1, 'triangle', 0.22, 1.5);
    tone(990, 0.16, 'triangle', 0.22, 1.3, 0.09);
  },
  eshot: () => {
    const t = audioNow();
    sweepTone(t, 'square', 520 * rand(0.9, 1.1), 180, 0.12, 0.05);
    noiseBurst(t, 0.06, 0.06, 'bandpass', 1500, 700, 2);
  },
  reload: () => {
    const t = audioNow();
    noiseBurst(t, 0.05, 0.25, 'bandpass', 1200, 800, 4);
    sweepTone(t, 'square', 300, 180, 0.05, 0.06);
  }, // mag out
  reloaded: () => {
    const t = audioNow();
    noiseBurst(t, 0.04, 0.3, 'bandpass', 1800, 1400, 5);
    noiseBurst(t + 0.07, 0.05, 0.35, 'bandpass', 2400, 1600, 5);
    sweepTone(t + 0.07, 'square', 500, 300, 0.04, 0.05);
  }, // mag in, slide
  portal: () => tone(220, 0.9, 'sine', 0.28, 4),
  // lockdown siren: two rising notes
  alarm: () => {
    tone(520, 0.22, 'square', 0.09, 1.5);
    tone(520, 0.22, 'square', 0.09, 1.5, 0.3);
  },
  heal: () => {
    tone(500, 0.12, 'sine', 0.2, 1.5);
    tone(750, 0.2, 'sine', 0.2, 1.3, 0.1);
  },
};
// (what the old set played for the sounds the new one split off, or nothing where it had none)
const none = () => {};
Object.assign(SFX_OLD, {
  bit: SFX_OLD.pick,
  kit: SFX_OLD.pick,
  equip: none,
  slam: none,
  unlock: none,
  terminal: none,
});

// a click: a very short knock of filtered noise (a latch, a switch, a part seating). Kept low (1.5 to 2 kHz) and loosely
// filtered: higher and narrower, it rang as a pitched tick that pierced (2026-10-19: "hit・kill・chip・pick が気になる")
const click = (t: number, f: number, vol: number, q = 2.5) => noiseBurst(t, 0.018, vol, 'bandpass', f, f * 0.8, q);
// a metal ring: a few short partials that do not sit on one note (a struck plate or a dropped part)
const clink = (t: number, f: number, vol: number, dur = 0.09) =>
  [1, 1.47, 2.09].forEach((m, i) =>
    sweepTone(t + i * 0.004, 'triangle', f * m, f * m * 0.98, dur / (1 + i * 0.4), vol),
  );

export const SFX_NEW: Record<string, () => void> = {
  // a round finding its mark: a short dull knock, no ring (it comes with every shot)
  hit: () => {
    const t = audioNow(),
      r = rand(0.9, 1.1);
    click(t, 1500 * r, 0.1, 1.5);
    sweepTone(t, 'sine', 320 * r, 170, 0.035, 0.06);
  },
  // hit: a heavy blow on the suit, no tone
  hurt: () => {
    const t = audioNow();
    sweepTone(t, 'sine', 130, 50, 0.25, 0.5);
    noiseBurst(t, 0.2, 0.35, 'lowpass', 900, 200);
    noiseBurst(t, 0.06, 0.2, 'bandpass', 700, 400, 2);
  },
  // the menus: a dry switch
  pick: () => click(audioNow(), 1800, 0.16),
  // a med kit into the belt: the case's two latches and a soft knock
  kit: () => {
    const t = audioNow();
    click(t, 1500, 0.2);
    click(t + 0.06, 1800, 0.2);
    sweepTone(t + 0.06, 'sine', 170, 90, 0.07, 0.18);
  },
  // a weapon taken up or drawn: the slide pulled back and let go
  // (no metal ring and no narrow filter in the three gun handling sounds: they rang and grated, 2026-10-19)
  equip: () => {
    const t = audioNow();
    noiseBurst(t, 0.05, 0.22, 'bandpass', 900, 600, 1.5);
    noiseBurst(t + 0.08, 0.05, 0.28, 'bandpass', 1300, 800, 1.5);
    sweepTone(t + 0.08, 'sine', 180, 95, 0.06, 0.18);
  },
  // a chip seated in the kit: it clicks in, a small motor turns, it locks
  chip: () => {
    const t = audioNow();
    click(t, 1700, 0.2);
    sweepTone(t + 0.03, 'triangle', 220, 300, 0.14, 0.05, 0.02);
    click(t + 0.17, 2000, 0.18);
  },
  // an enemy's shot: muffled and lower than the player's guns, no tone
  eshot: () => {
    const t = audioNow(),
      r = rand(0.9, 1.1);
    noiseBurst(t, 0.08, 0.1, 'bandpass', 1400 * r, 600, 2);
    sweepTone(t, 'sine', 320 * r, 120, 0.06, 0.06);
  },
  // mag out: a latch and the magazine sliding free
  reload: () => {
    const t = audioNow();
    click(t, 1300, 0.2, 1.5);
    noiseBurst(t + 0.02, 0.07, 0.18, 'lowpass', 1200, 450);
  },
  // mag in, slide forward
  reloaded: () => {
    const t = audioNow();
    noiseBurst(t, 0.04, 0.22, 'bandpass', 1200, 850, 1.5);
    click(t + 0.07, 1400, 0.26, 1.5);
    sweepTone(t + 0.07, 'sine', 180, 100, 0.06, 0.16);
  },
  // a gate taken: a deep hum swelling and dying away
  portal: () => {
    const t = audioNow();
    sweepTone(t, 'sine', 58, 44, 1.0, 0.32, 0.15);
    sweepTone(t, 'triangle', 116, 92, 0.9, 0.07, 0.2);
    noiseBurst(t, 0.8, 0.12, 'lowpass', 700, 180);
  },
  // the lockdown siren: one rise and fall
  alarm: () => {
    const t = audioNow();
    sweepTone(t, 'sawtooth', 480, 860, 0.32, 0.05, 0.05);
    sweepTone(t + 0.32, 'sawtooth', 860, 480, 0.32, 0.05, 0.02);
  },
  // a heal: the injector's click and its hiss
  heal: () => {
    const t = audioNow();
    click(t, 1800, 0.2);
    noiseBurst(t + 0.02, 0.28, 0.16, 'highpass', 4200, 2400);
    noiseBurst(t + 0.02, 0.1, 0.08, 'bandpass', 1300, 900, 2);
  },
  // the lockdown's doors slamming shut: a heavy metal blow
  slam: () => {
    const t = audioNow();
    sweepTone(t, 'sine', 72, 34, 0.5, 0.6);
    noiseBurst(t, 0.45, 0.45, 'lowpass', 900, 100);
    noiseBurst(t, 0.14, 0.25, 'bandpass', 1500, 500, 2);
    clink(t + 0.01, 620, 0.05, 0.3);
  },
  // ... and opening again: a bolt drawn and the air let out
  unlock: () => {
    const t = audioNow();
    noiseBurst(t, 0.1, 0.3, 'bandpass', 620, 380, 2);
    sweepTone(t, 'sine', 120, 70, 0.1, 0.25);
    noiseBurst(t + 0.08, 0.45, 0.12, 'highpass', 3200, 1500);
  },
  // a milestone's terminal waking: a switch, then two short tones (a screen is the one thing here that beeps)
  terminal: () => {
    const t = audioNow();
    click(t, 2000, 0.18);
    sweepTone(t + 0.06, 'sine', 660, 660, 0.07, 0.06);
    sweepTone(t + 0.15, 'sine', 990, 990, 0.09, 0.05);
  },
};

// the bits and a machine going down keep the old set's sounds: closer to how they should feel than the new ones were
// (2026-10-19, "bit, killは前のほうがイメージ近いかも")
SFX_NEW.bit = SFX_OLD.pick!;
SFX_NEW.kill = SFX_OLD.kill!;

Object.assign(SFX, SHARED, sfxOld ? SFX_OLD : SFX_NEW);
