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
