import { test } from 'vitest';
import { actx, audioInit } from '../src/audio/audio.ts';
import {
  LAYER_MIX,
  MUSIC,
  MUSIC_STYLES,
  type MusicStyle,
  musicState,
  setMusic,
  setMusicMix,
} from '../src/audio/music.ts';
import { eq, ok } from './helpers.ts';

// ---------- audio ----------
test('music: the game decides the fallback style and the mix; without them nothing breaks', () => {
  audioInit();
  ok(actx && musicState.bus, 'music bus');
  const calm: MusicStyle = { bpm: 80, root: 40, scale: 'minor', prog: [0, 3], padWave: 'sine', padCut: 800 };
  const rush: MusicStyle = { ...calm, bpm: 120 };
  Object.assign(MUSIC_STYLES, { calm, rush });
  Object.assign(LAYER_MIX, {
    soft: { pad: 1, arp: 0, bass: 0, drums: 0, tension: 0 },
    loud: { pad: 1, arp: 1, bass: 1, drums: 1, tension: 1 },
  });
  // not filled in by the game: an unknown name plays nothing, a known one plays without a mix change, an unknown mix is ignored
  setMusic('nowhere');
  eq(musicState.st, null, 'no fallback: nothing plays');
  eq(musicState.name, null);
  setMusic('calm');
  eq(musicState.st, calm);
  eq(musicState.mix, null, 'no mixOf: the mix is left alone');
  setMusicMix('missing');
  eq(musicState.mix, null, 'a mix the game does not have is ignored');
  // filled in: the fallback style, and the mix that mixOf names for the name and the boss flag
  const asked: string[] = [];
  Object.assign(MUSIC, {
    fallback: 'calm',
    mixOf: (name: string, boss: boolean) => {
      asked.push(name + (boss ? ':boss' : ''));
      return boss || name === 'rush' ? 'loud' : 'soft';
    },
  });
  setMusic('nowhere');
  eq(musicState.st, calm, 'unknown name: the fallback style');
  eq(musicState.name, 'nowhere');
  eq(musicState.mix, 'soft');
  setMusic('rush');
  eq(musicState.st, rush);
  eq(musicState.mix, 'loud');
  setMusic('calm', true);
  ok(musicState.st && musicState.st.boss, 'boss arrangement');
  eq(musicState.st!.bpm, Math.round(calm.bpm * 1.3));
  eq(musicState.name, 'calm:boss');
  eq(musicState.mix, 'loud');
  eq(asked.join(','), 'nowhere,rush,calm:boss');
  setMusic('calm');
  eq(musicState.mix, 'soft');
  // fadeOf: how fast each mix comes in
  const fades: string[] = [];
  const keepFade = MUSIC.fadeOf;
  MUSIC.fadeOf = (mix: string) => {
    fades.push(mix);
    return 0.1;
  };
  setMusicMix('loud');
  eq(fades.join(','), 'loud', 'fadeOf is asked for the mix that comes in');
  MUSIC.fadeOf = keepFade;
  Object.assign(MUSIC, { fallback: null, mixOf: () => null });
  delete MUSIC_STYLES.calm;
  delete MUSIC_STYLES.rush;
  delete LAYER_MIX.soft;
  delete LAYER_MIX.loud;
});
