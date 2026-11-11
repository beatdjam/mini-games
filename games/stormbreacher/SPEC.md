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

`logic/`・`data/` は three・DOM・`view/`・`app/`・`dev/`・`i18n/` を読まない。`data/` は `logic/` も読まない。`view/` は `app/` と `dev/` を読まない。`app/` は `dev/` を読まない（本体のページに開発用の入口が入らないため）。この向きは dependency-cruiser の規則（`sb-logic-data-no-render`・`sb-logic-data-inward`・`sb-data-is-data`・`sb-view-reads-only`・`sb-app-no-dev`・`sb-portable-no-game`）で止めてある。

`src/view/camera.ts` は三人称カメラの位置を決める純粋な関数で、`scene` も `camera` も触らない（カメラに書くのは `applyPose` だけ）。

`src/view/world.ts` はマップの描き方を本体と開発用の入口で共有し、`src/view/outdoor.ts` は地面と物、`src/view/mechProxy.ts` は機体の仮の模型を描き、`src/data/colors.ts` は地面の砂と空の色を名前で持つ。`src/view/play.ts` は出撃中の画面を組み立てて描き、`src/view/world.ts` の `syncWorld` が壊れた目標を低く暗い姿にする。

`src/logic/mech.ts` は機体の歩く・跳ぶ・ブースト・着地を、状態を引数で受けて進める純粋な関数で、three も DOM も読まない。`src/logic/fire.ts` は正面への線が的の箱に当たるかを返す純粋な関数。`src/view/feel.ts` は動きの出来事からカメラの揺れ・FOV・ヒットストップ・砂煙を作る。

`src/logic/fcs.ts` は三人称の照準の線・機体の胸・的から、撃つ向きと `hard` が捕まえた的を決める純粋な関数。`src/logic/dummies.ts` は `#view-fcs` の動く的の動きと当たりを、`src/view/reticle.ts` はその照準（点・円・候補の弧・捕まえた印）を DOM で描く。

`src/logic/script.ts` はミッションの台本を進める純粋な関数。`src/data/missions/m1.ts` に M1 の cue の並びと、場所・物・波・目標・印・味方・道の名前の一覧を置き、`src/data/script.ts` にカットシーンの秒と無線の最低表示時間を置く。

`src/logic/mapCheck.ts` はマップが台本と機体の大きさに合うかを調べる純粋な関数。`src/logic/mapgen.ts` は種と規則から物を並べる純粋な関数。M1 の B の手書きのマップは `src/data/maps/m1b-hand.ts`、生成の規則は `src/data/maps/m1b-rules.ts` に置く。

`src/logic/collide.ts` は平面で円を回った四角から押し出す純粋な関数で、engine へ移す候補なのでゲームのファイルを読まず、四角と半径を引数で受ける（規則 `sb-portable-no-game`）。`src/logic/mapShapes.ts` の `mapBlockers` が `MapDef` から四角の一覧を作り、通り道の検査と機体の当たりがそれを読む。規則に入っているファイルは `src/logic/collide.ts`・`src/logic/mech.ts`・`src/logic/fcs.ts`・`src/logic/fire.ts`・`src/view/camera.ts`・`src/data/tuneTypes.ts` の6つで、機体・カメラ・FCS の調整の型は値と分けて `src/data/tuneTypes.ts` に置く（値は `src/data/tune.ts`）。

`src/logic/game.ts` は出撃の `GameModel`（機体・マップ・目標の体力・メインとサブの武器・そのフレームの出来事）を持ち、`step(game, input, dt)` で入力から1フレーム進める。機体が歩き、メインとサブの武器が撃ち（`data/weapons.ts` の表の威力・射程・間隔・弾数）、弾が目標に当たると体力が減って0で壊れ、全部壊れると `cleared` になる。台本（SB-150）・敵（SB-190）はまだつながない。

`src/logic/hud.ts` は HUD に出す値（ブースト・装甲・メインとサブの弾数・目標の数・照準の円の中の一番近い敵の体力・レーダーの点）を `GameModel` から作る純粋な関数 `hudModel`。装甲は機体の体力が無い（SB-190）ので常に満タン。熱は持たない。描くのは `view/hud.ts`（次の票）。

`src/app/touch.ts` は engine のスティック・視点のドラッグ・タッチのボタンを `MechInput` の形に変え、ボタンの配置の編集と、押した回数・同時に触れている指の数・動作が同時に効いた時間を測る。

- `src/app/keyboard.ts`: engine のキーの動作とマウスを読み、ジャンプとロックの押した瞬間、右クリックのサブ射撃を `MechInput` の形にする
- `src/app/input.ts`: タッチとキーボードを1つの `MechInput` にまとめる口。本番のゲームもここから読む
- `src/app/play.ts`: 出撃の開始（`startSortie`）・出撃中のシステム・結果の画面（`showResult`）と、タイトルから出撃へ進む入り口
- `src/logic/input.ts`: タッチとキーボードの `MechInput` を合わせる純粋な関数（three も DOM も読まない）

## テストの層

| 層 | 何を確かめるか | 動く場所 | project の名前 | 流し方 |
|----|----------------|----------|----------------|--------|
| unit | 純粋な関数1つ | node | `stormbreacher-unit` | `npx vitest run --project stormbreacher-unit` |
| integration | `logic/` を何フレームも回す | node | `stormbreacher-integration` | `npx vitest run --project stormbreacher-integration` |
| e2e | ページを起動する | Chromium | `stormbreacher-e2e` | `npx vitest run --project stormbreacher-e2e` |

E2E に書いてよいのは、画面か入力が無いと確かめられないものだけ。

## 2. 画面

- ページの要素: `<canvas id="gl">` の上に `<div id="sbApp">` を重ねる（`pointer-events:none`。一覧へ戻るリンクと出撃のボタンだけ `pointer-events:auto`）
- 画面の状態は `src/app/screen.ts` の `GameState` と `src/data/states.ts` の `STATES` で持つ。`title`（タイトル）・`play`（出撃中）・`result`（結果）の3つで、`playing` は `play` のときだけ true
- 状態は `setState` でだけ書き換え、遊んでいるかは `isPlaying()` で見る。状態の名前を直に比べない

| 状態 | playing | 意味 |
|------|---------|------|
| `title` | false | タイトル画面 |
| `play` | true | 出撃中 |
| `result` | false | 結果の画面 |

画面はタイトル → 出撃 → 結果と進む。タイトルの「出撃」（`#sbStart` のクリックか Enter）で `play` になり、M1 の B のマップで機体を歩かせて撃ち、目標を全部壊すと `result` の画面（所要時間と「タイトルへ」）になる。「タイトルへ」は今は `location.reload()` で戻る（結果とセーブは SB-210）。

## 3. 乱数

- 乱数は `src/logic/rng.ts` の1つの口からだけ引く。ほかで `Math.random` を呼ばない
- `rng()`: 全体の乱数。`seed(n)` で種を入れると、同じ種からは同じ並びになる
- `stream(name)`: 要素ごとの専用の乱数列。`field`・`fcs`・`dummies`・`map`・`craters` がある。種を入れると、種と `STREAM_SALT[name]` を混ぜた種から始まる
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
| `camDist` | 8.5 | m。箱からの水平距離（起動時と `#view-field` のカメラ） |
| `camHeight` | 3 | m。箱の中ほどからの高さ |
| `touchMaxFps` | 60 | コマ/秒。スマホで描く上限 |

機体そのものの大きさは `MECH_TUNE`（D-24: 高さ 4m）。下の `CAMERA_TUNE`・`MOVE_TUNE` はこの高さを基準に書く。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `height` | 4 | m。機体の高さ |
| `radius` | 1 | m。地面での当たり半径。機体と物の当たりと通り道の検査が使う |
| `chestHeight` | 2.5 | m。撃つ弾が足元から出る高さ |

出撃の値は `PLAY_TUNE`（SB-115）。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `startMargin` | 4 | m。機体が始まる位置の、マップの手前の端からの距離 |

HUD の値は `HUD_TUNE`（SB-160）。値は仮。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `radarRange` | 200 | m。レーダーの見える距離。これより遠い目標は描かない |
| `aimCone` | `FCS_TUNE.soft.cone` | 度。照準の円の半分の角度。敵の体力の棒はこの中の目標を選ぶ |
| `objectiveKey` | `obj.break-pillboxes` | 目標の言語キー。台本（SB-150）がつながるまで |
| `objectiveKind` | `pillbox` | 目標が数える目標の種類 |

武器は表 `data/weapons.ts` の `WEAPONS`（`Record<WeaponId, WeaponDef>`）に置く。値はどれも仮で、SB-140 の2枚目と遊んで詰める。熱は持たない（2026-11-12 の決定）。

| 武器 | `damage` | `range` | `interval` | `ammo` |
|------|----------|---------|------------|--------|
| メイン `autocannon`（連射の機関砲） | 10 | 120 m | 0.125 s | 200 |
| サブ `heavyGun`（単発で重い砲） | 60 | 180 m | 1.2 s | 8 |

M1 は組み替え無しの1組（`M1_LOADOUT`）で、出撃ごとに `ammo` の弾を積み、撃ち切ると撃てない。撃つ間隔は `logic/weapons.ts` の `stepWeapon` が決め、`wait` の残りを次のフレームへ持ち越すので、フレームの長さで連射の速さは変わらない。

弾は物で止まり、物の向こうの目標には当たらない（物は壊れない）。

三人称カメラの出発点は `CAMERA_TUNE`（SB-020）。距離は地面に沿って測る。本体（`src/view/play.ts`）と開発用の入口 `#view-map`・`#view-fx` は、マップの物と目標の四角（`top` の無い四角は 100m の壁）をカメラの壁として渡す。注視点（足元から 2.9m）より下で終わる低い物は、カメラを引き寄せない。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `dist` | 8.6 | m。注視点からカメラまでの水平距離 |
| `height` | 1.5 | m。注視点より上へ置く高さ |
| `shoulder` | 2.15 | m。注視点を機体の右へずらす量 |
| `lookHeight` | 2.9 | m。注視点の足元からの高さ |
| `minDist` | 0.5 | m。壁で寄せるときの、注視点からの最短水平距離。ほぼ 0 にして、壁の向こうへ抜けないようにする |
| `margin` | 0.6 | m。壁の手前に残す隙間 |
| `pitchMin` | -0.5 | rad。上下の向きの下限（負が見下ろす） |
| `pitchMax` | 0.8 | rad。上下の向きの上限（正が見上げる） |
| `lag` | 0.12 | s。カメラが目標の位置に追いつく時定数（0 なら遅れなし） |
| `fov` | 72 | 度。縦の画角 |
| `aimDist` | 5.1 | m。狙うときの水平距離 |
| `aimFov` | 52 | 度。狙うときの縦の画角 |
| `walk` | 7.4 | m/s。`#view-camera` の模型の歩く速さ |

機体の動きの出発点は `MOVE_TUNE`（SB-025）。速さは m/s、加速は m/s²。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `walk` | 7.5 | m/s。歩く速さ |
| `stepHeight` | 0.75 | m。跳ばずに歩いて乗れる段差の高さ（仮。SB-120 の低い障害物で決め直す） |
| `accel` | 40 | m/s²。歩きの加速 |
| `decel` | 90 | m/s²。入力が無いときの減速 |
| `jump` | 7.2 | m/s。ジャンプの初速（最高点は約 1m） |
| `gravity` | 25 | m/s²。空中の落下 |
| `airControl` | 0.4 | 空中で歩きの加速が効く割合（0〜1） |
| `boost` | 15 | m/s。ブーストの速さ |
| `boostAccel` | 80 | m/s²。ブーストの加速 |
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
| `hitStop` | 0.05 | s。敵を倒したときに機体を止める時間（連射の命中では止めない） |
| `dust` | 1 | 砂煙の量の倍率（0 で出さない） |
| `fireRate` | 8 | 発/秒。撃ち続けたときの1秒の数 |

照準装置（FCS）の出発点は `FCS_TUNE`（SB-060）。角度は度、距離は m、速さは度/秒、時間は秒。

| 名前 | manual | soft | hard | 単位・意味 |
|------|--------|------|------|------------|
| `cone` | 0 | 8 | 12 | 度。照準の円の半径（半角）。`soft`・`hard` が使い、`manual` は使わない |
| `range` | 200 | 200 | 180 | m。的の中心が胸からこの距離までのものを狙える |
| `spread` | 0.5 | 0.8 | 1.5 | 度。撃った弾が向きからずれる円錐の半径 |
| `pull` | 0 | 20 | 0 | 度/秒。`soft` が的へ狙いを引き寄せる速さ。ほかの型は 0 |
| `lockTime` | 0 | 0 | 0.35 | 秒。`hard` が円の中の的を捕まえるまで入れ続ける時間。ほかの型は 0 |
| `trackRate` | 0 | 0 | 90 | 度/秒。`hard` が捕まえた的へ銃口を向ける速さ。ほかの型は 0 |
| `breakCone` | 0 | 0 | 20 | 度。`hard` が捕まえた的を外す、照準の線からの角度。ほかの型は 0 |

`#view-fcs` の動く的の出発点は `DUMMY_TUNE`（SB-060）。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `hp` | 10 | 発。倒すのに要る命中の数 |
| `speed` | 8 | m/s。動く的の速さ |
| `respawn` | 1.5 | s。倒されてから最初の場所に戻るまで |

上陸戦の迫力の出発点は `FX_TUNE`（SB-045）。段階 2（中）の値で、`FX_STAGES` が段階 0（切る）・1（弱）・3（強）の上書きを持つ。色は `0xRRGGBB`。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `pixel` | 0.4 | 描く解像度の倍率（1 で今のまま、0.25 で 1/4。引き伸ばしは `image-rendering: pixelated`） |
| `saturate` | 0.61 | canvas に掛ける CSS の `saturate`（1 で今のまま） |
| `contrast` | 1.01 | 同じ `contrast`（1 で今のまま） |
| `sepia` | 0.16 | 同じ `sepia`（0 で今のまま） |
| `haze` | 0.25 | 霧の近い側を手前に寄せる割合（0 で `#view-map` のまま） |
| `fogColor` | 0x9aa9b0 | 霧の色 |
| `skyColor` | 0x93a3ac | 空（背景）の色 |
| `light` | 0.6 | シーンの全部の光の強さに掛ける倍率（1 で今のまま） |
| `sun` | 1 | 太陽（`DirectionalLight`）だけにさらに掛ける倍率（1 で今のまま） |
| `groundColor` | 0x7a6a4f | 地面のタイルの色（`0xRRGGBB`） |
| `shellEvery` | 10 | s。何秒に1発落ちるか（0 で無し） |
| `shellNear` | 17 | m。機体からこの距離より内側には落とさない |
| `shellFar` | 70 | m。機体からこの距離までの輪の中に落とす |
| `shellShake` | 0.14 | m。10m で落ちたときの揺れ（距離で減らす） |
| `smokeLife` | 5.5 | s。砲撃の煙が残る時間 |
| `smokeCubes` | 10 | 個。1発で出る煙の塊の数 |
| `smokeMax` | 270 | 個。同時に出せる煙の塊の上限 |
| `wreckSmoke` | 3 | 本。マップの残骸から立ち続ける煙の柱の数 |
| `smokeColor` | 0xb0aaa0 | 出たばかりの煙の色 |
| `smokeDark` | 0x3f3d3a | 消える直前の煙の色 |
| `craters` | 90 | 個。最初からマップに散らす砲弾穴の数（0 で無し） |
| `craterMin` | 2.5 | m。砲弾穴の半径の最小 |
| `craterMax` | 8 | m。砲弾穴の半径の最大 |
| `craterWater` | 0.2 | 水が溜まっている穴の割合（0〜1） |
| `shellCrater` | 1 | 砲撃が落ちた所に新しい穴を残すか（0 か 1） |
| `craterCap` | 50 | 個。砲撃で増やす穴の上限。超えたら古いものから消す |
| `tracers` | 15 | 本/秒。画面を横切る曳光弾の数（0 で無し） |
| `tracerSpeed` | 80 | m/s。曳光弾の速さ |
| `allies` | 300 | 人。最初に出す味方の人数（0 で無し） |
| `allyWaves` | 5 | s。何秒ごとに次の波を出すか（0 で次の波を出さない） |
| `allySpeed` | 2 | m/s。味方の進む速さ |
| `allyDeathRate` | 0.1 | 1人が1秒に倒れる確率（0 で誰も倒れない） |
| `planes` | 8 | 機。同時に飛ぶ飛行機の数（0 で無し） |
| `planeHeight` | 80 | m。飛行機の高さ |
| `planeSpeed` | 30 | m/s。飛行機の速さ |

## 6. 確認用の入口

- `?fps`: 直近1秒に描いたコマ数と、最後のコマが描いた物を画面の上に出す
- `?stats`: 最後のコマが描いた物（描く回数と三角形の数）を、0.1秒ごとにページのタイトルへ書く
- `?seed=<n>`: 乱数の種を入れる。確認用の入口は起動（`boot()`）のあとに読み込むので、種が効くのはそのあとに引く乱数だけ。起動時に作る屋外は乱数を使っていない
- `#view-field`: 起動時のカメラで止まった、空の屋外の絵にする
- `#view-scale…`: 寸法を見比べる試験コースを出す。`#view-scale` は全体を斜め上から、`#view-scale-<場所>`（`corridor`・`door`・`hall`・`step`・`ref`）はその場所を正面やや上から、`#view-scale-<場所>-tp` は機体の後ろからの三人称の構図。`?mech=<m>` は三人称の機体の高さ（既定 8）、`?ceil=<m>` は部屋の天井の高さ（既定 18）、`?radius=<m>` は当たり半径（既定 2）
- `#view-camera`: 三人称カメラを測る入口。試験コースを 8m の模型が道筋で歩き、カメラが追う。カメラの既定は `CAMERA_TUNE` を `scaleForMech` で 8m 用に戻した値。`?dist=14` のように `CAMERA_TUNE` の項目を URL の値で上書きでき（数値でない値は無視）、`?ceil=<m>` は部屋の天井（既定 18）、`?aim` は狙う距離と画角に固定、`?speed=<倍率>` は道筋の速さ（既定 1。測る数字はコマごと）
- `?drive` 付きの `#view-camera`: 模型をキーボードで動かす。W/S が前後、A/D が左右、Q/E か左右の矢印が向き、R/F か上下の矢印が pitch、Shift を押している間が狙う構図。道筋は使わない
- `#view-camera` の `window.sbCameraReport()`: 道筋の最初の1周を記録し終えると、コマ数・`pulled` のコマ数・`dist` の最小と平均・`shoulder` の最小・カメラが箱の中にあったコマ数・`screenFraction` の最小・平均・最大を、全体と区間（`corridor`・`door`・`hall`・`step`・`ref`）ごとに JSON の文字列で返す。まだなら `null`
- `#view-move`: 平らな地面で、4m の機体が歩く・跳ぶ・ブースト・滞空・着地・撃つ入口。W/S が前後、A/D が左右、Q/E か左右の矢印が向き、マウスのドラッグでも向き、Space がジャンプ（押した瞬間に跳び、空中で押し続けると滞空）、Shift がブースト、J かマウスの左ボタンが撃つ。`CAMERA_TUNE`・`MOVE_TUNE`・`FEEL_TUNE` の項目を URL の値で上書きでき（例 `?walk=9&boostFov=0`。数値でない値は無視）、`?feel=0` で演出（FOV・揺れ・ヒットストップ・砂煙）を全部切る。画面の左下に速さ・ゲージ・地上か・着地の硬直の残りを出す
- `#view-touch`: 同じ平らな地面で、タッチで機体を動かす入口。左 45% のスティックが移動、残りのドラッグが視点、`#btnFire`（メイン）が撃つ、`#btnFire2`（サブ）が押した回数だけ、`#btnJump`（ジャンプ）が押した瞬間に跳び、空中で押し続けると滞空、`#btnBoost`（ブースト）が押している間ブースト、`#btnLock`（ロック）が LOCK の表示を切り替える。ボタンの最初の配置は `src/data/touch.ts` の `TOUCH_DEFAULTS` のとおりで、右手側に寄せ、メインを少し大きくする。画面の上の「配置」で engine の配置の編集画面を開き、指で動かした座標と大きさを保存する。画面の左上に速さ・ゲージ・LOCK・押した回数・同時に触れた指の最大・「スティック＋視点＋メイン」と「スティック＋視点＋ブースト」が同時に効いた秒を出す。視点は `INPUT.look` が呼ばれた時刻から `LOOK_RECENT`（0.25 秒）以内なら使っていると数え、メインのボタンを押したままのドラッグも含める。画面の上の「結果」で、`window.sbTouchReport()` と同じ JSON（測った数字、ボタンの配置 `x`・`y`・`s`・`b`、画面の大きさと `devicePixelRatio`、`userAgent`）を出す
- `#view-play`: `#view-touch` と同じ画面を、PC ではキーボードとマウス、スマホではタッチで動かす入口。キーボードは W/S が前後、A/D が左右、マウスの移動と矢印キーが視点、Space がジャンプ（押した瞬間に跳び、空中で押し続けると滞空）、Shift がブースト、J かマウスの左ボタンがメイン（機関砲）、K かマウスの右ボタンがサブ（砲）、E がロック、Esc がロック解除。スマホではタッチのメインのボタンで機関砲、サブのボタンで砲を撃つ。PC では画面の下の真ん中に操作の一覧を出し、ポインタロック中は消す。`MOVE_TUNE`・`FEEL_TUNE` の項目と `?feel=0` は `#view-move` と同じく URL で上書きできる（`#view-touch` も同じ）
- `#view-fcs`: 平らな地面で、8体の動く的（止まる2・左右に往復2・円を回る2・近づいて離れる2）へ撃ち、FCS の3つの型を比べる入口。`?fcs=manual|soft|hard` で型を選び（既定はゲームで使う `soft`。表に無い値は既定にして画面に「無効な値」と出す）、`FCS_TUNE` の各項目を同じ名前で上書きできる（例 `?fcs=soft&cone=10&pull=30`）。`MOVE_TUNE`・`FEEL_TUNE` の項目と `?feel=0` も `#view-move` と同じく効く。`?move=still` で的を全部止める。画面の上の真ん中のボタンで型を切り替える（`?fcs=` を変えて読み直す）。照準は画面の真ん中の点と、`cone` が 0 より大きい型ではカメラの画角から出した円、円の中の的の角の印、`hard` の候補の進み具合の弧、捕まえた的の四角で出す。画面の左上に撃った数・当てた数・当たる率・倒した数・倒すまでの時間の平均・捕まえるまでの時間の平均を出し、`window.sbFcsReport()` が同じ数字を JSON の文字列で返す。測る数字は型ごとで、切り替えると 0 から
- `#view-script`: M1「強襲上陸」の台本をボタンで動かす入口。3D は描かず、屋外の画面に DOM を重ねる。左に今の目標・地図の印・カットシーンと残りの秒・旗・結果、下の真ん中に無線の帯（1行を最低 `RADIO_MIN_SEC` ずつ順に出す）、右に出来事を入れるボタン（`enter b-line`・`enter seawall-top`・各物の `destroyed`・`skip`）と時間の速さ（×1・×4）、右下に cue が発火した時刻と出来事のログを出す。毎フレーム `stepScript` を回し、`window.sbScriptReport()` が `fired`（cue → 時刻）と出来事の列を JSON の文字列で返す
- `#view-hud`: HUD の配置の見本を4案（A 四隅に散らす・B 下にまとめる・C 照準のまわりに寄せる・D A の配置に照準のまわりの細い計器を足す）で切り替えて見る入口。`#view-map` の浜のマップ（`buildMapScene`）を固定カメラで描き、機体の模型を置く。ゲームの状態にはつながず、見本の値（`src/dev/hud/plans.ts` の `HUD_SAMPLE`）で描く。`?plan=a|b|c|d`（既定 a）、`?cut=1`（カットシーンの帯）、`?touch=1`（タッチのボタンの輪）、数字キー 1〜4 で案を切り替える。`window.sbHudReport()` が各要素の矩形を JSON の文字列で返す。要素の値の多く（装甲・熱・弾数・武器の枠（メインとサブの2つ）・レーダー）と、カットシーン中の表示（無線以外を隠す）は仮であること
- `#view-map`: M1 の B トーチカ線と C 防波堤の手前のマップを歩く入口。`?src=hand|gen|edit` で手書き（`m1b-hand.ts`）・生成（`m1b-rules.ts`）・エディタが `localStorage` に保存したマップを選び（既定 `hand`、無いときは「保存されたマップが無い」）、`?seed=<n>` を生成の種にする。地面のタイルと物を `buildOutdoor`、目標を `buildTargets`、台本の場所を薄い枠、波の出る場所を小さな輪で描く。描き方は `src/view/world.ts` の `buildWorld` を使う。機体は `#view-play` と同じ入力で歩き、始まりは範囲の手前の真ん中。機体は物（`blocks` が真の物）と目標に入らず、斜めに当たると壁に沿って滑る（8章）。左上に種類ごとの物の数・目標の数・違反の一覧・描く回数と三角形の数を出し、`window.sbMapReport()` が同じ数字と機体の位置を JSON の文字列で返す
- `#view-fx`: M1 の B のマップ（手書き・生成・エディタが保存したもの）を機体で歩きながら、周りで戦闘が起きている迫力を試す入口。`?src=hand|gen|edit` で M1 の B の手書きのマップ・生成したマップ・エディタが `localStorage` に保存したマップを選び（既定 `hand`。`edit` で保存が無いときは「保存されたマップが無い」を出して空のマップで開く）、`?fx=0|1|2|3` で濃さを選び（0 は演出を全部切った見た目で、`mech=4` なら `#view-map` と同じ。1 は弱、2 は中、3 は強。既定 2）、`FX_TUNE` の各項目を同じ名前でさらに上書きできる（例 `?fx=3&pixel=0.4&tracers=6`）。`?seed=<n>` は場面の種。`?mech=<m>` は機体の高さ（3〜8m、既定は `MECH_TUNE.height` の 4）で、仮の模型を `mech/4` 倍にし、足元は地面に付けたままにする。機体は `#view-map` と同じく物と目標に入らず、斜めに当たると壁に沿って滑る。当たり半径は `?mech=` とつまみに比例する（`MECH_TUNE.radius` × `mech/4`。`?mechMove=0` でも比例し、`?mech=8` で 2m）。`?mechCam=0` はカメラの距離・肩・注視点の高さ・上への持ち上げ・狙うときの距離を、`?mechMove=0` は歩き・ブーストの速さと加速・ジャンプの初速を `mech/4` に比例させない（ジャンプの初速は `sqrt(mech/4)`。既定はどちらも比例）。`MOVE_TUNE`・`CAMERA_TUNE` は 4m 用で、`?mech=8` にすると SB-100 の前の 8m の値に戻る。物と歩兵の大きさは 8m の機体に合わせて決めたときのまま。機体の始まりは地図の手前の端から、`mech` に比例したカメラの距離＋4m 内側にして、カメラが地図の外に出ないようにする。味方の歩兵は海側から波で出て -z へ進み、倒れた人と抜けた人を数える。砲撃は機体のまわりの輪に落ちて閃光・破片・灰色の煙を出し、近いほどカメラを揺らす。残骸からは煙の柱が立ち、曳光弾が画面を横切り、飛行機が頭上を飛ぶ。地面には `stream('craters')` の種から散らした砲弾穴があり、`craterWater` の割合で水が溜まる（見た目だけで、地面の高さ・機体の歩き・当たり判定は変えない）。砲撃は `shellCrater` が 1 なら落ちた所に新しい穴を残し、`craterCap` を超えると古いものから消える。見た目は `pixel` の解像度と canvas の CSS の `filter`（`saturate`・`contrast`・`sepia`）と霧で作る。`light` はシーンの全部の光の強さに掛ける倍率、`sun` はそのうち `DirectionalLight` だけにさらに掛ける倍率、`groundColor` は地面のタイルの色（タイルごとの濃淡は残す）で、色は URL では10進の数値で上書きできる。煙の色は `smokeColor`・`smokeDark` で変えられる（URL のみ）。右上のつまみは `FX_TUNE` の主な値をスライダーで変え（歩兵の人数・煙の上限・穴の数と上限・穴の半径と水の割合は「やり直し」で作り直す）、`mech` のスライダーと `mechCam`・`mechMove` のチェックも置き、折りたためる。「書き出し」は今の値を JSON で `<textarea>` に出し、`window.sbFxReport()` が同じ JSON に機体の高さ・比例のありなし・歩きとブーストの速さ・描く回数・三角形の数・直近の fps を足して文字列で返す。左上に選んだ `src`・前進・倒れ・抜けの人数（戦場の歩兵が上限に当たっているときは「上限」も）・煙の塊の数と描く回数・三角形の数・fps を出し、`window.sbFxReport()` と書き出しの JSON にも `src` を出す。演出はゲームの状態に影響しない
- `#view-mapedit`: マップの簡易エディタ。上から見下ろすカメラで、ホイールかピンチで寄り・引き、右ドラッグか2本指で動かす。右の一覧で物の8種か目標の4種を選び、地面をクリックかタップすると置く。目標は `id` を一覧から選ぶ。置いた物はドラッグで動き、`R` か回転のボタンで15度ずつ回り、`Delete` か削除のボタンで消える。「手書き」「生成（種）」「空」から始められ、置くたびに `validateMapForMission` を回して違反を出し、通り道が無ければ赤くする。「書き出し」は JSON を `<textarea>` に出し、「読み込み」はその JSON を読む。編集は `localStorage` の `stormbreacher-dev-map` に保存し、`#view-map?src=edit` で歩ける
- `#view-outdoor`: 上陸戦の浜辺のような広い屋外（地面・障害物・トーチカ・防波堤・崖・歩く敵の機体）を種から作り、その重さを測る入口。開いて2秒たってから10秒のあいだ、フレームの間隔・描く回数・三角形の数を記録し、終わると画面の右上に大きく出す（下の `textarea` は同じ結果の JSON）。`window.sbBenchReport()` は終わっていればその JSON の文字列、まだなら `null`
  - `?chunk=<m>`: 区画の一辺（`0`・`16`・`32`・`64`。既定 `32`。`0` は区画に分けない）。`?chunkMin=<n>`: 区画に分ける種類の三角形の数の下限（既定 `3000`）
  - `?far=<m>`: 描く距離と霧の終わり（`80`・`120`・`160`。既定 `120`）。霧の始まりは `far × 0.4`
  - `?enemies=<n>`: 歩く敵の数（`0`・`10`・`30`・`50`。既定 `30`。`0` は `?mechs=` の比べ用）。`?mechDraw=group|instanced`: 機体の描き方（既定 `group`）
  - `?mechs=<n>`: 比べ用に、防波堤の前に横一列で置く機体の数（既定 `0`。歩かない）。`?density=<倍率>`: 障害物の多さ（既定 `1`）
  - `?cam=path|fixed`: カメラ（既定 `path`。`path` は海から防波堤まで歩いて折り返す、`fixed` は浜の中ほどで陸を向いて止まる）
  - スマホで開くときは `npx vite --port 8765 --host` で開発サーバーを立て、同じ Wi-Fi の端末から `http://<Mac の IP>:8765/games/stormbreacher/#view-outdoor` を開く

確認用の入口は開発サーバーでだけ読み込む（公開のビルドには入らない）。

## 7. 台本

ミッションの台本は「きっかけ → 動き」の行（cue）の並びで、`src/data/missions/<id>.ts` に置き、`src/logic/script.ts` が進める。台本は出来事を出すだけで、目標の文・無線の帯・地図の印・カットシーンはそれを読んで出す。`data/`・`logic/` は three も DOM も読まない。

- どの cue も1回だけ発火する。時刻は `dt` で進む台本の秒で、`Date.now()` や実時間は使わない
- 始まりからの絶対の時刻は書かない。場所か物で区切り、その中の間合いだけ `after` で付ける
- 迫撃砲・副砲の砲撃のような繰り返しは台本の動きにしない。敵や陣地の設定で持ち、台本は `spawn` と `flag` で始めたり変えたりする
- 乱数は使わない（M1 の台本に要らない）
- 種類は union 型と `Record<Kind, …>`。知らない種類や、一覧に無い id は `validateMission` が例外にする。無線の行のキーは `logic/` から言語ファイルを読めないので、テストで検査する
- きっかけが条件を満たした cue は、無くなるまで同じフレームで続けて発火する（`after … 0` のため）

### きっかけ

| `kind` | 形 | 意味 |
|--------|----|------|
| `start` | `{ kind: 'start' }` | ミッションの始まり。最初の `stepScript` で発火する |
| `enter` | `{ kind: 'enter', area }` | プレイヤーが場所に入った |
| `destroyed` | `{ kind: 'destroyed', targets, count? }` | 目標の物が壊れた。`count` を省くと全部、`count: 1` ならどれか1つ |
| `cleared` | `{ kind: 'cleared', wave }` | 出した波の敵が全部倒れた（M1 では使わないが、型と判定はある） |
| `after` | `{ kind: 'after', cue, sec }` | 別の cue が発火してから `sec` 秒後。`sec: 0` は同じフレームで続けて |
| `flag` | `{ kind: 'flag', name }` | 旗が立った（M1 では使わないが、型と判定はある） |

場所は四角で持つ（`{ x, z, w, d }`。中心と、x の幅・z の奥行き m）。

### 動き

| `kind` | 形 | 意味 |
|--------|----|------|
| `objective` | `{ kind: 'objective', id }` | 目標を書き換える |
| `radio` | `{ kind: 'radio', line }` | 無線の1行（言語ファイルのキー） |
| `spawn` | `{ kind: 'spawn', wave }` | 敵の波を出す（中身はマップの側で決める） |
| `ally` | `{ kind: 'ally', id, path, fate? }` | 味方の台本（出来事を出すだけ）。`fate` は `{ at, by }` |
| `cutscene` | `{ kind: 'cutscene', id }` | カットシーンに入る。`CUTSCENE_SEC` の秒だけ経つか、読み飛ばすまで、カットシーン中の状態にする |
| `checkpoint` | `{ kind: 'checkpoint', id }` | チェックポイント。台本の状態を深いコピーで残す |
| `flag` | `{ kind: 'flag', name }` | 旗を立てる |
| `map` | `{ kind: 'map', mark, on }` | 戦況の地図の印を出す・消す |
| `end` | `{ kind: 'end', result }` | ミッションの終わり（`result` は `'cleared'`） |

決まり:

- `CUTSCENE_SEC`（`src/data/script.ts`）は `landing` 10 秒・`wave2-sinks` 6 秒・`beach-held` 8 秒（仮の値）。カットシーンの中でも台本の時間は進み、`after` の秒は数える
- 無線が重なったら、順番に積んで1行ずつ出す。1行は最低 `RADIO_MIN_SEC`（3 秒）出す（画面の側の決まり）
- 報酬は扱わない。ミッションの終わりでまとめて決める

### M1「強襲上陸」の cue

| cue | きっかけ | 動き |
|-----|----------|------|
| `intro` | `start` | `cutscene landing` |
| `beach` | `after intro 0` | `objective reach-pillboxes`・`map wave2 on`・`spawn beach-mortar`・`ally buddy beach-run`（`fate { at: 'beach-mid', by: 'mortar' }`） |
| `pillboxes` | `enter b-line` | `objective break-pillboxes`・`spawn b-squad`・`radio m1.depot-hint` |
| `depot` | `destroyed depot` | `flag depot-down`・`radio m1.depot-down` |
| `cp1` | `destroyed pillbox-1, pillbox-2` | `checkpoint cp1` |
| `wave2-lost` | `after cp1 4` | `cutscene wave2-sinks`・`radio m1.wave2-lost`・`map wave2 off`・`objective take-seawall`・`spawn seawall-drop` |
| `seawall` | `enter seawall-top` | `checkpoint cp2`・`objective silence-battery`・`spawn battery` |
| `gun1` | `destroyed main-gun-1, main-gun-2`（どれか1つ） | `radio m1.gun1-down` |
| `shutter` | `destroyed main-gun-1, main-gun-2`（全部） | `flag shutter-open`・`objective hit-magazine` |
| `win` | `destroyed magazine` | `cutscene beach-held`・`end cleared` |

場所は仮の座標で、奥行き 480m・幅 200m のマップに置く（+z が海、A 波打ち際 z 120〜240、B トーチカ線 z −30〜120、C 防波堤 z −150〜−30、ボスは z −150 より陸側）。`b-line` は中心 z 135・奥行き 30（z 120〜150）、`seawall-top` は中心 z −90・奥行き 60（z −120〜−60）で、幅はどちらも 200。物は `depot`・`pillbox-1`・`pillbox-2`・`main-gun-1`・`main-gun-2`・`magazine`、波は `beach-mortar`・`b-squad`・`seawall-drop`・`battery`、目標は `reach-pillboxes`・`break-pillboxes`・`take-seawall`・`silence-battery`・`hit-magazine`、印は `wave2`、味方は `buddy`、道は `beach-run`。

### チェックポイント

- `checkpoint` は台本の状態を深いコピーで残す。コピーを取るのは、その cue の動きを全部当て終わってから（M1 の `seawall` は cp2 のあとに目標とボスを出すので、途中で取ると戻したときにどちらも出ない）。保存しない項目はチェックポイント自身だけで、前のチェックポイントを入れ子にしない
- `restoreCheckpoint` は最後のチェックポイントの深いコピーを返す。取った時点より後の cue は発火していない状態に戻る。戻した状態も同じチェックポイントを持つので、戻ったあとにまたやられても同じ所へ戻れる
- `checkpointReplay` は、戻したあとに画面を組み直す出来事（今の目標、出ている地図の印、出してまだ倒していない波）を返す。状態は出した波を `spawned` に持つ
- 報酬はチェックポイントで確定しない（ミッションの終わりでまとめて決める）

## 8. マップ

M1 の B トーチカ線と C 防波堤の手前（z −60〜170、x −100〜100）を、手書き・生成・簡易エディタの3つの作り方で同じ形のデータにする。決めるのは遊ぶ人と Claude で、どの作り方がよいかはこの仕様では決めない。

- `MapDef`（`src/data/types.ts`）は `id`・`bounds`（`minX`・`maxX`・`minZ`・`maxZ`）・`props`・`targets`・`spawns` を持つ。`bounds` の外は作らない
- `Prop` は `kind`・`x`・`z`・`yaw`・`scale`・`breakable?`。種類（`PropKind`）は `tile`（地面）・`hedgehog`・`block`・`bunker`・`seawall`・`cliff`・`crater`（低い凹み）・`wreck`（壊れた艇や車両）。`breakable: true` は「後で壊して突破できる物」の印で、今は色とエディタの切り替えだけで、壊す仕組みは G1 で作る
- `TargetPlace` は `id`・`kind`・`x`・`z`・`yaw`。種類（`TargetKind`）は `pillbox`・`depot`・`gun`・`magazine`。`spawns` は波の名前 → `SpawnPoint`（`x`・`z`）の一覧
- 物と目標の大きさは `src/data/props.ts` の `PROP_SIZE`（物）・`TARGET_SIZE`（目標）に置く。`PropSize` は `w`（x の幅）・`h`（高さ）・`d`（z の奥行き）・`blocks`（機体の通り道を塞ぐか）。物の大きさは高さ 8m・当たり半径 2m の機体に合わせて決めたときのまま。機体は今 4m・当たり半径 1m（`MECH_TUNE`）で、ジャンプの最高点は約 1m なので、対戦車障害物（3m）は跳んでも越えられない。描く形（`src/view/outdoor.ts`）も検査も当たりもこの表を読む。`breakable` の物は同じ形のまま色を少し赤っぽくし、種類ごとの `InstancedMesh` と描く回数は増やさない（`instanceColor`）
- 目標の体力は `TARGET_HP`（仮。`pillbox` 100・`depot` 60・`gun` 200・`magazine` 80。武器の表の威力で減り、トーチカは機関砲10発・砲2発で壊れる。SB-190 で決め直す）
- 手書きは `src/data/maps/m1b-hand.ts`。物は1行に1つ書き、数を数える関数は置かない。目標は `pillbox-1`・`pillbox-2`・`depot`、波は `b-squad`・`seawall-drop`
  - B は「三重の防御線」: z 128〜146・z 80〜96・z 8〜26 に、それぞれ対戦車障害物を3列（列の間 6m 前後、同じ列の中は 6.5m 前後、奇数の列は半分ずらす）。線1の突破口は x −55 と x 40、線2は x −10（ほかに壊せる区間 x 40〜60）、線3は x 61（ほかに壊せる区間 x −40〜−20）。突破口はどれも四角の間で 9m 前後、壊せる区間は幅 15m 前後。同じ列の中のすき間は 3.5m 前後あり、当たり半径 1m の機体は突破口でなくても列の間を抜けられる（線を詰めるのは SB-120）
  - C の手前（z −55〜−35）は2列で突破口が2か所。線の間には塊・残骸・クレーターの遮蔽物をそれぞれ 10〜12 個、線3の奥に6個ほど置く
  - 目標は `pillbox-1`（x −33, z −15）・`pillbox-2`（x 22, z −15）・`depot`（x 53, z 31）。`b-squad` はトーチカの後ろ（z −25〜−35）、`seawall-drop` は z −55。崖は右の辺のまま
- 生成は `generateMap(rng, rules, anchors)`（`src/logic/mapgen.ts`）。`MapRules` は帯（`minZ`・`maxZ`・`kind`・`count`・`minGap`）・防御線（`lines`）・右の辺の崖・目標のまわりの空き（`clear`、既定 10m）・道筋の帯（`lanes`）を持つ。目標と波の出る場所は物語に関わるので生成せず `anchors` で受ける。M1 の B の規則は `src/data/maps/m1b-rules.ts` の `M1B_RULES`（`lanes` は空で、通り道は防御線の突破口が決める）
- `MapLine` は `z`（線の真ん中）・`depth`（奥行き）・`rows`（列の数）・`kind`・`spacing`（同じ列の中の間隔）・`gaps`（突破口の真ん中と、四角の間の幅）・`breakable`（壊せる区間の真ん中と幅）を持つ。生成は列ごとに `spacing` で x に並べ、奇数の列を `spacing / 2` ずらし、位置を ±1m・向きと倍率（0.9〜1.1）を少し揺らす。`gaps` には四角が入らないように物を置かず、`breakable` の区間の物に `breakable: true` を付ける。帯の物は防御線の z の範囲には置かない
- 生成は物を置いたあと通り道を調べ、通れなければ種をずらして作り直す（最大10回。だめなら例外）。`rng` は `logic/rng.ts` の `stream('map')` から引く
- 簡易エディタは `#view-mapedit`（`src/dev/views/mapEdit.ts`）。編集は `localStorage` の `stormbreacher-dev-map` に保存し、`#view-map?src=edit` が読む。開発用なので保存キーは `src/dev/map/store.ts` に置く
  - 目標の id は最初「選んで」（空）で、空のまま目標を置こうとすると置かずに「id を選んで」と出す。すでにある id を選んで置くと、増やさずにその目標をクリックした所へ動かす
  - 物を選んでいるとき「壊せる」で `breakable` を切り替える。書き出しの JSON には `breakable: true` のときだけ出す
- `validateMapForMission(map, mission, skip)`（`src/logic/mapCheck.ts`）は違反の一覧 `{ kind, message }[]` を返す（例外にしない）。`skip` は範囲の外にある波と目標の名前
  - 台本の `targets` が全部マップにあり、マップにしか無い目標が無い。同じ id の目標が2つあれば `target-duplicate`。台本で `spawn` する波が全部 `spawns` にある
  - 物と目標が `bounds` の中にあり、目標どうしが 12m より近くない
  - 範囲の手前（`maxZ`）から奥（`minZ`）まで、当たり半径 `MECH_TUNE.radius`（1m）の機体が通れる道があるか。2m 四方の格子にして幅優先で調べ、`PROP_SIZE` の `blocks` が真の物と目標を、表の `w`×`d` に `scale` を掛け `yaw` で回した四角として避ける。`breakable` の物も今は塞ぐ物として避ける（壊せるようになるまでは突破口で通れること）。格子の点から四角までの距離が 1m より近ければ塞がれている。`crater` と `tile` は避けない。物が範囲の外に出ているかは中心で見る。`seawall` は登らない前提なので、防波堤の帯（z −75〜−65）は範囲の外（`minZ` −60）に置く
- 機体は、`mapBlockers`（`src/logic/mapShapes.ts`）が作る四角（`blocks` が真の物と全部の目標。表の `w`×`d` に `scale` を掛け `yaw` で回したもの。通り道の検査と同じ）から、当たり半径 `MECH_TUNE.radius` 以上離れた所に押し出される（`pushOutCircle` in `src/logic/collide.ts`）
- 押し出したあと、壁へ向かう速さだけを消し、壁に沿う速さは残すので、斜めに当たると滑る（`stepMech` in `src/logic/mech.ts`）。1歩は `MOVE_TUNE.maxStep` 以下に刻むので、ブーストでも薄い物を抜けない
- 高さを見る。物と目標の四角は上の面の高さ `top`（m）を持ち（`GroundRect.top`。`mapBlockers` が物は `PROP_SIZE` の `h` × `scale`、目標は `TARGET_SIZE` の `h` を入れる）、`top` の無い四角はどの高さからも越えられない壁になる。地面にいる機体は、足元から `MOVE_TUNE.stepHeight`（仮 0.75m）までの物には歩いて乗る。それより高い物は壁になり、押し出される。跳んでいる機体は、足より低い物の上を越えられ、その上に降りられる。物から歩いて外れると、その高さから地面へ落ちる。`breakable` の物も壊す仕組みができるまでは当たる
- 効くのは `#view-map` と `#view-fx`。平らな地面の入口（`#view-move`・`#view-touch`・`#view-play`・`#view-fcs`）の的には当たらない
- M1 の範囲の外（A 波打ち際・ボスの場所）と、物を壊す仕組み・防波堤を登る仕組みは作らない
