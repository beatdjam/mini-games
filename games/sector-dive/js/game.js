'use strict';
// ================= game flow =================
let state = 'base', time = 0;
const screens = ['#scrBase', '#scrPerk', '#scrPause', '#scrResult', '#scrBag'];
function show(id) { screens.forEach(s => { $(s).hidden = s !== id; }); }
function setPlayUI(on) { $('#hud').hidden = !on; $('#touch').hidden = !on; gun.visible = on; if (!on) bigmap.hidden = true; }

function startRun() {
  audioInit();
  if (isTouch && !isFs()) enterFs();
  if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').catch(() => {});
  const tier = clamp(save.startTier, 0, save.shortcut);
  P = newPlayer(save.loadout);
  const risked = save.loadout.filter(w => w && !w.basic).length;
  // non-basic weapons leave the base: they come back only on extraction
  save.loadout = save.loadout.map((w, i) => w && w.basic ? w : (i === 0 ? basicW('pistol') : null));
  run = { stage: tier * PER, kills: 0, bits: 0, perks: [], startTier: tier, route: shuffle(BIOMES.map((_, i) => i)) };
  save.runs++; persist();
  show(null); setPlayUI(true); normalizeWeapons(); weaponHud();
  startStage();
  requestLock();
  const queue = [];
  for (let k = 0; k < save.up.chip; k++) queue.push('持ち込みチップ');
  for (let k = 0; k < tier; k++) queue.push('ショートカット補給');
  const total = queue.length;
  const next = () => { if (queue.length) { const kind = queue.shift(); openPerk(`${kind}（${total - queue.length} / ${total}）`, 'loadout', next); } };
  next();
  if (!total) toast(isTouch ? '左で移動 / 右ドラッグで視点。操作一覧は II（一時停止）に' : 'WASD移動 / マウスで視点 / クリックで射撃。操作一覧は Esc（一時停止）に', 4200);
  if (risked) setTimeout(() => toast('倉庫から持ち出した武器は、死ぬと失う', 3000), total ? 0 : 4400);
}
function startStage() {
  const si = stageInfo(run.stage), b = si.biome, isArena = isBossStage(run.stage);
  const fade = $('#fade'); fade.style.transition = 'none'; fade.style.opacity = 1;
  requestAnimationFrame(() => { fade.style.transition = ''; fade.style.opacity = 0; });
  const bossKind = isArena ? (run.forceBoss || pick(b.bosses)) : null;
  buildLevel(b, isArena, bossKind);
  const diff = diffOf(run.stage);
  if (isArena) {
    P.x = W * T / 2; P.z = 14.5 * T; P.yaw = 0; P.pitch = 0.08;
    const stageAt = run.stage;
    setTimeout(() => { if (run && run.stage === stageAt && !boss && !portals.length && state !== 'base' && state !== 'result') spawnBoss(bossKind); }, 1200);
  } else {
    const [sx, sz] = roomSpot(rooms[startIdx]); P.x = sx; P.z = sz;
    const [ex, ez] = roomSpot(rooms[exitIdx]); P.yaw = Math.atan2(-(ex - sx), -(ez - sz)); P.pitch = 0;
    makePortal(ex, ez, 0xffc24a, 'next', si.sub === PER - 2 ? 'ボスへ' : '次の区画');
    rooms.forEach((r, idx) => {
      if (idx === startIdx) return;
      const n = Math.min(ENEMY_TUNE.maxPerRoom, Math.max(2, Math.floor(r.w * r.h / (b.gen.density || 3))), randi(2, 4) + Math.floor(prog(run.stage) * 0.3));
      for (let k = 0; k < n; k++) { const [x, z] = randomTileIn(r); spawnEnemy(pickEnemyType(b, si.tier), x, z, idx, diff); }
      roomCount[idx] = n;
    });
    const cand = rooms.map((r, i) => i).filter(i => i !== startIdx);
    const caches = Math.random() < 0.4 ? 2 : 1;
    shuffle(cand).slice(0, caches).forEach(i => {
      const [x, z] = randomTileIn(rooms[i]);
      addPickup('weapon', x, z, { w: rollWeapon(prog(run.stage)) });
    });
  }
  P.tile = -1; P.inv = 1.0; P.fy = floorY(P.x, P.z); P.vy = 0;
  $('#bossBar').hidden = true;
  $('#stageLbl').innerHTML = `<b>${stageLabel(run.stage)}</b>　${b.name}`;
  banner(stageLabel(run.stage), b.name);
  const hintAt = run.stage;
  if (si.sub === 0 && b.hint) setTimeout(() => { if (run && run.stage === hintAt && state === 'play') toast(b.hint, 3600); }, 1800);
  state = 'play';
  updateHint();
}
// deeper sectors lean toward the biome's tougher enemy types
function pickEnemyType(b, tier) {
  const elites = b.enemies.filter(t => ELITE_TYPES.includes(t));
  const chance = Math.min(ENEMY_TUNE.eliteMax, ENEMY_TUNE.elitePerDepth * tier);
  return elites.length && Math.random() < chance ? pick(elites) : pick(b.enemies);
}
function nextStage() {
  sfx('portal');
  run.stage++;
  save.best = Math.max(save.best, run.stage + 1); persist();
  if (run.stage % (PER * 3) === 0) toast(`DEPTH ${stageInfo(run.stage).tier + 1} — ここから敵がさらに強くなる`, 3000);
  startStage();
}
function openPerk(title, eyebrow, done) {
  state = 'perk'; releaseInputs(); exitLock(); bigmap.hidden = true;
  $('#perkTitle').textContent = title; $('#perkEyebrow').textContent = eyebrow || 'chip acquired';
  const opts = shuffle(PERKS.filter(o => !(o.maxed && o.maxed(P)))).slice(0, 3 + save.pres.up.choice)
    .map(o => ({ o, rare: o.rv !== undefined && Math.random() < TUNE.rareChipChance }));
  const list = $('#perkList'); list.innerHTML = '';
  opts.forEach(({ o, rare }) => {
    const v = rare ? o.rv : o.v, name = o.name + (rare ? '+' : '');
    const b = document.createElement('button'); b.className = 'perk' + (rare ? ' rare' : '');
    b.innerHTML = `<span class="pn">${rare ? '★ ' : ''}${name}</span><span class="pd">${o.desc(v)}</span>`;
    b.addEventListener('click', () => {
      o.apply(P, v); run.perks.push(name); sfx('chip');
      show(null); state = 'play'; weaponHud();
      requestLock();
      if (done) done();
    });
    list.appendChild(b);
  });
  show('#scrPerk');
}
function exitLock() { if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) {} } }
function pause() {
  if (state !== 'play') return;
  state = 'pause'; releaseInputs(); exitLock(); bigmap.hidden = true;
  renderSettings();
  $('#btnSuspend').hidden = !!run.practice;
  $('#pauseChips').innerHTML = statsHTML();
  show('#scrPause');
}
$('#btnResume').addEventListener('click', () => { show(null); state = 'play'; requestLock(); });
$('#btnAbandon').addEventListener('click', () => endRun('abandon'));
$('#btnSuspend').addEventListener('click', suspendRun);

// ---- suspend / resume ----
// the snapshot keeps the run and the player's build; resuming regenerates the current stage from its start
const SNAP_SKIP = ['x', 'z', 'yaw', 'pitch', 'tile', 'bob', 'fy', 'vy', 'inv', 'dashT', 'ddx', 'ddz', 'reloadT', 'reloadMax', 'fireCd', 'stDelay'];
let discardArm = false;
function suspendRun() {
  const p = {};
  Object.keys(P).forEach(k => { if (!SNAP_SKIP.includes(k)) p[k] = P[k]; });
  save.suspend = { run: { stage: run.stage, kills: run.kills, bits: run.bits, perks: run.perks, startTier: run.startTier, route: run.route }, P: JSON.parse(JSON.stringify(p)) };
  persist(); releaseInputs(); exitLock(); discardArm = false;
  goBase();
}
function restoreSnapshot(sn) {
  P = Object.assign(newPlayer([basicW('pistol'), null]), sn.P);
  run = Object.assign({}, sn.run);
}
function resumeRun() {
  const sn = save.suspend; if (!sn) return;
  audioInit();
  if (isTouch && !isFs()) enterFs();
  restoreSnapshot(sn);
  save.suspend = null; persist();
  show(null); setPlayUI(true); normalizeWeapons(); weaponHud();
  startStage(); requestLock();
  toast('中断した潜行を再開した', 2000);
}
function discardSuspended() {
  const sn = save.suspend; if (!sn) return;
  restoreSnapshot(sn); save.suspend = null; discardArm = false;
  endRun('abandon');
}
function renderSuspend() {
  const box = $('#suspendBox'), sn = save.suspend;
  box.hidden = !sn; $('#btnStart').hidden = !!sn;
  if (!sn) return;
  const tier = Math.floor(sn.run.stage / PER), b = BIOMES[sn.run.route[tier % sn.run.route.length]];
  box.innerHTML = `<p class="eyebrow">suspended</p>
    <div>中断中の潜行: <b>${stageLabel(sn.run.stage)}</b>　${b.name}（HP ${Math.ceil(sn.P.hp)} / ${sn.P.maxHp}、ビット ${Math.floor(sn.run.bits)}）</div>
    <div class="row"><button class="primary" data-susp="resume">RESUME<small>この区画の最初から再開</small></button>
    ${discardArm ? '<button class="buy" data-susp="discard">本当に破棄する（死亡扱い）</button><button class="mini-btn" data-susp="cancel">やめる</button>'
      : '<button class="mini-btn" data-susp="arm">破棄…</button>'}</div>`;
}
$('#suspendBox').addEventListener('click', e => {
  const b = e.target.closest('[data-susp]'); if (!b) return;
  const a = b.dataset.susp;
  if (a === 'resume') resumeRun();
  else if (a === 'discard') discardSuspended();
  else { discardArm = a === 'arm'; renderSuspend(); }
});

// ---- stats panel ----
function statsHTML() {
  const w = curW(), pct = v => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`, rows = [];
  rows.push(['最大HP', P.maxHp]);
  rows.push(['与ダメージ', pct(P.dmgMul * (1 + PLUS_DMG * (w.plus || 0)) - 1)]);
  rows.push(['連射速度', pct(P.fireRate / Math.pow(0.91, wo('rate')) - 1)]);
  rows.push(['移動速度', pct(P.spdMul * (1 + 0.06 * wo('speed')) - 1)]);
  rows.push(['スタミナ', `最大 ${P.stMax}（ダッシュ ${Math.floor(P.stMax / TUNE.dashCost)} 回分）/ 回復 ${Math.round(P.stRegen)} 毎秒`]);
  rows.push(['リロード時間', pct(P.reloadMul * Math.pow(0.8, wo('reload')) - 1)]);
  rows.push(['装弾数', pct(P.magMul * (1 + 0.3 * wo('mag')) - 1)]);
  rows.push(['会心率（2倍ダメージ）', `${Math.round(critChance() * 100)}%${P.crit + 0.08 * wo('crit') > TUNE.critCap ? '（上限）' : ''}`]);
  const pierce = P.pierce + wo('pierce'), leech = P.leech + 2 * wo('leech'), gain = P.gainMul * (1 + 0.1 * wo('gain'));
  if (pierce) rows.push(['貫通', `+${pierce} 体`]);
  if (P.extra) rows.push(['分裂弾', `発射数 +${P.extra}（1発の威力 -20%）`]);
  if (leech) rows.push(['撃破時回復', `HP +${leech}`]);
  if (P.chain) rows.push(['連鎖爆破', `Lv ${P.chain}`]);
  if (P.magnet > 1) rows.push(['回収範囲', `×${P.magnet.toFixed(1)}`]);
  rows.push(['ビット獲得', pct(gain - 1)]);
  const counts = {}; run.perks.forEach(n => { counts[n] = (counts[n] || 0) + 1; });
  const chips = Object.keys(counts).map(n => counts[n] > 1 ? `${n}×${counts[n]}` : n).join('、') || 'なし';
  return `<h3>現在の性能<small>拠点強化・チップ・手持ち武器（${wText(w)}）込み</small></h3>
    <dl class="reslist">${rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>
    <p class="chips">取得チップ: ${chips}</p>`;
}

// ---- inventory ----
let invSel = null; // {where:'eq'|'bag', i}
function openBag() {
  if (state !== 'play') return;
  state = 'bag'; releaseInputs(); exitLock(); invSel = null; bigmap.hidden = true;
  renderBag(); show('#scrBag');
}
function closeBag() { show(null); state = 'play'; normalizeWeapons(); weaponHud(); requestLock(); }
$('#btnBagClose').addEventListener('click', closeBag);
$('#btnUseKit').addEventListener('click', () => { useKit(); renderBag(); });
function itemCard(w, where, i) {
  const sel = invSel && invSel.where === where && invSel.i === i;
  if (!w) return `<button class="item none ${sel ? 'sel' : ''}" data-inv="${where}:${i}">空き</button>`;
  const def = WEAPONS[w.id];
  return `<button class="item ${sel ? 'sel' : ''}" data-inv="${where}:${i}" style="border-left:3px solid ${w.basic ? 'var(--line)' : RARITY[w.r].css}"><span class="wn">${wName(w)}</span>
    <span class="ws">火力 ${Math.round(weaponStats(w).dps)} / DMG ${Math.round(def.dmg * wDmgMul(w))}${def.pellets > 1 ? '×' + def.pellets : ''} / 弾 ${w.mag}/${magSize(w)}</span>${wOpts(w)}
    ${where === 'eq' ? `<span class="ws">スロット${i + 1}${i === P.cur ? '（手持ち）' : ''}</span>` : ''}</button>`;
}
function renderBag() {
  $('#invEq').innerHTML = P.weapons.map((w, i) => itemCard(w, 'eq', i)).join('');
  $('#invBag').innerHTML = P.bag.map((w, i) => itemCard(w, 'bag', i)).join('');
  $('#kitNum').textContent = P.kits;
  $('#btnUseKit').textContent = `使う（HP +${TUNE.kitHeal}）`;
  $('#btnUseKit').disabled = P.kits <= 0 || P.hp >= P.maxHp;
  $('#bagChips').innerHTML = `<p class="chips">HP ${Math.ceil(P.hp)} / ${P.maxHp}　今回のビット ${Math.floor(run.bits)}</p>` + statsHTML();
  const act = $('#invAct');
  if (!invSel) { act.innerHTML = '武器を選ぶと、装備の入れ替えや廃棄ができる'; return; }
  const w = invSel.where === 'eq' ? P.weapons[invSel.i] : P.bag[invSel.i];
  if (!w) { act.innerHTML = '空きスロット'; return; }
  const eqCount = P.weapons.filter(Boolean).length, bagFree = P.bag.includes(null);
  const btns = [];
  if (invSel.where === 'bag') {
    btns.push(`<button class="mini-btn amber" data-act="equip0">スロット1に装備</button>`);
    btns.push(`<button class="mini-btn amber" data-act="equip1">スロット2に装備</button>`);
    btns.push(`<button class="mini-btn" data-act="drop">捨てる</button>`);
  } else {
    btns.push(`<button class="mini-btn" data-act="stow" ${eqCount > 1 && bagFree ? '' : 'disabled'}>バッグへしまう</button>`);
    btns.push(`<button class="mini-btn" data-act="drop" ${eqCount > 1 ? '' : 'disabled'}>捨てる</button>`);
  }
  act.innerHTML = btns.join('') + (w.basic ? '' : '<span>（帰還すれば倉庫に残る）</span>');
}
$('#scrBag').addEventListener('click', e => {
  const it = e.target.closest('[data-inv]'), ac = e.target.closest('[data-act]');
  if (it) { const [where, i] = it.dataset.inv.split(':'); invSel = { where, i: +i }; renderBag(); return; }
  if (!ac || !invSel) return;
  const a = ac.dataset.act, src = invSel.where === 'eq' ? P.weapons : P.bag, w = src[invSel.i];
  if (!w) return;
  if (a === 'equip0' || a === 'equip1') {
    const k = a === 'equip0' ? 0 : 1, prev = P.weapons[k];
    P.weapons[k] = w; P.bag[invSel.i] = prev; P.cur = k; invSel = { where: 'eq', i: k };
  } else if (a === 'stow') {
    const slot = P.bag.indexOf(null); if (slot < 0) return;
    P.bag[slot] = w; P.weapons[invSel.i] = null; invSel = { where: 'bag', i: slot };
  } else if (a === 'drop') {
    src[invSel.i] = null; addPickup('weapon', P.x + rand(-0.6, 0.6), P.z + rand(-0.6, 0.6), { w }); invSel = null;
  }
  normalizeWeapons(); sfx('pick'); renderBag(); weaponHud();
});

// ---- run end ----
// ---- boss practice: fight one boss at a chosen depth's strength; nothing is gained or lost ----
let practiceTier = 0;
function startPractice(kind, tier) {
  tier = tier || 0;
  audioInit();
  if (isTouch && !isFs()) enterFs();
  const bi = BIOMES.findIndex(b => b.bosses.includes(kind));
  P = newPlayer(save.loadout);
  run = { stage: tier * PER + PER - 1, kills: 0, bits: 0, perks: [], startTier: 0, route: [bi], practice: true, forceBoss: kind, t0: performance.now() };
  show(null); setPlayUI(true); normalizeWeapons(); weaponHud();
  startStage(); requestLock();
  toast('ボス練習 — 報酬もロストもなし', 2600);
}
function endPractice(kind) {
  state = 'result'; releaseInputs(); exitLock();
  const sec = Math.round((performance.now() - run.t0) / 1000);
  $('#resEyebrow').textContent = 'practice';
  $('#resTitle').textContent = run.cleared ? '練習終了 — 撃破' : '練習終了';
  $('#resList').innerHTML = [['ボス', BOSS_META[run.forceBoss].name], ['強さ', `DEPTH ${stageInfo(run.stage).tier + 1} 相当`], ['結果', run.cleared ? '撃破' : kind === 'dead' ? 'やられた' : '中断'], ['時間', `${Math.floor(sec / 60)}分${sec % 60}秒`]]
    .map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
  $('#resChips').textContent = '練習なので、ビット・武器・記録は変わらない。';
  setTimeout(() => { setPlayUI(false); show('#scrResult'); }, kind === 'dead' ? 700 : 0);
}
function endRun(kind) {
  if (run.practice) { endPractice(kind); return; }
  const dead = kind !== 'extract';
  state = 'result'; releaseInputs(); exitLock();
  const got = Math.floor(run.bits), kept = dead ? Math.floor(got * TUNE.deathBitsKeep) : got;
  save.bits += kept;
  save.best = Math.max(save.best, run.stage + 1);
  const found = P.weapons.concat(P.bag).filter(w => w && !w.basic);
  const rows = [];
  rows.push(['到達区画', `${stageLabel(run.stage)}　${stageInfo(run.stage).biome.name}`]);
  rows.push(['撃破数', run.kills]);
  rows.push(['ビット', dead ? `+${kept}（${got - kept} を失った）` : `+${kept}`]);
  let shortcutMsg = '';
  if (dead) {
    rows.push(['失った武器', found.length ? found.map(wText).join('、') : 'なし']);
    if (save.shortcut > 0) { save.shortcut--; shortcutMsg = `${tierLabel(save.shortcut + 1)} へのショートカットが閉じた`; }
    save.startTier = Math.min(save.startTier, save.shortcut);
  } else {
    const strip = w => w ? { id: w.id, r: w.r, basic: !!w.basic, plus: w.plus || 0, opts: w.opts || [] } : null;
    save.loadout = [strip(P.weapons[0]), strip(P.weapons[1])];
    if (!save.loadout[0]) save.loadout[0] = basicW('pistol');
    let sold = 0;
    P.bag.filter(w => w && !w.basic).forEach(w => save.stash.push(strip(w)));
    while (save.stash.length > STASH_MAX) {
      let mi = 0; save.stash.forEach((w, i) => { if (sellValue(w) < sellValue(save.stash[mi])) mi = i; });
      sold += sellValue(save.stash[mi]); save.stash.splice(mi, 1);
    }
    if (sold) save.bits += sold;
    rows.push(['持ち帰った武器', found.length ? found.map(wText).join('、') : 'なし']);
    if (sold) rows.push(['倉庫あふれ分を換金', `+${sold}`]);
  }
  if (shortcutMsg) rows.push(['ショートカット', shortcutMsg]);
  persist();
  $('#resEyebrow').textContent = kind === 'extract' ? 'extracted' : kind === 'abandon' ? 'abandoned' : 'signal lost';
  $('#resTitle').textContent = kind === 'extract' ? '帰還完了' : kind === 'abandon' ? '潜行放棄' : '信号途絶';
  $('#resList').innerHTML = rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
  $('#resChips').textContent = run.perks.length ? `この潜行のチップ（持ち帰り不可）: ${run.perks.join('、')}` : '';
  setTimeout(() => { setPlayUI(false); show('#scrResult'); }, kind === 'dead' ? 700 : 0);
}
$('#btnBack').addEventListener('click', goBase);
function goBase() {
  state = 'base'; run = null; P = null;
  setPlayUI(false); show('#scrBase'); renderBase();
  buildAttract();
}
let attractYaw = 0, attractPos = [0, 0];
function buildAttract() {
  const ab = pick(BIOMES);
  buildLevel(ab, false);
  rooms.forEach((r, idx) => { if (idx === startIdx) return; for (let k = 0; k < 3; k++) { const [x, z] = randomTileIn(r); spawnEnemy(pick(ab.enemies), x, z, idx, 1); } });
  attractPos = roomSpot(rooms[startIdx]);
  const [ex, ez] = roomSpot(rooms[exitIdx]); attractYaw = Math.atan2(-(ex - attractPos[0]), -(ez - attractPos[1]));
  makePortal(ex, ez, 0xffc24a, 'next', '');
  seen.fill(1);
}

// ================= base screen =================
let selSlot = 0;
function wStat(w) {
  const d = WEAPONS[w.id];
  return `DMG ${Math.round(d.dmg * wDmgMul(w))}${d.pellets > 1 ? '×' + d.pellets : ''} / ${(1 / d.rate).toFixed(1)}発/秒 / 弾倉 ${d.mag}${d.pierce ? ' / 貫通' : ''}${d.blast ? ' / 爆発' : ''}`;
}
function renderBase() {
  $('#sBits').textContent = save.bits;
  $('#sBest').textContent = save.best ? stageLabel(save.best - 1) : '—';
  $('#sRuns').textContent = save.runs;
  $('#sBoss').textContent = save.bossKills;
  save.startTier = clamp(save.startTier, 0, save.shortcut);
  $('#tiers').innerHTML = Array.from({ length: save.shortcut + 1 }, (_, t) =>
    `<button class="tier" data-tier="${t}" aria-pressed="${save.startTier === t}"><b>${tierLabel(t)}</b><small>${t === 0 ? '最初から' : `補給チップ ${t} 枚`}</small></button>`).join('');
  $('#startSub').textContent = `潜行開始 — ${tierLabel(save.startTier)} から`;
  renderSuspend();
  $('#loadout').innerHTML = [0, 1].map(k => {
    const w = save.loadout[k];
    return `<button class="lslot ${selSlot === k ? 'sel' : ''}" data-slot="${k}"><span class="eyebrow">装備${k + 1}${selSlot === k ? ' — 割り当て先' : ''}</span>
      <span class="wn">${w ? wName(w) : '空き'}</span>${w && !w.basic ? '<span class="risk">倉庫の武器。死ぬと失う</span>' : ''}
      ${k === 1 && w ? '<span class="mini-btn" data-unequip="1" role="button">外す</span>' : ''}</button>`;
  }).join('');
  $('#wgrid').innerHTML = WEAPON_ORDER.map(id => {
    const w = WEAPONS[id], un = !!save.unlocked[id];
    const foot = un ? `装備${selSlot + 1}に割り当て` : `解放 ${w.cost} BIT`;
    return `<button class="wcard ${un ? '' : 'locked'} ${!un && save.bits < w.cost ? 'poor' : ''}" data-w="${id}">
      <span class="wn">${w.name}</span><span class="wd">${w.desc}</span><span class="ws">${wStat({ id, r: 0 })}</span><span class="wf">${foot}</span></button>`;
  }).join('');
  $('#stashCount').textContent = `${save.stash.length} / ${STASH_MAX}　潜行で拾って帰還した武器。持ち出すと死亡時に失う`;
  $('#stash').innerHTML = save.stash.length ? save.stash.map((w, i) => `<div class="wcard" style="border-left:3px solid ${RARITY[w.r].css}"><span class="wn">${wName(w)}</span><span class="ws">${wStat(w)}</span>${wOpts(w)}
      <span class="acts"><button class="mini-btn amber" data-stash="${i}">装備${selSlot + 1}へ</button><button class="mini-btn" data-sell="${i}">売却 +${sellValue(w)}</button></span></div>`).join('')
    : '<div class="empty">まだ空。潜行中に拾った武器を持って帰還すると、ここに入る</div>';
  $('#ulist').innerHTML = UPGRADES.map(u => {
    const l = save.up[u.id] || 0, maxed = l >= u.max, cost = u.cost(l);
    const pips = Array.from({ length: u.max }, (_, k) => `<i class="${k < l ? 'on' : ''}"></i>`).join('');
    return `<div class="urow"><div><div class="un">${u.name}</div><div class="ud">${u.desc(l)}</div><div class="pips">${pips}</div></div>
      <button class="buy" data-up="${u.id}" ${maxed || save.bits < cost ? 'disabled' : ''}>${maxed ? '最大' : cost + ' BIT'}</button></div>`;
  }).join('');
  renderReboot();
  $('#practiceTier').innerHTML = '<span>強さ</span>' + [0, 1, 2, 4].map(t => `<button data-ptier="${t}" aria-pressed="${practiceTier === t}">D${t + 1}</button>`).join('');
  $('#bossList').innerHTML = BOSS_ORDER.map(k => `<button class="wcard" data-practice="${k}"><span class="wn">${BOSS_META[k].name}</span>
    <span class="wd">${BOSS_META[k].desc}</span><span class="wf">${save.bossSeen[k] ? '練習する' : '練習する（未遭遇）'}</span></button>`).join('');
  renderSettings();
  $('#help').innerHTML = isTouch
    ? '横持ち推奨。操作一覧は潜行中の一時停止（II）で見られる。セーブはこのブラウザに保存される。'
    : '操作一覧は潜行中の一時停止（Esc）で見られる。セーブはこのブラウザに保存される。';
}
let rebootArm = false;
const rebootGain = () => 2 + Math.max(0, save.shortcut - 3);
function renderReboot() {
  const pr = save.pres, sec = $('#rebootSec');
  sec.hidden = !(save.canReboot || pr.count > 0);
  if (sec.hidden) return;
  $('#rebootNote').textContent = `再起動 ${pr.count} 回 / 難度 +${pr.count * 15}% / 再起動ポイント ${pr.pts}`;
  $('#presList').innerHTML = PRES_UP.map(u => {
    const l = pr.up[u.id] || 0, maxed = l >= u.max;
    const pips = Array.from({ length: u.max }, (_, k) => `<i class="${k < l ? 'on' : ''}"></i>`).join('');
    return `<div class="urow"><div><div class="un">${u.name}</div><div class="ud">${u.desc(l)}</div><div class="pips">${pips}</div></div>
      <button class="buy" data-pres="${u.id}" ${maxed || pr.pts < u.cost ? 'disabled' : ''}>${maxed ? '最大' : u.cost + ' pt'}</button></div>`;
  }).join('');
  const row = $('#rebootRow');
  if (save.suspend) { row.innerHTML = '<p class="help">中断中の潜行を再開するか破棄してから再起動できる。</p>'; return; }
  if (!save.canReboot) { row.innerHTML = '<p class="help">もう一度 DEPTH 3 以降のボスを倒すと、次の再起動ができる。</p>'; return; }
  row.innerHTML = rebootArm
    ? `<p class="help">拠点強化・武器の解放・倉庫・ショートカット・ビットがすべて消える。敵は +15% 強くなる。本当に再起動する？</p>
       <button class="buy" data-reboot="go">再起動する（+${rebootGain()} pt）</button><button class="mini-btn" data-reboot="cancel">やめる</button>`
    : `<p class="help">進行をリセットして再起動ポイントを ${rebootGain()} 得る。ポイントは上の永続ボーナスに使える。</p><button class="buy" data-reboot="arm">再起動…</button>`;
}
function doReboot() {
  const pr = save.pres, keep = { best: save.best, runs: save.runs, bossKills: save.bossKills, settings: save.settings };
  pr.pts += rebootGain(); pr.count++;
  const d = defaultSave();
  Object.assign(save, d, keep, { pres: pr });
  save.bits = pr.up.funds * 150;
  for (let k = 0; k < pr.up.relic; k++) save.stash.push({ id: pickDrop(), r: 2, basic: false });
  rebootArm = false; persist(); renderBase();
  audioInit(); sfx('portal');
}
function assignLoadout(item) {
  const prev = save.loadout[selSlot];
  if (prev && !prev.basic) save.stash.push(prev);
  save.loadout[selSlot] = item;
}
$('#scrBase').addEventListener('click', e => {
  const un = e.target.closest('[data-unequip]'), sl = e.target.closest('[data-slot]'), w = e.target.closest('[data-w]'), u = e.target.closest('[data-up]');
  const st = e.target.closest('[data-stash]'), se = e.target.closest('[data-sell]'), ti = e.target.closest('[data-tier]');
  const pu = e.target.closest('[data-pres]'), rb = e.target.closest('[data-reboot]'), pr = e.target.closest('[data-practice]');
  if (pr) { startPractice(pr.dataset.practice, practiceTier); return; }
  const pt = e.target.closest('[data-ptier]');
  if (pt) { practiceTier = +pt.dataset.ptier; renderBase(); return; }
  if (rb) { const a = rb.dataset.reboot; if (a === 'go') { doReboot(); return; } rebootArm = a === 'arm'; renderReboot(); return; }
  if (pu) {
    const def = PRES_UP.find(x => x.id === pu.dataset.pres), l = save.pres.up[def.id] || 0;
    if (l < def.max && save.pres.pts >= def.cost) { save.pres.pts -= def.cost; save.pres.up[def.id] = l + 1; audioInit(); sfx('chip'); }
  } else if (un) { const prev = save.loadout[1]; if (prev && !prev.basic) save.stash.push(prev); save.loadout[1] = null; selSlot = 1; }
  else if (sl) selSlot = +sl.dataset.slot;
  else if (ti) save.startTier = +ti.dataset.tier;
  else if (w) {
    const id = w.dataset.w, def = WEAPONS[id];
    if (!save.unlocked[id]) { if (save.bits < def.cost) return; save.bits -= def.cost; save.unlocked[id] = true; audioInit(); sfx('chip'); }
    assignLoadout(basicW(id));
  } else if (st) {
    const i = +st.dataset.stash, item = save.stash.splice(i, 1)[0];
    assignLoadout(item);
  } else if (se) {
    const i = +se.dataset.sell; save.bits += sellValue(save.stash[i]); save.stash.splice(i, 1); audioInit(); sfx('pick');
  } else if (u) {
    const def = UPGRADES.find(x => x.id === u.dataset.up), l = save.up[def.id] || 0, cost = def.cost(l);
    if (l < def.max && save.bits >= cost) { save.bits -= cost; save.up[def.id] = l + 1; audioInit(); sfx('pick'); }
  } else return;
  persist(); renderBase();
});
$('#btnStart').addEventListener('click', startRun);

// ---- full data wipe (red confirmation dialog) ----
$('#btnWipe').addEventListener('click', () => { $('#dlgWipe').hidden = false; $('#btnWipeCancel').focus(); });
$('#btnWipeCancel').addEventListener('click', () => { $('#dlgWipe').hidden = true; });
document.addEventListener('keydown', e => { if (e.code === 'Escape' && !$('#dlgWipe').hidden) $('#dlgWipe').hidden = true; });
$('#btnWipeGo').addEventListener('click', () => {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  save = defaultSave(); persist();
  $('#dlgWipe').hidden = true; selSlot = 0;
  renderBase(); applyLayout();
});
