import type { RunState, Snapshot, Weapon } from '../data/types.ts';
import { $, el, rand, shuffle } from '../../../../engine/core/util.ts';
import { devSmoke } from '../../../../engine/core/dev.ts';
import { clearWorld, query } from '../../../../engine/core/world.ts';
import { LANG, lang, t } from '../../../../engine/core/i18n.ts';
import { SFX, actx, audioInit } from '../../../../engine/audio/audio.ts';
import { MUSIC_STYLES, mus, musicInit, musicVolume, playStep, setMusic, setMusicMix } from '../../../../engine/audio/music.ts';
import { V3, camera, scene } from '../../../../engine/render/render.ts';
import { H, STEP, T, W, blocked, cover, floorY, grid, hgt, isSolid, moveCircle, passable, ramp, walkable } from '../../../../engine/world/tiles.ts';
import { joy, setFireHeld } from '../../../../engine/ui/input.ts';
import { applyLayout, getL, openLayoutEditor } from '../../../../engine/ui/touchlayout.ts';
import { SPLIT_FAN, WEAPONS, WEAPON_ORDER } from '../data/weapons.ts';
import { EYE, PLAT_H } from '../data/level.ts';
import { ELITE_TYPES, ENEMY_TUNE } from '../data/enemies.ts';
import { BOSS_META, BOSS_ORDER, BOSS_TUNE } from '../data/bosses.ts';
import { BIOMES } from '../data/biomes.ts';
import { DEPTH_HP_GROWTH, DEPTH_HP_LATE, PER, TUNE } from '../data/progress.ts';
import { PERKS } from '../data/perks.ts';
import { basicW, exportSave, importSave, importSaveCheck, persist, save } from '../system/save.ts';
import { perkName, pickDrop, PRES_DIFF_CAP, presMul, presMulOf, prog, readiness, readinessScore, readyAfterReboot } from '../system/rules.ts';
import { buildLevel, haz, makePortal, portals, rooms, roomSpot, setHazardClock, startIdx } from '../world/level.ts';
import { addPickup, boss, enemies, nearW, pBullets, removeEnemyMesh, setBoss, spawnEnemy, spawnPBullet, spawnWave } from '../world/entities.ts';
import { P, critChance, damagePlayer, diffOf, explode, findTarget, fire, hurtEnemy, magSize, newPlayer, newWeapon, run, setPlayer, setRun, stageLabel, weaponStats } from '../actors/player.ts';
import { bossDiff, spawnBoss } from '../actors/bosses/common.ts';
import { equipNearby, normalizeWeapons, stowNearby } from '../ui/input.ts';
import { changeLang, hitDirs, updateHitDirs, weaponHud } from '../ui/hud.ts';
import { discardSuspended, endRun, goBase, nextStage, openPerk, pickEnemyType, resumeRun, setState, show, showTab, startPractice, startRun, startStage, state, suspendRun } from '../flow/game.ts';
import { drawShareCard, shareData, shareText } from '../ui/share.ts';
import { updatePBullets } from '../actors/bullets.ts';
import { update, updatePickups } from '../flow/update.ts';
import { TRACK_LOG } from '../../../../engine/core/analytics.ts';
import { FEEDBACK_FORM } from '../../../../engine/core/feedback.ts';
// ================= dev hooks =================
// URL hash hooks for checking the game without playing it by hand. See SPEC.md, chapter 10.

// dev check: open the page with #smoke (engine/core/dev.js) to run every sector (floor + each boss candidate) once and log errors to the console
devSmoke(() => {
    {
      startRun();
      const tick = (n: number) => { for (let k = 0; k < n; k++) { if (state !== 'play') { show(null); setState('play'); } P.hp = P.maxHp; P.inv = 1; update(1 / 60); } };
      setFireHeld(true);
      BIOMES.forEach((b, bi) => {
        run.route = [bi]; run.stage = bi * PER + 1; startStage(); tick(120);
        const n0 = enemies.length;
        // walk the player through the level to exercise movement over ramps/decks
        for (let k = 0; k < 120; k++) { joy.y = -1; P.yaw += 0.05; tick(1); }
        joy.y = 0;
        enemies.slice().forEach(e => hurtEnemy(e, 1e6, false)); tick(30);
        console.log('SMOKE floor', b.code, 'enemies', n0, 'fy', P.fy.toFixed(2), 'raised', hgt.filter(h => h > 0).length, 'ramps', ramp.filter(r => r >= 0).length, 'haz', haz.filter(Boolean).length);
        b.bosses.forEach(kind => {
          run.stage = bi * PER + PER - 1; startStage(); setBoss(null);
          enemies.slice().forEach(e => { e.dead = true; removeEnemyMesh(e); }); clearWorld('enemy');
          spawnBoss(kind); boss!.spawnT = 0; tick(400);
          if (boss && boss.invuln) { enemies.filter(e => !e.boss).forEach(e => hurtEnemy(e, 1e6, false)); tick(20); }
          const had = !!boss; if (boss) hurtEnemy(boss, boss.hp + 1, false); tick(60);
          console.log('SMOKE boss', b.code, kind, had ? 'spawned' : 'MISSING', 'portals', portals.length);
        });
      });
      // ledge: step off a raised deck along +x, then walk on; nothing may stay stuck or half inside the deck
      {
        let tested = 0, stuck = 0, inside = 0;
        for (let n = 0; n < 40 && tested < 12; n++) {
          run.route = [5]; run.stage = 26; buildLevel(BIOMES[5], false);
          for (let k = 0; k < W * H && tested < 12; k++) {
            const i = k % W, j = (k / W) | 0;
            if (i > W - 4 || grid[k] !== 1 || hgt[k] !== PLAT_H || ramp[k] >= 0 || cover[k]) continue;
            if (!walkable(k + 1) || hgt[k + 1] !== 0 || !walkable(k + 2) || hgt[k + 2] !== 0) continue;
            for (const who of ['player', 'enemy']) {
              const o = who === 'player' ? P : spawnEnemy('crawler', 0, 0, -1, 1);
              o.x = (i + 1) * T - 0.2; o.z = (j + 0.5) * T; o.fy = PLAT_H; o.vy = 0;
              for (let t = 0; t < 60; t++) { moveCircle(o, 0.15, 0, o.r || P.r); const g2 = floorY(o.x, o.z); o.fy = who === 'player' ? Math.max(g2, o.fy - 0.2) : g2; }
              const x0 = o.x; moveCircle(o, 0.3, 0, o.r || P.r);
              tested++;
              if (o.x <= x0 && !blocked(x0 + 0.3, o.z, o.r || P.r)) stuck++;
              if (floorY(o.x - (o.r || P.r) + 0.02, o.z) > o.fy + STEP) inside++;
            }
          }
        }
        console.log('SMOKE ledge tested', tested, 'stuck', stuck, 'inside', inside);
        if (stuck || inside) throw new Error('ledge check failed');
      }
      startRun(); tick(5);
      // progress: depth start = depth*5, boss = depth*5+4 regardless of PER
      if (prog(0) !== 0 || prog(PER - 1) !== 4 || prog(PER) !== 5 || stageLabel(PER - 1) !== 'D1 BOSS' || stageLabel(PER) !== 'D2 1/' + (PER - 1)) throw new Error('prog/label ' + [prog(PER - 1), prog(PER), stageLabel(PER - 1), stageLabel(PER)]);
      console.log('SMOKE prog ok', [0, 1, 2, 3, 4].map(prog).join(','));
      // shield: a round from the front wears the shield, not HP; from behind it hurts; the shield eventually breaks
      {
        run.route = [3]; run.stage = PER * 3 + 1; startStage(); enemies.slice().forEach(e => { e.dead = true; removeEnemyMesh(e); }); clearWorld('enemy');
        const [sx, sz] = roomSpot(rooms[startIdx]);
        const e = spawnEnemy('shield', sx, sz, -1, 1); e.face = 0; e.mesh.rotation.y = 0; // facing +z
        const shoot = (dir: number) => { spawnPBullet(new V3(sx, e.fy! + 1.6, sz + dir * 2.5), new V3(0, 0, -dir), 60, 20, 0, 0, 0xffffff, 0, {}); updatePBullets(0.1); }; // above rubble height
        const hp0 = e.hp, sh0 = e.shieldHp;
        shoot(1);   // from the front
        if (!(e.shieldHp < sh0 && e.hp === hp0)) throw new Error('shield front ' + [e.shieldHp, sh0, e.hp, hp0]);
        shoot(-1);  // from behind
        if (!(e.hp < hp0)) throw new Error('shield back');
        for (let k = 0; k < 20 && e.shieldHp > 0; k++) shoot(1);
        if (e.shieldHp > 0 || e.stun <= 0) throw new Error('shield break');
        const hp1 = e.hp; shoot(1);
        if (!(e.hp < hp1)) throw new Error('after break');
        console.log('SMOKE shield ok');
        removeEnemyMesh(e); clearWorld('enemy');
      }
      // split-shot fan: a big stack on a single-round weapon squeezes into SPLIT_FAN.max instead of fanning ever wider
      {
        pBullets.forEach(b => { b.alive = false; });
        const keep = P.weapons[P.cur]; P.weapons[P.cur] = newWeapon('rail', 0); P.extra = 25; P.pitch = 0;
        fire();
        const hs = pBullets.filter(b => b.alive).map(b => { const l = Math.hypot(b.vx, b.vz); return [b.vx / l, b.vz / l]; });
        let span = 0; // the extra rounds also get up to ±0.02 of random spread on top of the fan
        hs.forEach(a => hs.forEach(b => { span = Math.max(span, Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1]))); }));
        P.weapons[P.cur] = keep; P.extra = 0; pBullets.forEach(b => { b.alive = false; b.mesh.visible = false; });
        if (hs.length !== 26 || span > SPLIT_FAN.max + 0.045 || span < SPLIT_FAN.max * 0.7) throw new Error('split fan ' + hs.length + ' ' + span);
        console.log('SMOKE split fan ok', span.toFixed(3));
      }
      // watcher: drones at 75% and 40%
      {
        startPractice('watcher'); tick(10); if (!boss) spawnBoss('watcher'); boss!.spawnT = 0; boss!.phased = true;
        const drones = () => enemies.filter(o => !o.boss && !o.dead && o.type === 'drone').length;
        boss!.hp = boss!.maxHp * 0.7; tick(2); const a1 = drones();
        boss!.hp = boss!.maxHp * 0.35; tick(2); const a2 = drones();
        if (a1 !== 2 || a2 !== 5) throw new Error('watcher drones ' + a1 + ' ' + a2);
        console.log('SMOKE watcher waves ok');
        endRun('abandon');
      }
      // scaling: additive damage chips, compounding health, practice depth
      {
        const p0 = newPlayer(save.loadout), base = p0.dmgMul, od = PERKS.find(x => x.id === 'overload')!;
        od.apply(p0, od.v); od.apply(p0, od.v);
        if (Math.abs(p0.dmgMul - (base + 0.4)) > 1e-9) throw new Error('additive chips ' + p0.dmgMul);
        const perk = (n: string) => PERKS.find(x => x.id === n)!;
        for (let k = 0; k < 6; k++) ['crit', 'reload', 'mag'].forEach(n => perk(n).apply(p0, perk(n).rv!));
        if (Math.abs(p0.reloadMul - 0.4) > 1e-9 || Math.abs(p0.magMul - 2.5) > 1e-9) throw new Error('caps ' + p0.reloadMul + ' ' + p0.magMul);
        const keepP = P; setPlayer(p0); const cc = critChance(); setPlayer(keepP);
        // split-shot: full-hit total must go up by exactly 20% for a single-shot weapon and for the shotgun alike
        { const keep = P; setPlayer(newPlayer(save.loadout));
          ['rail', 'shotgun'].forEach(id => {
            const w = newWeapon(id, 0), a = weaponStats(w); P.extra = 1; const b = weaponStats(w); P.extra = 0;
            if (Math.abs(b.perHit * b.hits / (a.perHit * a.hits) - 1.2) > 1e-9) throw new Error('split ' + id);
          });
          setPlayer(keep); }
        if (cc !== TUNE.critCap) throw new Error('crit cap ' + cc);
        setRun({ stage: PER - 1, route: [0] } as RunState); const b1 = bossDiff();
        setRun({ stage: 2 * PER + PER - 1, route: [0] } as RunState); const b3 = bossDiff();
        if (Math.abs(b1 - 1.33 * BOSS_TUNE.hpMul * presMul()) > 1e-9 || Math.abs(b3 / b1 - BOSS_TUNE.growth * BOSS_TUNE.growth) > 1e-6) throw new Error('boss scaling ' + b1 + ' ' + b3);
        if (Math.abs(diffOf(0) - ENEMY_TUNE.hpMul * presMul()) > 1e-9) throw new Error('enemy hp base ' + diffOf(0));
        // past GROWTH_KNEE depths health grows by the late rates: D6 -> D7 boss by lateGrowth, D5 -> D6 still by growth
        const bossAt = (d: number) => { setRun({ stage: (d - 1) * PER + PER - 1, route: [0] } as RunState); return bossDiff(); };
        if (Math.abs(bossAt(6) / bossAt(5) - BOSS_TUNE.growth) > 1e-6 || Math.abs(bossAt(7) / bossAt(6) - BOSS_TUNE.lateGrowth) > 1e-6) throw new Error('boss late growth');
        if (Math.abs(diffOf(6 * PER) / diffOf(5 * PER) - DEPTH_HP_LATE) > 1e-6 || Math.abs(diffOf(5 * PER) / diffOf(4 * PER) - DEPTH_HP_GROWTH) > 1e-6) throw new Error('enemy late growth');
        startPractice('trinity', 2); tick(5);
        if (stageLabel(run.stage) !== 'D3 BOSS') throw new Error('practice depth ' + stageLabel(run.stage));
        endRun('abandon');
        console.log('SMOKE scaling ok', 'D1 boss', b1.toFixed(2), 'D3 boss', b3.toFixed(2));
      }
      // picking up: stow goes to the bag, equip swaps with the weapon in hand and drops the old one
      {
        startRun(); tick(5); clearWorld('pickup');
        P.weapons = [newWeapon('pistol', 0, true), newWeapon('smg', 0)]; P.cur = 0; P.bag = [null, null, null, null];
        const drop = (id: string) => { addPickup('weapon', P.x, P.z, { w: newWeapon(id, 1) }); updatePickups(0); };
        drop('rail'); stowNearby();
        if (!P.bag[0] || P.bag[0].id !== 'rail') throw new Error('stow');
        drop('shotgun'); equipNearby();
        if (P.weapons[0]!.id !== 'shotgun' || !query('pickup').some(p => p.kind === 'weapon' && p.w.id === 'pistol')) throw new Error('equip swap');
        P.bag = [newWeapon('smg', 0), newWeapon('smg', 0), newWeapon('smg', 0), newWeapon('smg', 0)];
        clearWorld('pickup');
        drop('launcher'); stowNearby();
        if (P.bag.some(w => w?.id === 'launcher') || !nearW) throw new Error('stow into a full bag');
        console.log('SMOKE pickup ok');
        endRun('abandon');
      }
      // chain blast: one kill in a tight cluster must not wipe the whole cluster through a cascade
      {
        startRun(); tick(3); enemies.slice().forEach(e => { e.dead = true; removeEnemyMesh(e); }); clearWorld('enemy');
        P.chain = 3; P.dmgMul = 10; // blasts strong enough to kill anything they touch
        const [cx, cz] = roomSpot(rooms[startIdx]);
        const line = [0, 2.8, 5.6, 8.4].map(dx => spawnEnemy('crawler', cx + dx, cz, -1, 1)); // each 2.8m apart, blast radius 4
        hurtEnemy(line[0], 1e6, false);
        const alive = line.filter(e => !e.dead).length;
        if (alive !== 2) throw new Error('chain cascade: alive ' + alive);
        console.log('SMOKE chain ok');
        endRun('abandon');
      }
      // shortcut supply: starting at DEPTH 3 gives 2 picks, each applying the chosen chip supplyTimes times
      {
        const keep = [save.shortcut, save.startTier, save.up.chip]; save.shortcut = save.startTier = 2; save.up.chip = 0;
        goBase(); startRun(); tick(3);
        const pick = (id: string) => { const cards = [...document.querySelectorAll<HTMLElement>('#perkList .perk')]; const c = cards.find(b => b.querySelector('.pn')!.textContent!.includes(perkName(id))) || cards[0]!; c.click(); };
        if (!document.querySelector('#perkList .pn')!.textContent!.includes('×' + TUNE.supplyTimes)) throw new Error('supply card label');
        pick('overload'); pick('overload');
        [save.shortcut, save.startTier, save.up.chip] = keep;
        // a capped chip (pierce, crit, reload, magazine) stops once maxed, after 3-4 of the supplyTimes
        if (run.perks.length < 6 || run.perks.length > 2 * TUNE.supplyTimes) throw new Error('supply picks ' + run.perks.length);
        console.log('SMOKE supply ok', run.perks.length, 'chips');
        endRun('abandon'); goBase();
      }
      // rare chips show up gold and apply the stronger amount; deep sectors favour tougher enemy types
      {
        startRun(); tick(3);
        const keep = TUNE.rareChipChance; TUNE.rareChipChance = 1;
        openPerk('test');
        const rareCards = document.querySelectorAll('#perkList .perk.rare').length;
        TUNE.rareChipChance = keep;
        P.hp = 1; // so a healing chip also visibly changes something
        const before = JSON.stringify(P);
        document.querySelector<HTMLElement>('#perkList .perk.rare')!.click();
        if (!rareCards || JSON.stringify(P) === before || !run.perks[run.perks.length - 1].endsWith('+')) throw new Error('rare chip');
        P.crit = TUNE.critCap; P.reloadMul = 0.4; P.magMul = 2.5; P.pierce = 3;
        for (let k = 0; k < 30; k++) {
          openPerk('test');
          const names = [...document.querySelectorAll('#perkList .pn')].map(n => n.textContent), maxedNames = ['crit', 'reload', 'mag', 'pierce'].map(id => perkName(id));
          if (names.some(n => maxedNames.some(m => n.replace(/^★ /, '').replace(/\+$/, '') === m))) throw new Error('maxed chip offered ' + names);
        }
        show(null); setState('play');
        let elite = 0; for (let k = 0; k < 400; k++) if (ELITE_TYPES.includes(pickEnemyType(BIOMES[3], 10))) elite++;
        let elite0 = 0; for (let k = 0; k < 400; k++) if (ELITE_TYPES.includes(pickEnemyType(BIOMES[3], 0))) elite0++;
        if (!(elite > elite0)) throw new Error('elite bias ' + elite0 + ' ' + elite);
        console.log('SMOKE rare/elite ok', 'rare cards', rareCards, 'elite share D1', elite0 / 400, 'D11', elite / 400);
        endRun('abandon');
      }
      // autofire target: an enemy hidden in the fog must not be picked, the same enemy close up must be
      {
        startRun(); tick(3); enemies.slice().forEach(e => { e.dead = true; removeEnemyMesh(e); }); clearWorld('enemy');
        (scene.fog as THREE.Fog).near = 2; (scene.fog as THREE.Fog).far = 20; // visibleRange = 12.8
        grid.fill(1); hgt.fill(0); ramp.fill(-1); cover.fill(0); // open floor so only distance matters
        P.x = W * T / 2; P.z = H * T / 2; P.yaw = 0; P.pitch = 0; P.fy = 0;
        camera.position.set(P.x, EYE, P.z); camera.rotation.set(0, 0, 0);
        const far = spawnEnemy('crawler', P.x, P.z - 20, -1, 1); far.mesh.position.set(far.x, EYE, far.z);
        const t1 = findTarget();
        far.z = P.z - 8; far.mesh.position.set(far.x, EYE, far.z);
        const t2 = findTarget();
        if (t1 || !t2) throw new Error('fog target ' + !!t1 + ' ' + !!t2);
        console.log('SMOKE fog target ok');
        endRun('abandon');
      }
      // shotgun knockback: once per shot however many pellets land; launcher gets half of the magazine chips
      {
        startRun(); tick(3); enemies.slice().forEach(e => { e.dead = true; removeEnemyMesh(e); }); clearWorld('enemy');
        grid.fill(1); hgt.fill(0); ramp.fill(-1); cover.fill(0);
        P.x = W * T / 2; P.z = H * T / 2; P.fy = 0;
        const e = spawnEnemy('brute', P.x, P.z - 4, -1, 50); e.fy = 0; e.mesh.position.set(e.x, 1.1, e.z);
        const z0 = e.z;
        for (let k = 0; k < 8; k++) spawnPBullet(new V3(P.x + rand(-0.2, 0.2), 1.1, P.z), new V3(0, 0, -1), 65, 1, 0, 0, 0xffffff, 0, { kb: WEAPONS.shotgun.kb, shot: 999 });
        updatePBullets(0.1);
        const pushed = z0 - e.z;
        if (!(pushed > 0.5 && pushed < WEAPONS.shotgun!.kb! + 0.05)) throw new Error('knockback ' + pushed);
        P.magMul = 2.5;
        if (magSize(newWeapon('launcher', 0)) > 4 || magSize(newWeapon('smg', 0)) < 110) throw new Error('mag chips ' + magSize(newWeapon('launcher', 0)));
        console.log('SMOKE knockback/mag ok', 'push', pushed.toFixed(2));
        endRun('abandon');
      }
      // every type drops regardless of unlocks; modded basic weapons start the run modded
      {
        const keepU = save.unlocked, keepM = save.mods, keepL = save.loadout;
        save.unlocked = { pistol: true };
        const ids = new Set(); for (let k = 0; k < 400; k++) ids.add(pickDrop());
        if (ids.size !== WEAPON_ORDER.length) throw new Error('drop pool should have every type: ' + [...ids]);
        save.mods = { rail: { plus: 3, r: 2 } }; save.loadout = [basicW('rail'), null];
        startRun(); tick(2);
        const w = P.weapons[0]!;
        if (w.id !== 'rail' || w.plus !== 3 || w.r !== 2 || !w.basic) throw new Error('modded basic ' + JSON.stringify(w));
        endRun('abandon');
        save.unlocked = keepU; save.mods = keepM; save.loadout = keepL; persist();
        console.log('SMOKE unlock/mod ok');
      }
      // splitter killed by a chain blast or a rocket: both halves must survive that blast
      {
        startRun(); tick(3); enemies.slice().forEach(e => { e.dead = true; removeEnemyMesh(e); }); clearWorld('enemy');
        grid.fill(1); hgt.fill(0); ramp.fill(-1); cover.fill(0);
        const cx = W * T / 2, cz = H * T / 2;
        P.chain = 3; P.dmgMul = 10;
        let s = spawnEnemy('splitter', cx, cz, -1, 1); hurtEnemy(s, 1e6, false);
        const a1 = enemies.filter(e => !e.dead && e.type === 'mini').length;
        P.chain = 0;
        s = spawnEnemy('splitter', cx + 10, cz, -1, 1); explode(s.x, 1, s.z, 5, 1e6, 0xff6a3d, true);
        const a2 = enemies.filter(e => !e.dead && e.type === 'mini').length;
        if (a1 !== 2 || a2 !== 4) throw new Error('splitter halves ' + a1 + ' ' + a2);
        console.log('SMOKE splitter ok');
        endRun('abandon');
      }
      // music: every style and its boss arrangement can be scheduled without errors (the context may be suspended in headless)
      {
        audioInit(); musicInit();
        if (!mus.bus) throw new Error('music bus');
        Object.keys(MUSIC_STYLES).forEach(name => {
          [false, true].forEach(boss => {
            if (boss && name === 'BASE') return;
            setMusic(name, boss);
            if (!mus.st || mus.name !== name + (boss ? ':boss' : '')) throw new Error('setMusic ' + name);
            for (let k = 0; k < 64; k++) playStep(mus.st, k, actx!.currentTime + k * 0.01, 0.1);
          });
        });
        setMusicMix('combat'); setMusicMix('explore'); musicVolume(0.4); musicVolume(1);
        Object.keys(SFX).forEach(k => SFX[k]()); // every effect builds its node graph without errors
        console.log('SMOKE music/sfx ok', Object.keys(MUSIC_STYLES).length, 'styles');
      }
      // boss entrance and phase change: invulnerable while appearing; one invulnerable burst when dropping below half
      {
        startPractice('trinity'); tick(3); if (!boss) spawnBoss('trinity');
        const hp0 = boss!.hp; hurtEnemy(boss!, 100, false);
        if (boss!.hp !== hp0) throw new Error('hurt during intro');
        tick(Math.ceil(BOSS_TUNE.introTime * 60) + 5);
        hurtEnemy(boss!, boss!.maxHp * 0.6, false);
        if (!boss!.phased || !(boss!.spawnT > 0)) throw new Error('phase change');
        const hp1 = boss!.hp; hurtEnemy(boss!, 100, false);
        if (boss!.hp !== hp1) throw new Error('hurt during phase change');
        console.log('SMOKE boss intro/phase ok');
        endRun('abandon');
      }
      // boss practice: fight, win, go home; the save must not change
      {
        const before = JSON.stringify(save);
        BOSS_ORDER.forEach(kind => {
          startPractice(kind); tick(120);
          if (!boss) spawnBoss(kind);
          boss!.spawnT = 0;
          if (boss!.name.indexOf(BOSS_META[kind]!.name!.split(' ')[0]) !== 0) throw new Error('wrong boss ' + kind + ' ' + boss!.name);
          if (boss!.invuln) { enemies.filter(e => !e.boss).forEach(e => hurtEnemy(e, 1e6, false)); tick(20); }
          spawnWave(boss!.x, boss!.z, 11, 18, 10, 0xff8a3d); // a shockwave still spreading when the boss falls
          hurtEnemy(boss!, boss!.hp + 1, false);
          if (query('wave').length) throw new Error('shockwave outlived the boss ' + kind);
          tick(30);
          if (portals.length !== 1 || portals[0].kind !== 'extract') throw new Error('practice portal ' + kind);
          endRun('extract');
        });
        const after = JSON.stringify(save);
        if (before !== after) throw new Error('practice changed the save');
        console.log('SMOKE practice ok');
      }
      // checkpoint: saved when a stage starts, holds the state from that moment, deleted when the run ends
      {
        startRun(); tick(5); show(null); setState('play');
        if (!save.suspend || save.suspend.run.stage !== run.stage) throw new Error('checkpoint at stage start');
        const bits0 = save.suspend.run.bits; run.bits += 999;
        if (save.suspend.run.bits !== bits0) throw new Error('checkpoint changed mid-stage');
        nextStage(); if (save.suspend.run.stage !== run.stage) throw new Error('checkpoint on next stage');
        endRun('dead');
        if (save.suspend) throw new Error('checkpoint survived the end of the run');
        goBase(); startRun(); tick(5); // leave a run going for the next check
        console.log('SMOKE checkpoint ok');
      }
      // feedback: hidden while there is no form; with one, the result screen opens it with the run filled in
      {
        const keepForm = { ...FEEDBACK_FORM }, keepOpen = window.open, opened: string[] = [];
        window.open = ((u: string) => { opened.push(u); return null; }) as typeof window.open;
        try {
          FEEDBACK_FORM.url = '';
          goBase(); if (!$('#btnFeedbackBase').hidden) throw new Error('feedback shown without a form');
          Object.assign(FEEDBACK_FORM, { url: 'https://docs.google.com/forms/d/e/test/viewform', game: '1', build: '2', info: '3' });
          startRun(); tick(5); run.perks = ['split', 'split', 'rapid+']; endRun('extract');
          if ($('#btnFeedbackRes').hidden) throw new Error('feedback button on the result screen');
          $('#btnFeedbackRes').click();
          const info = new URL(opened[0]!).searchParams.get('entry.3') || '';
          if (!info.includes('result=extract') || !info.includes('splitx2') || !info.includes('rapid+') || new URL(opened[0]!).searchParams.get('entry.1') !== 'sector-dive') throw new Error('feedback info ' + info);
          goBase(); if ($('#btnFeedbackBase').hidden) throw new Error('feedback link on the base screen');
          $('#btnFeedbackBase').click();
          if (!(new URL(opened[1]!).searchParams.get('entry.3') || '').startsWith('from=base')) throw new Error('feedback base info');
        } finally { Object.assign(FEEDBACK_FORM, keepForm); window.open = keepOpen; }
        goBase(); startRun(); tick(5);
        console.log('SMOKE feedback ok');
      }
      // result chips: counted, most first, rare ones folded in; the order taken is folded away underneath
      {
        goBase(); startRun(); tick(5); run.perks = ['rapid', 'split', 'split+', 'split', 'overload+'];
        endRun('extract');
        const want = t('res.chips', { n: 5, list: [t('common.countRare', { name: perkName('split'), n: 3, r: 1 }), perkName('rapid'), perkName('overload+')].join(t('common.sep')) });
        if ($('#resChips').textContent !== want) throw new Error('result chips ' + $('#resChips').textContent);
        if ($('#resOrder').hidden || ($('#resOrder') as HTMLDetailsElement).open || $('#resOrderList').textContent !== run.perks.map(perkName).join(t('common.sep'))) throw new Error('result chip order');
        goBase(); startPractice('crusher', 0); tick(5); endRun('abandon');
        if (!$('#resOrder').hidden) throw new Error('chip order after practice');
        goBase(); startRun(); tick(5);
        console.log('SMOKE result chips ok');
      }
      // share: shown after a real run with the bosses defeated, hidden after practice
      {
        goBase(); startRun(); tick(5); run.bosses = ['watcher']; run.perks = ['overload', 'overload', 'rapid+'];
        endRun('extract');
        if ($('#btnShare').hidden || !shareData || shareData.bosses[0] !== BOSS_META.watcher.short || shareData.chips[0] !== t('common.count', { name: perkName('overload'), n: 2 })) throw new Error('share data');
        if (!shareText(shareData).includes('#SectorDive') || !shareText(shareData).includes(BOSS_META.watcher.short)) throw new Error('share text');
        $('#btnShare').click(); if ($('#sharePanel').hidden) throw new Error('share panel on PC');
        goBase(); startPractice('crusher', 0); tick(5); endRun('abandon');
        if (!$('#btnShare').hidden) throw new Error('share shown after practice');
        goBase(); startRun(); tick(5);
        console.log('SMOKE share ok');
      }
      // analytics: the flow above sent its events (recorded in TRACK_LOG; no tag is loaded outside the real site)
      {
        if (TRACK_LOG.some(e => e.params.game !== 'sector-dive')) throw new Error('analytics: game id missing');
        const ev = TRACK_LOG.map(e => e.name + ':' + (e.params.result ?? e.params.method ?? ''));
        for (const want of ['dive_start:', 'level_start:', 'level_end:extract', 'level_end:dead', 'share:panel', 'practice_start:', 'practice_end:abandon'])
          if (!ev.includes(want)) throw new Error('analytics event ' + want + ' / ' + ev.slice(-12).join(' '));
        if (TRACK_LOG.some(e => (e.name === 'level_start' || e.name === 'level_end') && e.params.stage_role !== 'normal' && e.params.stage_role !== 'boss')) throw new Error('analytics: stage_role');
        // in a build (npm run test:build) the analytics tag must be in the page; the dev server has none
        if (import.meta.env.MODE === 'test' && !document.head.innerHTML.includes("gtag('config'")) throw new Error('analytics tag missing in the build');
        console.log('SMOKE analytics ok');
      }
      // suspend -> resume -> suspend -> discard
      run.route = [0]; run.stage = 2; startStage(); tick(30);
      suspendRun(); if (!save.suspend || state !== 'base') throw new Error('suspend failed');
      resumeRun(); tick(60); if (run.stage !== 2 || (save.suspend as Snapshot | null)?.run.stage !== 2) throw new Error('resume failed');
      suspendRun(); discardSuspended(); if (save.suspend || (state as string) !== 'result') throw new Error('discard failed');
      console.log('SMOKE suspend ok');
      goBase(); save.bits = 999; save.up.hp = 3; $('#btnWipe').click(); $('#btnWipeGo').click();
      if (save.bits !== 0 || save.up.hp !== 0 || !$('#dlgWipe').hidden) throw new Error('wipe failed');
      console.log('SMOKE wipe ok');
      // hit direction: a hit from behind shows the arc, one from in front doesn't
      {
        goBase(); startRun(); tick(5); P.yaw = 0; P.hp = P.maxHp = 1e6;
        hitDirs.forEach(d => { d.t = 0; });
        P.inv = 0; damagePlayer(1, { x: P.x, z: P.z - 8 });
        if (hitDirs.some(d => d.t > 0)) throw new Error('hit arc shown for a hit from the front');
        P.inv = 0; damagePlayer(1, { x: P.x + 3, z: P.z + 8 });
        if (!hitDirs.some(d => d.t > 0)) throw new Error('no hit arc for a hit from behind');
        goBase();
        console.log('SMOKE hit direction ok');
      }
      // gates: one that opens underfoot doesn't take the player until they step off it and come back after arming
      {
        goBase(); startRun(); tick(5);
        const st = run.stage;
        makePortal(P.x, P.z, 0xffffff, 'next', '');
        tick(30); if (run.stage !== st) throw new Error('gate took the player right away');
        tick(60); if (run.stage !== st) throw new Error('gate took the player without stepping off');
        P.x += 3; tick(2); P.x -= 3; tick(2);
        if (run.stage !== st + 1) throw new Error('gate did not work after stepping off and back');
        goBase();
        console.log('SMOKE gate arming ok');
      }
      // save codes: export, change things, import -> back to the exported state; a bad code is refused
      {
        save.bits = 777; save.up.dmg = 2; persist();
        const code = exportSave();
        save.bits = 1; save.up.dmg = 0; persist();
        if (importSaveCheck(code.slice(0, -1) + (code.endsWith('0') ? '1' : '0')) || importSave('SD1:abc.00000000')) throw new Error('bad save code accepted');
        if (!importSave(code) || save.bits !== 777 || save.up.dmg !== 2) throw new Error('save code round trip');
        $('#btnExport').click(); if ($('#savePanel').hidden || !el<HTMLTextAreaElement>('#saveCode').value.startsWith('SD1:')) throw new Error('export panel');
        $('#btnExport').click(); if (!$('#savePanel').hidden) throw new Error('export panel toggle');
        $('#btnWipe').click(); $('#btnWipeGo').click();
        console.log('SMOKE savecode ok', code.length + ' chars');
      }
      // start-depth readiness: a fresh save is "fair" at DEPTH 1 and gets harder deeper; upgrades and mods make it easier
      {
        const fresh = [0, 1, 2, 4].map(n => readiness(n));
        if (fresh[0] !== 2 || fresh.some((r, i) => i && r < fresh[i - 1]!)) throw new Error('readiness fresh ' + fresh);
        const s0 = readinessScore(2);
        save.up.dmg = 6; save.up.hp = 6; save.mods = { rail: { plus: 10, r: 2 } }; save.loadout = [basicW('rail'), null];
        const s1 = readinessScore(2);
        if (!(s1 > s0)) throw new Error('readiness upgrades ' + s0 + ' ' + s1);
        // reboot difficulty stops growing at PRES_DIFF_CAP reboots; the rating after the next reboot is worse than now
        if (presMulOf(PRES_DIFF_CAP + 5) !== presMulOf(PRES_DIFF_CAP) || !(presMulOf(1) > presMulOf(0))) throw new Error('reboot cap');
        if (!(readinessScore(0, readyAfterReboot()) < readinessScore(0))) throw new Error('readiness after reboot');
        console.log('SMOKE readiness ok', fresh.join(','), 'D3 fresh', s0.toFixed(2), 'maxed', s1.toFixed(2), '->', readiness(2));
        $('#btnWipe').click(); $('#btnWipeGo').click();
      }
      // touch layout editor: open from the base, make the dash button bigger, close; the edit is kept
      {
        const s0 = getL('dash').s;
        openLayoutEditor('base'); if ((state as string) !== 'layout' || $('#layoutBar').hidden) throw new Error('layout editor open');
        document.querySelector<HTMLElement>('[data-lbact="plus"]')!.click(); document.querySelector<HTMLElement>('[data-lbact="done"]')!.click();
        if (state !== 'base' || Math.abs(getL('dash').s - (s0 + 0.1)) > 1e-9) throw new Error('layout editor ' + getL('dash').s);
        save.settings.layout = {}; applyLayout();
        console.log('SMOKE layout ok');
      }
      startRun(); tick(10);
      // reachability: from the start room, can the player walk into every room (and back to the start)?
      BIOMES.forEach((b, bi) => {
        let bad = 0, back = 0;
        for (let n = 0; n < 25; n++) {
          run.route = [bi]; run.stage = bi * PER; buildLevel(b, false);
          const reach = (from: number) => { const seenT = new Uint8Array(W * H), q = [from]; seenT[from] = 1;
            while (q.length) { const c = q.pop()!, ci = c % W, cj = (c / W) | 0;
              [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, bb], sd) => { const ni = ci + a, nj = cj + bb; if (isSolid(ni, nj)) return; const nn = nj * W + ni; if (!seenT[nn] && passable(c, nn, sd)) { seenT[nn] = 1; q.push(nn); } }); }
            return seenT; };
          const [sx, sz] = roomSpot(rooms[startIdx]), st = Math.floor(sz / T) * W + Math.floor(sx / T), fwdR = reach(st);
          rooms.forEach(r => { const [x, z] = roomSpot(r), k = Math.floor(z / T) * W + Math.floor(x / T); if (!fwdR[k]) bad++; else if (!reach(k)[st]) back++; });
        }
        console.log('SMOKE reach', b.code, 'unreachable rooms', bad, 'one-way rooms', back);
      });
    }
});
// dev view: #view-KWLN etc. drops straight into that sector's first floor (for screenshots)
if (location.hash.startsWith('#view-')) {
  setTimeout(() => {
    const bi = BIOMES.findIndex(b => b.code === location.hash.slice(6));
    if (bi < 0) return;
    startRun(); run.route = [bi]; run.stage = bi * PER + 1; startStage(); show(null); setState('play');
    for (let k = 0; k < 20; k++) update(1 / 60);
  }, 300);
}
// dev view: #view-wipe opens the data wipe dialog on the base screen (for screenshots)
if (location.hash === '#view-wipe') setTimeout(() => $('#btnWipe').click(), 300);
// dev view: #boss-phantom etc. starts boss practice against that boss
// optional depth: #boss-phantom-3 = DEPTH 3 strength
if (location.hash.startsWith('#boss-')) setTimeout(() => { const [k, d] = location.hash.slice(6).split('-'); if (BOSS_META[k]) startPractice(k, d ? Math.max(0, +d - 1) : 0); }, 300);
// dev view: #view-pick stands next to a dropped weapon (for screenshots of the pick-up prompt)
if (location.hash.startsWith('#view-pick')) setTimeout(() => {
  startRun(); show(null); setState('play');
  addPickup('weapon', P.x + 0.3, P.z, { w: newWeapon('shotgun', 1, false, 2, ['rate']) });
  for (let k = 0; k < 10; k++) update(1 / 60);
}, 300);
// dev view: #view-haz[-<weapon>] stands on a lit hazard tile (checks the gun is drawn over it); #view-perk opens the chip screen
if (location.hash.startsWith('#view-haz')) setTimeout(() => {
  startRun(); run.route = [1]; run.stage = PER + 1; startStage(); show(null); setState('play');
  const k = haz.findIndex(Boolean); if (k < 0) return;
  P.x = ((k % W) + 0.5) * T; P.z = (((k / W) | 0) + 0.5) * T - 1.5; P.yaw = Math.PI; P.pitch = -0.5; P.hp = 1e6; P.maxHp = 1e6;
  const wid = location.hash.split('-')[2]; if (WEAPONS[wid]) { const w0 = basicW(wid) as Weapon; w0.mag = magSize(w0); P.weapons[0] = w0; P.cur = 0; normalizeWeapons(); weaponHud(); } // #view-haz-smg etc.
  setHazardClock(0.5); for (let n = 0; n < 5; n++) update(1 / 60);
}, 300);
// dev view: #view-share[-dead] shows the result card image for a sample run (#view-share-res: the result screen, #view-share-res-panel: with the PC share panel open,
// #view-share-res-many: a deep run's hundred chips)
if (location.hash.startsWith('#view-share')) setTimeout(() => {
  startRun(); run.stage = 2 * PER + PER - 1; run.kills = 142; run.bosses = ['watcher', 'trinity'];
  run.perks = ['overload', 'overload', 'rapid+', 'crit', 'reload', 'light'];
  // -many: a deep run's hundred chips (the mix from a player's D14 run), to see the result screen fold them up
  if (location.hash.includes('many')) run.perks = shuffle(Object.entries({ split: 25, rapid: 18, overload: 13, 'overload+': 3, armor: 10, 'armor+': 3, mag: 4, leech: 4, 'leech+': 3, sprint: 4, 'sprint+': 1, reload: 3, 'crit+': 2, chain: 1, pierce: 1, 'light+': 1, repair: 1, 'rapid+': 1 }).flatMap(([id, n]) => Array(n).fill(id)));
  if (location.hash.includes('reboot')) save.pres.count = 3; P.weapons[0] = { id: 'rail', r: 2, plus: 7, opts: [] } as unknown as Weapon;
  const kind = location.hash.includes('dead') ? 'dead' : 'extract';
  endRun(kind); if (location.hash.includes('res')) { if (location.hash.includes('panel')) setTimeout(() => $('#btnShare').click(), 900); return; } // #view-share-res: the result screen itself
  drawShareCard(shareData!).then(b => { const im = new Image(); im.src = URL.createObjectURL(b!); im.style.cssText = 'position:fixed;inset:0;width:100%;z-index:99;background:#000'; document.body.appendChild(im); console.log('VIEW share', shareText(shareData!)); });
}, 300);
if (location.hash.startsWith('#view-perk')) setTimeout(() => { startRun(); PERKS[0].apply(P, 0.2); if (location.hash.includes('perk4')) save.pres.up.choice = 1; openPerk(t('perk.title')); }, 300); // #view-perk4: four options
// dev view: #tab-<sortie|up|practice|settings>[-touch] opens that base tab
if (location.hash.startsWith('#tab-')) setTimeout(() => showTab(location.hash.slice(5).replace(/-touch$/, '')), 0);
// dev view: #view-susp[-touch] leaves a suspended run and returns to the base
if (location.hash.startsWith('#view-susp')) setTimeout(() => { startRun(); suspendRun(); }, 300);
// dev: ?lang=<code> opens the page in that language (saved like the settings button does)
setTimeout(() => { const q = new URLSearchParams(location.search).get('lang'); if (q && LANG[q] && q !== lang) changeLang(q); }, 0);
// dev view: #view-hitdir shows the hit-direction arcs (hits from behind-right and from the left)
if (location.hash === '#view-hitdir') setTimeout(() => {
  startRun(); show(null); setState('play'); P.yaw = 0; P.hp = P.maxHp = 1e6;
  P.inv = 0; damagePlayer(1, { x: P.x + 6, z: P.z + 6 }); P.inv = 0; damagePlayer(1, { x: P.x - 8, z: P.z });
  updateHitDirs(0.05);
}, 300);
