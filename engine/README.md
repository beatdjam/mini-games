# engine

ゲームをまたいで使うコア。ビルドなしのクラシックスクリプトで、全ファイルが1つのグローバルスコープを共有する。ゲームの `index.html` から `../../engine/<名前>.js?v=<版>` で、ゲーム固有のファイルより先に読み込む。

| ファイル | 中身 | ゲームに用意してもらうもの |
|---|---|---|
| `util.js` | `$`, `rand`, `randi`, `pick`, `clamp`, `shuffle`, `pct`, `isTouch`（body に `touch` / `desk` クラスを付ける） | — |
| `i18n.js` | `LANG`, `lang`, `t(key, values)`, `setLang(code)`, `fillData`, `applyStaticText`, `defaultLang` | `LANG.<code>` を登録する言語ファイル（`ja` は必須で、キーが無いときの予備）。定義に名前を流し込むなら `i18nApplyData(data)` |
| `audio.js` | 効果音の合成（`tone`, `nz`, `ot`, `gunshot`）、`sfx(name)`、`audioInit`, `sfxVolume` | 効果音のレシピ `SFX`（名前 → 関数）。音量は `sfxVolume` / `bgmVolume` に 0〜1 を入れる |
| `music.js` | BGM の再生（`setMusic(name, boss)`, `setMusicMix(kind)`, `musicVolume(duck)`, `musicTick`）、`SCALES` | 曲調 `MUSIC_STYLES` と層の混ぜ方 `LAYER_MIX` |
| `render.js` | `canvas`（`#gl`）, `renderer`, `scene`, `camera`, `dynGroup`, `resize`, `shared`, `basicMat`, `lineMat`, `disposeTree`, `textSprite`、手に持つ銃の別パス（`gunScene`, `gun`, `renderGun`） | `<canvas id="gl">`。毎フレーム `renderer.render(scene, camera)` のあとに `renderGun()` |
| `tiles.js` | タイルの世界（`T`=4, `STEP`, `RISE`, `W`, `H`, `grid`, `hgt`, `ramp`, `cover`, `flow`）と、`floorY`, `moveCircle`, `hasLOS`, `passable`, `computeFlow`, `flowDir` など | 地形を生成して `W`, `H`, `grid`, `hgt`, `ramp`, `cover`, `flow`, `flowQ` を埋める |
| `ui.js` | `toast(msg, ms)`, `banner(code, sub)`, 全画面（`enterFs`, `exitFs`, `toggleFs`, `isFs`） | `#toast`, `#banner`（`#bannerCode`, `#bannerSub`） |

- engine のファイルは、ゲーム固有の名前を読み込み時に使わない（実行時に使うものは上の表の右列だけ）
- engine を変えたら、使っている全ゲームで確認する。今のところ使っているのは Sector Dive だけ

## まだ切り出していないもの

Sector Dive の中に残っているが、2本目のゲームを作るときに engine へ移すと良さそうなもの。移すときは、ゲームの操作（拾う・回復・持ち替えなど）を呼んでいる箇所を、ゲームから渡す関数（フック）に置き換える。

- **入力**（`games/sector-dive/js/input.js`）: キーボード、マウスとポインタロック、タッチの移動スティックと視点ドラッグ、射撃ボタン。今は拾う・回復・持ち替え・一時停止などゲームの操作を直接呼んでいる
- **タッチボタンの配置の編集**（`games/sector-dive/js/hud.js` の `getL`, `applyLayout`, `openLayoutEditor`, `closeLayoutEditor`）: ボタンの位置と大きさの編集と保存。今は `save.settings.layout`、画面の切り替え（`show`, `state`）に依存している
- **セーブ**（`games/sector-dive/js/save.js`）: localStorage の読み書きと旧版の変換。中身はゲーム固有だが、読み書きと既定値の合成の部分は共通にできる
- **スモークテストの仕組み**（`games/sector-dive/js/dev.js`）: `#smoke` などの URL フックとヘッドレス Chrome での確認。テストの中身はゲーム固有
- **版番号とキャッシュ対策**（`games/sector-dive/tools/bump-version.sh`、`index.html` 先頭の古いページ検出）
