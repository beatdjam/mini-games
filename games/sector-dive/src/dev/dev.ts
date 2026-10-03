import type { RunEnd, Weapon } from '../data/types.ts';
import { el, shuffle } from '@engine/core/util.ts';
import { LANG, lang, t } from '@engine/core/i18n.ts';
import { T, W } from '@engine/world/tiles.ts';
import { WEAPONS } from '../data/weapons.ts';
import { BOSS_META } from '../data/bosses.ts';
import { BIOMES } from '../data/biomes.ts';
import { PER } from '../data/progress.ts';
import { PERKS } from '../data/perks.ts';
import { basicW, save } from '../core/save.ts';
import { devSeed, level } from '../world/level.ts';
import { setHazardClock } from '../world/hazards.ts';
import { addPickup, enemies, removeEnemyMesh, spawnEnemy } from '../world/entities.ts';
import { player, run } from '../actors/player.ts';
import { damagePlayer } from '../actors/combat.ts';
import { magSize, newWeapon } from '../actors/weapons.ts';
import { normalizeWeapons } from '../ui/input.ts';
import { updateHitDirs, weaponHud } from '../ui/hud.ts';
import { changeLang } from '../ui/settings.ts';
import { endRun, startPractice, startRun, startStage } from '../flow/run.ts';
import { setState, show } from '../flow/state.ts';
import { suspendRun } from '../flow/suspend.ts';
import { openPerk } from '../screens/perk.ts';
import { showTab } from '../screens/base.ts';
import { drawShareCard, shareData, shareText } from '../ui/share.ts';
import { update } from '../flow/update.ts';
// ================= dev hooks =================
// URL hash hooks for checking the game without playing it by hand. See SPEC.md, chapter 10.

// dev seed: ?seed=<n> builds every level from that seed (the same level each time)
const seedParam = new URLSearchParams(location.search).get('seed');
if (seedParam !== null && /^\d+$/.test(seedParam)) devSeed(Number(seedParam) >>> 0);

// dev view: #view-KWLN etc. drops straight into that sector's first floor (for screenshots)
if (location.hash.startsWith('#view-')) {
  setTimeout(() => {
    const bi = BIOMES.findIndex(b => b.code === location.hash.slice(6));
    if (bi < 0) return;
    startRun();
    run.route = [bi];
    run.stage = bi * PER + 1;
    startStage();
    show(null);
    setState('play');
    for (let k = 0; k < 20; k++) update(1 / 60);
  }, 300);
}
// dev view: #view-trooper stands in front of three troopers (the humanoid soldier): one walking, two aiming
if (location.hash === '#view-trooper')
  setTimeout(() => {
    startRun();
    show(null);
    setState('play');
    player.hp = 1e6;
    player.maxHp = 1e6;
    enemies.forEach(e => {
      e.dead = true;
      removeEnemyMesh(e);
    });
    const f = (d: number, side: number): [number, number] => [
      player.x - Math.sin(player.yaw) * d + Math.cos(player.yaw) * side,
      player.z - Math.cos(player.yaw) * d - Math.sin(player.yaw) * side,
    ];
    [
      [5, -1.6],
      [7, 1.8],
      [9.5, 0],
    ].forEach(([d, sd]) => {
      const [x, z] = f(d!, sd!);
      const e = spawnEnemy('trooper', x, z, -1, 1);
      e.active = true;
    });
    for (let k = 0; k < 40; k++) update(1 / 60);
  }, 300);
// dev view: #view-wipe opens the data wipe dialog on the base screen (for screenshots)
if (location.hash === '#view-wipe') setTimeout(() => el('#btnWipe').click(), 300);
// dev view: #view-keys opens the key settings dialog on the base screen; #view-keys-wait also clicks the reload key
if (location.hash === '#view-keys' || location.hash === '#view-keys-wait')
  setTimeout(() => {
    showTab('settings');
    document.querySelector<HTMLElement>('[data-settings="base"] [data-action="keys"]')?.click();
    if (location.hash.endsWith('-wait')) document.querySelector<HTMLElement>('[data-key-action="reload"]')?.click();
  }, 300);
// dev view: #boss-phantom etc. starts boss practice against that boss
// optional depth: #boss-phantom-3 = DEPTH 3 strength
if (location.hash.startsWith('#boss-'))
  setTimeout(() => {
    const [k, d] = location.hash.slice(6).split('-');
    if (BOSS_META[k]) startPractice(k, d ? Math.max(0, +d - 1) : 0);
  }, 300);
// dev view: #view-pick stands next to a dropped weapon (for screenshots of the pick-up prompt)
if (location.hash.startsWith('#view-pick'))
  setTimeout(() => {
    startRun();
    show(null);
    setState('play');
    addPickup('weapon', player.x + 0.3, player.z, { w: newWeapon('shotgun', 1, false, 2, ['rate']) });
    for (let k = 0; k < 10; k++) update(1 / 60);
  }, 300);
// dev view: #view-haz[-<weapon>] stands on a lit hazard tile (checks the gun is drawn over it); #view-perk opens the chip screen
if (location.hash.startsWith('#view-haz'))
  setTimeout(() => {
    startRun();
    run.route = [1];
    run.stage = PER + 1;
    startStage();
    show(null);
    setState('play');
    const k = level.hazardTiles.findIndex(Boolean);
    if (k < 0) return;
    player.x = ((k % W) + 0.5) * T;
    player.z = (((k / W) | 0) + 0.5) * T - 1.5;
    player.yaw = Math.PI;
    player.pitch = -0.5;
    player.hp = 1e6;
    player.maxHp = 1e6;
    const wid = location.hash.split('-')[2];
    if (WEAPONS[wid]) {
      const w0 = basicW(wid) as Weapon;
      w0.mag = magSize(w0);
      player.weapons[0] = w0;
      player.cur = 0;
      normalizeWeapons();
      weaponHud();
    } // #view-haz-smg etc.
    setHazardClock(0.5);
    for (let n = 0; n < 5; n++) update(1 / 60);
  }, 300);
// dev view: #view-share[-dead] shows the result card image for a sample run (#view-share-res: the result screen, #view-share-res-panel: with the PC share panel open,
// #view-share-res-many: a deep run's hundred chips)
if (location.hash.startsWith('#view-share'))
  setTimeout(() => {
    startRun();
    run.stage = 2 * PER + PER - 1;
    run.kills = 142;
    run.bosses = ['watcher', 'trinity'];
    run.perks = ['overload', 'overload', 'rapid+', 'crit', 'reload', 'light'];
    // -many: a deep run's hundred chips (the mix from a player's D14 run), to see the result screen fold them up
    if (location.hash.includes('many'))
      run.perks = shuffle(
        Object.entries({
          split: 25,
          rapid: 18,
          overload: 13,
          'overload+': 3,
          armor: 10,
          'armor+': 3,
          mag: 4,
          leech: 4,
          'leech+': 3,
          sprint: 4,
          'sprint+': 1,
          reload: 3,
          'crit+': 2,
          chain: 1,
          pierce: 1,
          'light+': 1,
          repair: 1,
          'rapid+': 1,
        }).flatMap(([id, n]) => Array(n).fill(id)),
      );
    if (location.hash.includes('reboot')) save.pres.count = 3;
    player.weapons[0] = { id: 'rail', r: 2, plus: 7, opts: [] } as unknown as Weapon;
    const kind: RunEnd = location.hash.includes('dead') ? 'dead' : 'extract';
    endRun(kind);
    if (location.hash.includes('res')) {
      if (location.hash.includes('panel')) setTimeout(() => el('#btnShare').click(), 900);
      return;
    } // #view-share-res: the result screen itself
    drawShareCard(shareData!).then(b => {
      const im = new Image();
      im.src = URL.createObjectURL(b!);
      im.style.cssText = 'position:fixed;inset:0;width:100%;z-index:99;background:#000';
      document.body.appendChild(im);
      console.log('VIEW share', shareText(shareData!));
    });
  }, 300);
if (location.hash.startsWith('#view-perk'))
  setTimeout(() => {
    startRun();
    PERKS[0].apply(player, 0.2);
    if (location.hash.includes('perk4')) save.pres.up.choice = 1;
    openPerk(t('perk.title'));
  }, 300); // #view-perk4: four options
// dev view: #tab-<sortie|up|practice|settings>[-touch] opens that base tab
if (location.hash.startsWith('#tab-')) setTimeout(() => showTab(location.hash.slice(5).replace(/-touch$/, '')), 0);
// dev view: #view-susp[-touch] leaves a suspended run and returns to the base
if (location.hash.startsWith('#view-susp'))
  setTimeout(() => {
    startRun();
    suspendRun();
  }, 300);
// dev: ?lang=<code> opens the page in that language (saved like the settings button does)
setTimeout(() => {
  const q = new URLSearchParams(location.search).get('lang');
  if (q && LANG[q] && q !== lang) changeLang(q);
}, 0);
// dev view: #view-hitdir shows the hit-direction arcs (hits from behind-right and from the left)
if (location.hash === '#view-hitdir')
  setTimeout(() => {
    startRun();
    show(null);
    setState('play');
    player.yaw = 0;
    player.hp = 1e6;
    player.maxHp = 1e6;
    player.inv = 0;
    damagePlayer(1, { x: player.x + 6, z: player.z + 6 });
    player.inv = 0;
    damagePlayer(1, { x: player.x - 8, z: player.z });
    updateHitDirs(0.05);
  }, 300);
