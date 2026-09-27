# engine

ゲームをまたいで使うコア。ビルドなしのクラシックスクリプトで、全ファイルが1つのグローバルスコープを共有する。ゲームの `index.html` から `../../engine/<名前>.js?v=<版>` で、ゲーム固有のファイルより先に読み込む。

共通のツールはリポジトリ直下の `tools/` にある: `bump-version.sh games/<game-id>`（版番号の更新）、`check_i18n.js games/<game-id>`（文言キーの照合）、`build_updates.py`（更新履歴の生成。公開時に Actions が実行）。

フォルダは関心ごとに分けている: `core/`（小さな関数・文言・セーブ・確認用フック・古いページ検出）、`render/`（描画）、`world/`（タイルの世界）、`audio/`（効果音と BGM）、`ui/`（画面の部品と入力）。

| ファイル | 中身 | ゲームに用意してもらうもの |
|---|---|---|
| `core/util.js` | `$`, `rand`, `randi`, `pick`, `clamp`, `shuffle`, `pct`, `isTouch`（body に `touch` / `desk` クラスを付ける） | — |
| `core/i18n.js` | `LANG`, `lang`, `t(key, values)`, `setLang(code)`, `fillData`, `applyStaticText`, `defaultLang` | `LANG.<code>` を登録する言語ファイル（`ja` は必須で、キーが無いときの予備）。定義に名前を流し込むなら `i18nApplyData(data)` |
| `audio/audio.js` | 効果音の合成（`tone`, `nz`, `ot`, `gunshot`）、`sfx(name)`、`audioInit`, `sfxVolume` | 効果音のレシピ `SFX`（名前 → 関数）。音量は `sfxVolume` / `bgmVolume` に 0〜1 を入れる |
| `audio/music.js` | BGM の再生（`setMusic(name, boss)`, `setMusicMix(kind)`, `musicVolume(duck)`, `musicTick`）、`SCALES` | 曲調 `MUSIC_STYLES` と層の混ぜ方 `LAYER_MIX` |
| `render/render.js` | `canvas`（`#gl`）, `renderer`, `scene`, `camera`, `dynGroup`, `resize`, `shared`, `basicMat`, `lineMat`, `disposeTree`, `textSprite`、手に持つ銃の別パス（`gunScene`, `gun`, `renderGun`） | `<canvas id="gl">`。毎フレーム `renderer.render(scene, camera)` のあとに `renderGun()` |
| `world/tiles.js` | タイルの世界（`T`=4, `STEP`, `RISE`, `W`, `H`, `grid`, `hgt`, `ramp`, `cover`, `flow`）と、`floorY`, `moveCircle`, `hasLOS`, `passable`, `computeFlow`, `flowDir` など | 地形を生成して `W`, `H`, `grid`, `hgt`, `ramp`, `cover`, `flow`, `flowQ` を埋める |
| `ui/ui.js` | `toast(msg, ms)`, `banner(code, sub)`, 全画面（`enterFs`, `exitFs`, `toggleFs`, `isFs`） | `#toast`, `#banner`（`#bannerCode`, `#bannerSub`） |
| `ui/input.js` | キー（`keys`）、マウスとポインタロック（`requestLock`, `exitLock`, `locked`, `mouseFire`）、タッチの移動スティック（`joy`）と視点ドラッグ、押しっぱなしの射撃ボタン（`fireHeld`, `fire2Held`）、`tapBtn(el, fn)`, `releaseInputs` | `INPUT` に `active`, `look`, `sens`, `key`, `pause`, `lockChanged` を入れる。`#touch`, `#joyBase`, `#joyKnob`, `#btnFire`, `#btnFire2`, `<canvas id="gl">` |
| `ui/touchlayout.js` | タッチボタンの配置（`applyLayout`, `getL`）と配置の編集（`openLayoutEditor`, `closeLayoutEditor`） | `TOUCH_LAYOUT` に `defs`, `first`, `edits`, `reset`, `save`, `afterApply`, `onOpen`, `onClose` を入れる。`data-lb` の付いたボタン、`#layoutBar`, `#lbName` |
| `core/store.js` | `loadStore(key, defaults)`（保存済みの値を既定値に深く重ねて `{ data, raw }` を返す）, `saveStore`, `clearStore`, `prefGet` / `prefSet`（タブの記憶など小さな値） | 既定値を返す関数。古い版からの変換は `raw` を見てゲーム側でやる |
| `core/stale.js` | 古いページ検出。キャッシュに残った古いページなら、最新版の URL へ1回だけ切り替える | `<meta name="build">` とゲームのフォルダの `version.json`（`tools/bump-version.sh` が書く） |
| `core/dev.js` | `devHook('view-x', rest => ...)`（URL の `#view-x…` で動く確認用の入口）、`devSmoke(fn)`（`#smoke` で fn を実行し、エラー・版番号の不一致・`SMOKE DONE` をコンソールに出す） | テストの中身 |

- engine のファイルは、ゲーム固有の名前を読み込み時に使わない（実行時に使うものは上の表の右列だけ）
- engine を変えたら、使っている全ゲームで確認する。今のところ使っているのは Sector Dive だけ

## まだ切り出していないもの

今のところなし。2本目のゲームで足りないところが出たら、そのとき engine を広げる。そのときの方針:

- ゲームの状態や操作を engine から直接呼ばず、設定オブジェクト（`INPUT`, `TOUCH_LAYOUT` のような形）やフック関数でゲームから渡す
- HTML の要素の ID を engine が前提にするときは、上の表に書く
