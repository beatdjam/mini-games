# STORMBREACHER 仕様

劣勢の戦線を、組み替えた機体で押し返す三人称のロボットアクション。今は試作（G0）を載せる器だけがあり、遊べる中身はまだ無い。

## 1. 位置づけ

- G0 の試作の器。空の屋外（地面・光・霧・大きさの目安の箱1つ）を3Dで描き、タイトルと「開発中」の札を出す
- トップページの一覧には出さない。ビルドには入るので、URL を知っていれば開ける
- 公開のビルドにも GA のタグは入る
- この器の上に、屋外の描画の測定（SB-010）・三人称カメラ（SB-020）・タッチ操作（SB-030）・寸法（SB-040）の確認用の入口が乗る

## フォルダと層

ソースは4層に分ける。`logic/` と `data/` は three も DOM も読まず、ページなしの node で動く。

| フォルダ | 中身 | 読んでよいもの |
|----------|------|----------------|
| `src/data/` | 表と定義（型・状態・調整の値） | `data/` と engine の core |
| `src/logic/` | 状態と1フレームの更新 | `data/`・`logic/`・engine の core |
| `src/view/` | 状態を読んで描く | `data/`・`logic/`・engine・three |
| `src/app/` | 入力・画面・起動 | すべて |

`logic/`・`data/` は three・DOM・`view/`・`app/`・`dev/`・`i18n/` を読まない。`data/` は `logic/` も読まない。`view/` は `app/` と `dev/` を読まない。この向きは dependency-cruiser の規則（`sb-logic-data-no-render`・`sb-logic-data-inward`・`sb-data-is-data`・`sb-view-reads-only`）で止めてある。

`src/view/camera.ts` は三人称カメラの位置を決める純粋な関数で、`scene` も `camera` も触らない（カメラに書くのは `applyPose` だけ）。

`src/logic/mech.ts` は機体の歩く・跳ぶ・ブースト・着地を、状態を引数で受けて進める純粋な関数で、three も DOM も読まない。`src/logic/fire.ts` は正面への線が的の箱に当たるかを返す純粋な関数。`src/view/feel.ts` は動きの出来事からカメラの揺れ・FOV・ヒットストップ・砂煙を作る。

`src/app/touch.ts` は engine のスティック・視点のドラッグ・タッチのボタンを `MechInput` の形に変え、ボタンの配置の編集と、押した回数・同時に触れている指の数・動作が同時に効いた時間を測る。

- `src/app/keyboard.ts`: engine のキーの動作とマウスを読み、ジャンプとロックの押した瞬間、右クリックのサブ射撃を `MechInput` の形にする
- `src/app/input.ts`: タッチとキーボードを1つの `MechInput` にまとめる口。本番のゲームもここから読む
- `src/logic/input.ts`: タッチとキーボードの `MechInput` を合わせる純粋な関数（three も DOM も読まない）

## テストの層

| 層 | 何を確かめるか | 動く場所 | project の名前 | 流し方 |
|----|----------------|----------|----------------|--------|
| unit | 純粋な関数1つ | node | `stormbreacher-unit` | `npx vitest run --project stormbreacher-unit` |
| integration | `logic/` を何フレームも回す | node | `stormbreacher-integration` | `npx vitest run --project stormbreacher-integration` |
| e2e | ページを起動する | Chromium | `stormbreacher-e2e` | `npx vitest run --project stormbreacher-e2e` |

E2E に書いてよいのは、画面か入力が無いと確かめられないものだけ。

## 2. 画面

- ページの要素: `<canvas id="gl">` の上に `<div id="sbApp">` を重ねる（`pointer-events:none`。一覧へ戻るリンクだけ `pointer-events:auto`）
- 画面の状態は `src/app/screen.ts` の `GameState` と `src/data/states.ts` の `STATES` で持つ。今は `title` の1つだけで、`playing` は false
- 状態は `setState` でだけ書き換え、遊んでいるかは `isPlaying()` で見る。状態の名前を直に比べない

| 状態 | playing | 意味 |
|------|---------|------|
| `title` | false | タイトル画面（今はこれだけ） |

## 3. 乱数

- 乱数は `src/logic/rng.ts` の1つの口からだけ引く。ほかで `Math.random` を呼ばない
- `rng()`: 全体の乱数。`seed(n)` で種を入れると、同じ種からは同じ並びになる
- `stream(name)`: 要素ごとの専用の乱数列。今は `field` の1つ。種を入れると、種と `STREAM_SALT[name]` を混ぜた種から始まる
- 種を入れていないときは、どれも `Math.random` から引く

## 4. セーブ

- 保存キー: キャンペーンの進みは `SAVE_KEY = 'stormbreacher-v1'`、設定（言語）は全モード共通で `SETTINGS_KEY = 'stormbreacher-settings'`、タッチのボタンの配置は `TOUCH_LAYOUT_KEY = 'stormbreacher-touch-layout'`
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

三人称カメラの出発点は `CAMERA_TUNE`（SB-020）。距離は地面に沿って測る。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `dist` | 17.2 | m。注視点からカメラまでの水平距離 |
| `height` | 3.0 | m。注視点より上へ置く高さ |
| `shoulder` | 4.3 | m。注視点を機体の右へずらす量 |
| `lookHeight` | 5.8 | m。注視点の足元からの高さ |
| `minDist` | 0.5 | m。壁で寄せるときの、注視点からの最短水平距離。ほぼ 0 にして、壁の向こうへ抜けないようにする |
| `margin` | 0.6 | m。壁の手前に残す隙間 |
| `pitchMin` | -0.5 | rad。上下の向きの下限（負が見下ろす） |
| `pitchMax` | 0.8 | rad。上下の向きの上限（正が見上げる） |
| `lag` | 0.12 | s。カメラが目標の位置に追いつく時定数（0 なら遅れなし） |
| `fov` | 72 | 度。縦の画角 |
| `aimDist` | 10.2 | m。狙うときの水平距離 |
| `aimFov` | 52 | 度。狙うときの縦の画角 |
| `walk` | 7.4 | m/s。`#view-camera` の模型の歩く速さ |

機体の動きの出発点は `MOVE_TUNE`（SB-025）。速さは m/s、加速は m/s²。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `walk` | 15 | m/s。歩く速さ |
| `accel` | 80 | m/s²。歩きの加速 |
| `decel` | 90 | m/s²。入力が無いときの減速 |
| `jump` | 10.2 | m/s。ジャンプの初速 |
| `gravity` | 25 | m/s²。空中の落下 |
| `airControl` | 0.4 | 空中で歩きの加速が効く割合（0〜1） |
| `boost` | 30 | m/s。ブーストの速さ |
| `boostAccel` | 160 | m/s²。ブーストの加速 |
| `boostDrain` | 0.5 | ゲージ/秒。ブーストで減るゲージ |
| `boostRegen` | 0.35 | ゲージ/秒。地上でキーを離したときに戻るゲージ |
| `boostLift` | 0 | m/s²。空中でブーストしたときの上向きの加速（0 なら落ちながら進む） |
| `hoverFall` | 1.5 | m/s。滞空中に落ちる速さの上限 |
| `hoverDrain` | 0.3 | ゲージ/秒。滞空で減るゲージ |
| `landStop` | 0.12 | s。着地の硬直。この間は歩けない |
| `turn` | 2.6 | rad/s。キーで向きを変える速さ |
| `maxStep` | 1/120 | s。1フレームを分ける刻みの最大 |

手応えの演出の出発点は `FEEL_TUNE`（SB-025）。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `boostFov` | 10 | 度。ブースト中に広げる画角 |
| `fovRate` | 8 | 1/s。画角が目標に寄る速さ |
| `landShake` | 0.35 | m。落ちる速さ 10m/s の着地の揺れ |
| `fireShake` | 0.06 | m。撃ったときの揺れ |
| `shakeDecay` | 10 | 1/s。揺れが収まる速さ |
| `hitStop` | 0.05 | s。当たったときに止める時間 |
| `dust` | 1 | 砂煙の量の倍率（0 で出さない） |
| `fireRate` | 8 | 発/秒。撃ち続けたときの1秒の数 |

## 6. 確認用の入口

- `?fps`: 直近1秒に描いたコマ数と、最後のコマが描いた物を画面の上に出す
- `?stats`: 最後のコマが描いた物（描く回数と三角形の数）を、0.1秒ごとにページのタイトルへ書く
- `?seed=<n>`: 乱数の種を入れる。確認用の入口は起動（`boot()`）のあとに読み込むので、種が効くのはそのあとに引く乱数だけ。起動時に作る屋外は乱数を使っていない
- `#view-field`: 起動時のカメラで止まった、空の屋外の絵にする
- `#view-scale…`: 寸法を見比べる試験コースを出す。`#view-scale` は全体を斜め上から、`#view-scale-<場所>`（`corridor`・`door`・`hall`・`step`・`ref`）はその場所を正面やや上から、`#view-scale-<場所>-tp` は機体の後ろからの三人称の構図。`?mech=<m>` は三人称の機体の高さ（既定 8）、`?ceil=<m>` は部屋の天井の高さ（既定 18）、`?radius=<m>` は当たり半径（既定 2）
- `#view-camera`: 三人称カメラを測る入口。試験コースを 8m の模型が道筋で歩き、カメラが追う。`?dist=14` のように `CAMERA_TUNE` の項目を URL の値で上書きでき（数値でない値は無視）、`?ceil=<m>` は部屋の天井（既定 18）、`?aim` は狙う距離と画角に固定、`?speed=<倍率>` は道筋の速さ（既定 1。測る数字はコマごと）
- `?drive` 付きの `#view-camera`: 模型をキーボードで動かす。W/S が前後、A/D が左右、Q/E か左右の矢印が向き、R/F か上下の矢印が pitch、Shift を押している間が狙う構図。道筋は使わない
- `#view-camera` の `window.sbCameraReport()`: 道筋の最初の1周を記録し終えると、コマ数・`pulled` のコマ数・`dist` の最小と平均・`shoulder` の最小・カメラが箱の中にあったコマ数・`screenFraction` の最小・平均・最大を、全体と区間（`corridor`・`door`・`hall`・`step`・`ref`）ごとに JSON の文字列で返す。まだなら `null`
- `#view-move`: 平らな地面で、8m の機体が歩く・跳ぶ・ブースト・滞空・着地・撃つ入口。W/S が前後、A/D が左右、Q/E か左右の矢印が向き、マウスのドラッグでも向き、Space がジャンプ（押した瞬間に跳び、空中で押し続けると滞空）、Shift がブースト、J かマウスの左ボタンが撃つ。`CAMERA_TUNE`・`MOVE_TUNE`・`FEEL_TUNE` の項目を URL の値で上書きでき（例 `?walk=9&boostFov=0`。数値でない値は無視）、`?feel=0` で演出（FOV・揺れ・ヒットストップ・砂煙）を全部切る。画面の左下に速さ・ゲージ・地上か・着地の硬直の残りを出す
- `#view-touch`: 同じ平らな地面で、タッチで機体を動かす入口。左 45% のスティックが移動、残りのドラッグが視点、`#btnFire`（メイン）が撃つ、`#btnFire2`（サブ）が押した回数だけ、`#btnJump`（ジャンプ）が押した瞬間に跳び、空中で押し続けると滞空、`#btnBoost`（ブースト）が押している間ブースト、`#btnLock`（ロック）が LOCK の表示を切り替える。ボタンの最初の配置は `src/data/touch.ts` の `TOUCH_DEFAULTS` のとおりで、右手側に寄せ、メインを少し大きくする。画面の上の「配置」で engine の配置の編集画面を開き、指で動かした座標と大きさを保存する。画面の左上に速さ・ゲージ・LOCK・押した回数・同時に触れた指の最大・「スティック＋視点＋メイン」と「スティック＋視点＋ブースト」が同時に効いた秒を出す。視点は `INPUT.look` が呼ばれた時刻から `LOOK_RECENT`（0.25 秒）以内なら使っていると数え、メインのボタンを押したままのドラッグも含める。画面の上の「結果」で、`window.sbTouchReport()` と同じ JSON（測った数字、ボタンの配置 `x`・`y`・`s`・`b`、画面の大きさと `devicePixelRatio`、`userAgent`）を出す
- `#view-play`: `#view-touch` と同じ画面を、PC ではキーボードとマウス、スマホではタッチで動かす入口。キーボードは W/S が前後、A/D が左右、マウスの移動と矢印キーが視点、Space がジャンプ（押した瞬間に跳び、空中で押し続けると滞空）、Shift がブースト、J かマウスの左ボタンがメイン、K かマウスの右ボタンがサブ、E がロック、Esc がロック解除。PC では画面の下の真ん中に操作の一覧を出し、ポインタロック中は消す
- `#view-outdoor`: 上陸戦の浜辺のような広い屋外（地面・障害物・トーチカ・防波堤・崖・歩く敵の機体）を種から作り、その重さを測る入口。開いて2秒たってから10秒のあいだ、フレームの間隔・描く回数・三角形の数を記録し、終わると画面の右上に大きく出す（下の `textarea` は同じ結果の JSON）。`window.sbBenchReport()` は終わっていればその JSON の文字列、まだなら `null`
  - `?chunk=<m>`: 区画の一辺（`0`・`16`・`32`・`64`。既定 `32`。`0` は区画に分けない）。`?chunkMin=<n>`: 区画に分ける種類の三角形の数の下限（既定 `3000`）
  - `?far=<m>`: 描く距離と霧の終わり（`80`・`120`・`160`。既定 `120`）。霧の始まりは `far × 0.4`
  - `?enemies=<n>`: 歩く敵の数（`0`・`10`・`30`・`50`。既定 `30`。`0` は `?mechs=` の比べ用）。`?mechDraw=group|instanced`: 機体の描き方（既定 `group`）
  - `?mechs=<n>`: 比べ用に、防波堤の前に横一列で置く機体の数（既定 `0`。歩かない）。`?density=<倍率>`: 障害物の多さ（既定 `1`）
  - `?cam=path|fixed`: カメラ（既定 `path`。`path` は海から防波堤まで歩いて折り返す、`fixed` は浜の中ほどで陸を向いて止まる）
  - スマホで開くときは `npx vite --port 8765 --host` で開発サーバーを立て、同じ Wi-Fi の端末から `http://<Mac の IP>:8765/games/stormbreacher/#view-outdoor` を開く

確認用の入口は開発サーバーでだけ読み込む（公開のビルドには入らない）。
