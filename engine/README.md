# engine

考え方と構造の図は [ARCHITECTURE.md](ARCHITECTURE.md)、仕様は [SPEC.md](SPEC.md)、テストは `engine/test/`（`tools/headless.sh 'engine/test/' 20000`）。

ゲームをまたいで使うコア。ES モジュールで、ゲームは `../../engine/<フォルダ>/<名前>.ts` から必要なものを import する。engine はゲームを import しない。

テストやビルドの道具（`tools/`）の使い方は、リポジトリの README「開発」にまとめてある。

フォルダは関心ごとに分けている: `core/`（ループ・world・文言・セーブ・感想フォーム・アクセス解析・確認用フック・古いページ検出・小さな関数）、`render/`（描画）、`world/`（タイルの世界・弾・追跡）、`audio/`（効果音と BGM）、`ui/`（画面の部品と入力）。下の表もこの順に並べている。

| ファイル | 中身 | ゲームに用意してもらうもの |
|---|---|---|
| `core/loop.ts` | メインループ。`requestAnimationFrame`、dt の上限、システムの実行、描画（`renderer.render` と手の銃）。`addSystem({ name, order, modes, update })`, `stopFrame()`, `runSystems(dt, mode)`, `startLoop()` | `LOOP.mode = () => 今のモード名`。動かしたいものを `addSystem` で登録し、最後に `startLoop()` |
| `core/world.ts` | 振る舞いを持つオブジェクト（Unity の MonoBehaviour に近い）。`spawn(obj)` で毎フレーム `obj.update(dt)`、`obj.dead = true` で片付け（`onRemove` と、画面に残っているメッシュの破棄）、`query(tag)`, `clearWorld(tag)`。`worldGroup(tag, order)` でタグごとに更新の順番を分けられる（リストは同じ配列のまま使い続けられる） | 各グループの `.system.modes` に動くモード。オブジェクトに `tag`, `update`, `mesh` |
| `core/util.ts` | `el`, `rand`, `randi`, `pick`, `clamp`, `shuffle`, `pct`, `distXZ`（x-z 平面の距離）, `isTouch`（body に `touch` / `desk` クラスを付ける） | — |
| `core/i18n.ts` | `LANG`, `lang`, `t(key, values)`, `setLang(code)`, `setI18nHook(fn)`, `fillData`, `applyStaticText`, `defaultLang` | `LANG.<code>` を登録する言語ファイル（`ja` は必須で、キーが無いときの予備）。定義に名前を流し込むなら `setI18nHook(fn)` で関数を登録 |
| `core/store.ts` | `encodeStore` / `decodeStore`（セーブを端末間で移す1行のコード。暗号化ではなく、読みにくく・書き換えにくくするだけ）、`loadStore(key, defaults)`（保存済みの値を既定値に深く重ねて `{ data, raw }` を返す）, `saveStore`, `clearStore`, `prefGet` / `prefSet`（タブの記憶など小さな値） | 既定値を返す関数。古い版からの変換は `raw` を見てゲーム側でやる |
| `core/stale.ts` | 古いページ検出。キャッシュに残った古いページなら、最新版の URL へ1回だけ切り替える | `<meta name="build" content="dev">`（ビルドが版番号に書き換え、`version.json` も出す。このファイルはページに埋め込まれる） |
| `core/feedback.ts` | `openFeedback(info)`（全ゲーム共通の Google フォームを、ゲーム名・ビルド・`info` を記入済みで開く）、`feedbackReady()`、`FEEDBACK.game`、`FEEDBACK_FORM` | 起動時に `FEEDBACK.game` へゲームID。`feedbackReady()` のときだけ送信ボタンを出し、押されたら今の状況をテキストにして `openFeedback` に渡す |
| `core/analytics.ts` | `track(name, params)`（GA4 のイベントを送る。タグの無いページでは記録だけ）、`TRACK_LOG`（直近50件）、`ANALYTICS.game` | 起動時に `ANALYTICS.game` へゲームID。送りたい出来事で `track` を呼ぶ。タグはビルドが入れる（`vite.config.js` の `GA_ID`） |
| `core/dev.ts` | `devHook('view-x', rest => ...)`（URL の `#view-x…` で動く確認用の入口）、`devSmoke(fn)`（`#smoke` で fn を実行し、エラー・版番号の不一致・`SMOKE DONE` をコンソールに出す） | テストの中身 |
| `render/render.ts` | `canvas`（`#gl`）, `renderer`, `scene`, `camera`, `dynGroup`, `resize`, `shared`, `basicMat`, `lineMat`, `disposeTree`, `textSprite`、手に持つ銃（部品の一覧から組み立てる `buildViewmodel` と、別パスで描く `gunScene`, `gun`, `renderGun`） | `<canvas id="gl">`。毎フレーム `renderer.render(scene, camera)` のあとに `renderGun()` |
| `render/fx.ts` | パーティクル（`burst`）と爆発の光（`fireball`）、`clearFx()`。システム `FX.particles` / `FX.fireballs` をエンジンが登録する | 動かすモードを `FX.particles.modes` などに入れる（入れなければ全モードで動く） |
| `world/tiles.ts` | タイルの世界（`T`=4, `STEP`, `RISE`, `W`, `H`, `grid`, `hgt`, `ramp`, `cover`, `flow`）と、`floorY`, `tileIndex`, `moveCircle`, `hasLOS`, `passable`, `computeFlow`, `flowDir` など | 地形を生成して `setTileWorld({ W, H, grid, hgt, ramp, cover, flow, flowQ })` で渡す |
| `world/projectiles.ts` | 弾の汎用部分: プール（`takeFromPool`, `clearPool`）、細かく刻んだ移動（`stepProjectile`。刻むたびにゲームの判定を呼ぶ）、地形との当たり（`projHitsTerrain`）、追尾（`steerToward`）、弾幕の方向（`ringAngles`, `aimFan`） | 弾の項目と、当たったときの処理（判定関数として渡す） |
| `world/steer.ts` | `steerChase`: 見えていれば近づく（近すぎたら回り込む）、見えなければ経路をたどる、仲間と押し合う | 速さ・保つ距離・押し合う相手のリスト |
| `audio/audio.ts` | 効果音の合成（`tone`, `nz`, `ot`, `gunshot`）、`sfx(name)`、`audioInit`, `sfxVolume` | `Object.assign(SFX, { 名前: () => {...} })` で効果音のレシピを入れる。音量は `setVolumes(sfx, bgm)`（0〜1） |
| `audio/music.ts` | BGM の再生（`setMusic(name, boss)`, `setMusicMix(kind)`, `musicVolume(duck)`, `musicTick`）、`SCALES` | `MUSIC_STYLES`（曲調）と `LAYER_MIX`（層の混ぜ方）に `Object.assign` で中身を入れる |
| `ui/ui.ts` | `toast(msg, ms)`, `banner(code, sub)`, 全画面（`enterFs`, `exitFs`, `toggleFs`, `isFs`） | `#toast`, `#banner`（`#bannerCode`, `#bannerSub`） |
| `ui/input.ts` | キー（`keys`）、マウスとポインタロック（`requestLock`, `exitLock`, `locked`, `mouseFire`）、タッチの移動スティック（`joy`）と視点ドラッグ、押しっぱなしの射撃ボタン（`fireHeld`, `fire2Held`）、`tapBtn(el, fn)`, `releaseInputs` | `INPUT` に `active`, `look`, `sens`, `key`, `pause`, `lockChanged` を入れる。`#touch`, `#joyBase`, `#joyKnob`, `#btnFire`, `#btnFire2`, `<canvas id="gl">` |
| `ui/touchlayout.ts` | タッチボタンの配置（`applyLayout`, `getL`）と配置の編集（`openLayoutEditor`, `closeLayoutEditor`） | `TOUCH_LAYOUT` に `defs`, `first`, `edits`, `reset`, `save`, `afterApply`, `onOpen`, `onClose` を入れる。`data-lb` の付いたボタン、`#layoutBar`, `#lbName` |

- engine のファイルは、ゲーム固有の名前を読み込み時に使わない（実行時に使うものは上の表の右列だけ）
- engine を変えたら、使っている全ゲームで確認する。今のところ使っているのは Sector Dive だけ

## まだ切り出していないもの

ゲームが1本のうちは切り出さず、2本目のゲームで要るとわかったときに engine を広げる。今のところ候補は次のもの（どれも Sector Dive の中にある）:

- 結果のシェアの流れ（スマホは共有シート、PC はコピー・保存・X 投稿を別々のボタンで。`ui/share.ts` の後半）
- 設定画面の共通部分（音量・言語・感度・全画面。`ui/hud.ts` の `settingsHTML`）
- 被弾方向の表示とヒットマーカー（FPS なら共通。`ui/hud.ts`）
- 部屋と通路の自動生成・ミニマップ（グリッドのダンジョン型のゲームなら。`world/level.ts`）

切り出すときの方針:

- ゲームの状態や操作を engine から直接呼ばず、設定オブジェクト（`INPUT`, `TOUCH_LAYOUT` のような形）やフック関数でゲームから渡す
- HTML の要素の ID を engine が前提にするときは、上の表に書く
