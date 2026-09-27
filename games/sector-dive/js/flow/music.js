'use strict';
// Which music plays when (the player is engine/audio/music.js, the styles are js/data/music.js)

// called every frame while playing: combat when a woken enemy is near or a boss is up
let musicCheckT = 0;
function updateMusic(dt) {
  if ((musicCheckT -= dt) > 0 || !mus.bus || !mus.st) return;
  musicCheckT = 0.5;
  if (mus.st.boss || mus.name === 'BASE') return;
  const fight = enemies.some(e => !e.dead && e.active && Math.hypot(e.x - P.x, e.z - P.z) < 30);
  setMusicMix(fight ? 'combat' : 'explore');
}
