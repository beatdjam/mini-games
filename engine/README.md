# engine

考え方と構造の図は [ARCHITECTURE.md](ARCHITECTURE.md)、仕様は [SPEC.md](SPEC.md)、テストは `engine/test/`（Vitest。`npm run test:engine`）。

ゲームをまたいで使うコア。ES モジュールで、ソースは `engine/src/` にあり、ゲームは `@engine/<フォルダ>/<名前>.ts`（`engine/src/` の別名。`tsconfig.json`・`vite.config.js`・`vitest.config.ts` で設定）から必要なものを import する。engine はゲームを import しない。

テストやビルドの道具（`tools/`）の使い方は、リポジトリの README「開発」にまとめてある。

`engine/src/` のフォルダは関心ごとに分けている: `core/`（ループ・world・文言・セーブ・感想フォーム・アクセス解析・確認用フック・古いページ検出・小さな関数）、`render/`（描画）、`world/`（タイルの世界・ダンジョン生成と固定マップ・弾・追跡）、`audio/`（効果音と BGM）、`ui/`（画面の部品と入力）。下の表もこの順に並べている。

| ファイル | 中身 | ゲームに用意してもらうもの |
|---|---|---|
| `src/core/loop.ts` | メインループ。`requestAnimationFrame`、dt の上限、システムの実行、描画（`renderer.render` と手の銃）。`addSystem({ name, order, modes, update })`, `stopFrame()`, `runSystems(dt, mode)`, `startLoop()` | `LOOP.mode = () => 今のモード名`。動かしたいものを `addSystem` で登録し、最後に `startLoop()` |
| `src/core/world.ts` | 振る舞いを持つオブジェクト（Unity の MonoBehaviour に近い）。`spawn(obj)` で毎フレーム `obj.update(dt)`、`obj.dead = true` で片付け（`onRemove` と、画面に残っているメッシュの破棄）、`query(tag)`, `clearWorld(tag)`。`worldGroup(tag, order)` でタグごとに更新の順番を分けられる（リストは同じ配列のまま使い続けられる） | 各グループの `.system.modes` に動くモード。オブジェクトに `tag`, `update`, `mesh` |
| `src/core/util.ts` | `el`, `rand`, `randi`, `pick`, `clamp`, `shuffle`, `createRng(seed)`（同じシードなら同じ並びになる乱数。`rand`・`randi`・`pick`・`shuffle` を持つ）, `pct`, `distXZ`（x-z 平面の距離）, `isTouch`（body に `touch` / `desk` クラスを付ける） | — |
| `src/core/i18n.ts` | `LANG`, `lang`, `t(key, values)`, `setLang(code)`, `setI18nHook(fn)`, `fillData`, `applyStaticText`, `defaultLang` | `LANG.<code>` を登録する言語ファイル（`ja` は必須で、キーが無いときの予備）。定義に名前を流し込むなら `setI18nHook(fn)` で関数を登録 |
| `src/core/store.ts` | `encodeStore` / `decodeStore`（セーブを端末間で移す1行のコード。暗号化ではなく、読みにくく・書き換えにくくするだけ）、`loadStore(key, defaults)`（保存済みの値を既定値に深く重ねて `{ data, raw }` を返す）, `saveStore`, `clearStore`, `prefGet` / `prefSet`（タブの記憶など小さな値） | 既定値を返す関数。古い版からの変換は `raw` を見てゲーム側でやる |
| `src/core/stale.ts` | 古いページ検出。キャッシュに残った古いページなら、最新版の URL へ1回だけ切り替える | `<meta name="build" content="dev">`（ビルドが版番号に書き換え、`version.json` も出す。このファイルはページに埋め込まれる） |
| `src/core/feedback.ts` | `openFeedback(info)`（全ゲーム共通の Google フォームを、ゲーム名・ビルド・`info` を記入済みで開く）、`feedbackReady()`、`FEEDBACK.game`、`FEEDBACK_FORM` | 起動時に `FEEDBACK.game` へゲームID。`feedbackReady()` のときだけ送信ボタンを出し、押されたら今の状況をテキストにして `openFeedback` に渡す |
| `src/core/analytics.ts` | `track(name, params)`（GA4 のイベントを送る。タグの無いページでは記録だけ）、`TRACK_LOG`（直近50件）、`ANALYTICS.game` | 起動時に `ANALYTICS.game` へゲームID。送りたい出来事で `track` を呼ぶ。タグはビルドが入れる（`vite.config.js` の `GA_ID`） |
| `src/core/dev.ts` | `devHook('view-x', rest => ...)`（URL の `#view-x…` で動く確認用の入口） | テストの中身 |
| `src/render/render.ts` | `canvas`（`#gl`）, `renderer`, `scene`, `camera`, `dynGroup`, `resize`, `shared`, `basicMat`, `lineMat`, `disposeTree`, `textSprite`、手に持つ銃（部品の一覧から組み立てる `buildViewmodel` と、別パスで描く `gunScene`, `gun`, `renderGun`） | `<canvas id="gl">`。毎フレーム `renderer.render(scene, camera)` のあとに `renderGun()` |
| `src/render/fx.ts` | パーティクル（`burst`）と爆発の光（`fireball`）、`clearFx()`。システム `FX.particles` / `FX.fireballs` をエンジンが登録する | 動かすモードを `FX.particles.modes` などに入れる（入れなければ全モードで動く） |
| `src/world/tiles.ts` | タイルの世界。地形1枚を表すオブジェクト `TileGrid`（`createTileGrid(world)` で作る。`inBounds`, `isSolid`, `solidAt`, `tileIndex`, `floorY`, `blocked`, `blockedDir`, `depenetrate`, `moveCircle`, `hasLOS`, `walkable`, `edgeH`, `passable`, `computeFlow`, `flowAt`, `flowDir` のメソッドを持つ。複数作っても互いに影響しない）。同じ名前のモジュール関数は「今の地形」（`activeTileGrid()`）に対するもの。そのほか `T`=4, `STEP`, `RISE`, `DECK_H`, `COVER_H`、今の地形の `W`, `H`, `grid`, `hgt`, `ramp`, `cover`, `flow`、地形に依存しない `tileCoord`, `tileCenter`、辺の番号（`SIDE_PX`・`SIDE_NX`・`SIDE_PZ`・`SIDE_NZ`, `SIDE_STEP`, `OPPOSITE_SIDE`） | 地形を生成して `setTileWorld({ W, H, grid, hgt, ramp, cover, flow, flowQ })` で今の地形に渡す。複数の地形を持つときは、`TileWorld` ごとに `createTileGrid` する |
| `src/world/dungeon.ts` | 部屋と通路のダンジョン生成: `generateDungeon(opts, rng)` → `{ W, H, maps, rooms }`（部屋を置く・通路でつなぐ・大きい部屋に高台か柱・瓦礫・橋）、開けたアリーナ `generateArena(size, from, to, pillars)`、単体で使える `addPlatform`, `addRubble`, `addBridges`、部屋の全タイルを回る `forEachRoomTile(room, fn)`、型 `Room`, `TileMaps`（`grid`, `hgt`, `ramp`, `cover`, `roomOf`）, `DungeonOptions`。乱数は渡した `Rng` だけから引く（同じシードなら同じ地形） | 生成の設定（`DungeonOptions`: 広さ・部屋数・部屋の大きさ・通路の幅・高台の確率・瓦礫の確率・橋の数・高さ）と `Rng`。結果の `maps` はそのまま `setTileWorld` に渡せる。危険床・開始部屋など、ゲームのルールで決める部分はゲームが足す |
| `src/world/tilemap.ts` | 文字の行から作る固定マップ: `tileMapFromRows(rows, legend?, rooms?)` → `{ W, H, maps, rooms }`、`DEFAULT_LEGEND` | 行の配列。凡例（下）を変えたいときは `legend` |
| `src/world/projectiles.ts` | 弾の汎用部分: プール（`takeFromPool`, `clearPool`）、細かく刻んだ移動（`stepProjectile`。刻むたびにゲームの判定を呼ぶ）、地形との当たり（`projHitsTerrain`）、追尾（`steerToward`）、弾幕の方向（`ringAngles`, `aimFan`） | 弾の項目と、当たったときの処理（判定関数として渡す） |
| `src/world/steer.ts` | `steerChase`: 見えていれば近づく（近すぎたら回り込む）、見えなければ経路をたどる、仲間と押し合う | 速さ・保つ距離・押し合う相手のリスト |
| `src/audio/audio.ts` | 効果音の合成（`tone`, `noiseBurst`, `sweepTone`, `gunshot`）、`sfx(name)`、`audioInit`, `sfxVolume` | `Object.assign(SFX, { 名前: () => {...} })` で効果音のレシピを入れる。音量は `setVolumes(sfx, bgm)`（0〜1） |
| `src/audio/music.ts` | BGM の再生（`setMusic(name, boss)`, `setMusicMix(kind)`, `musicVolume(duck)`, `musicTick`）、`SCALES` | `MUSIC_STYLES`（曲調）と `LAYER_MIX`（層の混ぜ方）に `Object.assign` で中身を入れる |
| `src/ui/ui.ts` | `toast(msg, ms)`, `banner(code, sub)`, 全画面（`enterFs`, `exitFs`, `toggleFs`, `isFullscreen`） | `#toast`, `#banner`（`#bannerCode`, `#bannerSub`） |
| `src/ui/hitdir.ts` | 被弾方向の表示。`createHitDirs({ container, view, camera, time, max?, className? })` が `{ show(x, z), update(dt), list }` を返す。視界の外から当たったときだけ、攻撃元を指す弧を出し、振り向きに合わせて向きを追って薄れる | `container`（照準の中心に置いた幅0・高さ0の要素。Sector Dive は `#hitDirs`）、`view()`（`x`・`z`・`yaw`。yaw は左が正）、`camera`、表示時間 `time`（秒）、弧の見た目の CSS（`className`、既定 `hdir`）。被弾で `show`、毎フレーム `update` |
| `src/ui/minimap.ts` | 上から見たタイルの地図。`drawTileMap(canvas, ctx, { tile, overlay?, markers, viewer, viewerColor? })` が、タイル（`tile(k)` が色と濃さを返したものだけ）→ 重ね塗り → 印（`square`・`ring`・`dot`、ラベル付きも可）→ 見ている人の向きの矢印、の順に描く。大きさの単位はキャンバスの幅の 1/160 | どのタイルを何色で描くか（見た場所だけ、など）と、印の一覧（位置はワールドの x・z） |
| `src/ui/settings.ts` | 設定パネル。`SETTINGS.items` に並べた設定を、ページの `[data-settings="<場所>"]` の要素すべてに描き、どれかで変えると全部を描き直す（スライダーは動かしている間、ほかのパネルのつまみと値だけを追わせる）。種類は `toggle`（オン・オフ）・`choice`（切り替えボタン）・`range`（スライダー。`format` を渡すと値も出す）・`button`。`show()` が false の項目は出さない。言語と全画面は `languageSetting(label, change)`・`fullscreenSetting(label)` で作れる。`renderSettings()` | `SETTINGS.items`（ラベル・値の読み書き）、`SETTINGS.onOff`（オン・オフの文言）、`SETTINGS.onChange(key)`（保存や反映）。見た目はゲームの CSS（`.toggle`・`.seg`・`.sens`） |
| `src/ui/share.ts` | 画像のシェアのブラウザ側の部品。`canShareFile(file)`, `shareNative(file, text)`（`'shared'`・`'cancelled'`・`'failed'`）, `canCopyImage()`, `copyImage(blob)`（成功したか）, `saveImage(blob, filename)`, `openXPost(text)`（X の投稿画面を開く） | 画像（`Blob`）と投稿文、ファイル名。パネルの要素・文言・解析イベントはゲームが持つ（スマホは `shareNative`、失敗したらパネル、PC はコピー・保存・X 投稿のボタン） |
| `src/ui/input.ts` | キー（`keys`）、マウスとポインタロック（`requestLock`, `exitLock`, `locked`, `mouseFire`）、タッチの移動スティック（`joy`）と視点ドラッグ、押しっぱなしの射撃ボタン（`fireHeld`, `fire2Held`）、`tapBtn(btn, fn)`, `releaseInputs` | `INPUT` に `active`, `look`, `sens`, `key`, `pause`, `lockChanged` を入れる。`#touch`, `#joyBase`, `#joyKnob`, `#btnFire`, `#btnFire2`, `<canvas id="gl">` |
| `src/ui/touchlayout.ts` | タッチボタンの配置（`applyLayout`, `buttonLayout`）と配置の編集（`openLayoutEditor`, `closeLayoutEditor`） | `TOUCH_LAYOUT` に `defs`, `first`, `edits`, `reset`, `save`, `afterApply`, `onOpen`, `onClose` を入れる。`data-lb` の付いたボタン、`#layoutBar`, `#lbName` |

`tileMapFromRows` の凡例（`DEFAULT_LEGEND`。`legend` で文字と高さを差し替えられる）:

| 文字 | 意味 | `grid` / `hgt` / `ramp` / `cover` |
|------|------|-----------------------------------|
| `#` | 壁 | 0 / 0 / -1 / 0 |
| `.` | 床 | 1 / 0 / -1 / 0 |
| `=` | 高台（高さ `deckH` = `DECK_H` 2m） | 1 / `deckH` / -1 / 0 |
| `c` | 遮蔽物（高さ `coverH` = `COVER_H` 1.2m） | 1 / `coverH` / -1 / 1 |
| `>` `<` `v` `^` | 坂。上る向きが +x / -x / +z（次の行）/ -z（前の行）。`ramp` は順に 0 / 1 / 2 / 3 | 1 / 0 / 向き / 0 |
| `A`〜`Z` | 床。部屋の目印（A = 部屋0 …）。`rooms` を渡さないときだけ部屋になる | 1 / 0 / -1 / 0 |

- 坂のタイルの高さは 0 で、`RISE` 上った先が同じ高さの高台なら、坂の隣に `=` を置けば上がれる
- 行の長さが違う、凡例にない文字、`A` から途切れた部屋の文字は例外にする
- `rooms` を渡したときは、その長方形の中のタイルに `roomOf` を入れる（文字の目印は使わない）

- engine のファイルは、ゲーム固有の名前を読み込み時に使わない（実行時に使うものは上の表の右列だけ）
- engine を変えたら、使っている全ゲームで確認する。今のところ使っているのは Sector Dive だけ

## まだ切り出していないもの

どのゲームでもそのまま使えるものは engine に置く。迷うものはゲームに置き、2本目のゲームで要るとわかったときに engine を広げる。今のところ候補は次のもの（どれも Sector Dive の中にある）:

- ヒットマーカー（FPS なら共通。`ui/hud.ts` の `hitMark`。タイマーをビネット・画面の揺れと同じ `screenFx` で回しているので、切り出すならそれらとまとめて）

切り出すときの方針:

- ゲームの状態や操作を engine から直接呼ばず、設定オブジェクト（`INPUT`, `TOUCH_LAYOUT` のような形）やフック関数でゲームから渡す
- HTML の要素の ID を engine が前提にするときは、上の表に書く
