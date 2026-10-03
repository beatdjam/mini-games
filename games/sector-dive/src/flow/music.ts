import { musicState, setMusicMix } from '@engine/audio/music.ts';
import { distXZ } from '@engine/core/util.ts';
import { enemies } from '../world/entities.ts';
import { player } from '../actors/player.ts';
// Which music plays when (the player is engine/src/audio/music.ts, the styles are src/data/music.ts)

// called every frame while playing: combat when a woken enemy is near or a boss is up
let musicCheckT = 0;
export function updateMusic(dt: number) {
  if ((musicCheckT -= dt) > 0 || !musicState.bus || !musicState.st) return;
  musicCheckT = 0.5;
  if (musicState.st.boss || musicState.mix === 'base') return; // the base keeps its own mix (see MUSIC.mixOf in src/data/music.ts)
  const fight = enemies.some(e => !e.dead && e.active && distXZ(e, player) < 30);
  setMusicMix(fight ? 'combat' : 'explore');
}
