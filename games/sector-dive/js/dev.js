'use strict';
// ================= dev hooks =================
// URL hash hooks for checking the game without playing it by hand. See SPEC.md 10章.

// dev check: open the page with #smoke to run every sector (floor + each boss candidate) once and log errors to the console
if (location.hash === '#smoke') {
  window.addEventListener('error', e => console.error('SMOKE ERR', e.message, e.filename + ':' + e.lineno));
  setTimeout(() => {
    try {
      startRun();
      const tick = n => { for (let k = 0; k < n; k++) { if (state !== 'play') { show(null); state = 'play'; } P.hp = P.maxHp; P.inv = 1; update(1 / 60); } };
      fireHeld = true;
      BIOMES.forEach((b, bi) => {
        run.route = [bi]; run.stage = bi * PER + 1; startStage(); tick(120);
        const n0 = enemies.length;
        // walk the player through the level to exercise movement over ramps/decks
        for (let k = 0; k < 120; k++) { joy.y = -1; P.yaw += 0.05; tick(1); }
        joy.y = 0;
        enemies.slice().forEach(e => hurtEnemy(e, 1e6, false)); tick(30);
        console.log('SMOKE floor', b.code, 'enemies', n0, 'fy', P.fy.toFixed(2), 'raised', hgt.filter(h => h > 0).length, 'ramps', ramp.filter(r => r >= 0).length, 'haz', haz.filter(Boolean).length);
        b.bosses.forEach(kind => {
          run.stage = bi * PER + PER - 1; startStage(); boss = null;
          enemies.slice().forEach(e => { e.dead = true; removeEnemyMesh(e); }); enemies = [];
          spawnBoss(kind); tick(400);
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
        run.route = [3]; run.stage = PER * 3 + 1; startStage(); enemies.slice().forEach(e => { e.dead = true; removeEnemyMesh(e); }); enemies = [];
        const [sx, sz] = roomSpot(rooms[startIdx]);
        const e = spawnEnemy('shield', sx, sz, -1, 1); e.face = 0; e.mesh.rotation.y = 0; // facing +z
        const shoot = dir => { spawnPBullet(new V3(sx, e.fy + 1.6, sz + dir * 2.5), new V3(0, 0, -dir), 60, 20, 0, 0, 0xffffff, 0, {}); updatePBullets(0.1); }; // above rubble height
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
        removeEnemyMesh(e); enemies = [];
      }
      // watcher: drones at 75% and 40%
      {
        startPractice('watcher'); tick(10); if (!boss) spawnBoss('watcher');
        const drones = () => enemies.filter(o => !o.boss && !o.dead && o.type === 'drone').length;
        boss.hp = boss.maxHp * 0.7; tick(2); const a1 = drones();
        boss.hp = boss.maxHp * 0.35; tick(2); const a2 = drones();
        if (a1 !== 2 || a2 !== 5) throw new Error('watcher drones ' + a1 + ' ' + a2);
        console.log('SMOKE watcher waves ok');
        endRun('abandon');
      }
      // scaling: additive damage chips, compounding health, practice depth
      {
        const p0 = newPlayer(save.loadout), base = p0.dmgMul, od = PERKS.find(x => x.name === '過負荷弾');
        od.apply(p0, od.v); od.apply(p0, od.v);
        if (Math.abs(p0.dmgMul - (base + 0.4)) > 1e-9) throw new Error('additive chips ' + p0.dmgMul);
        const perk = n => PERKS.find(x => x.name === n);
        for (let k = 0; k < 6; k++) ['弱点解析', '高速装填', '拡張弾倉'].forEach(n => perk(n).apply(p0, perk(n).rv));
        if (Math.abs(p0.reloadMul - 0.4) > 1e-9 || Math.abs(p0.magMul - 2.5) > 1e-9) throw new Error('caps ' + p0.reloadMul + ' ' + p0.magMul);
        const keepP = P; P = p0; const cc = critChance(); P = keepP;
        // 分裂弾: full-hit total must go up by exactly 20% for a single-shot weapon and for the shotgun alike
        { const keep = P; P = newPlayer(save.loadout);
          ['rail', 'shotgun'].forEach(id => {
            const w = newWeapon(id, 0), a = weaponStats(w); P.extra = 1; const b = weaponStats(w); P.extra = 0;
            if (Math.abs(b.perHit * b.hits / (a.perHit * a.hits) - 1.2) > 1e-9) throw new Error('split ' + id);
          });
          P = keep; }
        if (cc !== TUNE.critCap) throw new Error('crit cap ' + cc);
        run = { stage: PER - 1, route: [0] }; const b1 = bossDiff();
        run = { stage: 2 * PER + PER - 1, route: [0] }; const b3 = bossDiff();
        if (Math.abs(b1 - 1.33 * presMul()) > 0.01 || Math.abs(b3 / b1 - BOSS_HP_GROWTH * BOSS_HP_GROWTH) > 1e-6) throw new Error('boss scaling ' + b1 + ' ' + b3);
        if (Math.abs(diffOf(0) - ENEMY_TUNE.hpMul * presMul()) > 1e-9) throw new Error('enemy hp base ' + diffOf(0));
        startPractice('trinity', 2); tick(5);
        if (stageLabel(run.stage) !== 'D3 BOSS') throw new Error('practice depth ' + stageLabel(run.stage));
        endRun('abandon');
        console.log('SMOKE scaling ok', 'D1 boss', b1.toFixed(2), 'D3 boss', b3.toFixed(2));
      }
      // picking up: stow goes to the bag, equip swaps with the weapon in hand and drops the old one
      {
        startRun(); tick(5); pickups.slice().forEach(p => { p.dead = true; disposeTree(p.mesh); dynGroup.remove(p.mesh); }); pickups = [];
        P.weapons = [newWeapon('pistol', 0, true), newWeapon('smg', 0)]; P.cur = 0; P.bag = [null, null, null, null];
        const drop = id => { addPickup('weapon', P.x, P.z, { w: newWeapon(id, 1) }); updatePickups(0); };
        drop('rail'); stowNearby();
        if (!P.bag[0] || P.bag[0].id !== 'rail') throw new Error('stow');
        drop('shotgun'); equipNearby();
        if (P.weapons[0].id !== 'shotgun' || !pickups.some(p => !p.dead && p.kind === 'weapon' && p.w.id === 'pistol')) throw new Error('equip swap');
        P.bag = [newWeapon('smg', 0), newWeapon('smg', 0), newWeapon('smg', 0), newWeapon('smg', 0)];
        pickups.slice().forEach(p => { p.dead = true; disposeTree(p.mesh); dynGroup.remove(p.mesh); }); pickups = [];
        drop('launcher'); stowNearby();
        if (P.bag.some(w => w.id === 'launcher') || !nearW) throw new Error('stow into a full bag');
        console.log('SMOKE pickup ok');
        endRun('abandon');
      }
      // chain blast: one kill in a tight cluster must not wipe the whole cluster through a cascade
      {
        startRun(); tick(3); enemies.slice().forEach(e => { e.dead = true; removeEnemyMesh(e); }); enemies = [];
        P.chain = 3; P.dmgMul = 10; // blasts strong enough to kill anything they touch
        const [cx, cz] = roomSpot(rooms[startIdx]);
        const line = [0, 2.8, 5.6, 8.4].map(dx => spawnEnemy('crawler', cx + dx, cz, -1, 1)); // each 2.8m apart, blast radius 4
        hurtEnemy(line[0], 1e6, false);
        const alive = line.filter(e => !e.dead).length;
        if (alive !== 2) throw new Error('chain cascade: alive ' + alive);
        console.log('SMOKE chain ok');
        endRun('abandon');
      }
      // rare chips show up gold and apply the stronger amount; deep sectors favour tougher enemy types
      {
        startRun(); tick(3);
        const keep = TUNE.rareChipChance; TUNE.rareChipChance = 1;
        openPerk('test');
        const rareCards = document.querySelectorAll('#perkList .perk.rare').length;
        TUNE.rareChipChance = keep;
        const before = JSON.stringify(P);
        document.querySelector('#perkList .perk.rare').click();
        if (!rareCards || JSON.stringify(P) === before || !run.perks[run.perks.length - 1].endsWith('+')) throw new Error('rare chip');
        P.crit = TUNE.critCap; P.reloadMul = 0.4; P.magMul = 2.5;
        for (let k = 0; k < 30; k++) {
          openPerk('test');
          const names = [...document.querySelectorAll('#perkList .pn')].map(n => n.textContent);
          if (names.some(n => /弱点解析|高速装填|拡張弾倉/.test(n))) throw new Error('maxed chip offered ' + names);
        }
        show(null); state = 'play';
        let elite = 0; for (let k = 0; k < 400; k++) if (ELITE_TYPES.includes(pickEnemyType(BIOMES[3], 10))) elite++;
        let elite0 = 0; for (let k = 0; k < 400; k++) if (ELITE_TYPES.includes(pickEnemyType(BIOMES[3], 0))) elite0++;
        if (!(elite > elite0)) throw new Error('elite bias ' + elite0 + ' ' + elite);
        console.log('SMOKE rare/elite ok', 'rare cards', rareCards, 'elite share D1', elite0 / 400, 'D11', elite / 400);
        endRun('abandon');
      }
      // autofire target: an enemy hidden in the fog must not be picked, the same enemy close up must be
      {
        startRun(); tick(3); enemies.slice().forEach(e => { e.dead = true; removeEnemyMesh(e); }); enemies = [];
        scene.fog.near = 2; scene.fog.far = 20; // visibleRange = 12.8
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
        startRun(); tick(3); enemies.slice().forEach(e => { e.dead = true; removeEnemyMesh(e); }); enemies = [];
        grid.fill(1); hgt.fill(0); ramp.fill(-1); cover.fill(0);
        P.x = W * T / 2; P.z = H * T / 2; P.fy = 0;
        const e = spawnEnemy('brute', P.x, P.z - 4, -1, 50); e.fy = 0; e.mesh.position.set(e.x, 1.1, e.z);
        const z0 = e.z;
        for (let k = 0; k < 8; k++) spawnPBullet(new V3(P.x + rand(-0.2, 0.2), 1.1, P.z), new V3(0, 0, -1), 65, 1, 0, 0, 0xffffff, 0, { kb: WEAPONS.shotgun.kb, shot: 999 });
        updatePBullets(0.1);
        const pushed = z0 - e.z;
        if (!(pushed > 0.5 && pushed < WEAPONS.shotgun.kb + 0.05)) throw new Error('knockback ' + pushed);
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
        const w = P.weapons[0];
        if (w.id !== 'rail' || w.plus !== 3 || w.r !== 2 || !w.basic) throw new Error('modded basic ' + JSON.stringify(w));
        endRun('abandon');
        save.unlocked = keepU; save.mods = keepM; save.loadout = keepL; persist();
        console.log('SMOKE unlock/mod ok');
      }
      // boss practice: fight, win, go home; the save must not change
      {
        const before = JSON.stringify(save);
        BOSS_ORDER.forEach(kind => {
          startPractice(kind); tick(120);
          if (!boss) spawnBoss(kind);
          if (boss.name.indexOf(BOSS_META[kind].name.split(' ')[0]) !== 0) throw new Error('wrong boss ' + kind + ' ' + boss.name);
          if (boss.invuln) { enemies.filter(e => !e.boss).forEach(e => hurtEnemy(e, 1e6, false)); tick(20); }
          hurtEnemy(boss, boss.hp + 1, false); tick(30);
          if (portals.length !== 1 || portals[0].kind !== 'extract') throw new Error('practice portal ' + kind);
          endRun('extract');
        });
        const after = JSON.stringify(save);
        if (before !== after) throw new Error('practice changed the save');
        console.log('SMOKE practice ok');
      }
      // suspend -> resume -> suspend -> discard
      run.route = [0]; run.stage = 2; startStage(); tick(30);
      suspendRun(); if (!save.suspend || state !== 'base') throw new Error('suspend failed');
      resumeRun(); tick(60); if (run.stage !== 2 || save.suspend) throw new Error('resume failed');
      suspendRun(); discardSuspended(); if (save.suspend || state !== 'result') throw new Error('discard failed');
      console.log('SMOKE suspend ok');
      goBase(); save.bits = 999; save.up.hp = 3; $('#btnWipe').click(); $('#btnWipeGo').click();
      if (save.bits !== 0 || save.up.hp !== 0 || !$('#dlgWipe').hidden) throw new Error('wipe failed');
      console.log('SMOKE wipe ok');
      startRun(); tick(10);
      // reachability: from the start room, can the player walk into every room (and back to the start)?
      BIOMES.forEach((b, bi) => {
        let bad = 0, back = 0;
        for (let n = 0; n < 25; n++) {
          run.route = [bi]; run.stage = bi * PER; buildLevel(b, false);
          const reach = from => { const seenT = new Uint8Array(W * H), q = [from]; seenT[from] = 1;
            while (q.length) { const c = q.pop(), ci = c % W, cj = (c / W) | 0;
              [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, bb], sd) => { const ni = ci + a, nj = cj + bb; if (isSolid(ni, nj)) return; const nn = nj * W + ni; if (!seenT[nn] && passable(c, nn, sd)) { seenT[nn] = 1; q.push(nn); } }); }
            return seenT; };
          const [sx, sz] = roomSpot(rooms[startIdx]), st = Math.floor(sz / T) * W + Math.floor(sx / T), fwdR = reach(st);
          rooms.forEach(r => { const [x, z] = roomSpot(r), k = Math.floor(z / T) * W + Math.floor(x / T); if (!fwdR[k]) bad++; else if (!reach(k)[st]) back++; });
        }
        console.log('SMOKE reach', b.code, 'unreachable rooms', bad, 'one-way rooms', back);
      });
      // build guard: version.json must match the page's build meta
      fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.json()).then(v => {
        const mine = document.querySelector('meta[name="build"]').content;
        console.log(v.build === mine ? 'SMOKE build ok ' + mine : 'SMOKE ERR build mismatch ' + mine + ' vs ' + v.build);
      });
      console.log('SMOKE DONE');
    } catch (err) { console.error('SMOKE FAIL', err && err.stack || err); }
  }, 300);
}
// dev view: #view-KWLN etc. drops straight into that sector's first floor (for screenshots)
if (location.hash.startsWith('#view-')) {
  setTimeout(() => {
    const bi = BIOMES.findIndex(b => b.code === location.hash.slice(6));
    if (bi < 0) return;
    startRun(); run.route = [bi]; run.stage = bi * PER + 1; startStage(); show(null); state = 'play';
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
  startRun(); show(null); state = 'play';
  addPickup('weapon', P.x + 0.3, P.z, { w: newWeapon('shotgun', 1, false, 2, ['rate']) });
  for (let k = 0; k < 10; k++) update(1 / 60);
}, 300);
