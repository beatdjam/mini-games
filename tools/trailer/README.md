# トレイラーの撮り方（Sector Dive Extended）

このブランチ（`claude/trailer-ex`）だけにある道具。master にはマージしない。
台本（`games/sector-dive-ex/src/dev/trailer.ts`）がゲーム内部を直接触るので、本体に入れるとゲームを直すたびに壊れうるため。
道具（`capture.mjs`・`encode.sh`）は、Sector Dive のトレイラー（ブランチ `claude/trailer`、PR #17）から持ってきたもの。

## できるもの

27秒、1920×864（スマホ横向き 20:9）、30fps の mp4。日本語表示・タッチ操作の画面。Sector Dive から変わった所だけを見せる。

階段を走って降りる（上の階から下の階へ、切り替えなし）→ 階を飛ばすエレベーター → 建物全体の立体マップ → ロックダウン → ボス部屋のドアが開いてボスが出る → 白フラッシュでタイトルカード。場面ごとに、上に字幕が出る。

音は、ゲーム自身の効果音と、BGM（九龍城のボス戦アレンジ）を、映像と同期して書き出したもの。

## 手順

```sh
git checkout claude/trailer-ex && git merge origin/master   # 最新のゲームで撮るとき
npx tsc --noEmit                        # ゲームの変更で台本が壊れていないか
npm run dev &                           # 開発サーバー（8765番。もう動いていれば不要）
export CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" GL=metal   # Mac。GPU で描く
node tools/trailer/capture.mjs out video   # コマ（out/f00000.jpg…）と効果音（out/sfx.wav）。Mac の GPU で約45秒
node tools/trailer/capture.mjs out music   # BGM（out/music.wav）。数秒
tools/trailer/encode.sh out                # out/trailer.mp4
```

- `GAME=sector-dive` のように、撮るゲームを変えられる（既定は `sector-dive-ex`。そのゲームに `src/dev/trailer.ts` と `#trailer` の入口が要る）
- `GL` を指定しないとソフトウェア描画（swiftshader）で、どの環境でも同じ絵になる代わりに 30〜40分かかる
- Node 22 以上（組み込みの WebSocket を使う）。ffmpeg は libx264 入りのもの
- `encode.sh` の音量: `MUSIC=0.8 SFX=1.2 tools/trailer/encode.sh out` のように調整できる

## 一部だけ見る（台本を直すとき）

```sh
TEVERY=15 node tools/trailer/capture.mjs pv video   # 全体を15コマおきに（Mac の GPU で約8秒）
cd pv && ffmpeg -framerate 1 -pattern_type glob -i 'f*.jpg' -vf "scale=384:-1,tile=6x9" -frames:v 1 ../sheet.jpg
```

`TFRAMES=N`（最初の N コマだけ）、`TFROM=K`（K コマ目から撮る）も使える。

## 仕組み

- `capture.mjs` がヘッドレス Chrome を DevTools プロトコルで動かす。ページには最初に「仮想時計」を差し込み、`performance.now`・タイマー・`requestAnimationFrame` を置き換える。1/30秒ずつ進めて1コマずつ撮るので、描画が遅い環境でもカクつかない
- 乱数も固定の種にしているので、毎回同じ展開になる
- 音は `OfflineAudioContext` に流し、各コマの時刻で止めて進める
- 台本（`trailer.ts`）: 場面ごとの開始時刻（`SC`）、その場面の準備（`sceneStairs` など）、毎コマの「手の動き」（`hands`）、画面の演出（`uiScript`: 字幕、ロックダウンの赤い枠の明滅、タイトルカード）
  - 建物は、場面に要るもの（最初の一歩が階段、階を飛ばすエレベーター、最下階以外のロックダウン部屋）がそろうシードを探して使う（`pickSeed`）
  - ページの CSS のアニメーションは実時間で動くので、明滅のように動きが要るものは台本が毎コマ値を入れる
- 開発時（`#trailer` / `#trailer-music` で開いたとき）だけ読み込むので、公開版には入らない
