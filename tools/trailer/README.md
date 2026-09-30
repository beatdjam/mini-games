# SECTOR DIVE トレイラーの撮り方

このブランチ（`claude/trailer`）だけにある道具。master にはマージしない。
台本（`games/sector-dive/js/dev/trailer.ts`）がゲーム内部を直接触るので、本体に入れるとゲームを直すたびに壊れうるため。

## できるもの

約31秒、1920×864（スマホ横向き 20:9）、30fps の mp4。日本語表示・タッチ操作の画面。

拠点画面 → 九龍城の雑魚戦（横移動・ダッシュ・連鎖爆破）→ レアチップの選択 → 拠点強化 → WATCHER 戦（第二段階・撃破）→ タイトルカード（ロゴ・キャッチコピー・URL）

音は、ゲーム自身の効果音と、BGM（最初の3秒は拠点の曲、そのあと九龍城のボス戦アレンジ）を、映像と同期して書き出したもの。

## 手順

```sh
git fetch origin && git checkout claude/trailer && git merge origin/master   # 最新のゲームで撮るとき
npx tsc --noEmit                        # ゲームの変更で台本が壊れていないか
npx vite --port 8765 &                  # 開発サーバー（止まっていたら起動し直す）
node tools/trailer/capture.mjs out video   # コマ（out/f00000.jpg…）と効果音（out/sfx.wav）。30〜40分
node tools/trailer/capture.mjs out music   # BGM（out/music.wav）。1〜2分
FFMPEG=/path/to/ffmpeg tools/trailer/encode.sh out   # out/trailer.mp4
```

- Chrome は `CHROME=` で指定（既定はクラウド環境の `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`）。Node 22 以上（組み込みの WebSocket を使う）
- ffmpeg は libx264 入りのもの。無ければ `pip download imageio-ffmpeg` の wheel を展開すると静的ビルドが入っている
- `encode.sh` の音量: `MUSIC=0.8 SFX=1.2 tools/trailer/encode.sh out` のように調整できる

## 一部だけ見る（台本を直すとき）

撮影で時間がかかるのはスクリーンショットだけなので、途中の場面を間引いて見ると速い（それより前のコマも中身は動かす）。

```sh
TFRAMES=400 TFROM=96 TEVERY=12 node tools/trailer/capture.mjs pv video   # 3.2〜13.3秒を12コマおきに（1分ほど）
cd pv && ffmpeg -framerate 1 -pattern_type glob -i 'f*.jpg' -vf "scale=480:-1,tile=5x5" -frames:v 1 ../sheet.jpg
```

## 仕組み

- `capture.mjs` がヘッドレス Chrome を DevTools プロトコルで動かす。ページには最初に「仮想時計」を差し込み、`performance.now`・タイマー・`requestAnimationFrame` を置き換える。1/30秒ずつ進めて1コマずつ撮るので、描画が遅い環境でもカクつかない
- 乱数も固定の種にしているので、毎回同じ展開になる
- 音は `OfflineAudioContext` に流し、各コマの時刻で止めて進める（`suspend` / `resume`）。ゲームには常に「再生中」に見えるようにしている
- 台本（`trailer.ts`）: 場面ごとの開始時刻（`SC`）、その場面の準備（`sceneRun` など）、毎コマの「手の動き」（`hands`: 狙い・移動・射撃・ダッシュ）、画面の操作（`uiScript`: チップを選ぶ、強化を買う、タイトルカード）。ボスの体力は台本どおりに減らし、第二段階と撃破のタイミングを決めている
- 開発時（`#trailer` / `#trailer-music` で開いたとき）だけ読み込むので、公開版には入らない
