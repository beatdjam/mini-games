# STORMBREACHER 仕様

劣勢の戦線を、組み替えた機体で押し返す三人称のロボットアクション。今は試作（G0）を載せる器だけがあり、遊べる中身はまだ無い。

## 1. 位置づけ

- G0 の試作の器。空の屋外（地面・光・霧・大きさの目安の箱1つ）を3Dで描き、タイトルと「開発中」の札を出す
- トップページの一覧には出さない。ビルドには入るので、URL を知っていれば開ける
- 公開のビルドにも GA のタグは入る
- この器の上に、屋外の描画の測定（SB-010）・三人称カメラ（SB-020）・タッチ操作（SB-030）・寸法（SB-040）の確認用の入口が乗る

## 2. 画面

- ページの要素: `<canvas id="gl">` の上に `<div id="sbApp">` を重ねる（`pointer-events:none`。一覧へ戻るリンクだけ `pointer-events:auto`）
- 画面の状態は `src/core/state.ts` の `GameState` と `src/data/states.ts` の `STATES` で持つ。今は `title` の1つだけで、`playing` は false
- 状態は `setState` でだけ書き換え、遊んでいるかは `isPlaying()` で見る。状態の名前を直に比べない

| 状態 | playing | 意味 |
|------|---------|------|
| `title` | false | タイトル画面（今はこれだけ） |

## 3. 乱数

- 乱数は `src/core/rng.ts` の1つの口からだけ引く。ほかで `Math.random` を呼ばない
- `rng()`: 全体の乱数。`seed(n)` で種を入れると、同じ種からは同じ並びになる
- `stream(name)`: 要素ごとの専用の乱数列。今は `field` の1つ。種を入れると、種と `STREAM_SALT[name]` を混ぜた種から始まる
- 種を入れていないときは、どれも `Math.random` から引く

## 4. セーブ

- 保存キー: キャンペーンの進みは `SAVE_KEY = 'stormbreacher-v1'`、設定（言語）は全モード共通で `SETTINGS_KEY = 'stormbreacher-settings'`
- `SAVE_VERSION = 1`。形を変えたら版を上げ、`MIGRATIONS` に `[to, migrate]` を足す（今は空）
- `SaveData` は `v` と `records.missions` を持つ。`MissionRecord` は `cleared` と `bestSec`（秒、無ければ null）
- 古いセーブは `v`（無ければ 0）から今の版まで `MIGRATIONS` を順に流す。読むのは `initSave()`（起動時）で、モジュールの読み込み時には読まない
- 中断のスナップショットはまだ作らない

## 5. 調整の値

`src/data/tune.ts` の `FIELD_TUNE`。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `groundSize` | 400 | m。地面の一辺 |
| `fogNear` | 60 | m。霧の始まり |
| `fogFar` | 160 | m。霧の終わり |
| `viewFar` | 200 | m。カメラの描画距離（霧の終わりより遠い） |
| `mechHeight` | 8 | m。大きさの目安の箱の高さ（機体は 7〜10m の想定） |
| `camDist` | 17 | m。箱からの水平距離（起動時と `#view-field` のカメラ） |
| `camHeight` | 6 | m。箱の中ほどからの高さ |
| `touchMaxFps` | 60 | コマ/秒。スマホで描く上限 |

## 6. 確認用の入口

- `?fps`: 直近1秒に描いたコマ数と、最後のコマが描いた物を画面の上に出す
- `?stats`: 最後のコマが描いた物（描く回数と三角形の数）を、0.1秒ごとにページのタイトルへ書く
- `?seed=<n>`: 乱数の種を入れる。確認用の入口は起動（`boot()`）のあとに読み込むので、種が効くのはそのあとに引く乱数だけ。起動時に作る屋外は乱数を使っていない
- `#view-field`: 起動時のカメラで止まった、空の屋外の絵にする

確認用の入口は開発サーバーでだけ読み込む（公開のビルドには入らない）。
