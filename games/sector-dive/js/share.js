// ---- sharing a run's result: a card image + a short text with #SectorDive ----
// phones get the share sheet with the image attached. PCs get a small panel instead (a desktop share sheet rarely has X):
// the card, plus copy / save / open X as separate clicks (copying and opening a tab in one click loses the clipboard)
const SHARE_URL = 'https://beatdjam.github.io/mini-games/games/sector-dive/';
let shareData = null, shareBlob = null;

const bossShort = k => { const n = BOSS_META[k].name; return n.slice(n.indexOf(' ') + 1); };
function prepShare(kind) {
  const si = stageInfo(run.stage), w = P.weapons[P.cur] || P.weapons[0];
  const counts = {};
  run.perks.forEach(n => { const k = n.replace(/\+$/, ''); counts[k] = (counts[k] || 0) + 1; });
  const chips = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, c]) => c > 1 ? `${n}×${c}` : n);
  shareData = {
    kind, where: stageLabel(run.stage), biome: si.biome.name, kills: run.kills,
    bosses: (run.bosses || []).map(bossShort), weapon: w ? wText(w) : '', wr: w ? w.r : 0, chips, nChips: run.perks.length,
  };
  shareBlob = null;
  drawShareCard(shareData).then(b => { if (shareData && b) shareBlob = b; }).catch(() => {});
  $('#btnShare').hidden = false; $('#sharePanel').hidden = true;
}
function hideShare() { shareData = shareBlob = null; $('#btnShare').hidden = true; $('#sharePanel').hidden = true; }

function shareText(d) {
  const end = d.kind === 'extract' ? 'から帰還した' : d.kind === 'abandon' ? 'で潜行を放棄した' : 'で信号途絶';
  const b = d.bosses.length ? `${d.bosses.join('・')}を撃破。` : '';
  return `SECTOR/DIVE ${d.where} ${d.biome}${end}。${b}#SectorDive\n${SHARE_URL}`;
}

async function drawShareCard(d) {
  try { await Promise.all([document.fonts.load('700 40px "Chakra Petch"'), document.fonts.load('30px "DotGothic16"')]); } catch (e) {}
  const W = 1200, H = 630, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const disp = '"Chakra Petch","DotGothic16",sans-serif', jp = '"DotGothic16","Hiragino Sans","Noto Sans JP",sans-serif';
  const acc = d.kind === 'extract' ? '#54e8ff' : '#ff4d8d';
  const fit = (s, max) => { if (g.measureText(s).width <= max) return s; while (s && g.measureText(s + '…').width > max) s = s.slice(0, -1); return s + '…'; };
  g.fillStyle = '#05080c'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(84,232,255,0.06)'; g.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
  for (let y = 0; y <= H; y += 40) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
  g.fillStyle = acc; g.fillRect(0, 0, 10, H);
  // logo
  let x = 64; g.font = `700 34px ${disp}`;
  [['SECTOR', '#d5e4ee'], ['/', '#54e8ff'], ['DIVE', '#d5e4ee']].forEach(([s, col]) => { g.fillStyle = col; g.fillText(s, x, 86); x += g.measureText(s).width; });
  g.font = `500 20px ${disp}`; g.fillStyle = '#7f94a6'; g.textAlign = 'right';
  g.fillText(d.kind === 'extract' ? 'EXTRACTED' : d.kind === 'abandon' ? 'ABANDONED' : 'SIGNAL LOST', W - 64, 84);
  g.textAlign = 'left';
  // headline
  g.font = `64px ${jp}`; g.fillStyle = acc;
  g.fillText(d.kind === 'extract' ? '帰還完了' : d.kind === 'abandon' ? '潜行放棄' : '信号途絶', 64, 190);
  g.font = `700 76px ${disp}`; g.fillStyle = '#d5e4ee'; g.fillText(d.where, 64, 290);
  const ww = g.measureText(d.where).width;
  g.font = `34px ${jp}`; g.fillStyle = '#7f94a6'; g.fillText(fit(d.biome, W - 128 - ww - 28), 64 + ww + 28, 290);
  // rows
  const rows = [
    ['撃破', `${d.kills} 体`, '#d5e4ee'],
    ['ボス', d.bosses.length ? d.bosses.join('・') : 'なし', '#d5e4ee'],
    ['武器', d.weapon || 'なし', RARITY[d.wr] ? RARITY[d.wr].css : '#d5e4ee'],
    ['チップ', d.nChips ? `${d.chips.join('・')}${d.nChips > d.chips.length ? ` ほか（計${d.nChips}枚）` : ''}` : 'なし', '#d5e4ee'],
  ];
  rows.forEach(([k, v, col], i) => {
    const y = 370 + i * 50;
    g.fillStyle = 'rgba(213,228,238,0.08)'; g.fillRect(64, y + 16, W - 128, 1);
    g.font = `24px ${jp}`; g.fillStyle = '#7f94a6'; g.fillText(k, 64, y);
    g.fillStyle = col; g.fillText(fit(v, W - 128 - 140), 204, y);
  });
  g.font = `22px ${jp}`; g.fillStyle = '#7f94a6'; g.fillText('#SectorDive', 64, H - 36);
  g.textAlign = 'right'; g.font = `500 20px ${disp}`; g.fillText(SHARE_URL.replace('https://', ''), W - 64, H - 36); g.textAlign = 'left';
  return new Promise(r => c.toBlob(r, 'image/png'));
}

function shareResult() {
  if (!shareData) return;
  const file = shareBlob && new File([shareBlob], 'sector-dive.png', { type: 'image/png' });
  if (isTouch && file && navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], text: shareText(shareData) }).catch(e => { if (e.name !== 'AbortError') openSharePanel(); });
    return;
  }
  openSharePanel();
}
async function openSharePanel() {
  const panel = $('#sharePanel');
  if (!panel.hidden) { panel.hidden = true; return; }
  panel.hidden = false;
  $('#btnShareCopy').hidden = !(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write);
  if (!shareBlob) shareBlob = await drawShareCard(shareData);
  const img = $('#shareImg'); if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
  img.src = URL.createObjectURL(shareBlob);
}
function copyShareImage() {
  if (!shareBlob) return;
  navigator.clipboard.write([new ClipboardItem({ 'image/png': shareBlob })])
    .then(() => toast('画像をコピーした。X の投稿画面で貼り付けてね', 3000), () => toast('コピーできなかった。「画像を保存」を使ってね', 3000));
}
function saveShareImage() {
  if (!shareBlob) return;
  const a = document.createElement('a'); a.href = URL.createObjectURL(shareBlob); a.download = 'sector-dive.png';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
function openXPost() {
  if (shareData) window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText(shareData)), '_blank', 'noopener');
}
$('#btnShareCopy').addEventListener('click', copyShareImage);
$('#btnShareSave').addEventListener('click', saveShareImage);
$('#btnShareX').addEventListener('click', openXPost);
$('#btnShare').addEventListener('click', shareResult);
