# STORMBREACHER 仕様

劣勢の戦線を、組み替えた機体で押し返す三人称のロボットアクション。今は試作（G0）を載せる器だけがあり、遊べる中身はまだ無い。

## 1. 位置づけ

- G0 の試作の器。空の屋外（地面・光・霧・大きさの目安の箱1つ）を3Dで描き、タイトルと「開発中」の札を出す
- トップページの一覧には出さない。ビルドには入るので、URL を知っていれば開ける。公開のビルドでもタイトルから出撃して遊べる（開発用の入口 `#view-…` は入らない）
- 一覧に出すまでは、検索エンジンに載らないよう `index.html` に `<meta name="robots" content="noindex">` を置く。一覧に出すとき（M1 ができたとき。D-03）に外す
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

`src/view/camera.ts` は三人称カメラの位置を決める純粋な関数で、`scene` も `camera` も触らない（カメラに書くのは `applyPose` だけ）。`aimRay` はカメラの位置から注視点への線（壁を考えない）を返し、本体の射撃の狙いになる。

`src/view/world.ts` はマップの描き方を本体と開発用の入口で共有し、`src/view/outdoor.ts` は地面と物、`src/view/shore.ts` は海と揚陸艇（8章）、`src/view/mechProxy.ts` は寸法の確認用の仮の模型を描き（開発用の入口だけが使う）、`src/data/colors.ts` は地面の砂と空と海の色を名前で持つ。`src/view/mechModel.ts` は機体を箱で描く関数で、ゲームの状態に触らず、形を共有した単位の箱を色ごとに `InstancedMesh` で描く（1体の描く回数は使った色の数）。動かすのは `animateMech`（5章「機体の動き」）で、状態と角度の計算は three を読まない `src/view/mechMotion.ts`、ゲームの状態からの入力は `src/view/mechDrive.ts`、脚の種類ごとの動きの値を作るのは `src/logic/mechTune.ts` の `moveTuneOf`。`src/data/mech.ts` は機体の部品の表（腕・脚・背中・FCS の4スロットと武器2、胴は4スロットの外の枠、箱は高さの割合、色は名前、値は仮）と M1 の固定の1組 `M1_MECH`（見本 E の部品: 胴 `medium`・腕 `midArms`・脚 `midLegs`・背中 `pack`・FCS `blockHead`）、その色 `M1_MECH_PALETTE`（色の名前ごとの16進数）、武器の大きさ `M1_WEAPON_SCALE` を持つ。`src/view/play.ts` は出撃中の画面を組み立てて描き（本体の機体は `buildMechVisual` で M1 の組・色・武器の大きさから高さ `MECH_TUNE.height` に描く。向きと位置はゲームの機体に合わせる。1体の描く回数は色の数の5）、`src/view/world.ts` の `syncWorld` が壊れた目標と壊れた物（`breakable` の物）を低く暗い姿にする。`src/view/hud.ts` は本体の出撃中の HUD を `HudModel` から描き、`src/view/hudParts.ts` は弧・丸いレーダー・点と円・照準の円の半径を持ち、`#view-hud` の見本と本体が同じものを使う。`src/data/colors.ts` は HUD の色（`HUD_COLOR`）も名前で持つ。

`src/data/looks.ts` はミッションごとの見た目の表（`LOOKS`・`lookOf`）と光の元の強さ（`BASE_LIGHTS`）を持つ。`src/view/look.ts` は解像度・色味・霧・空・光・地面の色をかけ、`#view-fx`・`#view-hud`・本体が同じ関数を使う。`src/view/field.ts` の光は半球1つ・太陽1つ（engine の光は外す）。`src/logic/planes.ts` は飛行機の動き（機体と関係なくマップの座標で往復）を持つ。`src/logic/battle.ts` は戦場の層の進行（歩兵の波と砲撃の予定。5章「戦場の層」）を、`src/view/battle/` はそれを読んで描く（本体と `#view-fx` が同じものを使う）。

`src/logic/mech.ts` は機体の歩く・跳ぶ・ブースト・着地を、状態を引数で受けて進める純粋な関数で、three も DOM も読まない。`src/logic/fire.ts` は正面への線が的の箱に当たるかを返す純粋な関数。`src/view/feel.ts` は動きの出来事からカメラの揺れ・FOV・ヒットストップ・砂煙を作る。

`src/logic/fcs.ts` は三人称の照準の線・機体の胸・的から、撃つ向きと `hard` が捕まえた的を決める純粋な関数。本体の射撃は `soft` を使う（`game.ts`）。撃つ向きは弾の出る所（機体の右腕の先）から照準の点へ向ける。`src/logic/dummies.ts` は `#view-fcs` の動く的の動きと当たりを、`src/view/reticle.ts` はその照準（点・円・候補の弧・捕まえた印）を DOM で描く。

`src/data/enemies.ts` は敵の表（`EnemyKind`・`ENEMY_KINDS`・`ENEMIES`・波の名前から出る敵の種類の並びを引く `M1_WAVE_ENEMY`・撃つ高さの割合 `ENEMY_CHEST`）、`src/logic/enemies.ts` は敵1体の状態 `EnemyState` と1フレームの動き `stepEnemy`（three も DOM も読まない純粋な関数。乱数は引数で受ける）、`src/view/enemies.ts` は敵を種類ごとに1つの `InstancedMesh`（描く回数は種類の数）で描く。敵の色は `src/data/colors.ts` の `ENEMY_COLOR`・`ENEMY_DOWN_COLOR`・`ENEMY_BULLET_COLOR`。

`src/data/hazards.ts` は迫撃砲の砲撃と地雷の表（`BarrageKind`・`BARRAGE_KINDS`・`BARRAGES`・波の名前から出る砲撃の種類を引く `M1_WAVE_BARRAGE`・地雷の `MINE_TUNE`）、`src/logic/hazards.ts` は砲撃と地雷の純粋な関数（`newBarrage`・`stepBarrage`・`stepShells`・`inCircle`・`mineStepped`。乱数は引数で受ける）、`src/view/hazards.ts` は着弾予告の輪と地雷の円盤を `InstancedMesh` 1つずつで描く。色は `src/data/colors.ts` の `SHELL_WARN_COLOR`・`SHELL_LAND_COLOR`・`MINE_COLOR`。

`src/data/battery.ts` はボス（沿岸砲台）の表（機銃の `GUN_TUNE`・機銃が動き出す波 `BATTERY_WAVE`・シャッターの `ShutterDef` と `M1_SHUTTERS`）、`src/logic/battery.ts` は機銃とシャッターの純粋な関数（`newBattery`・`newShutters`・`stepGun`・`shuttered`・`openShutters`。乱数は引数で受ける）、`src/view/seaFire.ts` は主砲が海を撃つ見た目、シャッターの板は `src/view/world.ts` が描く。詳しくは「ボス（沿岸砲台）」。

`src/data/pillbox.ts` はトーチカの表（`PILLBOX_TUNE`）、`src/logic/pillbox.ts` はトーチカの純粋な関数（`PillboxState`・`newPillbox`・`pillboxFront`・`pillboxMuzzle`・`stepPillbox`。乱数は引数で受ける）、`src/view/play.ts` は銃眼の予兆の光を `InstancedMesh` 1つ（名前 `sb-pillbox-warn`）で描く。色は `src/data/colors.ts` の `PILLBOX_WARN_COLOR`。詳しくは「トーチカ」。

`src/logic/script.ts` はミッションの台本を進める純粋な関数。`src/data/missions/m1.ts` に M1 の cue の並びと、場所・物・波・目標・印・味方・道の名前の一覧を置き、`src/data/script.ts` にカットシーンの秒と無線の最低表示時間を置く。

`src/logic/mapCheck.ts` はマップが台本と機体の大きさに合うかを調べる純粋な関数。`src/logic/mapgen.ts` は種と規則から物を並べる純粋な関数。M1 の B の手書きのマップは `src/data/maps/m1b-hand.ts`、生成の規則は `src/data/maps/m1b-rules.ts` に置く。

`src/logic/collide.ts` は平面で円を回った四角から押し出す純粋な関数で、engine へ移す候補なのでゲームのファイルを読まず、四角と半径を引数で受ける（規則 `sb-portable-no-game`）。関数は円を四角から押し出す `pushOutCircle`、点と四角の距離 `rectDistance`、2つの四角の最短距離 `rectGap`、円の下の高い面 `groundAt`。`src/logic/mapShapes.ts` の `mapBlockers` が `MapDef` から四角の一覧を作り、通り道の検査と機体の当たりがそれを読む。規則に入っているファイルは `src/logic/collide.ts`・`src/logic/mech.ts`・`src/logic/fcs.ts`・`src/logic/fire.ts`・`src/view/camera.ts`・`src/data/tuneTypes.ts` の6つで、機体・カメラ・FCS の調整の型は値と分けて `src/data/tuneTypes.ts` に置く（値は `src/data/tune.ts`）。

`src/logic/game.ts` は出撃の `GameModel`（機体・機体の装甲 `armor` と倒れた印 `downed`・マップ・目標の体力と向き（`yaw`）・トーチカの状態 `pillboxes`・壊せる物の体力（`breakables`）・敵 `enemies`・メインとサブの武器・FCS の状態 `fcs`・ソフトロックが狙いを寄せている目標か敵の id `aimTarget`・飛んでいる弾 `bullets`・始まった砲撃 `barrages`・落ちる前の着弾予告 `shells`・残っている地雷 `mines`・味方の機体 `allies`・台本の状態 `script`・最後の無線 `radio`・そのフレームの出来事）を持ち、`step(game, input, dt)` で入力から1フレーム進める。機体が歩き、FCS（`soft`）が照準の円の中の生きている目標と敵へ狙いを寄せ、メインとサブの武器が撃ち（`data/weapons.ts` の表の威力・射程・弾速・間隔・弾数）、敵が起きて歩いて撃ち（5章の「敵」）、トーチカが見える機体へ予兆のあとに連射し（5章の「トーチカ」）、弾が飛んで目標や敵に当たると体力が減って0で壊れる・倒れる。`step` は壊れた目標（`destroyed`）と入った場所（`enter`）を台本に渡し、波の敵が全部倒れたら `cleared` を台本に渡し、台本の時間を進め、台本の出来事を `script` の出来事として残す。出撃が終わる（`cleared`）のは台本の `end` が来たときだけ。`cleared` になったときカットシーンが流れていれば（M1 の `win`）、そのカットシーンが終わる（飛ばしも）まで `step` は動き続け（台本の時間も進む）、結果の画面は閉じのカットシーンのあとに出す（`step` in `src/logic/game.ts`、`update` in `src/app/play.ts`）。機体の装甲が 0 になる（`downed`）と `step` は何もしない（`cleared` のあと、閉じのカットシーンが終わってからも同じ）。台本の `spawn`（敵の波）は敵を出し、`ally`（味方）は味方の機体 `allies` を出す（5章「台本の味方の機体」）。`breakable` の物は撃つと体力が減って0で壊れ、機体の当たりと弾の箱から外れて通れるようになる。壊れた物は戻らない。壊れた物は出来事 `propDestroyed`（`prop` は `map.props` の添字）で知らせる。

`src/logic/hud.ts` は HUD に出す値（ブースト・装甲・メインとサブの弾数・台本の今の目標と数えている数 `objective`・最後の無線 `radio`・ソフトロックが狙いを寄せている目標か敵の体力 `enemy` とその箱 `lock`・レーダーの点・着弾予告の警告 `warning`）を `GameModel` から作る純粋な関数 `hudModel`。装甲は `armor / MECH_TUNE.armor`。熱は持たない。描くのは `view/hud.ts`。

- HUD の目標: `objective` は台本の今の目標 `game.script.objective` の言語キー `obj.<id>`。台本がまだ目標を出していないときは null で、何も出さない。数える目標だけ `count: { done, total }` を持ち、画面は「目標 トーチカを2基破壊 1/2」のように数を足して書く。どの目標が何を数えるかは `OBJECTIVE_COUNT` in `src/data/script.ts`（目標 id → 数える目標 id の列。`break-pillboxes` は `pillbox-1`・`pillbox-2`、`silence-battery` は `main-gun-1`・`main-gun-2`）。表に無い目標（`reach-pillboxes`・`take-seawall`・`hit-magazine`）は数を出さない。`total` はマップにある目標だけ、`done` はその中で体力 0 のもの。数える目標がマップに1つも無いときも数を出さない
- HUD の無線: `radio` は最後の無線 `game.radio` の言語キーで、無線が来てから `RADIO_MIN_SEC`（3 秒）の間だけ。その後は null
- ロック枠: `lock` は `enemy` と同じ相手の箱（目標は `box`、敵は `enemyBox` in `src/logic/game.ts`）。`enemy` が null のときは null

`src/app/touch.ts` は engine のスティック・視点のドラッグ・タッチのボタンを `MechInput` の形に変え、ボタンの配置の編集と、押した回数・同時に触れている指の数・動作が同時に効いた時間を測る。

- `src/app/keyboard.ts`: engine のキーの動作とマウスを読み、ジャンプとロックの押した瞬間、右クリックのサブ射撃を `MechInput` の形にする
- `src/app/input.ts`: タッチとキーボードを1つの `MechInput` にまとめる口。本番のゲームもここから読む
- `src/app/play.ts`: 出撃の開始（`startSortie`）・出撃中のシステム・結果の画面（`showResult`）と、タイトルから出撃へ進む入り口（`pressStart`・`continueSortie`・`syncTitle`）。中断と放棄でタイトルへ戻る `returnToTitle` もここ
- `src/app/pause.ts`: 一時停止のメニュー（`initPause`）。P・Esc・一時停止のボタンで `paused` にし、「再開」「中断」「放棄」を出す（2章「一時停止と中断」）
- `src/logic/suspend.ts`: 中断のスナップショットを作る `suspendOf` と、読み戻す `restoreSuspend`（純粋）。保存と読み出しは `src/app/storage.ts`（4章）
- `src/logic/input.ts`: タッチとキーボードの `MechInput` を合わせる純粋な関数（three も DOM も読まない）
- `src/app/briefing.ts`: 出撃の前のブリーフィング（`openBriefing`。2章「ブリーフィング」）。記号と時計は `src/logic/briefing.ts`、絵は `src/view/briefing.ts`、表は `src/data/briefings.ts`
- `src/app/skip.ts`: カットシーンを飛ばす要求（クリック・タップ・Enter・Space・Esc）を受け、`update` が1コマに1回取る（7章「カットシーンの演出」）

## テストの層

| 層 | 何を確かめるか | 動く場所 | project の名前 | 流し方 |
|----|----------------|----------|----------------|--------|
| unit | 純粋な関数1つ | node | `stormbreacher-unit` | `npx vitest run --project stormbreacher-unit` |
| integration | `logic/` を何フレームも回す | node | `stormbreacher-integration` | `npx vitest run --project stormbreacher-integration` |
| e2e | ページを起動する | Chromium | `stormbreacher-e2e` | `npx vitest run --project stormbreacher-e2e` |

E2E に書いてよいのは、画面か入力が無いと確かめられないものだけ。

## 2. 画面

- ページの要素: `<canvas id="gl">` の上に `<div id="sbApp">` を重ねる（`pointer-events:none`。一覧へ戻るリンクと出撃のボタンだけ `pointer-events:auto`）
- 全画面のボタン `#sbFs`: どの画面でも右上の隅（HUD のレーダーの上、タッチの層より手前）に出す。押すと全画面を切り替え（engine の `toggleFs`）、文字は「全画面」「全画面を終了」が今の状態に合わせて変わる。全画面にできないブラウザと、ホーム画面のアプリとして開いているときは出さない。押した後はフォーカスを外す（タイトルの Enter で出撃しないため。`src/app/fullscreen.ts`）
- 画面の状態は `src/app/screen.ts` の `GameState` と `src/data/states.ts` の `STATES` で持つ。`title`（タイトル）・`briefing`（ブリーフィング）・`play`（出撃中）・`paused`（一時停止）・`result`（結果）の5つで、`playing` は `play` のときだけ true
- 状態は `setState` でだけ書き換え、遊んでいるかは `isPlaying()` で見る。状態の名前を直に比べない

| 状態 | playing | 意味 |
|------|---------|------|
| `title` | false | タイトル画面 |
| `briefing` | false | 出撃の前のブリーフィング（下の「ブリーフィング」） |
| `play` | true | 出撃中 |
| `paused` | false | 出撃の一時停止（メニューが出ている。`step` は進まない） |
| `result` | false | 結果の画面 |

画面はタイトル → ブリーフィング → 出撃 → 結果と進む。タイトルの「出撃」（`#sbStart` のクリックか Enter）でブリーフィングが出て、そこを抜けると `play` になり、M1 の B のマップで機体を歩かせて撃ち、目標を全部壊すと `result` の画面（所要時間・報酬の内訳・所持金と「タイトルへ」）になる。内訳は「報酬と所持金」（4章）。「タイトルへ」は今は `location.reload()` で戻る。出撃の見た目は `src/data/looks.ts` の `LOOKS` から決まる。出撃中は D 案の HUD（目標・敵の体力・レーダー・照準の円に沿った装甲とブーストの弧・メインとサブの弾数）が出る。装甲の弧は `armor / MECH_TUNE.armor`（数字なし）。熱は出さない。出撃中の HUD は左上に目標、下の真ん中に最後の無線（`RADIO_MIN_SEC` の間だけ。ラベルは `hud.radio`）を出し、ソフトロックが狙いを寄せている相手がいる間は、その相手を囲む四隅の鉤形の枠（ロック枠。色は `HUD_COLOR.lock`）を毎フレーム出す。枠の位置は、相手の箱の8隅をカメラで画面に投影した外接四角（`screenRect` in `src/view/camera.ts`。四角は画面の内側に切る。箱の隅がカメラの後ろにあるとき、または四角が画面の外にあるときは null で、枠を出さない）に、4px の余白を足したもの。枠は HTML で HUD と同じ層（`#sbPlayHud` の中、`data-hud="lock"`）に描く（`lockFrame` in `src/view/hudParts.ts`）。機体が着弾予告の円の中にいる間だけ、照準の円の上の真ん中に警告（`hud.warn.shell`。赤い文字）を出す。値の出し方は `src/logic/hud.ts`。色と主張は仮。

### ブリーフィング

出撃の前に、上から見た地図と1行ずつの文で作戦を告げる画面（`briefing`）。画面は `src/app/briefing.ts`、地図の絵は `src/view/briefing.ts`、地図の記号と時計は `src/logic/briefing.ts`（純粋）、行と時間割の表は `src/data/briefings.ts`（型 `BriefingLine`・`BriefingSymbol` は `src/data/types.ts`）、色は `BRIEFING_COLOR` in `src/data/colors.ts`。声はなし。

- 入口: タイトルの「出撃」（`pressStart` in `src/app/play.ts`）だけ。中断があるときの確認（2回押し）を済ませたあとで開く。「続きから」とやり直し（チェックポイントから・最初から）では出さない。出撃（`startSortie`）はブリーフィングを抜けたときに呼ばれ、そのあと導入のカットシーン（`landing`）が流れる
- 流れ:
  1. 開くと `#sbApp`（タイトル）を隠して `#sbBriefing` を出し、`briefing` にする。時計は 0 から `update`（システム `sb-briefing`）で進む
  2. 行は表（`M1_BRIEFING`）の `at` の秒に1行ずつ左から積まれ、最新の行だけ明るく出る。行が出ると、その行の `show` の記号が地図に出る
  3. 最新の行が出した記号は点滅し、前の行の記号は点いたままになる。矢印は出てから `BRIEFING_TUNE.arrowSec` 秒かけて尾から頭へ伸びる
  4. 全部の行が出ると「出撃」（`#sbBriefingGo`）が出て、「飛ばす」（`#sbBriefingSkip`）が消える
- 操作: タップ・クリック（ボタン以外）・Enter・Space で次の行がすぐ出る（時計がその行の `at` になる）。全部出たあとの同じ操作か「出撃」で出撃へ進む。Esc か「飛ばす」はいつでも出撃へ進む。開いたときの押下（タイトルの「出撃」のクリックと Enter）は数えない（`event.timeStamp` が開いた時刻より前のものは捨てる）。キーは capture 段階で受けて止める（同じ Esc が出撃を一時停止にしないため）。ボタンにフォーカスがあるときの Enter・Space はボタンのクリックとして1回だけ数える
- 行の表（`M1_BRIEFING`）: 一巡は約 15 秒（最後の行の `at` + `holdSec`）。`at` は 0 から増えていく

| キー | `at`（秒） | 出す記号 | 文（ja） |
|------|-----------|----------|----------|
| `briefing.goal` | 0 | `battery` | 沿岸砲台を黙らせ、突破口を開く |
| `briefing.enemy` | 3 | `pillboxes`・`squad` | 浜にトーチカと迫撃砲陣地がある |
| `briefing.wave1` | 6 | `wave1` | 第1波の機体と共に上陸する |
| `briefing.wave2` | 9 | `wave2` | 第2波が後に続く |
| `briefing.depot` | 12 | `depot` | 右手に敵の弾薬集積所がある。潰すと砲撃が弱まる |

- 地図: 手書きマップ（`M1B_HAND`）の範囲を canvas に上から描く。上が陸（−z）、下が海（+z。前の縁から `seaMargin` m 分の海も描く）。`briefingMap(map, path)` が `MapDef` から次を作る（座標を手で写さない）
  - 地面の点: 防風杭・防波堤・崖の props（`BRIEFING_TERRAIN_KINDS`）
  - `site`: マップの目標1つにつき四角1つ。記号は `BRIEFING_TARGET_SYMBOL`（トーチカ → `pillboxes`、集積所 → `depot`、主砲と弾薬庫 → `battery`）
  - `dot`: 波 `b-squad`（`M1_BRIEFING_SQUAD_WAVE`）の出る場所。記号は `squad`。マップに迫撃砲陣地の場所は無いので、敵の行ではこの点で敵の居場所を示す
  - `arrow`: `wave1` はミッションの道 `beach-run`（`M1_BRIEFING_WAVE_PATH`）の前に、海の側の尾（前の縁から `waveStartGap` m 沖）を足したもの。`wave2` は `wave1` の最初の `wave2Points` 点を x に `wave2ShiftX` m ずらしたもの（後ろの艇）
- 崩れる作戦（柱2）: ブリーフィングは第2波が後に続く予定を見せる。作戦が崩れて第2波の艇が沈んだときは、台本の cue `wave2-lost` の無線 `m1.wave2-lost` で伝える（7章）。ブリーフィング側に出撃中の表示は無い
- 数値: `BRIEFING_TUNE` in `src/data/briefings.ts`（`holdSec`・`arrowSec`・`blinkHz`・`seaMargin`・`waveStartGap`・`wave2ShiftX`・`wave2Points`）
- テスト: `test/unit/briefing.test.ts`（表・地図の記号）、`test/e2e/briefing.test.ts`（画面と操作）

### 一時停止と中断

出撃を止めて、あとで続けられる（中断）か、やめる（放棄）ための仕組み。画面は `src/app/pause.ts`、中断と放棄の中身は `suspendSortie`・`abandonSortie`・`returnToTitle` in `src/app/play.ts`、保存は 4章。

- 止める: 出撃中（`play`）に P か Esc（`PAUSE_KEYS` in `src/data/keys.ts`）、または左上の「一時停止」（`#sbPauseBtn`。HUD の目標の上、右上の全画面のボタンと重ならない）で `paused` になる。ポインターロックは外す（Esc でロックが外れたときも一時停止）。`paused` の間は `sb-play` のシステムが走らず、`step` も時計も進まない
- カットシーンの間の Esc は飛ばしが先で、止めない（P は止める）。止めている間に来た押し込みとメニューのクリック（`data-noskip` の要素）は飛ばしの要求に数えず、再開のときに溜まった要求も捨てる
- メニュー（`#sbPause`。タッチの層より手前）: 「再開」「中断」「放棄」。再開は `play` に戻り（ボタンのときは PC でポインターロックを取り直す）、P か Esc でも戻る
- 中断: 今の `GameModel` を `SUSPEND_KEY` に書き（4章）、タイトルへ戻って「続きから」（`#sbContinue`）を出す
- 放棄: 押すと確認に変わる（「放棄する（報酬なし）」`#sbAbandonYes` と「やめる」`#sbAbandonNo`。確認の間の Esc は確認を閉じる）。確定すると中断（あれば）も消してタイトルへ戻る。報酬もセーブも書かない
- タイトルの「続きから」: 中断があるときだけ出す。押すと中断から `GameModel` を組み直し（`beginPlay`）、中断を消す。同じ中断から2回再開できない
- タイトルの「出撃」: 中断があるときは1回目の押下で文字が「出撃する（中断を消す）」に変わり、2回目でブリーフィングを開く（ブリーフィングを抜けて出撃を始めると中断は消える）。Enter も同じ。ボタンにフォーカスがあるときの Enter はボタンのクリックとして1回だけ数える
- タイトルへの戻り方: 中断・放棄はページを読み込み直してタイトルに戻る（結果の「タイトルへ」と同じ）。読み直さないと、出撃の見た目（光・色の膜・霧・地面の色）がタイトルの地面に残って白く飛ぶため。中断はセーブにあるので、読み直したタイトルに「続きから」が出る。e2e はテストの途中でページを読み直せないので、`titleReturn.reload` を切ってページの中で戻す（`returnToTitle` in `src/app/play.ts`）

機体の装甲が 0 になる（`downed`）と、`src/app/play.ts` の `update` が結果の画面（`showResult`）へ移す。見出しは、やられたときが `result.downed`（「やられた」/ Downed）、台本の終わりのときが `result.title`（「突破」/ Breakthrough）。どちらも所要時間と「タイトルへ」が出る。やられたときだけ、さらに「チェックポイントから」（`#sbResultCheckpoint`。チェックポイントがあるときだけ）と「最初から」（`#sbResultRestart`）が出る。台本の終わりのときは出ない。押すと、`beginPlay`（`startSortie` と同じ片付けと組み直し）で新しい `GameModel` を描き直し、結果の画面を消して `play` に戻る。やり直しの中身は 7章「チェックポイント」。

結果の画面はタッチの層（`#touch`）より上（z-index 6）に出し、出すときに `#touch` を隠す（スマホでボタンを押せるように）。

## 3. 乱数

- 乱数は `src/logic/rng.ts` の1つの口からだけ引く。ほかで `Math.random` を呼ばない
- `rng()`: 全体の乱数。`seed(n)` で種を入れると、同じ種からは同じ並びになる
- `stream(name)`: 要素ごとの専用の乱数列。`field`・`fcs`・`dummies`・`map`・`craters`・`battle`（戦場の層の歩兵の波と砲撃の予定）・`shots`（機体の弾の散らし）・`enemies`（敵の弾の散らし）・`mortar`（迫撃砲の狙いのずれ）・`battery`（砲台の機銃の散らし）・`pillboxes`（トーチカの弾の散らし）がある。種を入れると、種と `STREAM_SALT[name]` を混ぜた種から始まる
- 種を入れていないときは、どれも `Math.random` から引く

## 4. セーブ

- 保存キー: キャンペーンの進みは `SAVE_KEY = 'stormbreacher-v1'`、設定（言語）は全モード共通で `SETTINGS_KEY = 'stormbreacher-settings'`、タッチのボタンの配置は `TOUCH_LAYOUT_KEY = 'stormbreacher-touch-layout'`
- `SAVE_VERSION = 2`。形を変えたら版を上げ、`MIGRATIONS` に `[to, migrate]` を足す。1 → 2 は `funds` を `ECONOMY.startFunds` で作る
- `SaveData` は `v`・所持金 `funds`（cr）と `records.missions` を持つ。`MissionRecord` は `cleared` と `bestSec`（秒、無ければ null）
- 古いセーブは `v`（無ければ 0）から今の版まで `MIGRATIONS` を順に流す。読むのは `initSave()`（起動時）で、モジュールの読み込み時には読まない
- 中断のスナップショット: 一時停止の「中断」で `SUSPEND_KEY = 'stormbreacher-suspend'` に1つだけ書く（キャンペーンの進みとは別のキー）。形は `SuspendData`（`v`・`map` と `mission` の id・`game`・`checkpoint`）で、`SUSPEND_VERSION = 3`（3: トーチカの待ちと予兆を保存する）。定義場所は `suspendOf`・`restoreSuspend` in src/logic/suspend.ts、読み書きは `loadSuspend`・`writeSuspend`・`clearSuspend` in src/app/storage.ts
  - 深いコピー（`structuredClone`）で、保存しない項目を名前で並べる形: `events`（そのフレームの出来事）・`bullets`（飛んでいる弾）・`shells`（落ちる前の着弾予告。チェックポイントと同じく持ち越さず、再開で消える）。`map` と `mission` は id で持ち、読むときに `MAPS`・`MISSIONS` の表から引き直す。`checkpoint` は `map`・`mission` を除いた形で一緒に保存し、再開したあとにやられてもそこからやり直せる。`GameModel` に項目を足すと、保存しない項目に書かない限り保存される（読み込みの検査表 `GAME_SHAPE` が項目の抜けを型で知らせる）。トーチカの状態 `pillboxes`（待ち・予兆・連射）も保存する
  - 読み込み: 版が違う・JSON として壊れている・map や mission の id が表に無い・項目の型が違うときは捨てて（キーを消す）、「続きから」を出さない。例外では落ちない
  - 再開すると中断のキーを消す。報酬を判定する粒度（クリア1回）より前に保存し、再開した出撃のクリアで1回だけ書くので、同じ中断から報酬を二重に取れない。やり直しの回数 `retries` も保存するので、再開しても費用と戦果は中断しなかったときと同じ
- 書くのはクリアしたときだけ（`recordClear` in src/logic/save.ts を結果画面の `settle` in src/app/play.ts が1回呼ぶ）。やられた・やり直しでは書かない。同じ結果画面で `showResult` を2回呼んでも、二重には足さない。報酬を判定する粒度（クリア1回）にそろえてある

### 報酬と所持金

クリアしたときに結果画面で報酬をまとめて計算し、所持金に足す。出撃からクリアまでお金は動かさず、所持金から引くこともない。単位は cr（仮）。値は全部仮。定義場所は `ECONOMY`・`MISSION_ECONOMY`・`AMMO_COST`・`M1_MECH_REPAIR_FULL`・`DEPOT_FLAG` in src/data/economy.ts（表）、`payoutOf`・`Payout` in src/logic/economy.ts（式。純粋）。

- 式: 手取り = 基本報酬 ＋ 戦果 − 弾薬費 − 修理費 − やり直しの費用 × やり直した回数。`ECONOMY.rewardFloor`（0）を下回ったら 0
- 値: `startFunds` 0、`rewardFloor` 0、`roundTo` 10。M1 の `baseReward` 10,000、`parTimeSec` 720
- 戦果は3つで、撃破の数は入れない。クリアの時点の状態から1回だけ数えるので、チェックポイントを何度通っても増えない
  - `depot`（2,000）: 弾薬集積所を壊した（台本の印 `depot-down` が立っている）
  - `par`（1,000）: ゲームの中の時計 `time` が `parTimeSec` 以内
  - `noRetry`（1,000）: `retries` が 0
- 弾薬費: メインとサブの武器の `AMMO_COST` の合計（機関砲 500、重い砲 300。M1 は 800）
- 修理費: `M1_MECH_REPAIR_FULL`（1,500）× 失った装甲 ÷ `MECH_TUNE.armor`（クリアした出撃の分）を `roundTo` に丸めたもの
- やり直しの費用: 1回につき 弾薬費 ＋ `M1_MECH_REPAIR_FULL`（M1 は 2,300）。チェックポイントからも最初からも1回と数える
- 初回だけ: そのミッションを前にクリアしていなければ（`records.missions[id].cleared`）手取りを `funds` に足す（`Payout.credited`）。2回目からも内訳は出すが、足さない
- 結果画面（`#sbResultPay`。クリアのときだけ。やられたときは出さない）: 基本報酬・取れた戦果だけ・弾薬費・修理費・やり直しの費用（やり直した回数があるとき、回数つき）・手取り・所持金。足さないときは「所持金には足さない」（`result.noCredit`）。数は桁区切り（`toLocaleString`。言語に合わせる）

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

`src/data/looks.ts` の `BASE_LIGHTS` はシーンの光の元の強さ。`hemi` 1.9（半球の強さ）・`sun` 1.25（太陽の強さ）・`sky` 0xe6f7ff・`ground` 0x4c4942（半球の上の色と下の色）・`sunAt` [24, 50, 16]（太陽の位置）。合計の元は engine の半球 1.0・太陽 0.45 と `src/view/field.ts` の半球 0.9・太陽 0.8。

機体そのものの大きさは `MECH_TUNE`（D-24: 高さ 4m）。下の `CAMERA_TUNE`・`MOVE_TUNE` はこの高さを基準に書く。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `height` | 4 | m。機体の高さ |
| `radius` | 1 | m。地面での当たり半径。機体と物の当たりと通り道の検査が使う |
| `chestHeight` | 2.5 | m。撃つ弾が出る、足元からの高さ。FCS の「胸」もこの高さ。敵が狙う機体の胸もこの高さ |
| `muzzleSide` | 0.9 | m。弾の出る所（武器を持つ右腕の先）の、機体の中心から右への距離。見た目の右腕（`data/mech.ts` の腕の `mount`）と大きくずれず、半径（`radius`）の内に収める |
| `muzzleForward` | 0.4 | m。弾の出る所の、機体の中心から前への距離 |
| `armor` | 200 | 機体が倒れるまでに受けるダメージ（仮）。0 になると `downed` |
| `fadeDist` | 3.5 | m。カメラと機体の胸（足元から `chestHeight`）の距離がこれより近いとき、機体を半透明にする |
| `fadeOpacity` | 0.35 | 半透明のときの不透明度。遠ざかると 1 に戻る |

半透明は、壁で寄ったカメラに画面を埋められないための決まり。`setMechOpacity`（`src/view/mechModel.ts`）が機体の材質の `transparent` と `opacity` を切り替えるだけなので、描く回数は変わらない。毎フレーム、カメラを置いたあとに距離を測る（`drawPlay`）。
出撃の値は `PLAY_TUNE`（SB-115）。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `startMargin` | 4 | m。機体が始まる位置の、マップの手前の端からの距離 |

HUD の値は `HUD_TUNE`（SB-160）。値は仮。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `radarRange` | 200 | m。レーダーの見える距離。これより遠い目標は描かない |

武器は表 `data/weapons.ts` の `WEAPONS`（`Record<WeaponId, WeaponDef>`）に置く。値はどれも仮で、SB-140 の2枚目と遊んで詰める。熱は持たない（2026-11-12 の決定）。

| 武器 | `damage` | `range` | `speed` | `interval` | `ammo` |
|------|----------|---------|---------|------------|--------|
| メイン `autocannon`（連射の機関砲） | 10 | 120 m | 400 m/s | 0.125 s | 400 |
| サブ `heavyGun`（単発で重い砲） | 60 | 180 m | 250 m/s | 1.2 s | 12 |

M1 は組み替え無しの1組（`M1_LOADOUT`）で、出撃ごとに `ammo` の弾を積み、撃ち切ると撃てない。撃つ間隔は `logic/weapons.ts` の `stepWeapon` が決め、`wait` の残りを次のフレームへ持ち越すので、フレームの長さで連射の速さは変わらない。

本体の射撃は、速さのある弾を飛ばす（`shoot`・`flyBullet` in `src/logic/game.ts`）。
- 撃つ: 1発ごとに、弾の出る所（`muzzleOf` in `src/logic/game.ts`。機体の中心から右へ `muzzleSide`・前へ `muzzleForward`、高さは足元から `chestHeight`）から `spreadDir(fcs.shotDir, FCS_TUNE.soft.spread, stream('shots'))` の向きへ弾 `Bullet`（`weapon`・位置・向き `dx dy dz`（長さ1）・射程の残り `left`）を出す。出来事 `shot`（位置・向き・`weapon`）を残す
- 狙い: `step` は、入力の `aim`（カメラの狙いの線。無いときは胸から機体の向きへ水平な線）と、生きている目標（`fcsTargets`。id は `game.targets` の番号、中心は箱の真ん中）で `stepFcs(game.fcs, 'soft', FCS_TUNE.soft, …)` を回す。照準の円（`FCS_TUNE.soft.cone`）の中の目標へ狙いが寄り、その目標の id が `game.aimTarget` になる（無ければ null）。本体は `aimRay`（`src/view/camera.ts`）でカメラの線を作り、`src/app/play.ts` の `update` が `step` に渡す
- 照準の点: ソフトロックが寄せている相手がいないとき、弾は照準の点へ向かう。照準の点は、カメラの狙いの線が、物の箱（`game.propBoxes`）・壊れていない目標の箱・生きている敵の箱・地面（y = 0）のうち最初に当たる点で、`FCS_TUNE.soft.range` の内に当たらなければ、線を `range` 延ばした点。カメラの線の上で、弾の出る所より手前の当たりは数えない。弾はカメラより右の腕の先から出るので、照準の点へ向けないと近くの壁で照準から横にそれる。`manualDir` in `src/logic/fcs.ts`（`fcs.ts` はゲームの表を読まないため、物と敵と地面は `stepFcs` の引数 `world`（`FcsWorld`）で受ける。`world` が無い `#view-fcs` は的の箱だけを見る）。寄せている間は、寄せた向きのまま
- 進む: 1フレームに min(`speed` × dt, `left`) m 進む。その区間で、生きている目標の箱・物の箱（坂は面に沿った段の箱。`rectBoxes`）・地面（y = 0。下向きの弾だけ）のうち一番手前で止まる。止まった所で出来事 `hit`（位置・`weapon`・`target`（目標の id か null）・`prop`（`map.props` の添字か null）・`enemy`・`mech`・`deflected`（トーチカの正面に弾かれたか。ほかは false）。地面は `target` `prop` `enemy` が null で `mech` は false）を残して弾を外す。止まらなければ `left` を減らし、0 以下で黙って消える
- 当たったあと: 目標は体力が減って 0 で `destroyed` を残して台本に渡す。トーチカの体力は、正面から（`pillboxDamageMul` の倍率 1 未満）は `PILLBOX_ARMOR.frontMul` = 0.25 倍だけ減り、横・後ろからは `sideMul` = 1 倍そのまま減る。ほかの目標は 1 倍。物は `damageProp` が体力を減らす。撃ったフレームの弾も同じフレームで進み、途中で壊れた目標や物には、あとの弾は当たらない
- 表示: `src/view/play.ts` は飛んでいる弾を `THREE.LineSegments` 1つ（最大 `MAX_BULLET_LINES` = 96 本。超えた弾は飛ぶが描かない）で、弾の頭から後ろへ `TRACER_LENGTH` = 4m の線として毎フレーム描く（色は `TRACER_COLOR`）。`hit` の起きた所に `HIT_DUST` = 3 の砂ぼこりを出し（`deflected` は火花。5章「トーチカ」）、`shot` で撃った手応え（`fire`）を出す
- 物と壊れる物: 弾は物で止まり、物の向こうの目標には当たらない。壊せる物（`breakable`）は体力が 0 で壊れ、当たりと弾の箱から外れる。ほかの物は壊れない
- 弾は4種類で、型 `Bullet = MechBullet | EnemyBullet | BatteryBullet | PillboxBullet`（`weapon` を持つのが機体の弾、`enemy` を持つのが敵の弾、`gun`（撃った主砲の目標 id）を持つのが砲台の弾、`pillbox`（撃ったトーチカの目標 id）を持つのがトーチカの弾。`isEnemyBullet`・`isBatteryBullet`・`isPillboxBullet` で絞り、敵の弾・砲台の弾・トーチカの弾をまとめて `isHostileBullet` で絞る）。速さと威力は `bulletSpec` が `WEAPONS`・`ENEMIES`・`GUN_TUNE`・`PILLBOX_TUNE` の表から引く
  - 機体の弾: 物・生きている目標・生きている敵・地面のうち一番手前で止まる。敵の箱は x z が ± `radius`、y が 0〜`height`。敵に当たると体力が減り、0 で出来事 `enemyDown`（`id`・`x`・`z`）を残す。`hit` の `enemy` は敵の id
  - 敵の弾・砲台の弾・トーチカの弾（`isHostileBullet`。以下は「敵の弾」と呼ぶ）: 物・機体・壊れていない目標・地面のうち一番手前で止まる。機体の箱は x z が ± `MECH_TUNE.radius`、y が足元から `MECH_TUNE.height`。目標は壁として弾を止めるだけで体力は減らない（トーチカの奥の敵がトーチカ越しに撃たないため）。敵には当たらず、物を壊さない。`hit` の `weapon` は null、機体に当たると `mech` が true
  - トーチカの弾: 型 `PillboxBullet`（`pillbox` に撃ったトーチカの id）。速さ `PILLBOX_TUNE.bulletSpeed`、威力 `PILLBOX_TUNE.damage`、飛ぶ距離 `PILLBOX_TUNE.range`。扱いは敵の弾と同じ（機体・物・壊れていない目標・地面で止まり、機体に当たると装甲が減って `damaged` を出す）
  - 機体に当たる（`damageMech`）: 装甲が弾の威力だけ減り、出来事 `damaged`（`amount`・`fromX`・`fromZ`。`fromX` `fromZ` は機体から見た、弾が来た側の地面の単位ベクトル）を残す。装甲が 0 になると `downed` を1回残し、`GameModel.downed` が true になる
  - 見た目: `src/view/play.ts` は敵の弾と砲台の弾を機体の弾とは別の `THREE.LineSegments` 1つ（最大 `MAX_BULLET_LINES` 本、色 `ENEMY_BULLET_COLOR`）で描く。`damaged` で `feelDamage`（`FEEL_TUNE.damageShake`）の揺れを足す。`enemyDown` は `destroyed` と同じに「倒した」手応え（ヒットストップ）を出す

### 敵

敵は `src/data/enemies.ts` の表 `ENEMIES`（`Record<EnemyKind, EnemyDef>`）に置く。値はどれも仮。種類は3つ: `grunt`（射撃。今の量産機）、`assault`（突撃。速くて柔く、近くまで詰めて撃つ）、`heavy`（重装。遅くて硬く、遠くから間隔の長い重い1発）。

| 項目 | `grunt`（射撃） | `assault`（突撃） | `heavy`（重装） | 単位・意味 |
|------|-----------------|-------------------|-----------------|------------|
| `hp` | 40 | 20 | 120 | 体力。射撃は機関砲4発・砲1発、突撃は機関砲2発、重装は機関砲12発・砲2発で倒れる |
| `height` | 3 | 2.4 | 3.5 | m。高さ。重装は射撃より高く自機 4m より低い |
| `radius` | 0.75 | 0.6 | 0.75 | m。当たりの半径（箱は `radius` の2倍四方で、高さは `height`） |
| `speed` | 3.5 | 6.5 | 2.2 | m/s。歩く速さ。突撃は自機の歩き 7.5 に近い |
| `notice` | 120 | 120 | 120 | m。この距離に機体が入ると起きる |
| `stopDist` | 25 | 4 | 35 | m。ここまで近づき、機体への線が通っていれば歩くのをやめる（線が通らない間は止まらない） |
| `fireRange` | 80 | 30 | 100 | m。機体がこの中にいると撃つ。弾の射程もこれ |
| `fireInterval` | 1.5 | 1 | 3.5 | s。撃つ間隔 |
| `damage` | 4 | 3 | 12 | 1発が減らす機体の装甲 |
| `bulletSpeed` | 150 | 150 | 130 | m/s。弾の速さ |
| `spread` | 3 | 5 | 2 | 度。撃つ向きのずれ |

`ENEMY_CHEST` = 0.7 は、敵が撃つ高さの、高さに対する割合。

波ごとの配分（`M1_WAVE_ENEMY`。種類は `map.spawns[波]` の順に並べる）:

| 波 | 出る数 | 種類（`map.spawns` の順） |
|----|--------|---------------------------|
| `b-squad` | 6 | `heavy`・`assault`・`grunt`・`grunt`・`assault`・`grunt` |
| `depot-guard` | 3 | `assault`・`heavy`・`grunt` |
| `seawall-drop` | 6 | `assault`・`grunt`・`heavy`・`grunt`・`assault`・`grunt` |
| `c-squad` | 4 | `assault`・`grunt`・`assault`・`heavy` |

4波の数は 6・3・4・6 で、`seawall-drop` は今のとおり防波堤の上（`PROP_SIZE.seawall.h` = 6m）から全員が降りる。

敵の動き（`stepEnemy` in `src/logic/enemies.ts`。`EnemyState` は `id`・`wave`・`kind`・`x`・`z`・`y`・`vy`・`yaw`・`hp`・`awake`・`wait`）:
- 出る: 台本の `spawn` で、波の名前が `M1_WAVE_ENEMY`（`src/data/enemies.ts`。波の名前ごとに `map.spawns[波]` の場所の順に並べた種類の配列）にあれば、i 番目の場所に i 番目の種類の敵を1体ずつ出す（`spawnWave` in `src/logic/game.ts`）。配列の長さが `map.spawns[波]` の場所の数と違う波は出さない。高さ `y` は `M1_WAVE_DROP`（`src/data/enemies.ts`。`seawall-drop` が防波堤の高さ `PROP_SIZE.seawall.h` = 6m。表に無い波は地面の 0）。id は `<波>-<番号>`（番号は1から）。場所が無ければ出さない。`beach-mortar`（迫撃砲）と `battery`（ボス）は表に入れず、出さない。出たとき出来事 `spawned`（`wave`・`count`）を残す
- 寝る: 起きる前は動かず撃たない。機体が地面での距離で `notice` に入ると起き、一度起きたら寝ない
- 降りる: `y` が 0 より大きい敵（`seawall-drop`）は、起きる前でも落ちる（`fall` in `src/logic/enemies.ts`）。毎フレーム `vy` を `DROP_GRAVITY`（20 m/s²）で下へ増やして `y` を動かし、同時に海（+z）へ `DROP_PUSH`（10 m/s）で跳ぶ（防波堤の海側の面 z −65 から離れて降りるため）。落ちている間は壁を無視し、撃たず、歩かない。`y` が 0 以下になったら地面に着き、`pushOutCircle` で壁の外へ押し出す。`enemyBox` の y は足元 `y` から `y` + `height`（機体の弾は落ちている敵にも当たる）。`src/view/enemies.ts` は `y` の分だけ上に描く
- 歩く: 起きると機体へ向く（`yaw`）。`stopDist` は種類ごとに違い（突撃 4m・射撃 25m・重装 35m）、`stopDist` の外では歩き、`stopDist` の中でも機体への線（撃つときと同じ判定）が通らない間は歩き続ける。線が通っていて `stopDist` 以内なら止まって撃つ。線が通って `stopDist` の外なら、`stopDist` を越えて進まない。歩く先は `navTarget`（下の「敵の道」）が返す点で、道が引けないときは機体そのもの。1フレームの歩幅は `speed` × dt で、歩く先を越えない。物の四角（`game.rects`）からは `pushOutCircle` で押し出されるので、壁に当たると壁に沿って滑る。マップの範囲（`bounds`）の中に `radius` 分だけ入った所から出ない
- 離れる: 生きていて地面にいる他の敵が `SEPARATION_DIST`（2.5m）より近いと、その敵から遠ざかる向きに、近いほど強く押される（0 の距離で `SEPARATION_SPEED` = 3 m/s、`SEPARATION_DIST` で 0）。歩いていても止まっていても押される。全く同じ所の2体は id の順で左右に分かれる。押したあとも壁の外へ押し出す（`keepApart` in `src/logic/enemies.ts`）
- 撃つ: 機体が `fireRange` の中にいて、胸（高さの `ENEMY_CHEST`）から機体の胸への線が物の箱（`game.propBoxes`）と壊れていない目標の箱に遮られないとき（この判定はそのフレームの歩く前の位置で1回だけ行い、止まるかどうかの判定と撃つ判定に使う）、`wait` が 0 になるたびに1発撃ち、`wait` を `fireInterval` に戻す。起きた直後は `fireInterval` 待ってから。向きは `spreadDir(…, spread, stream('enemies'))` で散らす。遮られている間は撃たずに待つ（歩き続けて線の通る所を探す）
- 敵の道（`src/logic/nav.ts`。何も import しない純粋なファイルで、検査の格子と同じ考え方）: 壁を回り込む道を、2m 四方の格子（`CELL`）と機体までの歩数で引く
  - 格子（`buildNavGrid`）: マップの範囲を 2m 四方に切り、中心が `game.rects` のどの四角からも「半径 + `NAV_MARGIN`（0.25m）」より近い格子を塞ぐ。半径は敵の種類のうち最大の `radius`（`NAV_RADIUS` in `src/logic/game.ts`。今は 0.75m で、塞ぐ距離は検査の機体と同じ 1m）。階段・坂・目標の四角も敵には壁（敵は登らないため）。壊した物は `game.rects` から抜けるので、`rectCount` が変わったら格子を作り直す
  - 歩数（`buildNavField`）: 機体のいる格子（塞がれていれば `NAV_GOAL_REACH` = 5 格子以内でいちばん近い空き）を 0 として、4方向の幅優先で各格子の歩数を数える。たどり着けない格子は `FAR`（65535）
  - 歩く先（`navTarget`）: 敵から機体への直線が塞がれた格子を通らなければ機体そのもの。通るなら、敵のいる格子から歩数の少ない隣（8方向。斜めは両側が空いているときだけ。同じ歩数なら機体に近いほう）を `NAV_LOOKAHEAD`（6）格子まで先へたどり、敵から直線で行ける最も遠い格子の中心を返す（角でだけ曲がる）。敵が壁沿いで塞がれた格子の中にいるときは、まわりでいちばん歩数の少ない格子から始める。機体が囲われていて歩数がつかないときは null（まっすぐ歩く）。直線の判定は `NAV_SAMPLE`（1m）ごとの点で、始まりの格子は数えない
  - 作り直し（`stepNav`）: `game.nav`（`NavState`）が持つ。生きている敵がいるフレームだけ呼ぶ。格子は最初と `rectCount` が変わったとき、歩数は格子を作ったときと、機体が別の格子に移ったとき（前の作り直しから `NAV_REBUILD_GAP` = 0.25 秒以上たっていれば）に作り直す。M1 の手書きマップ（四角 603 個）で、歩数の作り直しは1回 約 0.3 ms、格子は約 3 ms（壊せる物が壊れたときだけ）
  - 保存: `nav` は四角から作り直せるので、チェックポイント（`snapshotOf`・`GameSnapshot`）にも中断（`suspendOf`・`SuspendedGame`）にも入れず、戻したときは `newNav()`
- 倒れる: 体力 0 の敵は `game.enemies` に残るが、動かず、撃たず、弾も当たらない。FCS の対象にもならない
- 波が終わる: 波の敵が全部倒れると、`checkWaves` が台本に `cleared`（`wave`）を渡す。台本が覚えるので1回だけ。敵を出さなかった波には渡さない
- FCS: 生きている敵も `fcsTargets` に入る。`aimTarget` は目標か敵の id
- 見えない相手には寄らない: 胸から相手の箱の中心への線が、物の箱か壊れていない目標の箱（相手自身の箱は除く）に先に当たる相手は、生きていても `fcsTargets` で生きていない扱いにする（トーチカの陰の敵にソフトロックとロック枠が寄らないため。`inSight` in `src/logic/game.ts`）
- 見た目: `src/view/enemies.ts` が種類ごとの `InstancedMesh`（名前 `sb-enemy-<kind>`、最大 64 体、色 `ENEMY_COLOR`）で描く。色と高さ `height` で役割が分かる（射撃は暗い赤で 3m、突撃は明るい赤で 2.4m、重装は暗い灰緑で 3.5m）。倒れた敵は高さを 0.35 倍にして `ENEMY_DOWN_COLOR` に変える。HUD の敵の名前は `target.<kind>`、レーダーの印は赤い点
- 保存: 敵は `kind` の文字列ごと保存するので、種類を増やしても中断の版（`SUSPEND_VERSION`）は上げない。古いデータの種類は `grunt` だけなので、そのまま読める

### トーチカ

トーチカは B トーチカ線の的で、近づくと撃ってくる。遮蔽物づたいに近づく相手。射程の中で銃眼から機体への線が通ると、予兆のあとに数発撃ち、間を空ける。値はどれも仮。定義は `src/data/pillbox.ts` の `PILLBOX_TUNE`、動きは `src/logic/pillbox.ts` と `src/logic/game.ts` の `stepPillboxes`、見た目は `src/view/play.ts` の予兆の光。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `range` | 110 | m。箱の中心から機体の足元までの水平距離がこれ以内なら撃つ。弾の飛ぶ距離でもある |
| `firstWait` | 0.8 | s。射程に入って射線が通ってから、最初の予兆までの待ち |
| `warn` | 0.8 | s。撃つ前の予兆の長さ |
| `burst` | 3 | 1回の攻撃で撃つ数 |
| `shotInterval` | 0.2 | s。連射の中の1発から次まで |
| `interval` | 3.2 | s。連射が終わってから次の予兆まで |
| `damage` | 4 | 1発が減らす機体の装甲 |
| `bulletSpeed` | 180 | m/s。弾の速さ |
| `spread` | 3 | 度。狙いからのずれ |
| `muzzle` | 0.5 | 撃つ高さ。箱の高さに対する割合 |
| `muzzleGap` | 0.5 | m。箱の外へ出た所からさらに前へ出る距離 |

装甲は `src/data/pillbox.ts` の `PILLBOX_ARMOR`（仮）で決まる。角度は地面の上で、弾が来た側から見た正面との角。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `frontMul` | 0.25 | 正面に当たったときのダメージの倍率 |
| `sideMul` | 1 | 横・後ろに当たったときのダメージの倍率 |
| `frontArc` | 45 | 度。正面とみなす角の半分。来た側が正面の向きとの角でこれ以内なら正面 |

- 撃つ条件（`stepPillbox`）: 生きている（`hp > 0`）トーチカの箱の中心から機体の足元までの水平距離が `range` 以内で、銃眼から機体の胸（`mech.y + MECH_TUNE.chestHeight`）への線が、物の箱（`game.propBoxes`）・ほかの壊れていない目標の箱・自分の箱に遮られないこと。自分の箱も遮る物に数えるので、真横・後ろに回ると撃てない。銃眼は `pillboxMuzzle` が返す、箱の正面（`pillboxFront`。`{ x: sin yaw, z: cos yaw }`）の外へ `muzzleGap` 出た所、高さ `box.maxY × muzzle`
- 流れ: 射線が通る間だけ `wait` を数え、0 になったフレームに予兆を `warn` 秒出して出来事 `pillboxWarn`（`target`・銃眼の `x` `y` `z`）を残す。予兆が終わると `burst` 発を `shotInterval` ごとに撃ち、最後の1発のあと `interval` 待つ。連射の途中で射線が通らなくなったら、その連射をやめて `interval` 待つ。弾は `PillboxBullet`（`pillbox` に撃ったトーチカの id、`left` は `range`）で、機体・物・壊れていない目標・地面で止まる（敵の弾と同じ）
- 乱数: 散らしは `stream('pillboxes')` から引く（`spreadDir`）
- 装甲（`pillboxDamageMul` in `src/logic/pillbox.ts`）: 弾の水平の向き `(dx, dz)` の逆（トーチカから撃った側へ向かう向き）と `pillboxFront` の正面との角を出す。角が `frontArc` 以内なら `frontMul`、そうでなければ `sideMul`。水平の長さが 0 のときは `sideMul`。機体の弾がトーチカに当たると `flyBullet` がこの倍率を出し、体力は `damage × 倍率` だけ減る。倍率が 1 未満のときだけ `hit.deflected` が true になる
- カットシーンの間: `stepPillboxes` は何も数えず、予兆も撃ちもしない（`stepHazards`・`stepAllies` と同じ）
- 見た目: `src/view/play.ts` が予兆の光を `THREE.InstancedMesh` 1つ（名前 `sb-pillbox-warn`、最大 8、加算合成、`depthWrite: false`、色 `PILLBOX_WARN_COLOR`）で、目標の group に足して描く。毎フレーム `game.pillboxes` の `warn` から、`warn` が 0 より大きいトーチカの銃眼に光を出す（出来事 `pillboxWarn` は使わない）。壊れた（`hp` 0）トーチカは描かない。残り時間に合わせて少し縮め、0 で消える。`MAX_PILLBOX_WARNS`（8）を超えた分は描かない。大きさと縮み方は `play.ts` 頭の `const`
- 弾かれた見た目: `hit.deflected` が true の当たりは、砂ぼこりの代わりに `PILLBOX_DEFLECT_COLOR` の小さく明るい火花を `burst` で当たった位置（`event.x`・`event.y`・`event.z`）に出す。数・速さ・寿命・重力は `play.ts` 頭の `const`。false の当たりは今までどおり `spawnDust`
- 保存: `pillboxes` は `GameModel` の項目としてチェックポイントと中断に入る。チェックポイントから戻すと `wait` はコピーのまま、`warn`・`shots`・`shotWait` は 0 に戻る（飛んでいる弾は消えるので、途中の予兆と連射も切れる）。`retryFromCheckpoint` in `src/logic/game.ts`
- テスト: `test/unit/pillbox.test.ts`（射程・射線・自分の箱・予兆と連射の間隔・銃眼が箱の外・同じ種で同じ弾）と `test/integration/pillbox.test.ts`（物の後ろでは出ず、射線が通ると `pillboxWarn` の `warn` 秒後に `PillboxBullet` が出る。カットシーンの間は止まる）

### 迫撃砲の砲撃と地雷

SB-190 の3枚目。迫撃砲の陣地は壊せない背景の脅威で、遊ぶ人が壊しに行く対象にはしない。値はどれも仮。定義は `src/data/hazards.ts`、動きは `src/logic/hazards.ts` と `src/logic/game.ts` の `stepHazards`、見た目は `src/view/hazards.ts`。

- 砲撃（表 `BARRAGES`: `Record<BarrageKind, BarrageDef>`。種類は `mortar`（迫撃砲）と `battery`（沿岸砲台の副砲。「ボス（沿岸砲台）」））
  - 始まる: 台本の `spawn` で、波の名前が `M1_WAVE_BARRAGE`（`beach-mortar` が `mortar`、`battery` が `battery`）にあれば `startBarrage` が `game.barrages` に足す。同じ波では1回だけ。始まったら止まらない（迫撃砲の陣地は壊せないため、台本で止める仕組みは持たない。副砲も主砲が倒れたあとも続き、弾薬庫を壊して出撃が終わるまで止まらない）
  - 流れ（`stepBarrage`）: 機体の足元の z が `minZ` 以上 `maxZ` 以下の間だけ `wait` を数える（`inReach`。限りのない側は `-Infinity`・`Infinity`）。`slow`（`flag` と `mul`）を持つ砲撃は、台本のその印が立っている間、`wait` を `dt / mul` ずつ数える（間隔が `mul` 倍になる。`stepHazards` が `game.script.flags` を見て渡す）。0 になるたびに着弾予告 `ShellState` を `game.shells` に足し、出来事 `shellWarn`（`x`・`z`・`radius`）を出す。届かない間は数えない（届く所に戻ってから `interval` 後が最初の予告）
  - 狙い: 機体の位置から、向きは 0〜2π、距離は 0〜`aimJitter` の一様な乱数でずらした所。乱数の列は `stream('mortar')`
  - 落ちる: `shells` の `left` が `dt` ずつ減り、0 になった予告が落ちて `shellLand`（`x`・`z`・`hit`）を出す。機体の足元が半径 `radius` の円の中なら `hit` が true で、`damageMech` と同じ道で装甲が `damage` 減る（`damaged` の向きは機体から落ちた所へ）
- 地雷（`MINE_TUNE`）
  - 置き場所は `MapDef.mines`（`MinePlace` の一覧。省略できる）。省略した地図は地雷なしで、生成の地図と簡易エディタの地図は地雷を持たない。`newGame` が `game.mines`（`x`・`z`・`hp`）にする
  - 踏む: 機体の足元から `stepRadius` 以内で爆発する（跳んでいても高さは見ない）
  - 撃つ: 機体の弾は、地雷の箱（`size` の幅・高さ・奥行き）に当たると止まり、`hp` が威力の分だけ減る。0 で爆発する。弾が止まる順は、目標・敵・地雷・物・地面のうち、飛ぶ道の上でいちばん近いもの（敵の弾は地雷を素通りする）。当たりの出来事 `hit` は、地面と同じく目標・物・敵・機体のどれも空
  - 爆発（`blowUp`）: 地雷が `game.mines` から消え、出来事 `mineBlast`（`x`・`z`・`hit`）を出す。機体の足元が `blastRadius` 以内なら `hit` が true で、装甲が `damage` 減る
- チェックポイント: `shells` は持ち越さない（`retryFromCheckpoint` で空にする。`bullets` と同じ）。`barrages` と `mines` はコピーで、壊した地雷は戻らない
- 見た目（`src/view/hazards.ts`）
  - 着弾予告の輪: 地面の輪を `InstancedMesh`（名前 `sb-shells`、最大 16）1つで描く。輪の半径は爆発の半径のまま、落ちるまでの間に `SHELL_WARN_COLOR` から `SHELL_LAND_COLOR` へ明るくなる
  - 地雷: 地面の円盤を `InstancedMesh`（名前 `sb-mines`、最大 64）1つで描く。爆発したものは描かない
  - 落ちた・爆発したときは、その場に砂ぼこり（`spawnDust`）を出し、外れても機体から 25m 以内ならカメラが揺れる（当たったときは `damaged` の揺れ）。描く回数は輪1・地雷1。`clearPlay` が片付ける
- HUD の警告: `hudModel` の `warning` は、機体がどれかの着弾予告の円の中にいる間 `'shell'`、ほかは null

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `BARRAGES.mortar.interval` | 4 | s。予告から次の予告まで（届く間だけ数える） |
| `BARRAGES.mortar.warn` | 2.5 | s。予告から着弾まで |
| `BARRAGES.mortar.radius` | 7 | m。爆発の半径 |
| `BARRAGES.mortar.damage` | 25 | 当たったときに減る装甲 |
| `BARRAGES.mortar.aimJitter` | 12 | m。狙いのずれの最大 |
| `BARRAGES.mortar.minZ` | 30 | m。砲撃が届くのはこの z より海側 |
| `BARRAGES.mortar.maxZ` | Infinity | m。上限なし |
| `MINE_TUNE.stepRadius` | 1.8 | m。踏んで爆発する距離 |
| `MINE_TUNE.blastRadius` | 4 | m。爆発で装甲が減る距離 |
| `MINE_TUNE.damage` | 30 | 爆発で減る装甲 |
| `MINE_TUNE.hp` | 10 | 機体の弾に対する体力 |
| `MINE_TUNE.size` | 1×0.3×1 | m。弾の当たる箱（幅・高さ・奥行き） |

三人称カメラの出発点は `CAMERA_TUNE`（SB-020）。距離は地面に沿って測る。本体（`src/view/play.ts`）と開発用の入口 `#view-map`・`#view-fx` は、マップの物と目標の四角（`top` の無い四角は 100m の壁）をカメラの壁として渡す。坂は斜面に沿った段の箱に分けて渡す（`rectBoxes` in `src/logic/collide.ts`）ので、低い端の上の空間でカメラが引っかからない。壊れた物の箱は壁から外れる。注視点（足元から 2.9m）より下で終わる低い物は、カメラを引き寄せない。

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
| `jump` | 9.4 | m/s。ジャンプの初速（最高点は約 2.2m） |
| `gravity` | 20 | m/s²。空中の落下 |
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

脚の種類ごとの動きの値（SB-130 の3枚目。値は全部仮）。脚の部品は動きの種類 `gait`（`GaitKind` = `biped`・`reverse`・`multi`）を持ち、種類ごとに `MOVE_TUNE` の変える項目だけを `LEG_MOVE_TUNE` の上書きで持つ。機体の組から実際の値を作るのは `moveTuneOf`（`MOVE_TUNE` に脚の上書きを重ねる。純粋）で、`step` in `src/logic/game.ts` が `M1_MECH` から作った値を `stepMech` に渡す。定義場所は `GaitKind`・`PartDef.gait` in `src/data/mech.ts`、`LEG_MOVE_TUNE` in `src/data/tune.ts`、`moveTuneOf` in `src/logic/mechTune.ts`。

| 種類 | 脚の部品 | 上書き | 特性 |
|------|----------|--------|------|
| `biped` | `stoutLegs`・`midLegs`・`longLegs` | なし（`MOVE_TUNE` のまま） | 重ための2脚。標準。M1 の機体はこれ |
| `reverse` | `reverseLegs` | `walk` 8.5・`accel` 44・`jump` 10.4・`boostDrain` 0.42・`stepHeight` 0.6 | 軽量の逆関節。速く、高く跳び、ブーストが長い。段差には弱い |
| `multi` | `quadLegs` | `walk` 6.2・`jump` 7.05・`stepHeight` 0.6 | 多脚。遅く、低く跳ぶ |

- 多脚の「揺れが少なく狙いがぶれにくい」は、揺れの値（`FEEL_TUNE`）の脚ごとの上書きがまだ無いので、今は動きに出ていない

機体の動き（見た目だけ。当たりと `stepMech` の値は変えない。SB-130 の3枚目）は、機体の速さ・接地・ブーストと出来事から、箱の位置と回転を毎フレーム書き直す。骨は使わず、`InstancedMesh` の行列を書くので、描く回数は増えない。定義場所は `MotionState`・`stepMotion`・`legAngle`・`leanAngle`・`recoilBack`・`dipDepth`・`flameLength`（状態と、状態から角度や長さを出す純粋な関数）in `src/view/mechMotion.ts`、`animateMech`・`buildMechVisual` in `src/view/mechModel.ts`（行列を書く）、`drawMechMotion` in `src/view/mechDrive.ts`（`GameModel` から速さ・接地・ブースト・着地・撃った出来事を読んで渡す。`drawPlay` が呼ぶ）、`MOTION_TUNE` in `src/data/tune.ts`、`GAIT_LOOK`・`PartDef.exhaust` in `src/data/mech.ts`、`MECH_FLAME_COLOR` in `src/data/colors.ts`。

- 歩く: 脚が股関節のまわりを前後に振れる。振りの位相は進んだ距離で進み（1周期の距離は `GAIT_LOOK` の `stride` × 機体の高さ）、振れ幅は速さに比例して `MOTION_TUNE.walkSpeed` で最大（`swing`）になる。左右は逆位相。`multi` は対角の脚が組になる。止まると（`idleSpeed` 以下、空中、ブースト中）振れ幅が `walkRate` で 0 に戻る
- ブースト: 体が股関節を軸に `MOTION_TUNE.lean` だけ前に傾き、背中の部品の後ろ（`PartDef.exhaust`）に噴射の箱が長さ `flameLength` まで伸びる。色は `MECH_FLAME_COLOR`。噴射の箱は `frame` の色の `InstancedMesh` の末尾に置き、ブーストの間だけ `count` に入れるので、描く回数は変わらず、止まっているときの箱と三角形の数も変わらない。色は箱ごとの色（`instanceColor`）で、材質の色との比で表す
- ジャンプ・空中: 空中にいる間、脚が `GAIT_LOOK` の `bend` だけ後ろへ曲がる。着地の出来事で、落ちる速さに応じて体が最大 `landDip`（機体の高さの割合）沈み、`landTime` で戻る
- 射撃: 主武器が撃つたびに、腕と主武器が `recoilBack` だけ後ろへ引かれ、`recoilTime` で戻る。サブ武器は引かない
- 脚の動き方は `GAIT_LOOK`（`stride`・`swing`・`bend`。値は仮）が種類ごとに持つ。体と脚の動きの数は `MOTION_TUNE`

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `walkSpeed` | 6 | m/s。脚の振りが最大になる速さ |
| `idleSpeed` | 0.3 | m/s。これ以下では脚は止まる |
| `walkRate` | 6 | 1/s。振りが増減する速さ |
| `airRate` | 12 | 1/s。脚が曲がる・戻る速さ |
| `boostRate` | 8 | 1/s。傾きと噴射が出入りする速さ |
| `lean` | 0.2 | rad。ブーストで前に傾く角度 |
| `flameLength` | 0.22 | 噴射の長さ（機体の高さの割合） |
| `flameSize` | 0.035 | 噴射の太さ（同） |
| `flameShow` | 0.02 | ブーストの割合がこれを超えると噴射を描く |
| `recoilBack` | 0.06 | 撃った腕が引かれる距離（同） |
| `recoilTime` | 0.16 | s。腕が戻る時間 |
| `landDip` | 0.05 | 着地で沈む深さ（同） |
| `landSpeed` | 10 | m/s。この落ちる速さで最大に沈む |
| `landTime` | 0.2 | s。沈んだ体が戻る時間 |

手応えの演出の出発点は `FEEL_TUNE`（SB-025）。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `boostFov` | 10 | 度。ブースト中に広げる画角 |
| `fovRate` | 8 | 1/s。画角が目標に寄る速さ |
| `landShake` | 0.35 | m。落ちる速さ 10m/s の着地の揺れ |
| `fireShake` | 0.06 | m。撃ったときの揺れ |
| `damageShake` | 0.2 | m。機体が弾を受けたときの揺れ |
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

上陸戦の迫力の出発点は `FX_TUNE`（SB-045）。段階 2（中）の値で、`FX_STAGES` が段階 0（切る）・1（弱）・3（強）の上書きを持つ。色は `0xRRGGBB`。本体の出撃は `LOOKS` の M1 の行（今は `FX_TUNE` のまま）で、`pixel`・`saturate`・`contrast`・`sepia`・`haze`・`fogColor`・`skyColor`・`light`・`sun`・`groundColor` の10項目を使う。戦場の層（歩兵・砲撃・煙・曳光弾・飛行機・砲弾穴）は本体にも `FX_TUNE` の値（段階 2）で出る（下の「戦場の層」）。ただし本体の歩兵の人数だけは `PLAY_BATTLE_TUNE.allies`（60。`BATTLE_TUNE.allies`）で、`#view-fx` は `FX_TUNE.allies`（300）のまま。

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
| `allies` | 300 | 人。最初に出す味方の人数（0 で無し）。`#view-fx` の既定で、本体は `BATTLE_TUNE.allies`（60） |
| `allyWaves` | 5 | s。何秒ごとに次の波を出すか（0 で次の波を出さない） |
| `allySpeed` | 2 | m/s。味方の進む速さ |
| `allyDeathRate` | 0.1 | 1人が1秒に倒れる確率（0 で誰も倒れない） |
| `planes` | 8 | 機。同時に飛ぶ飛行機の数（0 で無し） |
| `planeHeight` | 80 | m。飛行機の高さ |
| `planeSpeed` | 30 | m/s。飛行機の速さ |

### 戦場の層

本体の出撃と `#view-fx` が同じ層を出す。歩兵・砲撃・煙・曳光弾・飛行機・砲弾穴で、見た目だけ。機体にも弾にも当たらず、`GameModel` に何も持たせない。値は `FX_TUNE`（段階 2）で、本体は `PLAY_BATTLE_TUNE`（`FX_TUNE` の歩兵の人数だけを `BATTLE_TUNE.allies` の 60 にしたもの）を、`#view-fx` は `FX_TUNE`（歩兵 300）を使う。`BATTLE_TUNE`・`PLAY_BATTLE_TUNE` の定義場所は `src/data/tune.ts`（`FX_TUNE` の隣）。層の定義場所は `buildBattle` in src/view/battle/index.ts（描く）、`newBattle`・`stepBattle` in src/logic/battle.ts（進行）、`stepCrowd` in src/logic/crowd.ts、`stepPlane` in src/logic/planes.ts、`scatterCraters` in src/logic/craters.ts。

- 進行は `logic/battle.ts`（three も DOM も読まない）。`BattleState` は歩兵 `crowd` と次の砲撃までの秒 `shellT`。`stepBattle(state, rng, dt, tune, at)` が歩兵を進め（`stepCrowd`）、`shellT` が 0 になったら砲撃を1発落とす（`at` は機体の位置）。砲撃の場所は `at` から `shellNear`〜`shellFar` m の輪の中で、引く乱数は距離、角度の順。揺れは `shellShake * 10 / max(10, 距離)`。最初の1発は `shellEvery` の半分の秒、あとは `shellEvery` ごと。歩兵は同時に `MAX_SOLDIERS`（1200）まで
- 描くのは `view/battle/`。砲撃の閃光と破片は `shellBurst` in src/view/hazards.ts（機体を狙う迫撃砲の着弾予告とは別で、予告の輪も機体への当たりも無い）。煙・曳光弾・飛行機・砲弾穴の乱数も同じ列から引く
- 乱数は `stream('battle')`（歩兵の波・砲撃の予定・煙・曳光弾・飛行機）と `stream('craters')`（穴）。`#view-fx` も同じ列を使う
- 本体は出撃ごとに `buildPlayView` が作り、やり直し（`retryFromCheckpoint`・`restartGame`）や次の出撃で作り直す。状態は view の側が持ち、`GameModel` にもチェックポイントにも入れない。見た目だけで勝ち負けに関わらず、チェックポイントに戻しても歩兵が巻き戻るかどうかは遊びに関係しないため。logic の `battle.ts` に出したのは、進行をページなしでテストするため
- 砲撃の揺れは本体のカメラの揺れ `FeelState.shake` に足す。導入のカットシーンの間も戦場の層は流れる
- 描く回数: 本体の出撃（導入のカットシーンを飛ばした 90 フレーム後）は 120 calls・45k tris（歩兵を1波 60 人にしたあと）、`#view-fx` の段階 2（40 フレーム後）は 252 calls・100k tris（headless Chromium。`test/e2e/battle.test.ts`・`test/e2e/fxView.test.ts` が出力する）。本体は地面の塊を視錐台で切る（`cullChunks`）ため、`#view-fx` より少ない

### 台本の味方の機体

台本の `ally` が出す、機体の隣を走る味方。浜の途中で迫撃砲に倒れる。当たり判定は無い。定義場所は `AllyState`・`newAlly`・`stepAlly` in src/logic/allies.ts、`ALLY_TUNE`・`ALLY_FATES` in src/data/allies.ts、`ALLY_PALETTE`・`ALLY_WRECK_PALETTE` in src/data/colors.ts、`drawAllies` in src/view/allies.ts、`stepAllies`・`spawnAlly` in src/logic/game.ts。

- 出る所: `ally` の出来事で `spawnAlly` が `GameModel.allies` に足す。道は `mission.paths[path]`、`fate.at` の座標は `mission.places[at]`。`AllyState` は道の点と場所の座標を自分で持つ（チェックポイントのコピーだけで立つため）。名前が無ければ例外。`validateMission` も `paths`・`places`・`ALLY_FATES` の名前を確かめる
- 走り方: `stepAlly` が `ALLY_TUNE.speed` で道の点を順に通る。道の終わりに着いたら止まる。向き `yaw` は進む向き（0 が -z）
- 落ち方: `fate` の場所から `ALLY_TUNE.arrive` 以内に入った1フレームで落ち（`down`）、`stepAllies` が出来事 `allyDown` を1回出す。落ちたあとは動かず、出来事も出ない。当たり判定が無いので、機体も弾もすり抜け、ダメージも与えない
- カットシーンの間は `stepAllies` が止まる。味方は導入のカットシーンと同じフレームに出るが、カットシーンの間は動かず描かれない（機体が走れるようになってから走り出す）
- 見た目: 機体の箱の組み立て（`buildMechVisual`）を `ALLY_TUNE.height`（3.4m。機体は 4m）と `ALLY_PALETTE` で作る。落ちたら同じ箱を `ALLY_WRECK_PALETTE` で作ったものを `wreckTilt` 倒して置く（5色ごとに1 draw で、走る姿と残骸の2体分）。メッシュの名前は `ally`（機体の `mech` と数え分ける）
- 撃つ真似: 走っている間 `fireEvery` ごとに、前（走る向き）へ曳光弾を `Battle.tracer` で出す（当たりは無い）。散らしは `tracerSpread`
- 落ちたときの見た目: `allyDown` を `drawPlay` が受けて、`shellBurst`（戦場の砲撃と同じ閃光と破片）と、迫撃砲の着弾と同じ砂煙（`BLAST_DUST`）をその場に出す。着弾予告の輪は出さない

| 名前（`ALLY_TUNE`） | 値 | 単位・意味 |
|------|----|------------|
| `speed` | 9 | m/s。走る速さ |
| `arrive` | 1.5 | m。場所にこの近さまで来たら着いたとする |
| `height` | 3.4 | m。味方の機体の高さ |
| `fireEvery` | 0.35 | s。曳光弾の間隔 |
| `fireHeight` | 2.2 | m。曳光弾が出る高さ |
| `fireAhead` | 1.6 | m。曳光弾が出る足元からの前への距離 |
| `tracerSpeed` | 80 | m/s。曳光弾の速さ |
| `tracerSpread` | 6 | m/s。曳光弾の速さの横と上への散らし |
| `wreckTilt` | 1.35 | rad。残骸が倒れる角度 |

### ボス（沿岸砲台）

SB-200。M1 の防波堤の奥にある砲台。主砲2門が海の上の味方の艇を撃っていて、機体には副砲（着弾予告つきの砲撃）と機銃で応じる。主砲を2門とも壊すと装甲のシャッターが開いて弾薬庫が見え、そこが弱点で、壊すと出撃が終わる。寄り道の弾薬集積所（`depot`）を壊していると、副砲の砲撃が間遠になる。値はどれも仮。定義は `src/data/battery.ts` と `src/data/hazards.ts`、動きは `src/logic/battery.ts` と `src/logic/game.ts`（`stepBattery`・`checkShutters`・`stepHazards`・`flyBullet`）、見た目は `src/view/world.ts` と `src/view/seaFire.ts`。

- シャッター（表 `M1_SHUTTERS`: `ShutterDef` の一覧。`target`・`opensWhen`・板の大きさ `w`×`h`×`d`・`gap`）
  - 守られる目標と、開くきっかけの目標は表で決める。M1 は `magazine` を、`main-gun-1`・`main-gun-2` が両方壊れると開く。守られる目標が地図に無ければシャッターも作らない（`newShutters`）
  - 閉じている間: 機体の弾は弾薬庫の箱で止まり、出来事 `hit`（`target` は弾薬庫の id）を出すが、体力は減らず `destroyed` も出ない（`shuttered`）。弾の止まる順は変わらない
  - 開く: きっかけの目標が全部壊れると `game.shutters` の `open` が true になり、出来事 `shutterOpen`（`target`）を1回だけ出す（`openShutters`）。弾が主砲を壊したフレームで（`destroyed` の直後に）開き、そのあとの弾は弾薬庫に当たる。毎フレームの `checkShutters` が、体力を別の道で 0 にした場合も拾う。台本の印 `shutter-open` と目標 `hit-magazine` は従来どおり台本の cue が出す
  - 見た目: 弾薬庫の前（海側の面から `gap` 離れた所）の板を `THREE.Mesh`（名前 `sb-shutter-<target>`、色 `SHUTTER_COLOR`）で描く。`buildWorld` が `targetGroup` に足し、`syncWorld` が開いたものを隠す。当たりには関わらない（弾が止まるのは弾薬庫の箱）
- 副砲の砲撃（`BARRAGES.battery`）
  - 台本の波 `battery` が出ると始まる（`M1_WAVE_BARRAGE`）。届くのは機体が防波堤の帯より陸側か防波堤の上にいるとき（z ≤ −65）。浜では撃たれない
  - 間隔・予告・半径・威力・ずらしは表のとおり。台本の印 `depot-down`（集積所を壊した）が立っている間は、間隔が `slow.mul` = 1.5 倍になる（`wait` を `dt / 1.5` ずつ数えるため、立った瞬間から効く）。乱数の列は `stream('mortar')`
  - 主砲が倒れたあとも続く
- 機銃（`GUN_TUNE`。`BatteryState.guns` に `kind` が `gun` の目標ごとの `GunState`（`id`・`wait`）を持つ）
  - 動き出す: 台本の波 `BATTERY_WAVE`（`battery`）が出ると `BatteryState.on` が true になる（`applyScriptOut`）。それまでは撃たない
  - 撃つ（`stepGun`）: 壊れていない主砲が、`wait` を `dt` ずつ減らし、0 になったとき、箱の中心から機体の足元までの水平距離が `range` 以内で、射線が物と、ほかの壊れていない目標に遮られないなら、1発撃って `wait` を `interval` に戻す。弾は主砲の箱の海側の面から `muzzleGap` 先の、箱の高さの `muzzle` 倍の所から、機体の胸へ向け、`spread` 度の範囲で散らして出る。最初の1発は動き出してから `interval` 後。乱数の列は `stream('battery')`
  - 弾: 型 `BatteryBullet`（`gun` に主砲の id）。速さ `bulletSpeed`、威力 `damage`、飛ぶ距離 `range`。扱いは敵の弾と同じ（機体・物・壊れていない目標・地面で止まり、機体に当たると装甲が減って `damaged` を出す）
- 主砲が海を撃つ見た目（`src/view/seaFire.ts`。当たりなし。ゲームの時計 `game.time` から決める）
  - 壊れていない主砲ごとに、`SEA_FIRE_PERIOD` ごとに箱の海側の面の砲口で閃光（`SEA_FLASH_COLOR`）を `FLASH_TIME` 出し、海の方（+z）へ曳光の線（`SEA_TRACER_COLOR`）を `TRACER_TIME` 走らせる。2門目の拍は `SEA_FIRE_OFFSET` ずらす。倒れた主砲は何も出さない。1門目が倒れて無線 `m1.gun1-down` が出ると、海を撃つのが片方止まる
  - 閃光の `Mesh`（名前 `sb-sea-flash`）と線の `Line`（名前 `sb-sea-tracer`）を主砲ごとに1つずつ作り、`buildSeaFire` が組み、`removeSeaFire` が片付ける（`clearPlay` から）
- チェックポイント: `shutters` と `battery` はコピーに入る（「本体のチェックポイントとやり直し」）。cp2 は波 `battery` を出した直後に取るので、戻すと機銃は動いたままで待ちはコピーの値、シャッターは閉じ、主砲は元の体力、副砲の砲撃は続く。落ちる前の予告 `shells` と飛んでいる弾は持ち越さない
- HUD: シャッターで守られていても、弾薬庫にロック枠と体力は出る。守られていることを示す文言や印は無い

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `GUN_TUNE.range` | 90 | m。機体がこの水平距離以内なら撃つ。弾の飛ぶ距離でもある |
| `GUN_TUNE.interval` | 1.2 | s。1発から次まで |
| `GUN_TUNE.damage` | 3 | 当たったときに減る装甲 |
| `GUN_TUNE.bulletSpeed` | 200 | m/s |
| `GUN_TUNE.spread` | 4 | 度。狙いからのずれ |
| `GUN_TUNE.muzzle` | 0.7 | 撃つ高さ。主砲の箱の高さに対する割合 |
| `GUN_TUNE.muzzleGap` | 0.3 | m。主砲の箱の海側の面から弾が出る所まで |
| `BARRAGES.battery.interval` | 3 | s。予告から次の予告まで |
| `BARRAGES.battery.warn` | 2 | s。予告から着弾まで |
| `BARRAGES.battery.radius` | 6 | m。爆発の半径 |
| `BARRAGES.battery.damage` | 30 | 当たったときに減る装甲 |
| `BARRAGES.battery.aimJitter` | 8 | m。狙いのずれの最大 |
| `BARRAGES.battery.minZ` / `maxZ` | −Infinity / −65 | m。届くのは z が −65 以下の間 |
| `BARRAGES.battery.slow` | `depot-down` / 1.5 | 印が立っている間の間隔の倍率 |
| `M1_SHUTTERS[0]` | 10×8×1.5、`gap` 0.5 | m。弾薬庫の板の幅・高さ・厚さと、箱の面からの離れ |
| `SEA_FIRE_PERIOD` | 3.2 | s。主砲が海を撃つ間隔（`src/view/seaFire.ts`） |
| `SEA_FIRE_OFFSET` | 1.3 | s。2門目の拍のずれ |
| `FLASH_TIME` / `TRACER_TIME` | 0.15 / 0.9 | s。閃光と曳光の線が出ている間 |
| `TRACER_SPEED` / `TRACER_LENGTH` | 220 / 25 | m/s と m。線の頭の速さと長さ |

テスト: 純粋な関数は `test/unit/battery.test.ts`・`test/unit/hazards.test.ts`、ゲームの中の動き（シャッター・波・集積所・ボットでのクリア・チェックポイント・同じ seed で同じ出来事）は `test/integration/boss.test.ts`、描画は `test/e2e/battery.test.ts`。

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
- `#view-hud`: HUD の配置の見本を4案（A 四隅に散らす・B 下にまとめる・C 照準のまわりに寄せる・D A の配置に照準のまわりの細い計器を足す）で切り替えて見る入口。`#view-map` の浜のマップ（`buildMapScene`）を固定カメラで描き、機体の模型を置く。ゲームの状態にはつながず、見本の値（`src/dev/hud/plans.ts` の `HUD_SAMPLE`）で描く。`?plan=a|b|c|d`（既定 a）、`?cut=1`（カットシーンの帯）、`?touch=1`（タッチのボタンの輪）、数字キー 1〜4 で案を切り替える。ロック枠は `lockFrame` で描き、見本の四角（`LOCK_SAMPLE`）に出す。`window.sbHudReport()` が各要素の矩形を JSON の文字列で返す。弧・レーダー・点と円の描き方は `src/view/hudParts.ts` から読む（見本の値と動きは変えない）。要素の値の多く（装甲・熱・弾数・武器の枠（メインとサブの2つ）・レーダー）と、カットシーン中の表示（無線以外を隠す）は仮であること
- `#view-mech`: 機体の見た目の案を5つ（A 重装ずんぐり・E 中量（A を細く）・F 中量・脚長・B 逆関節の軽め・D 四脚の戦車寄り）で切り替えて見る入口。`#view-hud` と同じ浜のマップに機体を置き、ゲームの状態にはつながない。`?pattern=a|e|f|b|d`（既定 a）、`?spin=0`（回転を止める）、`?view=behind`（ゲームの三人称カメラの構図で止める）。数字キー 1〜5 と上のボタンで案を切り替え、`回転`・`後ろから` のボタンで視点を替える。`window.sbMechReport()` が案・回転・視点と、機体の描く回数・三角形・箱の数・重さの合計と、画面全体の直近の描く回数・三角形を JSON の文字列で返す。`歩く`・`ブースト`・`跳ぶ`・`撃つ` のボタン（キー W・B・J・F）で機体の動きを見られる（`歩く`・`ブースト`・`撃つ` は押すたびに入り切り、`跳ぶ` は1回跳ぶ。速さと跳びは案の脚の種類の値で、案 B は逆関節、案 D は四脚の動きになる）。`window.sbMechReport()` の JSON には、動きの入り切り `acts` も入る。部品の寸法・色・重さはどれも仮であること
- `#view-map`: M1 の手書きのマップ（浜・B トーチカ線・C・防波堤・ボスの場所）を歩く入口。`?src=hand|gen|edit` で手書き（`m1b-hand.ts`）・生成（`m1b-rules.ts`）・エディタが `localStorage` に保存したマップを選び（既定 `hand`、無いときは「保存されたマップが無い」）、`?seed=<n>` を生成の種にする。地面のタイルと物を `buildOutdoor`、目標を `buildTargets`、海と揚陸艇を `buildShore`、台本の場所を薄い枠、波の出る場所を小さな輪で描く。描き方は `src/view/world.ts` の `buildWorld` を使う。機体は `#view-play` と同じ入力で歩き、始まりは範囲の手前の真ん中。機体は物（`blocks` が真の物）と目標に入らず、斜めに当たると壁に沿って滑る（8章）。左上に種類ごとの物の数・目標の数・違反の一覧・描く回数と三角形の数を出し、`window.sbMapReport()` が同じ数字と機体の位置を JSON の文字列で返す
- `#view-fx`: M1 の B のマップ（手書き・生成・エディタが保存したもの）を機体で歩きながら、周りで戦闘が起きている迫力を試す入口。`?src=hand|gen|edit` で M1 の B の手書きのマップ・生成したマップ・エディタが `localStorage` に保存したマップを選び（既定 `hand`。`edit` で保存が無いときは「保存されたマップが無い」を出して空のマップで開く）、`?fx=0|1|2|3` で濃さを選び（0 は演出を全部切った見た目で、`mech=4` なら `#view-map` と同じ。1 は弱、2 は中、3 は強。既定 2）、`FX_TUNE` の各項目を同じ名前でさらに上書きできる（例 `?fx=3&pixel=0.4&tracers=6`）。`?seed=<n>` は場面の種。`?mech=<m>` は機体の高さ（3〜8m、既定は `MECH_TUNE.height` の 4）で、仮の模型を `mech/4` 倍にし、足元は地面に付けたままにする。機体は `#view-map` と同じく物と目標に入らず、斜めに当たると壁に沿って滑る。当たり半径は `?mech=` とつまみに比例する（`MECH_TUNE.radius` × `mech/4`。`?mechMove=0` でも比例し、`?mech=8` で 2m）。`?mechCam=0` はカメラの距離・肩・注視点の高さ・上への持ち上げ・狙うときの距離を、`?mechMove=0` は歩き・ブーストの速さと加速・ジャンプの初速を `mech/4` に比例させない（ジャンプの初速は `sqrt(mech/4)`。既定はどちらも比例）。`MOVE_TUNE`・`CAMERA_TUNE` は 4m 用で、`?mech=8` にすると SB-100 の前の 8m の値に戻る。物と歩兵の大きさは 8m の機体に合わせて決めたときのまま。機体の始まりは地図の手前の端から、`mech` に比例したカメラの距離＋4m 内側にして、カメラが地図の外に出ないようにする。味方の歩兵は海側から波で出て -z へ進み、倒れた人と抜けた人を数える。砲撃は機体のまわりの輪に落ちて閃光・破片・灰色の煙を出し、近いほどカメラを揺らす。残骸からは煙の柱が立ち、曳光弾が画面を横切り、飛行機はマップの左右の端の外側（`PLANE_MARGIN`）まで機体と関係なくマップの座標で横切る。地面には `stream('craters')` の種から散らした砲弾穴があり、`craterWater` の割合で水が溜まる（見た目だけで、地面の高さ・機体の歩き・当たり判定は変えない）。砲撃は `shellCrater` が 1 なら落ちた所に新しい穴を残し、`craterCap` を超えると古いものから消える。見た目は `pixel` の解像度と canvas の CSS の `filter`（`saturate`・`contrast`・`sepia`）と霧で作る。`light` はシーンの全部の光の強さに掛ける倍率、`sun` はそのうち `DirectionalLight` だけにさらに掛ける倍率、`groundColor` は地面のタイルの色（タイルごとの濃淡は残す）で、色は URL では10進の数値で上書きできる。煙の色は `smokeColor`・`smokeDark` で変えられる（URL のみ）。右上のつまみは `FX_TUNE` の主な値をスライダーで変え（歩兵の人数・煙の上限・穴の数と上限・穴の半径と水の割合は「やり直し」で作り直す）、`mech` のスライダーと `mechCam`・`mechMove` のチェックも置き、折りたためる。「書き出し」は今の値を JSON で `<textarea>` に出し、`window.sbFxReport()` が同じ JSON に機体の高さ・比例のありなし・歩きとブーストの速さ・描く回数・三角形の数・直近の fps を足して文字列で返す。左上に選んだ `src`・前進・倒れ・抜けの人数（戦場の歩兵が上限に当たっているときは「上限」も）・煙の塊の数と描く回数・三角形の数・fps を出し、`window.sbFxReport()` と書き出しの JSON にも `src` を出す。演出はゲームの状態に影響しない
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
| `ally` | `{ kind: 'ally', id, path, fate? }` | 味方の台本。本体は味方の機体を出す（5章「台本の味方の機体」）。`fate` は `{ at, by }`（`at` は `places` の名前、`by` は `ALLY_FATES` の1つ。今は `mortar`） |
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
| `depot-guard` | `enter depot-approach` | `spawn depot-guard` |
| `depot` | `destroyed depot` | `flag depot-down`・`radio m1.depot-down` |
| `cp1` | `destroyed pillbox-1, pillbox-2` | `checkpoint cp1` |
| `wave2-lost` | `after cp1 4` | `cutscene wave2-sinks`・`radio m1.wave2-lost`・`map wave2 off`・`objective take-seawall`・`spawn seawall-drop` |
| `c-squad` | `enter c-line` | `spawn c-squad` |
| `seawall` | `enter seawall-top` | `checkpoint cp2`・`objective silence-battery`・`spawn battery` |
| `gun1` | `destroyed main-gun-1, main-gun-2`（どれか1つ） | `radio m1.gun1-down` |
| `shutter` | `destroyed main-gun-1, main-gun-2`（全部） | `flag shutter-open`・`objective hit-magazine` |
| `win` | `destroyed magazine` | `cutscene beach-held`・`end cleared` |

場所は手書きのマップ `M1B_HAND`（奥行き 340m・幅 200m、z −170〜170）に合わせた座標で、+z が海。浜と B のトーチカ線は z 170 から z 0 あたり（トーチカは z −15）、C の2列（z −55〜−35）の奥に防波堤（z −75〜−65）、その陸側（z −75〜−170）がボスの場所で、主砲が z −135、弾薬庫が z −150。`b-line` は中心 z 135・奥行き 30（z 120〜150）、`seawall-top` は中心 z −70・奥行き 10（z −75〜−65、防波堤の帯）で、幅はどちらも 200。`depot-approach` は中心 (55, 52)・幅 50・奥行き 30（x 30〜80・z 37〜67。線2の先、集積所へ下りる道）、`c-line` は中心 z −30・奥行き 10（z −35〜−25）・幅 200（C の1列目の手前）。地面からは防波堤に塞がれて入れず、坂を上がって防波堤の上に乗ると入る。物は `depot`・`pillbox-1`・`pillbox-2`・`pillbox-3`（集積所の守り。目標「トーチカ2基」の数に入らない）・`main-gun-1`・`main-gun-2`・`magazine`、波は `beach-mortar`・`b-squad`・`depot-guard`・`seawall-drop`・`c-squad`・`battery`、目標は `reach-pillboxes`・`break-pillboxes`・`take-seawall`・`silence-battery`・`hit-magazine`、印は `wave2`、味方は `buddy`、道は `beach-run`、場所は `beach-mid`。道と場所の座標は `M1` の `paths`・`places`（`MissionDef`）に置く: `beach-run` は (10,166)・(24,156)・(40,146)・(40,135)・(40,110) を順に通り、`beach-mid` は (40,135)。道は浜の1列目の防風杭（z 131〜143）の切れ目（x 40 あたり）を通す。

### チェックポイント

- `checkpoint` は台本の状態を深いコピーで残す。コピーを取るのは、その cue の動きを全部当て終わってから（M1 の `seawall` は cp2 のあとに目標とボスを出すので、途中で取ると戻したときにどちらも出ない）。保存しない項目はチェックポイント自身だけで、前のチェックポイントを入れ子にしない
- `restoreCheckpoint` は最後のチェックポイントの深いコピーを返す。取った時点より後の cue は発火していない状態に戻る。戻した状態も同じチェックポイントを持つので、戻ったあとにまたやられても同じ所へ戻れる
- `checkpointReplay` は、戻したあとに画面を組み直す出来事（今の目標、出ている地図の印、出してまだ倒していない波）を返す。状態は出した波を `spawned` に持つ
- 報酬はチェックポイントで確定しない（ミッションの終わりでまとめて決める）

#### 本体のチェックポイントとやり直し

台本が `checkpoint` を出すと、本体も自分の状態を残す。やられたら、そこからか最初からやり直せる。定義場所は `GameSnapshot`・`retryFromCheckpoint`・`restartGame` in src/logic/game.ts。

- 取る所: `applyScriptOut` が、そのフレームの台本の出来事を全部当て終えたあとに、`checkpoint` の出来事があれば `GameModel.checkpoint` に深いコピー（`structuredClone`）を取る。cue の `spawn` が同じフレームにあっても、出した敵がコピーに入るため
- コピーの形: `GameSnapshot` は `GameModel` から保存しない項目を除いたもの + 取った id。除く項目は `events`（空）・`bullets`（飛んでいる弾は持ち越さない）・`checkpoint`（入れ子にしない）。項目を足したときは、除く項目に書かない限りコピーされる。`map` と `mission` は書き換えない定義なので、コピーせず同じものを指す
- `retryFromCheckpoint(game)` は、コピーをもう一度深くコピーして新しい `GameModel` を返す（元は変わらない）
  - 戻る: 機体の位置・時計・敵（波は出し直さない）・目標・壊せる物・台本（`restoreCheckpoint` と同じ中身）・無線・味方の機体 `allies`（走っている位置と落ちた印。取ったときが走っている途中なら、そこからまた走って落ちる）
  - 満タンに戻る: 装甲（`MECH_TUNE.armor`）、メインとサブの弾数と待ち（`M1_LOADOUT` の表）。`downed`・`cleared` は false、`fcs` は新しく、`aimTarget` は null、`bullets` と `shells` は空（着弾予告は持ち越さない）。砲撃 `barrages`・地雷 `mines`・砲台の状態（`shutters`・`battery`。機銃の待ちと動き出したか）・トーチカの状態（`pillboxes`。待ち `wait` はコピーのまま、予兆 `warn` と連射 `shots`・`shotWait` は 0 に戻す）はチェックポイントのまま
  - `retries` は前の値 + 1（やり直した回数。修理費と弾の積み直しの請求は SB-210 が使う）。`checkpoint` は同じものを持つので、続けてやられても同じ所へ戻る。`events` は `{ kind: 'retried', from: <id> }`
  - チェックポイントが無いときは例外
- `restartGame(game)` は `newGame(game.map, game.mission)` で最初から。`retries` は前の値 + 1、`events` は `{ kind: 'retried', from: null }`、`checkpoint` は null

### 本体とのつながり

- 本体が台本に渡す入力: 壊れた目標の `destroyed`、入った場所の `enter`、波の敵が全部倒れたときの `cleared`
- 台本の出来事を本体が受ける所: `radio` は最後の1行を覚える、`spawn` は波の敵を出す、`ally` は味方の機体を出す、`end` で出撃が終わる、ほかは出来事に残すだけ
- 味方の機体が落ちたことは台本に返さない（台本の trigger に味方の種類が無い）。本体の出来事 `allyDown`（`id`・`x`・`z`・`by`）で画面に知らせる
- M1 の `main-gun-1`・`main-gun-2`・`magazine` は `M1B_HAND` の防波堤の陸側にあり、撃って壊すと台本に `destroyed` が渡る。`seawall-top` は `M1B_HAND` の防波堤の上にあり、坂を歩いて上がると入る。坂から台本の終わりまでは `test/integration/battery.test.ts` が入力で通す
- カットシーンの間の入力と、カットシーンの画面は、7章「カットシーンの演出」

### カットシーンの演出

台本の `cutscene` の間、カメラの通り道・文・見た目の出来事を表で持ち、上下に黒い帯を出して流す。定義場所は `CUTSCENES` in src/data/cutscenes.ts（表）、`cutscenePose`・`keyPose`・`cutsceneLine`・`cutsceneEvents`・`hasCutscene` in src/logic/cutscene.ts（時刻から引く純粋な関数）、`buildCutsceneView`・`drawCutscene` in src/view/cutscene.ts（帯・カメラ・艇・着弾・砲台の崩れ）、`armSkip`・`takeSkip` in src/app/skip.ts（飛ばす）。

- 表（`CutsceneDef`）: カットシーンの id ごとに、時刻は流し始めからの秒で持つ
  - `camera`: キーフレームの列 `{ at, pos, look, rel? }`（時刻・カメラの位置・見る点。マップの座標）。最初のキーより前は最初の姿勢、最後のキーより後は最後の姿勢
  - `rel: true` のキーは、`pos` と `look` の x・z が機体の x・z からの差（y は高さのまま）。機体がどこにいるか決まっていないカットシーン（`wave2-sinks`）で、機体の位置から始めて機体の位置に戻すため。`cutscenePose(id, elapsed, mech)` が `keyPose` でマップの座標にしてから混ぜる（`rel` のキーがあるのに `mech` を渡さなければ例外）。画面は `game.mech` を渡す
  - `mech`（省略可）: 機体の道 `{ at, pos }` の列（時刻・足元の位置。マップの座標）。キーとキーの間は直線を一定の速さで歩く。最初のキーより前は最初の位置、最後のキーより後は最後の位置に立つ。省くと機体を描かない。`landing` だけが持ち、最後のキーは `CUTSCENE_SEC` ちょうどで、機体の始まりの位置（`newGame` の `game.mech`）に合わせる（unit テストが比べる）
  - `lines`: 文の時間割 `{ from, to, key }`（出す秒・消す秒・言語キー）。重ならない。間は何も出ない
  - `events`: 見た目の出来事。座標はマップの座標
    - `sink`: `x`・`z`（艇の船体の始まり。省くと始まりの艇の z）の艇が `sec` 秒かけて傾いて沈む
    - `arrive`: `x`・`z` の艇が、`from` の z から `sec` 秒かけて進んで着く
    - `burst`: `x`・`z` に砲弾が落ちる（`shellBurst` in src/view/hazards.ts と砂煙）
    - `collapse`: `targets`（ミッションの物の id）が `sec` 秒かけて沈んで傾く
    - `ramp`: 始まりの艇のランプが `sec` 秒かけて上がった形から下りる
  - 表の時刻は `CUTSCENE_SEC`（7章「動き」）を超えない。`landing` の最後のキーは `CUTSCENE_SEC` ちょうどにして、その姿勢を本体のカメラ（`CAMERA_TUNE`、ピッチ 0）の始まりの位置に合わせる（unit テストが比べる）。`wave2-sinks` は防波堤の上を見せるため合わせず、最後のキーで止めて終わると本体のカメラに切り替わる。`beach-held` は結果の画面へ進むので合わせない
- カメラ: キーとキーの間は、時刻をなめらかに（`u*u*(3-2u)`）して位置と見る点を線形に混ぜる。そのためキーの時刻ちょうどは、そのキーの値で、前後で速さが 0 になる。画角は `CAMERA_TUNE.fov`。カットシーンが終わると、次のコマから本体のカメラに戻る。カットシーンの間も本体のカメラは機体の始まりの位置の後ろに置いてあり（遅れて追わず、そこに合わせる）、カメラのピッチもカットシーンの間は動かさない。そのため `landing` が最後まで流れても飛ばされても、次のコマの本体のカメラは最後のキーの位置（誤差 0.5m 以内。e2e テストが比べる）で、跳ばない
- 文: `cutsceneLine` が今の秒の言語キーを返す（なければ null）。下の帯の中に、`t(key)` の文字で出す
- 見た目の出来事: `cutsceneEvents(id, from, to)` は `from` より後で `to` 以前の出来事を返すので、コマごとに呼ぶと各出来事は1回だけ出る。画面はこれで砂煙を出す。艇の沈み方・着き方・ランプの角度・物の崩れ方は、経過秒と表の `at`・`sec` から毎コマ決める（見た目だけで、当たり判定・マップの検査には入らない）
- 帯: 上下に高さ 12vh の黒い帯（`#sbCutscene`。`#view-hud?cut=1` の見本の帯に合わせる）。文は下の帯の中の真ん中。カットシーンの間は HUD（`#sbPlayHud`）を隠し、終わると出す。帯は `pointer-events:none`
- 海の艇: 表の `sink`・`arrive` の数だけ、始まりの艇と同じ作り（`buildCraft` in src/view/shore.ts）の艇を置く。そのカットシーンの間だけ見え、`sink` は沈み終えると消える。物の崩れ（`collapse`）は、`buildCutsceneView` が渡された `world.targets` の模型の高さと傾きを動かす（`COLLAPSE_DEPTH` 3m・`COLLAPSE_TILT` 0.35 rad。1つおきに逆へ傾く。崩す物の id が無ければ例外）。始まりの艇のランプは別のメッシュ（`${CRAFT_NAME}Ramp`）で、カットシーンの外では下りた形
- 入力: 台本の `cutscene` の間（`game.script.cutscene` が null でない間）は、`step` が機体に何も押していない入力を渡す。動かず、撃たず（メインもサブも）、ジャンプもブーストもしない。敵・砲撃・弾・台本の時間は止まらず進む。台本が最初の `stepScript` でカットシーンに入るので、出撃の最初の1コマだけは入力が通る
- 砲撃: カットシーンの間は、砲撃（`game.barrages`）が数えず、着弾予告を出さない。もう予告した弾は落ちる。カットシーンが終わるか飛ばされると、そこから数え始める（機体が動けない間に被弾しないため。`stepHazards` in `src/logic/game.ts`）
- 被弾: カットシーンの間は、機体の装甲が減らない（弾は機体で止まる）。機体が動けない間に倒されないため（`damageMech` in `src/logic/game.ts`）
- 機体: 表に `mech`（機体の道）があるカットシーン（`landing`）の間は、模型を道に沿って描く。艇の甲板に立ち、ランプが下りたあとランプを歩いて降り、終わりに始まりの位置に着く。歩く間は脚を振る（`cutsceneMech` in `src/logic/cutscene.ts` が位置と地面の上の速さを返し、`drawMechWalk` in `src/view/mechDrive.ts` が `mechMotion` の歩きにその速さを渡す）。見た目だけの動きで、ゲームの機体（`game.mech`）は始まりの位置のまま動かさない。飛ばし・チェックポイント・中断で整合を取る必要がなく、飛ばすと次のコマから模型はゲームの機体（始まりの位置）に戻る。機体の道が無いカットシーン（`wave2-sinks`・`beach-held`）の間は、模型を描かない（`drawPlay` in `src/view/play.ts`）
- 飛ばし方: クリック・タップ（`pointerdown`）・Enter・Space・Esc のどれでも飛ばせる。出撃の開始より前の押し込み（出撃を始めたクリックや Enter）と、押しっぱなしの繰り返し（`repeat`）は数えない。`update` が `step` の後に取り、`game.script.cutscene` があれば台本に `skip` を渡す（`cutsceneEnd` が出て、次のコマから本体のカメラと HUD）。飛ばしても台本の状態は、最後まで見たときと同じ（台本の時計だけ、見た秒の分だけ小さい）
- 表に無いカットシーン: 表の無い id（今は無い）は流さず、`update` が `step` の直後に台本へ `skip` を渡すので、描かれる前に終わる。台本の出来事（`cutscene` と `cutsceneEnd`）は出る
- やり直し: 最初からのやり直し（`restartGame`）は台本が最初に戻るので、また流れる。チェックポイントからのやり直しは、`intro` が済んだ状態に戻るので流れない
- 文言: `cutscene.landing.wave`・`cutscene.landing.hit`・`cutscene.landing.ramp`・`cutscene.wave2.hit`・`cutscene.wave2.none`・`cutscene.held.silent`・`cutscene.held.landing`（ja・en）
- `landing`（10 秒）: カメラは 0 秒 艇の後ろの海の上 → 4 秒 横から艇の列 → 7 秒 ランプの脇（x 16・z 172）から、甲板の機体と下りるランプ → 10 秒 機体の後ろ。文は 0.5〜3.5 秒「第1波、上陸」、3.8〜6.3 秒「2番艇、被弾」、6.5〜9.5 秒「ランプ、下ろせ」。出来事は 4.2 秒に x −20 の艇が 2.5 秒かけて沈み、7 秒にランプが 1.5 秒かけて下りる。機体は 7.5 秒まで甲板（y 1.7・z 180）に立ち、8.5 秒にランプの蝶番（z 175）、9.3 秒にランプの先（y 0・z 170.3）を通り、10 秒に始まりの位置（x 0・z 166）に着く
- `wave2-sinks`（6 秒）: 台本の `wave2-lost`（トーチカ2基を壊した 4 秒後）で流れる。カメラは 0 秒 機体の後ろ（x 0・z +10・高さ 7、相対）から海を見る → 1.8 秒 浜の端（z 150）から沖の艇の列 → 3.6 秒 浜の端（z 165）でさらに近く → 5.2 秒 機体の後ろ（x 2.15・z +14・高さ 9、相対）から防波堤の方（z −50）を見て、6 秒まで止まる。艇は4隻（x −40・−14・16・42、z 205・222・208・226）で、1.4・1.9・2.4・2.9 秒に 1.8 秒かけて沈み、その 0.2 秒前に近くへ着弾する。文は 0.6〜3.2 秒「第2波、被弾」、3.4〜5.9 秒「後続、来ず」。防波堤の上の増援は同じ cue の `spawn` で出るので、画面はそれを描く
- `beach-held`（8 秒）: 台本の `win`（弾薬庫を壊した）で流れ、終わると結果の画面。カメラは 0 秒 砲台の手前（z −105・高さ 14）から砲台 → 3 秒 そのまま → 5 秒 浜（z 140）から海 → 8 秒 浜の上（z 110）から浜の奥（z 40）。出来事は 0.3・0.6・1 秒に主砲 2 基と弾薬庫へ着弾、0.8 秒から 2.2 秒かけて主砲 2 基（`main-gun-1`・`main-gun-2`）と弾薬庫（`magazine`）が沈む、3.2 秒に x −35（2.5 秒かけて z 230 から）、3.6 秒に x 40（z 240 から）の艇が浜（z 175）へ着く。文は 0.5〜3.5 秒「砲台、沈黙」、4.5〜7.5 秒「上陸、再開」。浜の歩兵は戦場の層（`view/battle/`）の味方が歩いているのをそのまま映す

## 8. マップ

M1 の浜・B トーチカ線・C・防波堤とボスの場所（z −170〜170、x −100〜100）を、手書き・生成・簡易エディタの3つの作り方で同じ形のデータにする。決めるのは遊ぶ人と Claude で、どの作り方がよいかはこの仕様では決めない。

- `MapDef`（`src/data/types.ts`）は `id`・`bounds`（`minX`・`maxX`・`minZ`・`maxZ`）・`props`・`targets`・`spawns` と、省略できる `mines`（`MinePlace`: `x`・`z`）を持つ。`bounds` の外は作らない
- `Prop` は `kind`・`x`・`z`・`yaw`・`scale`・`breakable?`。種類（`PropKind`）は `tile`（地面）・`hedgehog`・`block`・`bunker`・`seawall`・`cliff`・`crater`（低い凹み）・`wreck`（壊れた艇や車両）・`lowWall`（低い障害物）・`stairs`（防波堤へ上る階段1本）・`ramp`（防波堤へ上る坂1本）。`breakable: true` は撃つと壊れる物の印。体力は種類ごとに `PROP_HP`（仮）で、`hedgehog` 30・`block` 60・`bunker` 150・`seawall` 120・`wreck` 80・`cliff` 300・`lowWall` 40（`tile`・`crater`・`stairs`・`ramp` は 0。階段と坂は壊さない）。壊れると機体の当たりと弾の箱から外れて通れる。見た目は低い暗い残骸（`BROKEN_SCALE_Y`）で、`InstancedMesh` と描く回数は増えない
- `TargetPlace` は `id`・`kind`・`x`・`z`・`yaw`。種類（`TargetKind`）は `pillbox`・`depot`・`gun`・`magazine`。`spawns` は波の名前 → `SpawnPoint`（`x`・`z`）の一覧
- 物と目標の大きさは `src/data/props.ts` の `PROP_SIZE`（物）・`TARGET_SIZE`（目標）に置く。`PropSize` は `w`（x の幅）・`h`（高さ）・`d`（z の奥行き）・`blocks`（機体の通り道を塞ぐか）。物の大きさは高さ 8m・当たり半径 2m の機体に合わせて決めたときのまま。機体は今 4m・当たり半径 1m（`MECH_TUNE`）で、ジャンプの最高点は約 2.2m なので、対戦車障害物（3m）は跳んでも越えられない。描く形（`src/view/outdoor.ts`）も検査も当たりもこの表を読む。`breakable` の物は同じ形のまま色を少し赤っぽくし、種類ごとの `InstancedMesh` と描く回数は増やさない（`instanceColor`）
- 低い障害物 `lowWall` は 6×0.85×1m（`PROP_SIZE`）。段差 `MOVE_TUNE.stepHeight`（0.75m）より高いので歩いては越えられず、ジャンプの最高点（約 2.2m）より低いので跳ぶと越えられる
- 階段 `stairs`（`STAIRS_TUNE`・`STAIR_RISE` in `src/data/props.ts`）は幅 8m で、1つの物が段ごとの四角になる（`mapBlockers` が `STAIRS_TUNE.steps`＝9 の四角を出す。`propRects` in `src/logic/mapShapes.ts`）
  - 段は奥行き `STAIRS_TUNE.run`（1.5m）、1段の高さ `STAIR_RISE` は防波堤の高さ（`PROP_SIZE.seawall.h` 6m）を段の数で割った 0.667m で、段差 0.75m 以下。n 段目の `top` は `STAIR_RISE × n`、最上段は防波堤と同じ高さ。`scale` は幅・段の奥行き・高さに掛かる
  - `yaw` 0 で -z の向きへ上り、最も低い段が +z 側。`yaw` で段の並びごと回る（`yaw` π/2 で -x の向きへ上る）。壊れず（`PROP_HP` 0）、斜めの面の当たりは無い（四角は段ごと）。`blockingPropIndexes` は四角ごとに元の物の番号を返すので、階段は段の数だけ同じ番号が並ぶ
  - 見た目は段の箱ではなく坂（手前の上の辺を地面まで下げた箱）で、段ごとの `top` の奥の辺を通る。種類ごとに `InstancedMesh` 1つで、描く回数は増えない
- 坂 `ramp`（`RAMP_TUNE` in `src/data/props.ts`）は幅 8m・長さ 18m・高さ 6m（防波堤と同じ）のくさび形で、1つの物が1つの四角になる（`mapBlockers` が `ramp: true` の四角を1つ出す。`propRects` in `src/logic/mapShapes.ts`）
  - `yaw` 0 で -z の向きへ上り、低い端が +z 側。`yaw` で坂ごと回る（`yaw` π/2 で -x の向きへ上る）。壊れず（`PROP_HP` 0）。四角の `top` は高い端の高さで、`logic/collide.ts` の `surfaceAt` が四角の上の位置から低い端の 0 へ線形に下げる
  - 機体の足元は `groundAt` が返す坂の面の高さをそのまま使う（段差 `stepHeight` は使わない）。坂の中央が四角の上にあるときだけ面を読み、`radius` の重なりでは読まない（低い端は地面から段なく入り、高い端は防波堤の上面に段なく続く）。坂の横の面はどの高さでも壁で、坂の上にいる機体は `pushOutCircle` が当たり半径の分だけ幅の内側に留める（低い端と高い端は面の高さに応じて通す）。
  - 傾きは `atan2(高さ, 長さ)` で約 18.4°。歩いて上がれる傾きの上限 `RAMP_TUNE.maxSlopeDeg`（20°）を超えたら物の表の検査（`test/unit/ramp.test.ts`）が落ちる。テストは 6m・18m・20° を値で持ち、上限を上げて通す形にはしない
  - 見た目は、低い端の辺から高い端の上辺へ上がる斜めの面と、両側の三角形の側面で、色と質感は階段と同じ。斜めの面は手で並べた頂点で法線を上向きにする
- 目標の体力は `TARGET_HP`（仮。`pillbox` 100・`depot` 60・`gun` 200・`magazine` 80。武器の表の威力で減り、トーチカは横・後ろからは機関砲10発・砲2発、正面からは機関砲40発・砲7発で壊れる（`PILLBOX_ARMOR`）。SB-190 で決め直す）
- 手書きは `src/data/maps/m1b-hand.ts`。範囲は x −100〜100・z −170〜170。物は1行に1つ書き、数を数える関数は置かない。目標は `pillbox-1`・`pillbox-2`・`pillbox-3`・`depot` と、ボスの場所の `main-gun-1`・`main-gun-2`・`magazine`、波は `b-squad`・`depot-guard`・`seawall-drop`・`c-squad`。地雷は浜（z 148〜162、x −60〜60）に6個で、機体の始まり（x 0, z 166）から 6m 以上離す
  - B は「三重の防御線」: z 128〜146・z 80〜96・z 8〜26 に、それぞれ対戦車障害物を3列（列の間 6m 前後、同じ列の中は 4.4m 以下の間隔で均等に並べる）。線1の突破口は x −55 と x 40、線2は x −10（ほかに壊せる区間 x 40〜60）、線3は x 61（ほかに壊せる区間 x −40〜−20）。突破口はどれも四角の間で 9m 前後、壊せる区間は幅 15m 前後。同じ列の中の隣との四角の距離は 2m 未満（最大 約 1.3m）で、当たり半径 1m の機体は突破口と壊せる区間を壊したあとでなければ列を抜けられない
  - 防波堤は z −75〜−65 に `seawall`（8×6×4m）を z −73・−70・−67 の3列、x −96 から 96 まで 8m おきに25個ずつ並べ、x −100〜100 に隙間が無い（3列は1m ずつ重なる）。その陸側（z −75〜−170）は高さ 0 の平らな地面で、防波堤の上から -z へ歩いて降りると、降りた所で高さが 0 に戻る（下のボスの場所）
  - 坂 `ramp` は2本、x −50 と x 35（`yaw` 0。高い端を海側の面 z −65 に合わせ、長さ 18m ぶん z −65 から z −47 まで海側へ延ばす）。上ると防波堤の上（高さ 6m）に乗れる。C の手前の列（z −50・z −40）の突破口（x −50・x 35）の真後ろに置き、突破口をまっすぐ抜けるとそのまま坂の低い端に乗る（防波堤への道を突破口が決めるため）。階段 `stairs` は種類として残すが、M1 では使わない
  - 低い障害物 `lowWall` は浜（z 154）に5個（x −42・−18・6・30・54）。間は 14m 以上あいて回り込めて、地雷と重ならず、機体の始まり（x 0, z 166）から 4m 以上離れる
  - C の手前（z −55〜−35）は2列で突破口が2か所。線の間には塊・残骸・クレーターの遮蔽物をそれぞれ 10〜12 個、線3の奥に6個ほど置く
  - ボスの場所は防波堤の陸側（z −75〜−170）。「防波堤の上の巨大な砲台」の部位を目標として置く: `main-gun-1`（種類 `gun`、x −30, z −135）・`main-gun-2`（`gun`、x 30, z −135）・`magazine`（弾薬庫、x 0, z −150）。大きさは `TARGET_SIZE`（`gun` 14×8×14m、`magazine` 10×8×10m）で、主砲の間は 60m、主砲と弾薬庫の間は約 33m。台本はこの3つの名前で主砲2門 → 弾薬庫の順に進む（7章）。シャッターと、砲台が撃ってくる動きは「ボス（沿岸砲台）」
  - 降りた先（z −80〜−115）の遮蔽物は塊 7 個と残骸 4 個（1行に1つ）。どの2つの間も中心で 20m 以上あいて機体（当たり半径 1m）が通れ、防波堤の降り口から砲台へは遮蔽物で視線の一部が遮られる。主砲と弾薬庫のまわり（z −117 より奥）には置かない
  - 目標は `pillbox-1`（x −33, z −15）・`pillbox-2`（x 22, z −15）・`depot`（x 53, z 31）。`b-squad` はトーチカの後ろ（z −25〜−35）、`seawall-drop` は防波堤の上（z −70。x −62・−30・−10・10・24・50 で、坂 x −54〜−46 と 31〜39 の幅に入らない。高さ 6m は `M1_WAVE_DROP`）で、出るとすぐ海側へ跳び降り、z −64 あたりに着く。`pillbox-3`（`pillbox`、x 58, z 52）は集積所の守りで、集積所の 21m 海側に置き、線2の壊せる区間（x 50）から下りてくる道をにらむ。`depot-guard` の3か所は集積所の両脇と海側（(40,36)・(66,32)・(60,42)）、`c-squad` の4か所は C の2列の間（z −45、x −70・−20・15・65）。崖は右の辺のまま
- 生成は `generateMap(rng, rules, anchors)`（`src/logic/mapgen.ts`）。`MapRules` は帯（`minZ`・`maxZ`・`kind`・`count`・`minGap`）・防御線（`lines`）・右の辺の崖・目標のまわりの空き（`clear`、既定 10m）・道筋の帯（`lanes`）を持つ。目標と波の出る場所は物語に関わるので生成せず `anchors` で受ける。M1 の B の規則は `src/data/maps/m1b-rules.ts` の `M1B_RULES`（`lanes` は空で、列の中はすき間が 2m 未満に閉じているので、通り道は防御線の突破口が決める）
- `MapLine` は `z`（線の真ん中）・`depth`（奥行き）・`rows`（列の数）・`kind`・`spacing`（同じ列の中の間隔）・`gaps`（突破口の真ん中と、四角の間の幅）・`breakable`（壊せる区間の真ん中と幅）を持つ。生成は列ごとに `spacing` で x に並べ、奇数の列を `spacing / 2` ずらし、位置を ±1m・向きと倍率（0.9〜1.1）を少し揺らす。隣の物との四角の距離が `CRACK`（1.5m）を超えたら前の物へ引き寄せる。列の左の端は辺から `CRACK` 以内に寄せ、右は崖の遠い側の面から `CRACK` 以内に届くまで並べる。`spacing` は 4.4（3m の逆茂木の間を 2m 未満に保つ）。`gaps` には四角が入らないように物を置かず、`breakable` の区間の物に `breakable: true` を付ける。帯の物は防御線の z の範囲には置かない
- 生成は物を置いたあと通り道を調べ、通れなければ種をずらして作り直す（最大10回。だめなら例外）。`rng` は `logic/rng.ts` の `stream('map')` から引く
- 簡易エディタは `#view-mapedit`（`src/dev/views/mapEdit.ts`）。編集は `localStorage` の `stormbreacher-dev-map` に保存し、`#view-map?src=edit` が読む。開発用なので保存キーは `src/dev/map/store.ts` に置く
  - 目標の id は最初「選んで」（空）で、空のまま目標を置こうとすると置かずに「id を選んで」と出す。すでにある id を選んで置くと、増やさずにその目標をクリックした所へ動かす
  - 物を選んでいるとき「壊せる」で `breakable` を切り替える。書き出しの JSON には `breakable: true` のときだけ出す
- `validateMapForMission(map, mission, skip)`（`src/logic/mapCheck.ts`）は違反の一覧 `{ kind, message }[]` を返す（例外にしない）。`skip` は範囲の外にある波と目標の名前
  - 台本の `targets` が全部マップにあり、マップにしか無い目標が無い。同じ id の目標が2つあれば `target-duplicate`。台本で `spawn` する波が全部 `spawns` にある
  - 物と目標が `bounds` の中にあり、目標どうしが 12m より近くない
  - 道は防波堤が無い地図で1区間、ある地図で2区間を見る。どちらも当たり半径 `MECH_TUNE.radius`（1m）の機体が通れる道があるか。2m 四方の格子にして幅優先で調べ、塞ぐ物の扱いは共通（下）
  - 区間1: 範囲の手前（`maxZ`）から奥（`minZ`）まで、当たり半径 `MECH_TUNE.radius`（1m）の機体が通れる道があるか。2m 四方の格子にして幅優先で調べ、`PROP_SIZE` の `blocks` が真の物と目標を、表の `w`×`d` に `scale` を掛け `yaw` で回した四角として避ける。検査は壊す前の形で見るので、`breakable` の区間は塞ぐ物として数え、壊さなくても突破口で通れること。格子の点から四角までの距離が 1m より近ければ塞がれている。`crater` と `tile` は避けない。階段（`stairs`）と坂（`ramp`）は低い端から歩いて上がる物なので、検査では塞ぐ物に数えない（突破口の真後ろの階段や坂で道が閉じないため）。物が範囲の外に出ているかは中心で見る。防波堤（`seawall`）がある地図では、機体は階段か坂で上がるので、区間1は「手前から防波堤の海側の面の手前（面から当たり半径 1m と格子1つ分あけた行）まで」で終わる（`goalRow` in `src/logic/mapCheck.ts`）。防波堤が無い地図（生成）は奥の端まで見る。階段と坂は検査では歩かず、上がれることは歩く結合テストで確かめる
  - 区間2（防波堤がある地図で、防波堤の陸側の面より奥に目標がある場合だけ。`checkBehind` in `src/logic/mapCheck.ts`）: 陸側の面から当たり半径 1m 以上離れた最も手前の行の空いた格子点をどこからでも始めて、陸側の面より奥にある目標ごとに、その四角の縁から `TARGET_REACH`（4m）以内の空いた格子点へ着けること。降りる所は防波堤の上のどこでもよいので、区間1の続きにはせず陸側の面の行から始める。着けない目標ごとに `no-path` を1つ出す。階段や坂を下りる歩きは検査せず、結合テストが防波堤の上から歩いて降りる
  - 生成（`generateMap`）は、規則の `bounds` の外にある目標を作る地図に入れない。M1 の規則（z −60〜170）は手書きの `main-gun-1`・`main-gun-2`・`magazine` を持たず、防波堤も置かないので、区間1だけを見る
- 機体は、`mapBlockers`（`src/logic/mapShapes.ts`）が作る四角（`blocks` が真の物と全部の目標。表の `w`×`d` に `scale` を掛け `yaw` で回したもの。通り道の検査と同じ）から、当たり半径 `MECH_TUNE.radius` 以上離れた所に押し出される（`pushOutCircle` in `src/logic/collide.ts`）
- 押し出したあと、壁へ向かう速さだけを消し、壁に沿う速さは残すので、斜めに当たると滑る（`stepMech` in `src/logic/mech.ts`）。1歩は `MOVE_TUNE.maxStep` 以下に刻むので、ブーストでも薄い物を抜けない
- 高さを見る。物と目標の四角は上の面の高さ `top`（m）を持ち（`GroundRect.top`。`mapBlockers` が物は `PROP_SIZE` の `h` × `scale`、目標は `TARGET_SIZE` の `h` を入れる）、`top` の無い四角はどの高さからも越えられない壁になる。坂（`ramp`）の四角は `ramp: true` で、`top` を高い端の高さとし、`surfaceAt` in `src/logic/collide.ts` が位置に応じて低い端の 0 まで線形に下げる。弾とカメラの線が当たる箱は `rectBoxes` が作り、坂は面に沿った段の箱の集まりにするので、低い端の上の空間を飛ぶ弾は坂に当たらない。地面にいる機体は、足元から `MOVE_TUNE.stepHeight`（仮 0.75m）までの物には歩いて乗る。それより高い物は壁になり、押し出される。坂の上では足元の高さを面の高さそのものにし、下りでは stepHeight 以内の下がりを歩いて降りる（ほかの物から歩いて外れると、その高さから地面へ落ちる）。坂の横の面はどの高さでも壁で、坂の上にいる機体は幅の外へ歩き出せない。跳んでいる機体は、足より低い物の上を越えられ、その上に降りられる。`breakable` の物も壊れるまでは当たる
- 効くのは `#view-map` と `#view-fx`。平らな地面の入口（`#view-move`・`#view-touch`・`#view-play`・`#view-fcs`）の的には当たらない
- 海と揚陸艇（`buildShore` in `src/view/shore.ts`。見た目だけで、当たりも検査も無い）: `buildWorld` が作り、`#view-map`・`#view-fx`・本体が同じ関数を通る。出撃をやり直すと `World.shore` ごと外す
  - 海: 範囲の手前の端（`maxZ`）から +z へ 260m（`SEA_DEPTH`）、x は範囲の両側に 160m ずつ広げた平面を1枚。高さは砂より少し低い -0.1m、色は `SEA_COLOR`（`data/colors.ts`、霧と空より少し暗い青灰）。ミッションの見た目の表（`LOOKS`）は海に掛からず、霧の色だけが遠くを溶かす
  - 揚陸艇: 範囲の手前の端から 5m 後ろ（z 175）から +z へ長さ 12m の船体（幅 7m、甲板の高さ 1.7m、水に 0.6m 沈む）と、両脇の壁、後ろの壁、操舵室、浜（-z）へ下ろした開いたランプ（長さ 5m、先が砂に着く）。x は範囲の真ん中（機体の始まりの真後ろ）。箱の組み合わせで、船体（灰）と甲板（暗い灰）の2つのメッシュ（`buildCraft`。グループ名 `craft`）と、甲板の前の縁を蝶番にしたランプのメッシュ（暗い灰。グループ名 `craftRamp`。カットシーンで上げ下げする。7章「カットシーンの演出」）
  - 描く回数は海1・揚陸艇2・ランプ1の4回（カメラの視錐台の外にあるあいだは省かれる）
- 防波堤へは坂（`ramp`）を歩いて上がる。坂は1つの四角で斜めの面の高さを持ち、階段は段ごとの四角のまま残す（M1 では使わない）。M1 の範囲の外（浜より海側）に当たるものは置かない
