# STORMBREACHER 仕様

劣勢の戦線を、組み替えた機体で押し返す見下ろし（クォータービュー）のロボットアクション。M1（強襲上陸）を遊べる。

## 1. 位置づけ

- M1（強襲上陸）を遊べる。タイトルと「開発中」の札を出し、タイトルから出撃すると浜のマップで戦う
- トップページの一覧には出さない。ビルドには入るので、URL を知っていれば開ける。公開のビルドでもタイトルから出撃して遊べる（開発用の入口 `#view-…` は入らない）
- 一覧に出すまでは、検索エンジンに載らないよう `index.html` に `<meta name="robots" content="noindex">` を置く。一覧に出すとき（D-03）に外す
- 公開のビルドにも GA のタグは入る
- この器の上に、屋外の描画の測定（SB-010）・タッチ操作（SB-030）・寸法（SB-040）などの確認用の入口が26本乗る（`src/dev/views/index.ts`）

## 2. 構成

ソースは4層に分ける。`logic/` と `data/` は three も DOM も読まず、ページなしの node で動く。

| フォルダ | 中身 | 読んでよいもの |
|----------|------|----------------|
| `src/data/` | 表と定義（型・状態・調整の値） | `data/` と engine の core |
| `src/logic/` | 状態と1フレームの更新 | `data/`・`logic/`・engine の core |
| `src/view/` | 状態を読んで描く | `data/`・`logic/`・engine・three |
| `src/app/` | 入力・画面・起動 | すべて |

`logic/`・`data/` は three・DOM・`view/`・`app/`・`dev/`・`i18n/` を読まない。`data/` は `logic/` も読まない。`view/` は `app/` と `dev/` を読まない。`app/` は `dev/` を読まない（本体のページに開発用の入口が入らないため）。この向きは dependency-cruiser の規則（`sb-logic-data-no-render`・`sb-logic-data-inward`・`sb-data-is-data`・`sb-view-reads-only`・`sb-app-no-dev`・`sb-portable-no-game`）で止めてある。

- `src/view/camera.ts`: 画面の四角とカメラの箱を作る純粋な関数。`screenRect` は箱を画面へ投影した四角（`ScreenRect`）を返し（カメラの行列を読むだけで、書き換えるのは `updateMatrixWorld` のみ）、`cameraBoxesOfRect` は地面の四角（`GroundRect`）からカメラの箱（`THREE.Box3`）を作る。`scene` は読まない
- `src/view/world.ts`: マップの描き方を本体と開発用の入口で共有する。`syncWorld`（毎フレーム `dt` を受ける）が、壊れたトーチカを `PILLBOX_BREAK.sec` かけて砂へ沈ませ陸側へ傾け、ほかの壊れた目標をその場で低く暗い姿にし、壊れた物（`breakable` の物）・爆破で開いた物（`game.blasts` の `blasted` の点のハリネズミ）を低く暗い姿にする。シャッターの板も描く（6章「ボス（沿岸砲台）」）
- `src/view/outdoor.ts`: 地面と物を描く
- `src/view/shore.ts`: 海と揚陸艇を描く（9章。艇の寸法は `src/data/craft.ts`、歩ける面の四角は `src/logic/craft.ts`。プレイヤーの艇の両隣に、味方機を乗せた艇が並ぶ）
- `src/view/mechProxy.ts`: 寸法の確認用の仮の模型を描く（開発用の入口だけが使う）
- `src/data/colors.ts`: 地面の砂と空と海の色、敵・弾・爆発・トーチカ・爆破点の色を名前で持つ（HUD の色は3章「HUD」）
- `src/view/mechModel.ts`: 機体を箱で描く関数で、ゲームの状態に触らず、形を共有した単位の箱を色ごとに `InstancedMesh` で描く（1体の描く回数は使った色の数。色ごとの材質には `src/view/mechSurfaces.ts` が一度だけ描く絵（汚れ・番号・警告の縞・センサーの窓。`MECH_PAINT`・`MECH_PAINT_TEX` in `src/data/mech.ts`、色は `MECH_PAINT_COLOR` in `src/data/colors.ts`）を掛ける
- `src/view/mechMotion.ts`: 状態と角度の計算（three を読まない）
- `src/view/mechDrive.ts`: ゲームの状態から動きへの入力を作る
- `src/logic/mechTune.ts`: 脚の種類ごとの動きの値を作る `moveTuneOf`
- `src/data/mech.ts`: 機体の部品の表（腕・脚・背中・FCS の4スロットと武器2、胴は4スロットの外の枠、箱は高さの割合、色は名前、値は仮）と M1 の固定の1組 `M1_MECH`（見本 E の部品: 胴 `medium`・腕 `midArms`・脚 `midLegs`・背中 `pack`・FCS `blockHead`）、その色 `M1_MECH_PALETTE`（色の名前ごとの16進数）、武器の大きさ `M1_WEAPON_SCALE` を持つ。M1 の E 中量の部品は、装甲板の段・関節・脚の油圧・背中の箱と排気口・武器の銃身/弾倉/照準・頭のセンサーの窓を持つ（SB-1460。形は箱のままで、シルエットの寸法は D-24 の4m）
- `src/view/play.ts`: 出撃中の画面を組み立てて描く
  - 本体の機体は試作の機体（`buildProtoMech`・`src/view/mechProtoModel.ts`）を高さ `MECH_TUNE.height` で作り、向きと位置はゲームの機体に合わせる（材質ごとにまとめた SkinnedMesh。メッシュの名前は `mech-proto`）。動かすのは `animateProtoMech`。カメラが機体の胸から `MECH_TUNE.fadeDist` より近いと半透明にする判定は `mechSeeThrough` in `src/view/mechFade.ts`。出撃を作り直すときは `disposeProtoMech`（形・材質と、骨の質感を持つ skeleton）で片付ける。味方機も同じ試作の味方のキット（`allySniper`・`allyScout`）を `buildAllyMech`（`src/view/allies.ts`）で作り、`animateProtoMech` で動かす。敵の歩兵は `bakeProtoMech`（`src/view/mechProtoBake.ts`）で焼いた形を `src/view/enemies.ts` が `InstancedMesh` で描く（6章「敵」）。色は `PROTO_PALETTES` in `src/data/colors.ts`: 自機は白＋黄・青緑、狙撃は暗いオリーブ＋紺＋橙、偵察は暗い青灰＋白＋黄、敵は暗い灰＋赤。味方の印は型の色ではなく、肩の帯と番号の青緑 `PROTO_MARK_COLOR` で表す
  - 銃眼の予兆の光と、制圧されて黙った銃眼の煙を `InstancedMesh` 1つずつ（名前 `sb-pillbox-warn`・`sb-pillbox-smoke`）で描く（色は `src/data/colors.ts` の `PILLBOX_WARN_COLOR`・`PILLBOX_SMOKE_COLOR`。6章「トーチカ」）
- `src/data/looks.ts`: ミッションごとの見た目の表（`LOOKS`・`lookOf`）と光の元の強さ（`BASE_LIGHTS`）を持つ
- `src/view/look.ts`: 解像度・色味・霧・空・光・地面の色をかけ、`#view-fx`・`#view-hud`・本体が同じ関数を使う
- `src/view/field.ts`: 光は半球1つ・太陽1つ（engine の光は外す）
- `src/logic/planes.ts`: 飛行機の動き（機体と関係なくマップの座標で往復）を持つ
- `src/logic/battle.ts`: 戦場の層の進行（歩兵ドロイドの波と砲撃の予定。6章「戦場の層」）を、`src/view/battle/` が読んで描く（本体と `#view-fx` が同じものを使う）。歩兵は人間ではなくドロイドで、形は `src/data/droids.ts`（`DROID_PARTS.near` と `DROID_PARTS.far`・`DROID_JOINTS`・`DROID_TUNE`。近い形は面取りした札を重ねた胸と腰、関節の円筒、腿と脛の装甲、小さい暗い顔に横長の青緑のバイザーと白い殻をかぶせた頭（頭の上は 1.47m。胸の上の白い襟に首が収まり、首は短く見える）、小銃、背中のパック。遠い形は同じ輪郭の軽い形（体の色の割り当てだけ近い形に合わせ、胸の板や腿の枠は持たない）。`DROID_TUNE.nearDistance` 以内を近い形で `nearCap` 体まで）、組み立ては `src/view/droidModel.ts`（SB-1468 の形の道具で体と頭をまとめる）、姿勢は `src/view/droidPose.ts`（`writeDroid`・`showDroid`・`selectNearSoldiers`。膝を曲げた走り、待つときのしゃがみ、仰向けの倒れ）が持つ。色は味方の明るい灰・黄色・青緑の `DROID_COLOR` in src/data/colors.ts。パイロットと無線の声は人間のまま
- `src/logic/mech.ts`: 機体の歩く・跳ぶ・ブースト・着地を、状態を引数で受けて進める純粋な関数で、three も DOM も読まない
- `src/logic/fire.ts`: 正面への線が的の箱に当たるかを返す純粋な関数
- `src/view/feel.ts`: 動きの出来事からカメラの揺れ・FOV・ヒットストップ・砂煙を作る
- `src/data/sounds.ts`: 音の表（`SoundName`・`SOUND_NAMES`・音ごとの層 `SOUND_LAYERS`・1フレームの上限 `SOUND_FRAME_LIMIT`・距離 `SOUND_DISTANCE`・音量 `SOUND_VOLUME`・環境音 `SOUND_AMBIENT`）を持つ
- `src/view/sound.ts`: その表から出来事の音を選び、engine の合成音で鳴らす（10章「音」）
- `src/logic/fcs.ts`: 照準の線・機体の胸・的から、撃つ向きと `hard` が捕まえた的を決める純粋な関数。本体の射撃は `soft` を使う（`game.ts`）。撃つ向きは弾の出る所（機体の右腕の先）から照準の点へ向ける
- `src/logic/dummies.ts`: 動く的の動きと当たり
- `src/data/enemies.ts`: 敵の表（`EnemyKind`・`ENEMY_KINDS`・`ENEMIES`・波の名前から出る敵の種類の並びを引く `M1_WAVE_ENEMY`・撃つ高さの割合 `ENEMY_CHEST`）。歩兵の3種（`SoldierKind`・`SOLDIER_KINDS`）は着るキットを `src/data/enemyLooks.ts` の `ENEMY_KITS` に、近距離の形から簡易な形へ切り替える距離を `ENEMY_DETAIL_DISTANCE`（grunt 45m・assault 40m・heavy 55m）に持つ
- `src/data/defenders.ts`: 守備の敵の持ち場の表（`DefenderPost`・`DEFENDER_POSTS`・波ごとの最初の持ち場 `DEFENDER_START_POSTS`・湧く場所 `DEFENDER_SPAWNS`・`DEFENDER_TUNE` の隠れる/身を出す秒と射撃の間隔）
- `src/logic/enemies.ts`: 敵1体の状態 `EnemyState` と1フレームの動き `stepEnemy`（three も DOM も読まない純粋な関数。乱数は引数で受ける）。持ち場の敵は `stepHolder`（6章「敵」）
- `src/view/enemies.ts`: 敵を種類ごとの `InstancedMesh` で描く。歩兵は `src/view/mechProtoBake.ts` の `bakeProtoMech` が役割のキット（`ENEMY_KITS`）を立ち姿で焼いた形を、近距離用と簡易用の2つ作る。1体は塗装と発光の2グループなので2ドローで、描く回数は見えている近距離用・簡易用のメッシュのグループ数の合計。カメラからの距離（`ENEMY_DETAIL_DISTANCE`、境目は ±3m の幅）で使い分け、簡易形は板を面取りの無い箱にし、丸の分割を減らし、ピストンとボルトを省く（1体 2,500 三角形以下）。カメラの後ろと霧（`MAP_FOG.far`）の外の兵はインスタンスに書かない。色は `PROTO_PALETTES.enemy` を形に焼き、倒れた敵は `ENEMY_DOWN_TINT` を掛ける。弾の線は `ENEMY_BULLET_COLOR`。持ち場で隠れている敵は低く描く（6章「敵」）
- `src/data/hazards.ts`: 迫撃砲の砲撃と地雷の表（`BarrageKind`・`BARRAGE_KINDS`・`BARRAGES`・波の名前から出る砲撃の種類を引く `M1_WAVE_BARRAGE`・地雷の `MINE_TUNE`）
- `src/logic/hazards.ts`: 砲撃と地雷の純粋な関数（`newBarrage`・`stepBarrage`・`stepShells`・`inCircle`・`mineStepped`。乱数は引数で受ける）
- `src/view/hazards.ts`: 着弾予告の輪と地雷の円盤を `InstancedMesh` 1つずつで描く。色は `src/data/colors.ts` の `SHELL_WARN_COLOR`・`SHELL_LAND_COLOR`・`MINE_COLOR`
- `src/data/boom.ts`: 爆発の表（`BoomKind`・`BOOM_DEFS`・`BOOM_CAP`・`BOOM_SHAKE`・`boomShakeAt`）
- `src/view/boom.ts`: その表から火球・煙の柱・破片・砂柱・水柱を種類ごとに1つの `InstancedMesh` で描く（`spawnBoom`・`drawBooms`・`buildBooms`・`clearBooms`・`removeBooms`）。色は `src/data/colors.ts` の `BOOM_COLOR`。詳しくは6章「爆発」
- `src/data/battery.ts`: ボス（沿岸砲台）の表（機銃の `GUN_TUNE`・機銃が動き出す波 `BATTERY_WAVE`・シャッターの `ShutterDef` と `M1_SHUTTERS`）
- `src/logic/battery.ts`: 機銃とシャッターの純粋な関数（`newBattery`・`newShutters`・`stepGun`・`shuttered`・`openShutters`。乱数は引数で受ける）
- `src/view/seaFire.ts`: 主砲が海を撃つ見た目。詳しくは6章「ボス（沿岸砲台）」
- `src/data/pillbox.ts`: トーチカの表（`PILLBOX_TUNE`）
- `src/logic/pillbox.ts`: トーチカの純粋な関数（`PillboxState`・`newPillbox`・`pillboxFront`・`pillboxMuzzle`・`stepPillbox`・`suppressPillbox`。乱数は引数で受ける）
- `src/logic/script.ts`: ミッションの台本を進める純粋な関数
- `src/data/missions/m1.ts`: M1 の cue の並びと、場所・物・波・目標・印・味方・道の名前の一覧
- `src/data/front.ts`: 前線の表（`FRONT_TUNE` の4本の z と、線1・線2・トーチカ線の旗 `LINE1_FLAG`・`LINE2_FLAG`・`PILLBOXES_FLAG`）と、`FRONT_HOLD`（HUD のレーダーの前線の表。歩兵ドロイドの待ち線は区画 `M1_SECTORS` が持つので、ここの値では動かない）
- `src/data/sectors.ts`: 区画の表（`SECTOR_TUNE` の掃討・確保の値と、`M1_SECTORS` の11区画の z・待ち線・反撃の数・湧き続けの予算 `budget`）
- `src/logic/sectors.ts`: 区画の判定の純粋な関数（`SectorsState`・`newSectors`・`arrivedSoldiers`・`stepSectors`・`sectorHold`。three も DOM も読まない）
- `src/data/trickle.ts`: 湧き続けの表（`TRICKLE_TUNE` の間隔・上限・出す距離・視野の縦横比と余白・倒れた敵を残す秒と、波の名前 `TRICKLE_WAVE`）
- `src/logic/trickle.ts`: 湧き続けの判定の純粋な関数（`TrickleState`・`newTrickle`・`frontSector`・`stepTrickle`。three も DOM も読まない）
- `src/logic/viewGround.ts`: 見下ろしのカメラが地面に映す四角形の純粋な計算（`viewGround`・`insideQuad`。three も DOM も読まない）
- `src/data/payoff.ts`: 節目の表（`PAYOFFS` の契機・旗・見出し・下がる敵の次の線・爆発の種類と、`PAYOFF_TUNE` の溜め・砲撃の凪・下がり方・増援の数）
- `src/logic/front.ts`: 台本の旗から前線を読む純粋な関数 `frontOf`
- `src/data/script.ts`: カットシーンの秒・カットシーンを飛ばせない最初の秒 `CUTSCENE_SKIP_GUARD_SEC`・無線の表示の表 `RADIO_TUNE`（1行を出す最低の秒 `minSec`・待たせる行の上限 `maxPending`）
- `src/logic/mapCheck.ts`: マップが台本と機体の大きさに合うかを調べる純粋な関数
- `src/logic/mapgen.ts`: 種と規則から物を並べる純粋な関数
- `src/data/maps/m1b-hand.ts`: M1 の B の手書きのマップ
- `src/data/maps/m1b-rules.ts`: M1 の B の生成の規則
- `src/logic/collide.ts`: 平面で円を回った四角から押し出す純粋な関数で、engine へ移す候補なのでゲームのファイルを読まず、四角と半径を引数で受ける（規則 `sb-portable-no-game`）。関数は円を四角から押し出す `pushOutCircle`、点と四角の距離 `rectDistance`、2つの四角の最短距離 `rectGap`、円の下の高い面 `groundAt`
- `src/logic/mapShapes.ts`: `mapBlockers` が `MapDef` から四角の一覧を作り、通り道の検査と機体の当たりがそれを読む
- 規則 `sb-portable-no-game` に入っているファイルは `src/logic/collide.ts`・`src/logic/mech.ts`・`src/logic/fcs.ts`・`src/logic/fire.ts`・`src/view/camera.ts`・`src/data/tuneTypes.ts` の6つ。機体・カメラ・FCS の調整の型は値と分けて `src/data/tuneTypes.ts` に置く（値は `src/data/tune.ts`）
- `src/logic/game.ts`: 出撃の `GameModel` を持ち、`step(game, input, dt)` で入力から1フレーム進める
  - `GameModel` の項目: 機体・機体の装甲 `armor` と倒れた印 `downed`・マップ・目標の体力と向き（`yaw`）・トーチカの状態 `pillboxes`（制圧の残り `suppress` と一度撃たれたか `shot` を含む）・壊せる物の体力（`breakables`）・敵 `enemies`（持ち場 `post` と逃げる先 `fallbackPost` を含む）・メインとサブの武器・殴りの待ち・振り・踏み込み `melee`・FCS の状態 `fcs`・ソフトロックが狙いを寄せている目標か敵の id `aimTarget`・飛んでいる弾 `bullets`・始まった砲撃 `barrages`・落ちる前の着弾予告 `shells`・残っている地雷 `mines`・爆破点 `blasts`（爆破済みの印）・仕掛けた爆薬 `charges`・長押しの途中 `plant`・味方の機体 `allies`（足元の高さ `y` と、倒れる前に無線で叫んだか `called`、次の一撃までの待ち `fireT` を含む）・台本の状態 `script`・戦場の層 `battle`（歩兵ドロイド `crowd` と次の砲撃までの秒 `shellT`）・区画の状態 `sectors`（区画ごとの `idle`・`advancing`・`secured`・`counter`・`stable` と、反撃の残り・着いた兵・弱い支配。区画を回さない広場は null）・湧き続け `trickle`（次の敵までの秒 `t` と区画ごとに出した数 `spent`。広場は null）・層の値 `battleTune`・今出している無線 `radio`・その次に出す無線の列 `radioQueue`・味方機の援護射撃の途中 `cover`（制圧する波・残り秒・次の曳光弾までの待ち・次に撃つ機銃座・「弾が切れる」の無線を出したか）・そのフレームの出来事
  - 1フレーム: 機体が歩き、FCS（`soft`）が吸着の円錐（`cone`）の中の生きている目標と敵へ狙いを寄せ、メインとサブの武器が撃ち（`data/weapons.ts` の表の威力・射程・弾速・間隔・弾数）、殴りが待ちの明けたときに振りかぶって、振り抜きのフレームに前の扇のものを打って踏み込み、敵が起きて歩いて撃ち（6章「敵」）、トーチカが見える機体へ予兆のあとに連射し（6章「トーチカ」）、弾が飛んで目標や敵に当たると体力が減って0で壊れる・倒れる（トーチカは弾では壊れず、制圧されるだけ。6章「トーチカ」）
  - 台本: `step` は壊れた目標（`destroyed`）と入った場所（`enter`）を台本に渡し、波の敵が全部倒れたら `cleared` を台本に渡し、台本の時間を進め、台本の出来事を `script` の出来事として残す。台本の `spawn`（敵の波）は敵を出し、`ally`（味方）は味方の機体 `allies` を出す（6章「台本の味方の機体」）
  - 無線: `queueRadio` が列に積み、`stepRadio` が1フレームに1行だけ `RADIO_TUNE.minSec`（秒）の間ずつ出す
  - 終わり: 出撃が終わる（`cleared`）のは台本の `end` が来たときだけ。`cleared` になったときカットシーンが流れていれば（M1 の `win`）、そのカットシーンが終わる（飛ばしも）まで `step` は動き続け（台本の時間も進む）、結果の画面は閉じのカットシーンのあとに出す（`step` in `src/logic/game.ts`、`update` in `src/app/play.ts`）。機体の装甲が 0 になる（`downed`）と `step` は何もしない（`cleared` のあと、閉じのカットシーンが終わってからも同じ）
  - 壊れる物: `breakable` の物は撃つと体力が減って0で壊れ、機体の当たりと弾の箱から外れて通れるようになる。壊れた物は戻らない。壊れた物は出来事 `propDestroyed`（`prop` は `map.props` の添字）で知らせる
  - 入力: `GameInput` は `MechInput` に、サブ射撃 `sub`・画面の狙いの線 `aim`・指した地面の点 `aimAt`・爆薬 `use`・殴り `melee` を足したもの。`aimAt`（世界の座標、m）があると、`step` は機体からその点への yaw を `MechInput.face` に入れ（機体から `AIM_MIN_DIST` 0.9m より近いときは入れない）、`stepMech` は `face` があれば `turn` を使わず、近い回りで `MOVE_TUNE.faceRate × dt` まで向き直る。`MechInput.frame`（yaw）があると、`moveX`・`moveZ` は機体の向きではなくその yaw を基準に回す（画面の上を基準に動く）。照準の線 `aim` が無く `aimAt` があるときは、胸から `aimAt` へ水平（`dy: 0`）の線を照準に使う。`aimPointOf` が点を返さないときは、`cursorAim` が `face` に直前の `mech.yaw` を入れて向きを保つ（矢印キーの `turn` には戻さない）
- `src/app/touch.ts`: engine のスティック・視点のドラッグ・タッチのボタンを `MechInput` の形に変え、ボタンの配置の編集と、押した回数・同時に触れている指の数・動作が同時に効いた時間を測る
- `src/app/keyboard.ts`: engine のキーの動作とマウスを読み、ロックの押した瞬間、右クリックのサブ射撃を `MechInput` の形にする。ジャンプは入力に無く、ロジックにだけ残る（D-50）。PC ではポインタロック無しでキャンバスの左ボタンをメイン・右ボタンをサブとして読む（離すのは `document` の `mouseup` と `window` の `blur` で受け、キャンバスの `contextmenu` は止める）
- `src/app/input.ts`: タッチとキーボードを1つの `MechInput` にまとめる口。本番のゲームもここから読む
- `src/app/play.ts`: 出撃の開始（`startSortie`）・出撃中のシステム・結果の画面（`showResult`）と、タイトルから出撃へ進む入り口（`pressStart`・`continueSortie`・`syncTitle`）。中断と放棄でタイトルへ戻る `returnToTitle` もここ
- `src/app/pause.ts`: 一時停止のメニュー（`initPause`）。P・Esc・一時停止のボタンで `paused` にし、「再開」「中断」「放棄」を出す（3章「一時停止と中断」）
- `src/logic/suspend.ts`: 中断のスナップショットを作る `suspendOf` と、読み戻す `restoreSuspend`（純粋）。保存と読み出しは `src/app/storage.ts`（5章）
- `src/logic/input.ts`: タッチとキーボードの `MechInput` を合わせる純粋な関数（three も DOM も読まない）
- `src/app/briefing.ts`: 出撃の前のブリーフィング（`openBriefing`。3章「ブリーフィング」）。記号と時計は `src/logic/briefing.ts`、絵は `src/view/briefing.ts`、表は `src/data/briefings.ts`
- `src/app/skip.ts`: カットシーンを飛ばす要求（クリック・タップ・Enter・Space・Esc）を受け、`update` が1コマに1回取る（8章「カットシーンの演出」）

### テストの層

| 層 | 何を確かめるか | 動く場所 | project の名前 | 流し方 |
|----|----------------|----------|----------------|--------|
| unit | 純粋な関数1つ | node | `stormbreacher-unit` | `npx vitest run --project stormbreacher-unit` |
| integration | `logic/` を何フレームも回す | node | `stormbreacher-integration` | `npx vitest run --project stormbreacher-integration` |
| e2e | ページを起動する | Chromium | `stormbreacher-e2e` | `npx vitest run --project stormbreacher-e2e` |

E2E に書いてよいのは、画面か入力が無いと確かめられないものだけ。

## 3. 画面

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

画面はタイトル → ブリーフィング → 出撃 → 結果と進む。タイトルの「出撃」（`#sbStart` のクリックか Enter）でブリーフィングが出て、そこを抜けると `play` になり、M1 の B のマップで機体を歩かせて撃ち、目標を全部壊すと `result` の画面（所要時間・報酬の内訳・所持金と「タイトルへ」）になる。内訳は「報酬と所持金」（5章）。「タイトルへ」は `location.reload()` で戻る。出撃の見た目は `src/data/looks.ts` の `LOOKS` から決まる。

- 操作（出撃中）: PC では WASD が画面基準の移動（W が画面の上）、機体はマウスカーソルが指す地面の方向を向いて撃ち、左クリックがメイン・右クリックがサブで、ポインタロックは使わない（カーソルは画面に出したまま遊ぶ）。矢印キーの左右の視点は PC の本体では効かない。ジャンプは入力に無い（D-50。ロジックにだけ残り、どの入口からも出せない）。Shift がブースト、J がメイン、K がサブ、Q が殴り（近接）、E がロック、P か Esc が一時停止。F は「使う」で、防風杭の線の手前の爆破点の所で長押しすると爆薬を仕掛ける（6章「爆破点と爆薬」）。長押しの間はメインもサブも撃たず、殴りもしない。地上にいるときだけ仕掛けられ、長押しの間に撃たれても進みは戻らない。スマホでは `#btnUse` を同じように長押しし、`#btnMelee` を同じように押して殴る。スマホの左のスティックは PC の WASD と同じ画面基準の移動（上に倒すと画面の上へ進む）。右のドラッグは、指を置いた所から今の所への向きを狙う向きにし、機体の足元から `TOUCH_TUNE.aimReach`（20m、仮）だけその向きにある地面の点を狙う（`TOUCH_TUNE.aimDeadzone`（16px、仮）以内の動きは右を触っていない扱い）。右を触っていない間は、最後に狙った向きを保つ（スティックで歩いても照準は回らないので、引き撃ちや横歩きができる）

### HUD

出撃中は HUD を出す。照準のマークをカーソルの点に置き、その左の弧にメインの弾（残りの割合）、右の弧にサブの弾（1発＝1こまの区切り。満タンが `HUD_RING_TUNE.reticle.bar.maxSegments` を超えるときは割合）、上の横バーに装甲（残りで3段の色に変わり、被弾の瞬間に `HUD_RING_TUNE.reticle.glowSec` の間光る）、下の横バーにブースト（満タンの間は薄い）を出す。装甲の値は `armor / MECH_TUNE.armor`（数字なし）。熱は出さない。左上に目標、下の真ん中に今出している1行の無線（`RADIO_TUNE.minSec` の間だけ。ラベルは `hud.radio`）を出す。ソフトロックが狙いを寄せている相手がいる間は、その相手を囲む四隅の鉤形の枠（ロック枠。色は `HUD_COLOR.lock`）を毎フレーム出す。機体が着弾予告の円の中にいる間だけ、画面の中央から `--ring` だけ上の真ん中に警告（`hud.warn.shell`。赤い文字）を出す。PC もタッチも同じ照準のマーク（点と小さな円、左右の弧、上下のバー）を出し、吸着の円錐を表す大きな円は出さない（タッチもマークを画面の真ん中に出す）。色と主張は仮。

- 枠の位置は、相手の箱の8隅をカメラで画面に投影した外接四角（`screenRect` in `src/view/camera.ts`。四角は画面の内側に切る。箱の隅がカメラの後ろにあるとき、または四角が画面の外にあるときは null で、枠を出さない）に、4px の余白を足したもの。枠は HTML で HUD と同じ層（`#sbPlayHud` の中、`data-hud="lock"`）に描く（`lockFrame` in `src/view/hudParts.ts`）
- HUD の配置（SB-2159）: 画面に固定する部品は `PLAY_HUD_PLACES` in `src/view/hud.ts` が持ち、照準のマークはカーソルの点（`placeReticle` が残す点。カーソルが無いときは画面の真ん中）に置く。マークは中心の点と小さな円で、ロック中は色が変わる。左右の弧と上下の横バーにゲージを振り分ける（`HUD_RETICLE_MARK`）: 左の弧＝メインの弾（残りの割合）、右の弧＝サブの弾（こま）、上の横バー＝装甲、下の横バー＝ブースト。弾の少ないときの色・弾切れの赤い点滅・装甲の色の段・ブーストの薄さは、置き場所ではなくゲージの種類に付いて回る（`gaugeReading` in `src/view/hudRing.ts`）。弧も横バーも太さ（`HUD_RING_TUNE.reticle.stroke`）と間隔（`HUD_RING_TUNE.reticle.gap`）を揃え、線の端を丸め、明るい地面でも読めるよう細い暗い縁（`shadow`）を付ける。弧の満タンの長さとバーの幅も揃える。減る向きも揃える: 弧は水位のように、残りが画面で下の端に溜まって上から減る（左右とも。`arcLowEndIsStart` in `src/view/hudRing.ts`）。横バーは左に寄せて右から減る。こま割りも同じ向き。メイン・サブとも残りが1/4（`HUD_RING_TUNE.reticle.ammo.warnShare`）以下で色が変わり、弾切れはゲージが赤くゆっくり明滅する（`HUD_RING_TUNE.reticle.ammo.blinkHz` の速さで、`blinkMin` の明るさまで暗くなるだけで消えない。リロードは無く、弾切れだけ）。カーソルが画面の端に近いときは、弧とバーがはみ出さないようマーク全体を内側に寄せる（`setPosition` in `src/view/hudParts.ts`）。目標・任意の印・無線・敵の体力・見出し・警告・指示・使う・殴る・レーダー・戦線ゲージ・ロック枠は `PLAY_HUD_PLACES` の固定の位置に出す。使う・殴る・警告・指示は画面の中央から `--ring` だけ上下にずらした位置に置く（輪は無いが、位置の基準として `--ring` は残す）
- 値: `hudModel` in `src/logic/hud.ts`（純粋）が、HUD に出す値（ブースト・装甲・メインとサブの弾数・台本の今の目標と数えている数 `objective`・今出している1行の無線 `radio`・ソフトロックが狙いを寄せている目標か敵の体力 `enemy` とその箱 `lock`・レーダーの点・着弾予告の警告 `warning`）を `GameModel` から作る。装甲は `armor / MECH_TUNE.armor`。熱は持たない。レーダーの角度は、呼び元が画面の向き `viewYaw` を渡したときは画面の上（本体と広場は `QUARTER_TUNE.azimuth`）を 0 度にし、渡さないときは機体の正面を 0 度にする
- HUD の目標: `objective` は台本の今の目標 `game.script.objective` の言語キー `obj.<id>`。台本がまだ目標を出していないときは null で、何も出さない。数える目標だけ `count: { done, total }` を持ち、画面は「目標 トーチカを2基破壊 1/2」のように数を足して書く。どの目標が何を数えるかは `OBJECTIVE_COUNT` in `src/data/script.ts`（目標 id → 数える目標 id の列。`break-pillboxes` は `pillbox-1`・`pillbox-2`、`silence-battery` は `main-gun-1`・`main-gun-2`）。表に無い目標（`reach-pillboxes`・`stop-fortress-gun`・`bomb-fortress`・`hit-magazine`）は数を出さない。`total` はマップにある目標だけ、`done` はその中で体力 0 のもの。数える目標がマップに1つも無いときも数を出さない
- HUD の爆薬: `use` は爆破点の近くで `hud.use`（「使う」）と長押しの割合を出し、`charge` は仕掛けた爆薬の `hud.charge`（「爆破まで」）と残り秒・棒を出す。棒の割合は `left / total` で、`total` はその爆薬を仕掛けたときの導火線（`ChargeState.total`。線の爆薬は `CHARGE_TUNE.fuse` の 3 秒、要塞の爆薬は `FORT_BLAST_TUNE.countdownSec` の 20 秒）。新しい行やキーは足さない（SB-1860）
- HUD の敵の体力: ソフトロックが寄せている目標か敵の `hp / TARGET_HP[kind]` か `hp / ENEMIES[kind].hp`。トーチカは爆薬でしか壊れず（6章「トーチカ」）ソフトロックの候補にならない（SB-2043）ので、体力のバーも制圧の残りも出さない。`hudModel` は、`aimTarget` に `TARGET_CHARGE_ONLY` の目標の id が入っていても、`enemy` と `lock` を null にする（旗で開くシャッターの奥の目標、起動の前の要塞の機関砲も同じ。SB-2051）。制圧が効いていることは、銃眼の予兆の光が止まることと、銃眼の灰色の煙（`sb-pillbox-smoke`）で見える
- HUD の任意の印: `optional` は目標とは別の項目。砲撃の始まり（cue `shelling-start`）が発火済みで、`depot` が生きていて、旗 `depot-down` が無い間だけ `{ key: 'hud.optional.depot', distance: 水平距離 }` を返す。画面は目標の下に「任意 敵の弾薬庫 72m」の1行を出す（`hud.optional` の文字と距離）。壊しても通り過ぎても、目標の文言は変えない。レーダーは今の `depot` の印（`RADAR_MARK.depot`）をそのまま使う
- HUD の無線: `radio` は今出している1行 `game.radio` の言語キーで、HUD が出ている間の経過（`game.time - game.radio.time`）が `RADIO_TUNE.minSec`（3 秒）に届くまで。その後は null。同時に来た行は列で待ち、1フレームに1行だけ出す（`stepRadio`）。カットシーンの間は HUD を隠すので、`stepRadio` は表示中の行の経過を数えず、列の次の行も上げない。終わってから残りの秒を出し、次の行へ進む。待たせる行は出してよい時刻 `at` を持てて、その時刻まで列の先頭に留まる（`queueRadio` の遅れ）
- HUD の指示（SB-2028）: 戦闘中は視線が照準のまわりから動かず、下の無線の帯は読めない。そこで、プレイヤーに動いてほしい無線の行（台本の `radio` の `callout`。ゲーム本体が出す行は `queueRadio` の第4引数）には短い指示（12文字前後。`m1.callout.line2-support` 今だ、爆薬を仕掛けろ／`m1.callout.line2-ammo` 援護が切れる、急げ／`m1.callout.line2-hold` 手前で迎え撃て／`m1.callout.pillbox-charge` 横か後ろから爆薬を）を付け、その行が帯に上がってから `CALLOUT_TUNE.sec`（2.5 秒。`RADIO_TUNE.minSec` より短い）の間、`HudModel.callout`（言語キー。なければ null）として画面の中央から `--ring` だけ上に大きめ（`PLAY_HUD_TEXT.callout`、26px。琥珀色）の1行で出す。位置は `PLAY_HUD_PLACES.callout`（`top: calc(50% - var(--ring) - 120px)`。着弾予告の警告 `-40px` のさらに上で重ならない）。着弾予告の警告が出ている間（`warning` が `shell`）は `callout` は null で警告が優先し、警告が消えれば指示の残りの秒だけ戻る。無線の帯には、指示のある行も今までどおり出る。カットシーンの間は HUD ごと出ない。雰囲気の会話（歓声・損害の報告）には付けない。`radio` 項目（`game.radio`・`radioQueue`）に任意の `callout` が増えるが、無いものは今までと同じなので `SUSPEND_VERSION` は上げない
- ロック枠: `lock` は `enemy` と同じ相手の箱（目標は `box`、敵は `enemyBox` in `src/logic/game.ts`）。`enemy` が null のときは null
- 照準: 本体と広場では、マークをマウスカーソルの位置（`PlayRead.cursor` の正規化座標。動かすまでは画面の真ん中）に描く。タッチでは画面の真ん中に出す（右のドラッグの狙う向きには動かさない）。位置は正規化座標を画面の px に直して書き（`ndcToScreen` in `src/view/hudPlace.ts`）、画面の端に近いときはマーク全体を内側に寄せる。HUD を作り直しても最後の位置に戻す（`placeReticle` in `src/view/hud.ts`）。キャンバスの外のボタンの上でも追う（`mousemove` は `window` で受け、`#gl` の矩形で正規化する）
- 描く: `src/view/hud.ts` が本体の出撃中の HUD を `HudModel` から描き、`src/view/hudParts.ts` は照準のマーク・丸いレーダー・ロック枠を持つ。`#view-hud` の見本も同じ `src/view/hudParts.ts` を使う。`src/data/colors.ts` は HUD の色（`HUD_COLOR`）も名前で持つ
- 前線: 丸いレーダーに、味方が押さえている地面の端（前線）を破線で描く（SB-2010）。`HudModel.front` が前線の両端をレーダーの角度と距離で持ち、`roundRadar` が円で切り抜いて線を引く。位置は台本の旗から `frontOf` が決める（6章「節目」）。角度はレーダーの点と同じく、本体と広場では画面の上を 0 度にする
- 戦線ゲージ（SB-2270、SB-2281）: 浜から一番奥の弾薬庫までの全長（`M1_SECTORS` の先頭の `seaZ` 170 から最後の `landZ` -255。425m。+z が海）を、右端の縦1本のゲージにする（`PLAY_HUD_PLACES.gauge`。レーダーの下、右端から 24px、幅 12px）。下が海、上が陸なので、前進すると自機の印が上へ動く（見下ろしの前進が画面の右上であることと向きが近い）。高さは `GAUGE_TUNE.height` を `window.innerHeight / GAUGE_TUNE.baseHeight` で伸ばす（`ringRadius` と同じ考え方）。タッチの右手のボタンとは重ならない高さにする。全長は区画の表から出るので（`gaugeSpan`）、後半の7区画が延びた分だけ自動で延びる。全長が 210m から 425m になったので、1mあたりの px は約1/2になり（`height 150` のとき約0.35px/m）、`cband`・`gate` の 15m は約5px、`yard`・`magazine` の 30m は約11px になる。縮尺は線形のまま（区画ごとに等分しない）で、縮んだ分は印と境目を次のように見直した: 戦線の太い横線（`GAUGE_TUNE.frontThickness` 3px）と自機の菱形（`GAUGE_TUNE.mechSize` 6px。回した対角は約 8.5px で、最小の区画の約 5px より大きいので、菱形は隣の区画の境目を覆うことがある。実画面で見て決める）は、縮尺によらず px の大きさを変えない。区画の境目は `GAUGE_TUNE.boundaryThickness` 1px の短い横線で、色は塗りより少し明るい `HUD_COLOR.gaugeBoundary` にし、暗い敵の土地の隣でも消えないようにした。区画の塗りは `sectorFills`（`src/logic/frontGauge.ts`）が決める: 敵の土地（`idle`・`advancing`）は暗い赤灰 `HUD_COLOR.gaugeEnemy`、確保（`secured`・`counter`。反撃を凌ぐまで）は琥珀 `HUD_COLOR.gaugeSecured`、安定（`stable`）は明るいシアン `HUD_COLOR.gaugeStable`。3色は色だけでなく明るさでも区別できる（暗い→中→明るい）。戦線（`sectorHold` の `holdZ`）は太い横線（`HUD_COLOR.bar`）で出す。数字（m・人数）は出さない。自機の印は戦線から内陸へ出た距離で色を変える（`isolation`）: `GAUGE_TUNE.warnGap`（30m）未満は通常（`HUD_COLOR.text`）、そこから `GAUGE_TUNE.isolatedGap`（57m。援護射撃の届く `SUPPORT_TUNE.range`）未満は琥珀、以上は孤立として赤（明るい縁を付けて、敵の土地の暗い赤の上でも読めるようにする）。点滅はさせない。広場（`game.sectors === null`）では出さない。カットシーンの間は HUD ごと出ない。値は `HudModel.gauge`（`mech`・`front`・`fills`・`isolation`・`marks`）が毎フレームの状態から作り、`src/view/hud.ts` は変わった値だけ書く。中断セーブの形は変えない
- 歩兵の戦死のポップ（SB-2272）: 戦線ゲージの下端から `FEEDBACK_TUNE.popGap` 6px 下、右端から 24px（ゲージと揃え）に、右寄せで「歩兵 戦死 ×N」（`hud.infantryFall`、`HUD_COLOR.amber`。赤は弾切れ・被弾に使うので分ける）を出す。数は短い間に続けて倒れた歩兵の数（`battleFell` の `by` が `fire` か `shell`。間引かれた無線の分も数える）で、1体なら「×N」を付けない。`FEEDBACK_TUNE.popSec` 2.5 秒（続けて倒れるたびに延びる）で消え、消えてから数が 0 に戻る。タッチの右下のボタンとは重ならない高さ。残り秒と数は view だけが持ち（`PlayHud.pop`）、`GameModel` には入れず `SUSPEND_VERSION` も上げない。カットシーンの間は HUD ごと隠れ、広場（`game.sectors === null`）では出さない
- 短い見出し: 節目の間だけ、画面の上の方に「突破」「第二線突破」「トーチカ沈黙」のような短い見出しを出す（`HudModel.headline`。言語キーは `m1.breach`・`m1.breach2`・`m1.bunker-down`）。出るのはその cue が発火してから `PAYOFF_TUNE.headlineSec` の間で、時刻は台本の `fired` から読む

### 撃たれている感

撃たれている感（SB-1380）は `src/view/hurt.ts` が画面の縁に出す。要素 `#sbPlayHurt`（`z-index: 4`。キャンバスの上、HUD とカットシーンの帯の下）は出撃を作るときに1度だけ作り、カットシーンの間は HUD と同じく隠す。毎フレームは縁と白みの `opacity`、色を抜く層の `backdrop-filter` を書き換えるだけ（変わるまで書かない）。値は `HURT_TUNE` in `src/data/tune.ts`（すべて仮。`#view-hurt` の調整パネルで決める）。

- 被弾の方向: 出来事 `damaged` の `fromX`・`fromZ`（機体から撃った側への向き）と、画面の向き（本体と広場は画面の上 `QUARTER_TUNE.azimuth`。渡さないときは機体の `yaw`）から、その向きを 0 度とする角度を `hurtAngle` で出す。画面の縁を8方向（正面・右前・右・右後ろ・後ろ・左後ろ・左・左前。`hurtEdge`）に分け、その方向の縁を `HURT_TUNE.edgeFade` 秒かけて赤く光らせる。同じ方向に重ねて受けたら消えるまでの時間を戻し、別の方向は同時に出る
- 近い着弾: 爆発が機体から `HURT_TUNE.flashNear` m 以内で起きたら、`HURT_TUNE.flashFade` 秒かけて画面を白ませる。強さは近いほど強く、0m で `flashAlpha`、`flashNear` で 0。爆発は迫撃砲・地雷のほか、自分が壊した目標・敵・物の爆発も同じに扱い（どれも「爆発」）、カットシーン中に着弾した砲弾でも白む。揺れは6章の爆発の `boomShakeAt` が近いほど強くする（ここでは足さない）
- 装甲の減り: 装甲が `HURT_TUNE.armorDarkFrom`（0.5 = 50%）を下回ると、画面の縁を暗くし、`backdrop-filter` の `saturate()` で色を抜く。強さは減るほど強く、装甲 0 で `armorDarkMax`・`armorDrain`。暗くする層と色を抜く層は分け、色を抜く層の `opacity` は 1 のままにする（同じ層に置くと暗さの `opacity` が抜けも弱めるため）。色を抜くのは縁だけで、画面の真ん中は残す。出撃を作り直す（やり直し）と戻る

### 浜の空気感

上陸の戦場の空気（SB-1440）。煙と砂ぼこりと炎で視界が濁り、光が鈍い画面にする。見た目だけで、当たり・体力・動き・台本は変えない。定義場所は `ATMOSPHERE_TUNE`・`ATMOSPHERE_PLUMES`・`ATMOSPHERE_FIRES`・`ATMOSPHERE_LIGHT` in `src/data/atmosphere.ts`（表）、`buildAtmosphere`・`drawAtmosphere`・`applyAtmosphereLight`・`applyAtmosphereScreen`・`burnAtmosphere`・`removeAtmosphere`・`gradeFilterCss` in `src/view/atmosphere.ts`（描く）、`softDiscTexture` in `src/view/puff.ts`（ぼけた丸い質感の1枚の絵）、色は `PLUME_SMOKE_COLOR`・`PLUME_FADE_COLOR`・`HAZE_COLOR`・`FIRE_CORE_COLOR`・`FIRE_FLAME_COLOR`・`FIRE_GLOW_COLOR`・`LIGHT_SKY_COLOR`・`LIGHT_GROUND_COLOR`・`LIGHT_SUN_COLOR` in `src/data/colors.ts`。`buildWorld` がマップを作るときに `buildAtmosphere(map)` を呼び、出撃・`#view-map`・`#view-fx` などの同じマップが同じ空気を持つ（`#view-fx` のステージ 0 は効果なしの基準なので、空気も建てない）。出撃の残骸の煙は空気の柱に一本化し、戦闘側の `wreckSmoke` は `PLAY_BATTLE_TUNE` で 0 にしている。値はすべて仮で、`#view-map` の調整パネル（`ATMOSPHERE_TUNE` の行）でその場で決める。

- 煙の柱: `ATMOSPHERE_PLUMES` の置き場所（地図の残骸と砲撃の跡。上部 `columns` 本を使う。8〜12本が目安）から、`columnEvery` 秒ごとに1粒ずつ上がる。粒は `rise` で上り、`windX`・`windZ` の一方向の風で流れ、上へ行くほど `plumeGrow` で大きくなりながら `PLUME_FADE_COLOR` へ薄れる。粒は上限 `plumeCap` で、空いている枠を先に使い、枠が全部埋まっているときは新しい粒を捨てる（生きている粒は上書きしない）。粒は寿命の最後の 2 割（`PLUME_FADE_FROM`）で大きさを縮めて消える（`plumeFade`）
- 低いかすみ: 地面から高さ 0〜3m のあいだに、大きな半透明の板を `hazeSheets` 枚、カメラの方を向けて置く（`hazeWidth`・`hazeHeight`・`hazeY`）。`hazeDrift` でゆっくり流れ、地図の端で折り返す。今の距離の霧（`MAP_FOG`）と重なって奥行きを出す
- 燃える残骸: `ATMOSPHERE_FIRES` の数だけ残骸が燃える。炎は `flameEvery` 秒ごとに `flameCap` の枠へ上がり、`flameFlicker` で揺れ、明るい中心 `FIRE_CORE_COLOR` から橙 `FIRE_FLAME_COLOR` へ変わる（加算）。足元には点光源を足さず、加算の板（`glowSize`・`glowOpacity`）で周りを照らす。出撃中に壊れた物（`propDestroyed`・`destroyed`）は `burnAtmosphere` で自分の炎を持ち、その煙は `burnSmokeEvery` ごとに1粒上がる（上限 `burnFires`）
- 光: マップを作るとき、`applyAtmosphereLight` がシーンの半球光と向きのある光をその場で書き換える（ライトは増やさない）。半球光は曇り空の `LIGHT_SKY_COLOR` と地面の `LIGHT_GROUND_COLOR`、強さ `ATMOSPHERE_LIGHT.hemi`。低い日の光は `LIGHT_SUN_COLOR`、強さ `ATMOSPHERE_LIGHT.sun`、向きは `BASE_LIGHTS.sunAt`（`src/data/looks.ts`）。物の面ごとに明暗が付く。影（shadow map）は今回入れず、描く回数と時間の測定も並列作業のため未実施
- 画面: canvas に CSS の `filter`（`grade`。彩度を少し落とし、コントラストを上げ、少し暖色へ）、画面の端を暗くするビネット（`vignette`）、`GRAIN_TILE` のノイズ画像を重ねて毎フレーム位置をずらす粒状感（`grain`。`transform` で動かす）。0 でその層を消す。canvas の `filter` は `view/look.ts` が look の項の後ろに `gradeFilterCss()` を足す。ビネットは `#sbAtmosphere`、粒状感は `body` 直下の `#sbAtmosphereGrain`（どちらも `z-index: 4`。canvas の上、HUD の下）に置く（粒状感の `overlay` を canvas と混ぜるため、ビネットの親の中には入れない）。`grade` は空気を建てたあいだだけ掛け、`removeAtmosphere` で look の `filter` だけに戻す。空気はポーズ中（`paused`）は動かない（`modes: ['play', 'title', 'result']`）
- 爆発の形: `view/boom.ts` の火球と煙も、`view/puff.ts` の同じ丸い板（カメラを向くビルボード）に替えた。火球は加算で明るい中心と橙のふち、煙は中心が濃く外が透明。数・寿命・色の表（`BOOM_DEFS`・`BOOM_CAP`・`BOOM_LOOK`）は変えない
- 描く回数: 空気で増える描く回数は、煙・炎・照り返し・かすみの4つ（それぞれ1つの `InstancedMesh`）。粒の数は表の上限で決まる
- 確認用の入口 `#view-map`: 調整パネルに `ATMOSPHERE_TUNE` の行（柱の本数・風・煙の寿命と濃さ・かすみの枚数と濃さ・燃える残骸の数・照り返し・画面の色・ビネット・粒状感）を出す。シーンの値は毎フレーム読み直し、画面の層と光は変更時（`onChange`）に `applyAtmosphere` で入れ直す

### ブリーフィング

出撃の前に、上から見た地図と1行ずつの文で作戦を告げる画面（`briefing`）。画面は `src/app/briefing.ts`、地図の絵は `src/view/briefing.ts`、地図の記号と時計は `src/logic/briefing.ts`（純粋）、行と時間割の表は `src/data/briefings.ts`（型 `BriefingLine`・`BriefingSymbol` は `src/data/types.ts`）、色は `BRIEFING_COLOR` in `src/data/colors.ts`。声はなし。

- 入口: タイトルの「出撃」（`pressStart` in `src/app/play.ts`）だけ。中断があるときの確認（2回押し）を済ませたあとで開く。「続きから」とやり直し（チェックポイントから・最初から）では出さない。出撃（`startSortie`）はブリーフィングを抜けたときに呼ばれ、そのあと導入のカットシーン（`landing`）が流れる
- 流れ:
  1. 開くと `#sbApp`（タイトル）を隠して `#sbBriefing` を出し、`briefing` にする。時計は 0 から `update`（システム `sb-briefing`）で進む
  2. 行は表（`M1_BRIEFING`）の `at` の秒に1行ずつ左から積まれ、最新の行だけ明るく出る。行が出ると、その行の `show` の記号が地図に出る
  3. 最新の行が出した記号は点滅し、前の行の記号は点いたままになる。矢印は出てから `BRIEFING_TUNE.arrowSec` 秒かけて尾から頭へ伸びる
  4. 全部の行が出ると「出撃」（`#sbBriefingGo`）が出て、「飛ばす」（`#sbBriefingSkip`）が消える
- 操作: タップ・クリック（ボタン以外）・Enter・Space で次の行がすぐ出る（時計がその行の `at` になる）。全部出たあとの同じ操作か「出撃」で出撃へ進む。Esc か「飛ばす」はいつでも出撃へ進む。開いたときの押下（タイトルの「出撃」のクリックと Enter）は数えない（`event.timeStamp` が開いた時刻より前のものは捨てる）。キーは capture 段階で受けて止める（同じ Esc が出撃を一時停止にしないため）。ボタンにフォーカスがあるときの Enter・Space はボタンのクリックとして1回だけ数える
- 行の表（`M1_BRIEFING`）: 一巡は約 13 秒（最後の行の `at` 10 + `holdSec` 3）。`at` は 0 から増えていく

| キー | `at`（秒） | 出す記号 | 文（ja） |
|------|-----------|----------|----------|
| `briefing.goal` | 0 | `battery` | 要塞の機関砲を黙らせろ |
| `briefing.enemy` | 4 | `pillboxes`・`squad` | 浜にトーチカと迫撃砲陣地がある |
| `briefing.wave1` | 7 | `wave1` | 第1波の機体と共に上陸する |
| `briefing.depot` | 10 | `depot` | 右手に敵の弾薬集積所がある。潰すと砲撃が弱まる |

- 地図: 手書きマップ（`M1B_HAND`）の範囲を canvas に上から描く。上が陸（−z）、下が海（+z。前の縁から `seaMargin` m 分の海も描く）。`briefingMap(map, path)` が `MapDef` から次を作る（座標を手で写さない）
  - 地面の点: 防風杭・防波堤・崖の props（`BRIEFING_TERRAIN_KINDS`）
  - `site`: マップの目標1つにつき四角1つ。記号は `BRIEFING_TARGET_SYMBOL`（トーチカ → `pillboxes`、集積所 → `depot`、主砲と弾薬庫 → `battery`）
  - `dot`: 波 `b-squad`（`M1_BRIEFING_SQUAD_WAVE`）の出る場所。記号は `squad`。マップに迫撃砲陣地の場所は無いので、敵の行ではこの点で敵の居場所を示す
  - `arrow`: `wave1` はミッションの道 `beach-run`（`M1_BRIEFING_WAVE_PATH`）の前に、海の側の尾（前の縁から `waveStartGap` m 沖）を足したもの。第2波の矢印は無い（M1 のブリーフィングは第2波の行を持たない）
- 崩れる作戦（柱2）: M1 のブリーフィングは第2波の約束を見せない。作戦が崩れて第2波の艇が沈む場面は、今の M1 の台本には無い（無線 `m1.wave2-lost` とカットシーン `wave2-sinks` の表だけが残る。8章）。ブリーフィング側に出撃中の表示は無い
- 数値: `BRIEFING_TUNE` in `src/data/briefings.ts`（`holdSec`・`arrowSec`・`blinkHz`・`seaMargin`・`waveStartGap`）
- テスト: `test/unit/briefing.test.ts`（表・地図の記号）、`test/e2e/briefing.test.ts`（画面と操作）

### 一時停止と中断

出撃を止めて、あとで続けられる（中断）か、やめる（放棄）ための仕組み。画面は `src/app/pause.ts`、中断と放棄の中身は `suspendSortie`・`abandonSortie`・`returnToTitle` in `src/app/play.ts`、保存は 5章。

- 止める: 出撃中（`play`）に P か Esc（`PAUSE_KEYS` in `src/data/keys.ts`）、または左上の「一時停止」（`#sbPauseBtn`。HUD の目標の上、右上の全画面のボタンと重ならない）で `paused` になる。ポインターロックを使わないので、Esc はそのまま `keydown` で届いて止まる。`paused` の間は `sb-play` のシステムが走らず、`step` も時計も進まない
- カットシーンの間の Esc は飛ばしが先で、止めない（P は止める）。本体と広場では Esc の `keydown` がそのまま飛ばしの要求になる。止めている間に来た押し込みとメニューのクリック（`data-noskip` の要素）は飛ばしの要求に数えず、再開のときに溜まった要求も捨てる
- メニュー（`#sbPause`。タッチの層より手前）: 「再開」「中断」「放棄」。再開は `play` に戻り、P か Esc でも戻る
- 中断: 今の `GameModel` を `SUSPEND_KEY` に書き（5章）、タイトルへ戻って「続きから」（`#sbContinue`）を出す
- 放棄: 押すと確認に変わる（「放棄する（報酬なし）」`#sbAbandonYes` と「やめる」`#sbAbandonNo`。確認の間の Esc は確認を閉じる）。確定すると中断（あれば）も消してタイトルへ戻る。報酬もセーブも書かない
- タイトルの「続きから」: 中断があるときだけ出す。押すと中断から `GameModel` を組み直し（`beginPlay`）、中断を消す。同じ中断から2回再開できない
- タイトルの「出撃」: 中断があるときは1回目の押下で文字が「出撃する（中断を消す）」に変わり、2回目でブリーフィングを開く（ブリーフィングを抜けて出撃を始めると中断は消える）。Enter も同じ。ボタンにフォーカスがあるときの Enter はボタンのクリックとして1回だけ数える
- タイトルへの戻り方: 中断・放棄はページを読み込み直してタイトルに戻る（結果の「タイトルへ」と同じ）。読み直さないと、出撃の見た目（光・色の膜・霧・地面の色）がタイトルの地面に残って白く飛ぶため。中断はセーブにあるので、読み直したタイトルに「続きから」が出る。e2e はテストの途中でページを読み直せないので、`titleReturn.reload` を切ってページの中で戻す（`returnToTitle` in `src/app/play.ts`）

機体の装甲が 0 になる（`downed`）と、`src/app/play.ts` の `update` が結果の画面（`showResult`）へ移す。見出しは、やられたときが `result.downed`（「やられた」/ Downed）、台本の終わりのときが `result.title`（「突破」/ Breakthrough）。どちらも所要時間と「タイトルへ」が出る。やられたときだけ、さらに「チェックポイントから」（`#sbResultCheckpoint`。チェックポイントがあるときだけ）と「最初から」（`#sbResultRestart`）が出る。台本の終わりのときは出ない。押すと、`beginPlay`（`startSortie` と同じ片付けと組み直し）で新しい `GameModel` を描き直し、結果の画面を消して `play` に戻る。やり直しの中身は 8章「チェックポイント」。

結果の画面はタッチの層（`#touch`）より上（z-index 6）に出し、出すときに `#touch` を隠す（スマホでボタンを押せるように）。

## 4. 乱数

- 乱数は `src/logic/rng.ts` の1つの口からだけ引く。ほかで `Math.random` を呼ばない
- `rng()`: 全体の乱数。`seed(n)` で種を入れると、同じ種からは同じ並びになる
- `stream(name)`: 要素ごとの専用の乱数列。`field`・`fcs`・`dummies`・`map`・`craters`・`battle`（戦場の層の見た目: 煙・曳光弾・飛行機・砲弾穴）・`crowd`（戦場の層の歩兵ドロイドの波と砲撃の予定。ゲームの `step` が回す）・`shots`（機体の弾の散らし）・`enemies`（敵の弾の散らし）・`emplacements`（機銃座の掃射の散らし）・`mortar`（迫撃砲の狙いのずれ）・`battery`（砲台の機銃の散らし）・`pillboxes`（トーチカの弾の散らし）・`allyFx`（味方機と敵の曳光の散らし）・`trickle`（湧き続けの敵の場所。SB-2230）・`support`（歩兵の援護射撃で撃つ兵の選び。SB-2240）・`allyFire`（味方機の撃つ待ちの始まり。SB-2301）がある。種を入れると、種と `STREAM_SALT[name]` を混ぜた種から始まる
- 種を入れていないときは、どれも `Math.random` から引く

## 5. セーブ

- 保存キー: キャンペーンの進みは `SAVE_KEY = 'stormbreacher-v1'`、設定（言語）は全モード共通で `SETTINGS_KEY = 'stormbreacher-settings'`、タッチのボタンの配置は `TOUCH_LAYOUT_KEY = 'stormbreacher-touch-layout'`
- `SAVE_VERSION = 2`。形を変えたら版を上げ、`MIGRATIONS` に `[to, migrate]` を足す。1 → 2 は `funds` を `ECONOMY.startFunds` で作る
- `SaveData` は `v`・所持金 `funds`（cr）と `records.missions` を持つ。`MissionRecord` は `cleared` と `bestSec`（秒、無ければ null）
- 古いセーブは `v`（無ければ 0）から今の版まで `MIGRATIONS` を順に流す。読むのは `initSave()`（起動時）で、モジュールの読み込み時には読まない
- 中断のスナップショット: 一時停止の「中断」で `SUSPEND_KEY = 'stormbreacher-suspend'` に1つだけ書く（キャンペーンの進みとは別のキー）。形は `SuspendData`（`v`・`map` と `mission` の id・`game`・`checkpoint`）で、`SUSPEND_VERSION = 35`（35: 味方機の次の一撃までの待ち `fireT` を保存する（SB-2301）。34: 区画が弾薬庫まで伸び、`sectors` と `trickle` が11区画分になった（SB-2280）。33: 歩兵の援護の残り時間 `supportT` と敵の制圧 `suppressT` を保存する（SB-2240）。32: 湧き続けの残りの時間と、区画ごとの湧いた数 `trickle`（`t`・`spent`）を保存する（SB-2230）。31: 区画の反撃 `counterLeft`・`counterT`・`counterIds`・`arrived`・`weak` を保存する（SB-2220）。30: 区画 `sectors` を保存する（SB-2210）。29: 集積所の寄り道の損耗 `losses` をやめた（SB-2046）。28: 要塞の爆破で崩れた物 `brokenProps` と、爆薬の秒読みの長さ `total` を保存する（SB-1860）。27: 中ボスの段階・タイマー・露出 `warden` を保存する（SB-1850）。26: 中庭の援護 `assist`（`waves`・`left`）を保存する（SB-1840）。25: 要塞の機関砲の掃射の途中 `fortressGun`（`wait`・`burstLeft`）を保存する（SB-1830）。24: 寄り道で失った味方機と分隊の数 `losses` を保存した（SB-1820。29 でやめた）。23: 台本の cue が旗の条件 `when`・`unless` を持てる（SB-1810）。22: マップが z −300 まで奥へ広がり、要塞が目標を動かしたので、古い `rects`・目標は合わない（SB-1800）。21: 殴りの待ち `wait`・踏み込み `lunge`・途中の一撃 `blow` を保存する（SB-1750、SB-1755）。20: トーチカが一度撃たれたかの `shot` を保存する（SB-2022）。19: 味方機の援護射撃の途中 `cover` を保存する（SB-2024）。17: 守備の敵の持ち場 `post`・逃げる先 `fallbackPost`・隠れ/身を出す残り、トーチカの制圧 `suppress` を保存する（SB-2015）。16: 節目の溜め `slow` と砲撃の凪 `calm` を保存する（SB-2010）。15: 3隻の艇の間が船体の幅＋5m に広がり、味方機は導入が操作を渡した所で甲板を降りる（古い中断は味方機を古い甲板の点に置いたまま）。14: 敵を眠ったまま置いて台本の `wake` まで起こさない `dormant` を持つ。13: 五機の味方機が導入からプレイヤーの艇の両隣の艇に乗っている。12: 台本が、機体が艇を降りたことを覚える（浜の味方機が走り出す合図）。11: 台本が、線を開けた爆破点を覚える（覆いの味方機が進む合図）。10: 艇の四角が `rects` に入り、機体が甲板から始まり、導入が 12 秒になったので古い中断の `script.cutscene.left` の意味が変わる。9: 味方機の足元の高さと叫んだかを保存する。8: 無線の列も保存する。7: 狙う迫撃砲が、機体がどこに立っていたかを覚えている。6: 機銃座の掃射の途中を保存する。5: 爆破した線は開いたまま。4: 仕掛けた爆薬と導火線、長押しの途中を保存する。3: トーチカの待ちと予兆を保存する）。定義場所は `suspendOf`・`restoreSuspend` in src/logic/suspend.ts、読み書きは `loadSuspend`・`writeSuspend`・`clearSuspend` in src/app/storage.ts
  - 深いコピー（`structuredClone`）で、保存しない項目を名前で並べる形: `events`（そのフレームの出来事）・`bullets`（飛んでいる弾）・`shells`（落ちる前の着弾予告。チェックポイントと同じく持ち越さず、再開で消える）・`battle`・`battleTune`（戦場の層。復帰のときに区画の待ち線で作り直す）。`map` と `mission` は id で持ち、読むときに `MAPS`・`MISSIONS` の表から引き直す。`checkpoint` は `map`・`mission` を除いた形で一緒に保存し、再開したあとにやられてもそこからやり直せる。`GameModel` に項目を足すと、保存しない項目に書かない限り保存される（読み込みの検査表 `GAME_SHAPE` が項目の抜けを型で知らせる）。区画 `sectors` は保存し、再開したときの歩兵の待ち線を決める。湧き続け `trickle`（次の敵までの秒 `t` と区画ごとに出した数 `spent`）も保存する。トーチカの状態 `pillboxes`（待ち・予兆・連射・制圧の残り）と、敵の持ち場 `post` と逃げる先 `fallbackPost`・隠れ/身を出す残り、爆破点 `blasts`（爆破済みの印を含む）・仕掛けた爆薬 `charges`（導火線の残りと、仕掛けたときの長さ `total`）・長押しの途中 `plant`、狙う迫撃砲 `aimed`（`anchor`・`still`）、殴りの待ち `wait`・踏み込み `lunge`・途中の一撃 `blow` も保存する。トーチカの爆破点も `blasts` の点として同じに保存し、壊す目標の id は `map.blasts` の `target` から引く（`BlastState` の形は変えないので版は上げない。SB-1540）
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

## 6. 調整の値

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

`src/data/looks.ts` の `BASE_LIGHTS` はシーンの光の元の強さ。`hemi` 1.9（半球の強さ）・`sun` 1.25（太陽の強さ）・`sky` 0xe6f7ff・`ground` 0x4c4942（半球の上の色と下の色）・`sunAt` [42, 30, 22]（太陽の位置。横から当てて箱の面ごとに陰影を付ける）。合計の元は engine の半球 1.0・太陽 0.45 と `src/view/field.ts` の半球 0.9・太陽 0.8。上を向いた面の光は 1 を超えるため、`src/data/looks.ts` の `TONE.exposure`（0.85）を露出にして `ACESFilmicToneMapping` を掛け、砂や白波が白に飛ばないようにする（`applyToneBase` in `src/view/look.ts`。engine のレンダラーは共有なので STORMBREACHER の側で設定する）。

機体そのものの大きさは `MECH_TUNE`（D-24: 高さ 4m）。下の `MOVE_TUNE`・`QUARTER_TUNE` はこの高さを基準に書く。

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

半透明は、壁で寄ったカメラに画面を埋められないための決まり。`setProtoOpacity`（`src/view/mechProtoModel.ts`。炎の材質は自分の不透明度に同じ割合をかける）が機体の材質の `transparent` と `opacity` を切り替えるだけなので、描く回数は変わらない。毎フレーム、カメラを置いたあとに距離を測る（`drawPlay`）。

出撃・導入のカットシーン・艇の甲板の自機は、試作の模型（`buildProtoMech` in `src/view/mechProtoModel.ts`、表は `src/data/mechProto.ts`、SB-1473）で描く。骨と `SkinnedMesh` で、材質ごとに1回描く。動きは `src/view/mechDrive.ts` が `animateProtoMech` に渡す（入力と数は `mechMotion.ts` のまま）。敵の歩兵と味方機も同じ試作の部品から作る: 敵は `bakeProtoMech` で焼いた形（6章「敵」）、味方は `buildAllyMech` in `src/view/allies.ts` が `allySniper`・`allyScout` を着せた形（6章「台本の味方の機体」）。`#view-mech` は既定で今までの箱の案を出し、`?kit=<名前>`（または `?proto`・`?compare`）で試作を出す。キットは `PROTO_KITS` の名前（`player`・`ally`・`sniper`・`scout`・`enemy`・`enemyRifle`・`enemyGunner`・`enemyHeavy`・`boss`）で、`ProtoKit.scale` はボスのように高さを掛けて大きくする口、`handL` は空いた手を爪に替える口（SB-2084）。色は `PROTO_PALETTES` の行で、自機は白＋黄・青緑、狙撃は暗いオリーブ＋紺＋橙、偵察は暗い青灰＋白＋黄、敵は暗い灰＋赤。味方の印は型の色ではなく、肩の帯と番号の青緑 `PROTO_MARK_COLOR` で表す（SB-2082）。立ちの姿勢は `PROTO_TUNE.pose` の `hip` 0.5・`knee` 0.85（1471 では 0.48・1.05。仮）。影と環境の光は既定で入れない。`?shadow=1`・`?env=1` を付けたときだけ `src/view/protoStage.ts`（太陽・縁の光・環境）を自機に追わせて入れる。
出撃の値は `LANDING_TUNE`（SB-120）。艇の寸法は `CRAFT_TUNE`（`src/data/craft.ts`）。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `startDepth` | 2 | m。機体が甲板に立つ位置の、ランプの蝶番からの奥行き。艇の船尾の壁がカメラに当たらない上限は 2.5 |

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `gap` | 5 | m。艇の船体が始まる位置の、マップの手前の端からの距離 |
| `width` | 7 | m。船体の幅 |
| `length` | 12 | m。船体の長さ（z 方向） |
| `hullTop` | 1.7 | m。船体の上面。ランプの蝶番の高さ |
| `deckTop` | 1.8 | m。甲板の歩ける面の高さ |
| `deckWidth` | 5.8 | m。甲板の幅 |
| `wallHeight` | 1.6 | m。船体の上の両脇の壁の高さ |
| `wallThickness` | 0.5 | m。両脇の壁と船尾の壁の厚さ |
| `sternHeightExtra` | 1.4 | m。船尾の壁の、両脇の壁からの高さ |
| `wheelhouse` | `{ w: 3, h: 2.6, d: 3, fromStern: 3 }` | m。操舵室の幅・高さ・奥行きと、船尾からの距離 |
| `sideGap` | 5 | m。プレイヤーの艇と両隣の艇の船体の間の水面。中心の間は `width + sideGap` = 12m（SB-1967） |
| `rampLength` | 5 | m。ランプの板の長さ |
| `rampTilt` | 0.35 | rad。ランプの先を蝶番から下ろす角度 |

HUD の値は `HUD_TUNE`（SB-160）。値は仮。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `radarRange` | 200 | m。レーダーの見える距離。これより遠い目標は描かない |
| `PLAY_HUD_PLACES` | — | `src/view/hud.ts` の HUD の固定の部品（目標・任意の印・無線・敵の体力・見出し・警告・指示・使う・殴る・レーダー・ロック枠）の位置。寸法は 1280x720 向けの px で仮 |
| `HUD_RING_TUNE` | 下表 | 照準のマークの寸法（SB-2155・2157・2158・2159）。`reticle` はカーソルの照準のマーク、弧とバー（px） |
| `HUD_RING_TUNE.reticle.radius` | 12 | px。照準の中心の点のまわりの小さな円の半径 |
| `HUD_RING_TUNE.reticle.thickness` | 1.4 | px。円の線の太さ |
| `HUD_RING_TUNE.reticle.dotRadius` | 2.2 | px。中心の点の半径 |
| `HUD_RING_TUNE.reticle.gap` | 12 | px。照準の円から弧まで、弧からバーまでの同じ距離 |
| `HUD_RING_TUNE.reticle.stroke` | 3 | px。弧とバーに共通の線の太さ |
| `HUD_RING_TUNE.reticle.shadow` | 1 | px。弧とバーの両側に付ける暗い縁の太さ |
| `HUD_RING_TUNE.reticle.arc.radius` | 26 | px。左右の弧の中心線の半径（円の半径＋gap＋stroke/2） |
| `HUD_RING_TUNE.reticle.arc.openDeg` | 96 | 度。満タンのときに弧が開く角度（弧の長さは約44px） |
| `HUD_RING_TUNE.reticle.arc.armorOpacity` | 0.7 | 装甲のゲージの普段の不透明度（0-1） |
| `HUD_RING_TUNE.reticle.arc.boostFullOpacity` | 0.22 | ブーストが満タンの間の不透明度（0-1） |
| `HUD_RING_TUNE.reticle.arc.boostLowOpacity` | 0.85 | ブーストが減っている間の不透明度（0-1） |
| `HUD_RING_TUNE.reticle.bar.width` | 44 | px。横バーの幅（満タンの弧の長さに揃える） |
| `HUD_RING_TUNE.reticle.bar.segmentGap` | 1 | px。サブのこまとこまの間（バーも弧も） |
| `HUD_RING_TUNE.reticle.bar.maxSegments` | 16 | こま。満タンの弾がこれより多いときは、こまではなく割合の長さにする |
| `HUD_RING_TUNE.reticle.armorMid` | 0.6 | 装甲の色が high から mid に変わる境目（この値は mid） |
| `HUD_RING_TUNE.reticle.armorLow` | 0.28 | 装甲の色が mid から low に変わる境目（この値は low） |
| `HUD_RING_TUNE.reticle.glowSec` | 0.35 | s。被弾のあと装甲のゲージが光っている長さ |
| `HUD_RING_TUNE.reticle.ammo.warnShare` | 0.25 | 残りの割合がこれ以下ならゲージの色を変える（ちょうども含む） |
| `HUD_RING_TUNE.reticle.ammo.blinkHz` | 1 | 回/s。弾切れのゲージが赤く明滅する速さ |
| `HUD_RING_TUNE.reticle.ammo.blinkMin` | 0.5 | 0〜1。明滅で一番暗くなるときの明るさ（消えない） |

`GAUGE_TUNE`（SB-2270、SB-2281、仮）は戦線ゲージの値。色は `HUD_COLOR.gaugeEnemy`・`gaugeSecured`・`gaugeStable`（暗い赤灰・琥珀・明るいシアン。明るさでも区別できる）と、区画の境目の `gaugeBoundary`（塗りより少し明るい）。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `GAUGE_TUNE.height` | 150 | px。戦線ゲージの高さ（`baseHeight` のとき）。タッチのブーストボタン（1280x720 で y 378〜）の上で、下のポップも収まる高さ |
| `GAUGE_TUNE.baseHeight` | 720 | px。上の高さを書いた画面の高さ。ゲージの高さは `window.innerHeight` に比例させる |
| `GAUGE_TUNE.warnGap` | 30 | m。戦線からこれだけ内陸へ出ると自機の印の色が変わり始める |
| `GAUGE_TUNE.isolatedGap` | 57 | m。戦線からこれだけ内陸へ出ると孤立（援護射撃の `SUPPORT_TUNE.range`。色が赤） |
| `GAUGE_TUNE.edgeOverhang` | 4 | px。戦線の横線と区画の境目が、ゲージの左右からはみ出す長さ |
| `GAUGE_TUNE.frontThickness` | 3 | px。戦線の横線の太さ（縮尺によらず一定） |
| `GAUGE_TUNE.boundaryThickness` | 1 | px。区画の境目の横線の太さ |
| `GAUGE_TUNE.mechSize` | 6 | px。自機の菱形の一辺（縮尺によらず一定） |

`FEEDBACK_TUNE`（SB-2272、仮）は歩兵の被弾・戦死の知らせの値。色は `FEEDBACK_COLOR.mark`（琥珀）・`markHit`（赤）・`spark`（橙）。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `maxMarks` | 24 | 個。一度に出す印の上限（カメラに近い順） |
| `markSize` | 1.2 | m。印（下向きの三角）の幅と高さ。既定の見下ろしカメラで約24px |
| `markLift` | 0.4 | m。印の先を歩兵の頭の上に置く高さ |
| `markRedShare` | 0.5 | 体力の割合。これ以下で印が赤、満タンで琥珀 |
| `sparkHeight` | 1.6 | m。被弾の火花を出す高さ（足元から。兵の頭の高さ） |
| `sparkSize` | 2.5 | 火花の粒の大きさ（エンジンの既定の粒に掛ける。`burst` の最後の引数） |
| `sparkGap` | 0.4 | s。同じ兵の火花を続けて出さない間隔 |
| `sparkCount` | 3 | 個。1回の被弾の火花の数 |
| `sparkSpeed` | 4 | m/s。火花が飛ぶ速さ |
| `sparkLife` | 0.35 | s。火花の寿命 |
| `sparkGravity` | 6 | m/s²。火花が落ちる速さ |
| `downRadioGap` | 15 | s。同じ区画で歩兵の戦死の無線を続けて出さない間隔 |
| `popSec` | 2.5 | s。戦死のポップが消えるまでの秒（続けて死ぬたびに延びる） |
| `popGap` | 6 | px。戦線ゲージの下端からポップまでの距離 |

`use`（「使う」。`hud.use`）は爆破点の `CHARGE_TUNE.reach` 以内にいるとき、画面の中央から `--ring` だけ上の真ん中（`top: calc(50% - var(--ring) - 80px)`。着弾予告の警告の上）に1つだけ出し、長押しの進み（`plant.hold / CHARGE_TUNE.holdSec`）を細い棒で表す。仕掛けたあとは同じ場所に導火線（`charge`。`hud.charge` と残り秒）と棒を出す。弾数の2段（`50% + ring + 36px`）とは重ねない。値は `HudModel.use`・`HudModel.charge`（`src/logic/hud.ts`）、描くのは `src/view/hud.ts`。

メインとサブの弾が両方 0 のときは、画面の中央から `--ring` だけ下（`top: calc(50% + var(--ring) + 8px)`）に「殴る（Q）」（`hud.melee`）を出す。値は `HudModel.melee`（メインとサブの `ammo` がどちらも 0）、描くのは同じ `src/view/hud.ts`。

### 射撃

武器は表 `data/weapons.ts` の `WEAPONS`（`Record<WeaponId, WeaponDef>`）に置く。値はどれも仮で、SB-140 の2枚目と遊んで詰める。熱は持たない（2026-11-12 の決定）。

| 武器 | `damage` | `range` | `speed` | `interval` | `ammo` |
|------|----------|---------|---------|------------|--------|
| メイン `autocannon`（連射の機関砲） | 10 | 120 m | 400 m/s | 0.125 s | 400 |
| サブ `heavyGun`（単発で重い砲） | 60 | 180 m | 250 m/s | 1.2 s | 12 |

M1 は組み替え無しの1組（`M1_LOADOUT`）で、出撃ごとに `ammo` の弾を積み、撃ち切ると撃てない。撃つ間隔は `logic/weapons.ts` の `stepWeapon` が決め、`wait` の残りを次のフレームへ持ち越すので、フレームの長さで連射の速さは変わらない。

本体の射撃は、速さのある弾を飛ばす（`shoot`・`flyBullet` in `src/logic/game.ts`）。
- 撃つ: 1発ごとに、弾の出る所（`muzzleOf` in `src/logic/game.ts`。機体の中心から右へ `muzzleSide`・前へ `muzzleForward`、高さは足元から `chestHeight`）から `spreadDir(fcs.shotDir, spreadFor(fcs.shotDist, FCS_QUARTER), stream('shots'))` の向きへ弾 `Bullet`（`weapon`・位置・向き `dx dy dz`（長さ1）・射程の残り `left`）を出す（`frame` も `aimAt` も無い入力は、散らしも `FCS_TUNE.soft` で測る）。散らしは照準の点までの距離で小さくなる（`spreadFor`）。出来事 `shot`（位置・向き・`weapon`）を残す
- 狙い: `step` は、入力の `aim`（画面の狙いの線。無いときは胸から `aimAt` へ、無ければ機体の向きへ水平な線）と、生きている目標（`fcsTargets`。id は `game.targets` の番号、中心は箱の真ん中）で `stepFcs(game.fcs, 'soft', FCS_QUARTER, …)` を回す（`frame` も `aimAt` も無い入力は `FCS_TUNE.soft`）。吸着の円錐（`FCS_QUARTER.cone`）の中の目標へ狙いが寄り、その目標の id が `game.aimTarget` になる（無ければ null）。爆薬でしか壊せない目標（`TARGET_CHARGE_ONLY` in `src/data/props.ts` が true の `pillbox`）は `fcsTargets` が `lockable: false` で渡し、`circleTargets` が候補にも円の中の目標（`inCone`）にも入れない（SB-2043）。そのため、トーチカだけが円の中にいても `aimTarget` は null で、ロック枠も体力のバーも出ない。旗で開くシャッターの奥にいる目標（起動の前の要塞の機関砲。`armoured`）も同じく `lockable: false` で、シャッターが開くと候補に戻る（SB-2051）。弾はそのまま当たる（手で照準を合わせて撃てば制圧は効く）。照準の点（`manualDir`）と、陰になる相手を隠す壁には、これまでどおりトーチカも数える。本体と広場は、線ではなくカーソルが指す地面の点 `aimAt`（`aimPointOf` in `src/view/play.ts`。画面の座標から、揺れを足す前の `view.quarter.pose` と、最後に描いた画角（`view.quarter.fov`。ブースト中は `feel` の分だけ広い）・画面の縦横比で、機体の足元の高さ `mech.y` の水平面との交点として出す）を渡す。`step` はそこから胸への水平な線を作り、機体もその点へ向く
- 近距離の狙い: `soft` が寄せている相手が `FCS_QUARTER.nearRange`（12m）以内なら、`FCS_QUARTER.pull`（720度/秒）の寄せを待たず、弾の出る所から相手の箱へ入る点（弾の出る所から見た箱の一番近い点から、中心へ 1/4 進んだ所。`insideAim` in `src/logic/fcs.ts`）へ直接向ける。近くで機体を回しながら撃っても、銃口が的を置いていかない。散らしも距離で小さくなり、`spreadFor` が 0m で `nearSpread` 倍、`nearRange` で `spread` そのものにする
- 照準の点: ソフトロックが寄せている相手がいないとき、弾は照準の点へ向かう。照準の点は、照準の線（本体と広場では胸から `aimAt` への水平な線）が、物の箱（`game.propBoxes`）・壊れていない目標の箱・生きている敵の箱・地面（y = 0。本体と広場の水平な線は地面に当たらない）のうち最初に当たる点で、`FCS_QUARTER.range`（45m）の内に当たらなければ、線を `range` 延ばした点。線の上で、弾の出る所より手前の当たりは数えない。弾は照準の線より右の腕の先から出るので、照準の点へ向けないと近くの壁で照準から横にそれる。`manualDir` in `src/logic/fcs.ts`（`fcs.ts` はゲームの表を読まないため、物と敵と地面は `stepFcs` の引数 `world`（`FcsWorld`）で受ける。`world` が無いときは的の箱だけを見る）。寄せている間は、寄せた向きのまま
- 進む: 1フレームに min(`speed` × dt, `left`) m 進む。その区間で、生きている目標の箱・物の箱（坂は面に沿った段の箱。`rectBoxes`）・地面（y = 0。下向きの弾だけ）のうち一番手前で止まる。止まった所で出来事 `hit`（位置・`weapon`・`target`（目標の id か null）・`prop`（`map.props` の添字か null）・`enemy`・`mech`・`deflected`（トーチカの正面に弾かれたか。ほかは false）。地面は `target` `prop` `enemy` が null で `mech` は false）を残して弾を外す。止まらなければ `left` を減らし、0 以下で黙って消える
- 当たったあと: 目標は体力が減って 0 で `destroyed` を残して台本に渡す（`damageTarget` in `src/logic/game.ts` が、弾と爆薬の共通の道）。トーチカは弾では体力が減らず、`suppressPillbox` が銃眼を `PILLBOX_TUNE.suppressSec` 黙らせるだけ（SB-2015。6章「トーチカ」）。ほかの目標は弾の威力だけ減る。爆破点の爆薬は装甲の倍率を掛けず `PILLBOX_BLAST.damage` をそのまま与える。物は `damageProp` が体力を減らす。撃ったフレームの弾も同じフレームで進み、途中で壊れた目標や物には、あとの弾は当たらない
- 表示: 飛んでいる弾は `src/view/gunfire.ts` が、カメラへ向けた細長い板（`InstancedMesh` 1つ、最大 `GUNFIRE_CAP.tracers` = 128 本。超えた弾は飛ぶが描かない）で、頭を明るく尾を暗くした光る帯として毎フレーム描く。長さは `GUNFIRE_TUNE.tracer.length` = 8m、太さは `tracer.width`、尾の明るさは `tracer.tail`。機体の弾は `GUNFIRE_COLOR.mechTracer`、敵の弾は `enemyTracer`。`shot` で撃った手応え（`fire`）を出し、撃った武器の銃口（`muzzleOf`）に大きさの違う炎（`GUNFIRE_TUNE.flash` の `autocannon` と `heavyGun`）を 0.08〜0.1 秒（5〜6 コマ）出す。`hit` の起きた所に `HIT_DUST` = 3 の砂ぼこりを、その `x` `z` の面の高さ（`blastFaceHeight`）に出し（`deflected` は火花。6章「トーチカ」）、火花と小さな煙（`spawnImpact`。目標・敵・機体なら金属の火花を多めに）を出す
- 物と壊れる物: 弾は物で止まり、物の向こうの目標には当たらない。壊せる物（`breakable`）は体力が 0 で壊れ、当たりと弾の箱から外れる。ほかの物は壊れない
- 弾は4種類で、型 `Bullet = MechBullet | EnemyBullet | BatteryBullet | PillboxBullet`（`weapon` を持つのが機体の弾、`enemy` を持つのが敵の弾、`gun`（撃った主砲の目標 id）を持つのが砲台の弾、`pillbox`（撃ったトーチカの目標 id）を持つのがトーチカの弾。`isEnemyBullet`・`isBatteryBullet`・`isPillboxBullet` で絞り、敵の弾・砲台の弾・トーチカの弾をまとめて `isHostileBullet` で絞る）。速さと威力は `bulletSpec` が `WEAPONS`・`ENEMIES`・`GUN_TUNE`・`PILLBOX_TUNE` の表から引く
  - 機体の弾: 物・生きている目標・生きている敵・地面のうち一番手前で止まる。敵の箱は x z が ± `radius`、y が 0〜`height`。敵に当たると体力が減り、0 で出来事 `enemyDown`（`id`・`x`・`y`・`z`）を残す。`hit` の `enemy` は敵の id
  - 敵の弾・砲台の弾・トーチカの弾（`isHostileBullet`。以下は「敵の弾」と呼ぶ）: 物・機体・壊れていない目標・地面のうち一番手前で止まる。機体の箱は x z が ± `MECH_TUNE.radius`、y が足元から `MECH_TUNE.height`。目標は壁として弾を止めるだけで体力は減らない（トーチカの奥の敵がトーチカ越しに撃たないため）。敵には当たらず、物を壊さない。`hit` の `weapon` は null、機体に当たると `mech` が true
  - トーチカの弾: 型 `PillboxBullet`（`pillbox` に撃ったトーチカの id）。速さ `PILLBOX_TUNE.bulletSpeed`、威力 `PILLBOX_TUNE.damage`、飛ぶ距離 `PILLBOX_TUNE.range`。扱いは敵の弾と同じ（機体・物・壊れていない目標・地面で止まり、機体に当たると装甲が減って `damaged` を出す）
  - 機体に当たる（`damageMech`）: 装甲が弾の威力だけ減り、出来事 `damaged`（`amount`・`fromX`・`fromZ`。`fromX` `fromZ` は機体から見た、弾が来た側の地面の単位ベクトル）を残す。装甲が 0 になると `downed` を1回残し、`GameModel.downed` が true になる
- 見た目: 敵の弾・砲台の弾・トーチカの弾も、機体の弾と同じ帯（`src/view/gunfire.ts`）を `GUNFIRE_COLOR.enemyTracer` で描く。敵・トーチカ・砲台は撃ったことを出来事にしないので、見た目は飛んでいる弾を初めて見たフレームを「撃った瞬間」とし、弾の位置からその弾の速さ × dt だけ戻した所（銃口）を `GUNFIRE_TUNE.flash.enemy` の大きさで光らせる。`damaged` で `feelDamage`（`FEEL_TUNE.damageShake`）の揺れを足す。`enemyDown` は `destroyed` と同じに「倒した」手応え（ヒットストップ）を出す

射撃の見た目の値は `src/data/gunfire.ts` の `GUNFIRE_TUNE`（仮）と、上限の `GUNFIRE_CAP`、火花を散らす種の `GUNFIRE_SEED`。色は `src/data/colors.ts` の `GUNFIRE_COLOR`。同じ種類は1つの `InstancedMesh` にまとめ、毎フレーム新しい mesh・geometry・material は作らない。あふれた粒は一番古い所を使い回す。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `tracer.length` | 8 | m。帯の長さ |
| `tracer.width` | 0.4 | m。帯の頭の太さ |
| `tracer.tail` | 0.35 | 頭を1とした尾の明るさ |
| `flash.autocannon.size` / `life` | 1 / 0.08 | m / s。機関砲の銃口炎 |
| `flash.heavyGun.size` / `life` | 1.6 / 0.1 | m / s。重い砲の銃口炎 |
| `flash.enemy.size` / `life` | 2 / 0.16 | m / s。敵・トーチカ・砲台の銃口炎 |
| `impact.surfaceSparks` / `metalSparks` | 16 / 22 | 個。地面・物 / 目標・敵・機体に当たったときの火花 |
| `impact.sparkSpeed` / `sparkLife` / `sparkSize` | 9 / 0.35 / 0.25 | m/s / s / m。火花 |
| `impact.smokeSize` / `smokeLife` | 1.5 / 1.2 | m / s。着弾の煙 |
| `GUNFIRE_CAP.tracers` / `flashes` / `sparks` / `smoke` | 128 / 24 / 160 / 48 | 同時に描く上限 |

### 殴り

弾を使わない近接の一撃（2026-11-13 の決定: M1 では弾を補給しないので、撃ち切っても詰まないように）。値は `MELEE_TUNE`（`src/data/melee.ts`。すべて仮）に置き、`#view-map` の調整パネルで触れる。当たる種類ごとの倍率は同じファイルの `MELEE_DAMAGE_MUL`。定義と当たりを取るのは `logic/melee.ts`、ゲームへの組み込みは `src/logic/game.ts` の `step`・`meleeStrike`。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `damage` | 40 | 1発の威力。種類ごとの倍率を掛ける |
| `range` | 6 | m。扇の半径。物と目標は中心ではなく当たりの箱の最近点から測る |
| `halfArcDeg` | 40 | 度。機体の前から左右へこの角度までが扇 |
| `interval` | 0.8 | s。次の一撃までの待ち |
| `windupSec` | 0.12 | s。腕を振りかぶる時間 |
| `swingSec` | 0.2 | s。腕を振り抜く時間 |
| `returnSec` | 0.18 | s。振り抜いたあと腕が戻る時間 |
| `hitShare` | 0.45 | 振り抜きのどこで当たるか（0 が振り抜きの始め、1 が終わり） |
| `lungeSec` | 0.25 | s。踏み込みにかける時間 |
| `lungeDistance` | 5 | m。何かに当たったときの踏み込み（最大） |
| `missDistance` | 1.5 | m。空振りの短い踏み込み |
| `hitStop` | 0.08 | s。当たったときのヒットストップ |
| `hitShake` | 0.35 | m。当たったときのカメラの揺れ |
| `contactGap` | 0.05 | m。当たりの点を相手の面から機体側へずらす量（火花が面の中に埋もれないように） |
| `sparkCount` | 8 | 個。当たったときの火花 |
| `sparkSpeed` | 5 | m/s。火花の速さ |
| `sparkLife` | 0.18 | s。火花の寿命 |
| `sparkGravity` | -4 | m/s²。火花の落下 |

| 当たる種類 | `MELEE_DAMAGE_MUL` | 体力 | 一撃の数（仮） |
|------------|-------------------|------|----------------|
| 突撃 `assault` | 1 | 20 | 1 |
| 射撃 `grunt` | 1 | 40 | 1 |
| 重装 `heavy` | 0.6 | 120 | 5 |
| 機銃座 `emplacement` | 0.375 | 140 | 10 |
| 中ボス `warden` | 0.0625 | 400 | 160 |
| トーチカ `pillbox` | 0 | 100 | 壊せない（制圧だけ。壊せるのは爆薬） |
| 集積所 `depot` | 0.15625 | 60 | 10 |
| 砲台の主砲 `gun` | 0.0625 | 200 | 80 |
| 要塞の機関砲 `fortressGun` | 0.0625 | 300 | 120 |
| 火薬庫 `magazine` | 0.09375 | 80 | 22 |
| 地雷 `mine` | 0.625 | 10 | 1（殴った機体はその爆風を受けない） |
| 壊せる物 `prop` | 0.15625 | 物の `PROP_HP` | 物による |

- 入力と時刻: `GameInput.melee`（キー Q。タッチは `#btnMelee`）。押している間、`game.melee.wait` を毎フレーム `span`（節目の溜めの間は `dt × slow.scale`）だけ減らし、0 以下で `beginMelee` が一撃を始める。一撃は振りかぶり（`windupSec`）→ 振り抜き（`swingSec`）→ 戻り（`returnSec`）の順に進み、当たりは振り抜きの途中、`windupSec + swingSec * hitShare`（`meleeHitSec()`）のフレーム。押しっぱなしでも `interval` より速くは出ない。F の長押しで爆薬を仕掛けている間は殴らない（`step` が `held` から `melee` も外す）
- 当たる相手: 機体の前の扇（`range` 以内、`halfArcDeg` 以内）にいて、生きている敵（量産機の3種・機銃座・中ボス）・生きている目標（`pillbox`・`depot`・`gun`・`magazine`）・残っている地雷・壊せる物のうち一番近いもの。距離と扇の向きは、物と目標では中心ではなく当たりの箱の最近点（機体に近い面）で見るので、大きな目標にも面の前から届く。機体の胸から当たりの点までの線が物か立っている目標に遮られている相手には当たらず、隠れている守備兵（`post` があり `holdOut` でない敵）は候補から外れる。`MELEE_DAMAGE_MUL` の倍率を掛けたダメージを、弾と同じ関数（`damageEnemy`・`damageTarget`・`damageMine`・`damageProp`）で与えるので、0 になったときの `enemyDown`・`destroyed`・`mineBlast`・`propDestroyed` と台本への知らせは弾と同じ流れ。トーチカは弾と同じで体力を減らさず、砲口を `suppressPillbox` で制圧するだけ（初めて当たったときの無線も弾と同じ。壊せるのは爆薬だけ、SB-2015）。中ボスは殴りの倍率が `MELEE_DAMAGE_MUL.warden`（0.0625、仮）で、正面・背中の装甲の倍率は殴りには掛けない。目標の正面の決まりはこのとおり
- 踏み込み: 一撃が当たったフレームに `game.melee.lunge` を作り、機体の向きへ `lungeDistance`（空振りは `missDistance`）だけ `lungeSec` かけて進む。`stepMeleeLunge` が 1/120 秒より細かい刻みで動かし、`pushOutCircle` で物と目標の四角から押し出すので、薄い壁を抜けない。踏み込みも `span` で進む。マップの端は `step` の機体と同じく `stepBounds`（艇のランプの幅だけ前の縁を越える）と半径を残して止める
- 出来事 `melee`（`hit`・位置・`enemy`・`target`・`prop`）: 当たったら当たった物の近い面、空振りなら機体の前の空間の位置。`enemy` は敵の id、`target` は目標の id、`prop` は壊せる物の `map.props` での番号。`src/view/play.ts` が当たりの位置に火花（`MELEE_SPARK_COLOR`）を出し、`feelMelee` が揺れとヒットストップ（`MELEE_TUNE.hitStop`）を足す。音は `src/view/sound.ts` が `hit` で `meleeHit`、空振りで `meleeMiss` を鳴らす
- モーション: 一撃の時計は `game.melee.blow.t`（`meleeBlowSec()` まで残す）。`view/mechDrive.ts` が `MotionInput.meleeT` に渡し、`view/mechMotion.ts` が同じ時計から振りかぶり・振り抜き・戻りを作る。出撃の機体は試作（`buildProtoMech`）なので、`view/mechProtoModel.ts` の `poseProto` が動かす。大砲を持つ右腕は狙いを保ち、空いた左腕（`shoulderL`・`elbowL`）を引き（`punchBack`）、振り抜きで前へ突き出し（`punchReach`）、胴を振りかぶりで逆へひねって振り抜きで戻し（`punchTwist`）、前へ傾け（`punchLean`）、当たりで沈める（`punchDip`、`dipDepth` に着地の沈みと足す）。すべて仮の値。箱の案の機体（`view/mechModel.ts`）は出撃で使われないので、殴りの腕は持たない。`#view-mech` の「殴る」（キー Q）で試作の腕の動きを見られる
- HUD: メインとサブの弾が両方 0 のとき、画面の中央から `--ring` だけ下に「殴る（Q）」（`hud.melee`）を出す（`HudModel.melee`）
- 状態: `game.melee`（`wait`・`lunge`・`blow`）はチェックポイントと中断に残す。チェックポイントからのやり直し（`retryFromCheckpoint`）では `newMelee()` に戻すので、待ちと踏み込みと途中の一撃は持ち越さない

### 機体の動き

機体の動きの出発点は `MOVE_TUNE`（SB-025）。速さは m/s、加速は m/s²。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `walk` | 8 | m/s。歩く速さ |
| `stepHeight` | 0.75 | m。跳ばずに歩いて乗れる段差の高さ（仮。SB-120 の低い障害物で決め直す） |
| `accel` | 40 | m/s²。歩きの加速 |
| `decel` | 90 | m/s²。入力が無いときの減速 |
| `jump` | 10 | m/s。ジャンプの初速（最高点は約 2.5m）。本体の操作からは出せない（D-50）。ロジックにだけ残す |
| `gravity` | 20 | m/s²。空中の落下 |
| `airControl` | 0.4 | 空中で歩きの加速が効く割合（0〜1） |
| `boost` | 25 | m/s。ブーストの速さ |
| `boostAccel` | 80 | m/s²。ブーストの加速 |
| `boostDrain` | 0.3 | ゲージ/秒。ブーストで減るゲージ |
| `boostRegen` | 0.35 | ゲージ/秒。地上でキーを離したときに戻るゲージ |
| `boostLift` | 0 | m/s²。空中でブーストしたときの上向きの加速（0 なら落ちながら進む） |
| `hoverFall` | 1.5 | m/s。滞空中に落ちる速さの上限。入力には滞空も無い（D-50） |
| `hoverDrain` | 0.3 | ゲージ/秒。滞空で減るゲージ。入力には滞空も無い（D-50） |
| `landStop` | 0.12 | s。着地の硬直。この間は歩けない |
| `turn` | 2.6 | rad/s。キーで向きを変える速さ |
| `faceRate` | 30 | rad/s。指した点の方へ向き直る速さ（60fps で1コマ 0.5 rad、真後ろへ約6コマ） |
| `maxStep` | 1/120 | s。1フレームを分ける刻みの最大 |

脚の種類ごとの動きの値（SB-130 の3枚目。値は全部仮）。脚の部品は動きの種類 `gait`（`GaitKind` = `biped`・`reverse`・`multi`）を持ち、種類ごとに `MOVE_TUNE` の変える項目だけを `LEG_MOVE_TUNE` の上書きで持つ。機体の組から実際の値を作るのは `moveTuneOf`（`MOVE_TUNE` に脚の上書きを重ねる。純粋）で、`step` in `src/logic/game.ts` が `M1_MECH` から作った値を `stepMech` に渡す。定義場所は `GaitKind`・`PartDef.gait` in `src/data/mech.ts`、`LEG_MOVE_TUNE` in `src/data/tune.ts`、`moveTuneOf` in `src/logic/mechTune.ts`。

| 種類 | 脚の部品 | 上書き |
|------|----------|--------|
| `biped` | `stoutLegs`・`midLegs`・`longLegs` | なし（`MOVE_TUNE` のまま） |
| `reverse` | `reverseLegs` | `walk` 8.5・`accel` 44・`jump` 10.4・`boostDrain` 0.25・`stepHeight` 0.6 |
| `multi` | `quadLegs` | `walk` 6.2・`jump` 7.05・`stepHeight` 0.6 |

- `biped` は重ための2脚で標準。M1 の機体はこれ
- `reverse` は軽量の逆関節で、速く、高く跳び、ブーストが長い。段差には弱い
- `multi` は多脚で、遅く、低く跳ぶ
- 多脚の「揺れが少なく狙いがぶれにくい」は、揺れの値（`FEEL_TUNE`）の脚ごとの上書きが無いので、動きに出ていない

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

### カメラ・手応え・FCS

本体（`src/view/play.ts`）と広場（`#view-arena`）のカメラは、固定方位の見下ろし（クォータービュー）で、`QUARTER_TUNE`（D-50）を使う。本体の値は `?q.<項目>=<値>`（例 `?q.height=30`）で URL から上書きできる（数値でない値、範囲外の値、知らない項目は無視する。`fov` は 1〜179、`height`・`back`・`lag`・`zoomRange`・`zoomLag` は 0 以上、`zoomScale` は 1 以上だけを使う）。高さ 6m 以上の物（防波堤・要塞の壁・バンカー）は透かさないので、画面の下側にある高い壁の裏で機体が隠れることがある（既知の制限。屋内のカットアウェイと一緒にあとで直す）。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `azimuth` | π/4 | rad。画面の上が指す向き（機体の yaw と同じ約束。前進方向の -z が画面の右上に来る） |
| `height` | 25 | m。注視点からカメラまでの高さ（俯角は約 51 度） |
| `back` | 20 | m。注視点からカメラまでの水平距離（画面の下の方向へ） |
| `lead` | 3.75 | m。注視点を機体から画面の上の方向へずらす距離 |
| `lookHeight` | 1.2 | m。注視点の、機体の足元からの高さ |
| `fov` | 58 | 度。縦の画角 |
| `lag` | 0.23 | s。追従の時定数（フレーム数ではなく秒で書くので、fps で速さが変わらない） |
| `zoomScale` | 1.4 | 倍。大きい敵が近い間、`height` と `back` をこの比まで伸ばす（注視点は変えない） |
| `zoomRange` | 90 | m。大きい敵が機体からこの距離以内に生きていれば引く |
| `zoomLag` | 0.6 | s。引く・戻すの時定数。0 で遅れなし |

大きい敵で引く（SB-2160）: 中ボス（`warden`）、沿岸砲台の主砲（`gun`）と要塞の機関砲（`fortressGun`）が `zoomRange` 以内に生きている間、`src/logic/quarterZoom.ts` の `wantsWide` が引き、`stepZoom` が `zoomScale` へ `zoomLag` で寄せる（倒れた敵・目標は数えない。眠っている敵も距離が近ければ数える）。距離は、敵は中心の水平距離、目標は箱（`Aabb`）の地面での最近点までの水平距離で測る。引くのは `height` と `back` を同じ比で伸ばすだけで（`zoomedTune`）、`fov`・`lead`・`lookHeight` は変えないので、注視点はそのままでカメラだけが遠ざかる。現在の比は `view.quarter.zoom`（1〜`zoomScale`）に見た目として持ち、`GameModel` には入れない。カットシーン中は引かない（`zoom` を 1 に戻し、カットシーンの姿勢をそのまま使う）。カットシーンが終わると 1 から `zoomLag` で寄せる。照準（`aimPointOf`）は描いた姿勢 `view.quarter.pose` から地面の点を出すので、引いた姿勢でもカーソルと地面は合う。広場（`#view-arena`）も `drawPlay` を通るので同じく引くが、広場の敵は量産機だけなので、ふだんは引かない。浜の機銃座（`emplacement`）は数えない（上陸から6基が立っていて、前半ずっと引いたままになるため）。

高さが `FADE_TUNE.wallHeight`（6m）未満の物は壁にしない（SB-2048）。

- 壁と透かす物（SB-2048）: 物の高さ（`PROP_SIZE` の `h` に物の `scale` を掛けたもの）が `FADE_TUNE.wallHeight`（6m）以上なら壁で（seawall 6m・bunker 6m・stairs・ramp・cliff・fortWall 12m、目標の pillbox 6m・depot 6m・gun 8m・magazine 8m・fortressGun 10m、上陸の艇。トーチカ（pillbox・bunker）はちょうど 6m なので壁のまま）、`FADE_TUNE.wallHeight` 未満の物（hedgehog 3m・block 4m・wreck 5m・lowWall 0.85m）は壁にせず、透かす。大きい壁まで透かすと壁の向こうの敵が見えて遮蔽の意味が無くなるので、透かすのは低い物だけ。分けるのは `buildWorld`（`src/view/world.ts`）で、`lowRects`（`src/view/fade.ts`）が決める。`FADE_TUNE.wallHeight` を 0 にすると全部が壁に戻る
- 低い物の透かし（SB-2048）: `fadeStep`（`src/view/fade.ts`）が毎フレーム、画面のカメラの位置から機体の胸（足元から `MECH_TUNE.height / 2`）への線を見て、その線が低い物の箱を（x・z に `FADE_TUNE.fadePad` 広げて）通る物、またはカメラがその箱の中に入った物を、`FADE_TUNE.fadeIn` 秒で不透明度 `FADE_TUNE.fadeOpacity` まで下げる。線から外れたら `FADE_TUNE.fadeOut` 秒で戻る。カメラの距離・位置は低い物では変わらない。描き方は、透かす間だけその物のコピーを、同じ種類の透明な双子の InstancedMesh（種類ごとに 1 つ、12 コピー分。コピーごとの不透明度を頂点属性 `instanceFade` で持つ）へ移し、元のコピーは大きさ 0 にする。透かしている種類だけ 1 draw 増え、透かす物の数では増えない。透かしの前に壊れた物は元のコピーへ戻してから壊す。機体自身の半透明（`MECH_TUNE.fadeDist`、`setProtoOpacity`）とは別の仕組みで、材質も別

手応えの基準・照準の円・カットシーンの画角は `FOV_TUNE`（SB-2196）。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `feel` | 72 | 度。手応えの基準の画角 |
| `ring` | 72 | 度。照準の円の大きさを決める画角 |
| `cutscene` | 72 | 度。カットシーンの画角 |

低い物の透かしは `FADE_TUNE`（SB-2196）。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `wallHeight` | 6 | m。この高さ以上の物を壁にする。未満は壁にせず、カメラと機体の間に入ると透かす。0 で全部が壁（SB-2048） |
| `fadeOpacity` | 0.35 | 0〜1。透かした物の不透明度 |
| `fadeIn` | 0.12 | s。物が間に入ってから `fadeOpacity` まで透けるまでの時間 |
| `fadeOut` | 0.25 | s。間から外れてから元の濃さに戻るまでの時間 |
| `fadePad` | 0.5 | m。カメラから機体への線が、物の箱の横をこれだけ外れて通っても透かす（x・z） |

手応えの演出の出発点は `FEEL_TUNE`（SB-025）。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `boostFov` | 10 | 度。ブースト中に広げる画角 |
| `fovRate` | 8 | 1/s。画角が目標に寄る速さ |
| `landShake` | 0.35 | m。落ちる速さ 10m/s の着地の揺れ |
| `fireShake` | 0.06 | m。撃ったときの揺れ |
| `damageShake` | 0.2 | m。機体が弾を受けたときの揺れ |
| `shakeDecay` | 10 | 1/s。揺れが収まる速さ |
| `hitStop` | 0.025 | s。敵を倒したときに機体を止める時間（連射の命中では止めない） |
| `dust` | 1 | 砂煙の量の倍率（0 で出さない） |
| `fireRate` | 8 | 発/秒。撃ち続けたときの1秒の数 |

照準装置（FCS）の出発点は `FCS_TUNE`（SB-060）。角度は度、距離は m、速さは度/秒、時間は秒。

| 名前 | manual | soft | hard | 単位・意味 |
|------|--------|------|------|------------|
| `cone` | 0 | 10 | 12 | 度。吸着の円錐の半径（半角）。`soft`・`hard` が使い、`manual` は使わない |
| `range` | 200 | 200 | 180 | m。的の中心が胸からこの距離までのものを狙える |
| `spread` | 0.5 | 0.8 | 1.5 | 度。撃った弾が向きからずれる円錐の半径 |
| `nearRange` | 15 | 20 | 15 | m。この距離より近い的は、寄せを待たず直接狙い、散らしも `nearSpread` から `spread` へ戻す |
| `nearSpread` | 0.25 | 0.25 | 0.5 | 倍。0m での散らしの `spread` に対する割合（`nearRange` で 1 倍） |
| `pull` | 0 | 25 | 0 | 度/秒。`soft` が的へ狙いを引き寄せる速さ。ほかの型は 0 |
| `lockTime` | 0 | 0 | 0.35 | 秒。`hard` が円の中の的を捕まえるまで入れ続ける時間。ほかの型は 0 |
| `trackRate` | 0 | 0 | 90 | 度/秒。`hard` が捕まえた的へ銃口を向ける速さ。ほかの型は 0 |
| `breakCone` | 0 | 0 | 20 | 度。`hard` が捕まえた的を外す、照準の線からの角度。ほかの型は 0 |
| `flat` | — | — | — | true のとき、円錐の角度と届く距離を水平（x・z）だけで測る（SB-2120）。`FCS_TUNE` のどれも使わない |
| `FCS_QUARTER` | — | — | — | 本体と広場が PC の `aimAt`・タッチの入力で使う値の組。`flat: true`・`cone` 20・`range` 45・`spread` 0.8・`nearRange` 12・`nearSpread` 0.25・`pull` 720・`lockTime` 0・`trackRate` 0・`breakCone` 0 |

本体と広場（`#view-arena`）は見下ろしの入力のとき `FCS_QUARTER` を `soft` として使う。見下ろしの入力は、移動の基準の向き `frame` か、指した地面の点 `aimAt` のどちらかを持つもの（PC の `aimAt`、タッチの `frame` と `aimAt`）。`FCS_QUARTER` は `FCS_TUNE` に入れない（`FcsKind` を広げないため）。`frame` も `aimAt` も無い入力（ボット・テスト・開発用の入口）は `FCS_TUNE.soft` を使う。

タッチの右のドラッグの狙いは `src/data/touch.ts` の `TOUCH_TUNE`（仮）。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `aimReach` | 20 | m。右のドラッグの狙う点を、機体の足元からドラッグの画面の向きへ置く距離。`FCS_QUARTER.range`（45）の中、`FCS_QUARTER.nearRange`（12）の外 |
| `aimDeadzone` | 16 | px。これ以下のドラッグは右を触っていない扱いにする |

- テスト: `test/unit/touchAim.test.ts`（画面の向きと地面の向きの変換・死域・`aimReach` の距離・右を触っていない間は向きを保つこと・スティックだけで歩いても照準が回らないこと）、`test/integration/touchTwinStick.test.ts`（スティックの上の移動・`aimAt` と `frame` の `FCS_QUARTER`・`frame` も `aimAt` も無い `FCS_TUNE.soft`）、`test/unit/input.test.ts`（スティックの閾値）、`test/e2e/touch.test.ts`（右のドラッグの始点からの差・スティックは出ない・視点のドラッグ）

動く的の出発点は `DUMMY_TUNE`（SB-060）。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `hp` | 10 | 発。倒すのに要る命中の数 |
| `speed` | 8 | m/s。動く的の速さ |
| `respawn` | 1.5 | s。倒されてから最初の場所に戻るまで |

### 上陸戦の迫力（FX）

上陸戦の迫力の出発点は `FX_TUNE`（SB-045）。段階 2（中）の値で、`FX_STAGES` が段階 0（切る）・1（弱）・3（強）の上書きを持つ。色は `0xRRGGBB`。本体の出撃は `LOOKS` の M1 の行（`FX_TUNE`）で、`pixel`・`saturate`・`contrast`・`sepia`・`haze`・`fogColor`・`skyColor`・`light`・`sun`・`groundColor` の10項目を使う。戦場の層（歩兵ドロイド・砲撃・煙・曳光弾・飛行機・砲弾穴）は本体にも `FX_TUNE` の値（段階 2）で出る（下の「戦場の層」）。`#view-fx` は `FX_TUNE`（歩兵ドロイド 300・5 秒・分隊なし）を使う。本体の歩兵ドロイドの波は `PLAY_BATTLE_TUNE` を使う（下の「戦場の層」）。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `pixel` | 0.4 | 描く解像度の倍率（1 で等倍、0.25 で 1/4。引き伸ばしは `image-rendering: pixelated`） |
| `saturate` | 0.61 | canvas に掛ける CSS の `saturate` |
| `contrast` | 1.01 | 同じ `contrast` |
| `sepia` | 0.16 | 同じ `sepia` |
| `haze` | 0.25 | 霧の近い側を手前に寄せる割合（0 で `#view-map` と同じ見た目） |
| `fogColor` | 0x9aa9b0 | 霧の色 |
| `skyColor` | 0x93a3ac | 空（背景）の色 |
| `light` | 0.6 | シーンの全部の光の強さに掛ける倍率（1 で今のまま） |
| `sun` | 1 | 太陽（`DirectionalLight`）だけにさらに掛ける倍率（1 で今のまま） |
| `groundColor` | 0x7a6a4f | 地面の色（`0xRRGGBB`。海沿いは濡れて暗い） |
| `shellEvery` | 10 | s。何秒に1発落ちるか（0 で無し） |
| `shellNear` | 17 | m。機体からこの距離より内側には落とさない |
| `shellFar` | 70 | m。機体からこの距離までの輪の中に落とす |
| `shellShake` | 0.14 | m。10m で落ちたときの揺れ（距離で減らす）。機体の近くの爆発の揺れと合わせて `FEEL_TUNE.shakeMax` を超えない |
| `smokeLife` | 5.5 | s。砲撃の煙が残る時間 |
| `smokeCubes` | 10 | 個。1発で出る煙の塊の数 |
| `smokeMax` | 270 | 個。同時に出せる煙の塊の上限 |
| `wreckSmoke` | 3 | 本。マップの残骸から立ち続ける煙の柱の数（出撃の `PLAY_BATTLE_TUNE` は 0。残骸の柱は 1440 の空気が立てる） |
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
| `allies` | 300 | 体。1波に出す味方の体数（0 で無し）。`#view-fx` の既定 |
| `allyWaves` | 5 | s。何秒ごとに次の波を出すか（0 で次の波を出さない） |
| `allySpeed` | 2 | m/s。味方の進む速さ |
| `allyDeathRate` | 0.1 | 1体が1秒に倒れる確率（0 で1体も倒れない） |
| `allyCatchGap` | 40 | m。機体の後ろ（海側）にこれより離れた味方が歩く速さを上げ始める距離（SB-2044。本体は `BATTLE_TUNE` が同じ 40） |
| `allyCatchMul` | 1 | 倍。`allyCatchGap` の2倍離れたときの歩く速さの倍率（1 で速めない。`#view-fx` は追う機体が無いので 1。本体は 2.5） |
| `allySpawnBehind` | 0 | m。機体がこの線の先へ進んだあと、新しい波を海の縁ではなく機体のこれだけ後ろに出す（0 で海の縁。本体は 60） |
| `squads` | 0 | 隊。1波のうち機銃座へ歩く分隊の数（0 で分隊にしない） |
| `squad` | 0 | 体。1分隊の体数（0 で分隊にしない） |
| `squadFallShare` | 0 | 分隊のうち、機銃座から `squadFallRadius` 以内で倒れる割合（0〜1、0 で1体も倒れない） |
| `squadFallRadius` | 0 | m。機銃座からこの距離に入った分隊が倒れる（0 で1体も倒れない） |
| `shellFallRadius` | 0 | m。着弾からこの距離にいる歩兵ドロイドが倒れうる（0 で1体も倒れない） |
| `shellFallShare` | 0 | 半径 `shellFallRadius` の中の歩兵ドロイドが倒れる確率（0〜1、0 で1体も倒れない） |
| `planes` | 8 | 機。同時に飛ぶ飛行機の数（0 で無し） |
| `planeHeight` | 80 | m。飛行機の高さ |
| `planeSpeed` | 30 | m/s。飛行機の速さ |

本体の出撃の戦場の層は `PLAY_BATTLE_TUNE`（`FX_TUNE` に `BATTLE_TUNE` の戦場の値だけを重ねたもの）。`BATTLE_TUNE.allyDeathRate` と `BATTLE_TUNE.squadFallShare` は 0 で、本体では理由のない死と分隊の台本の死は起きない（SB-2271。分隊は機銃座へ歩き、機銃座の射撃が倒す）。`#view-fx` は `FX_TUNE` のまま。

歩兵の体力と、敵が歩兵を狙う値は `INFANTRY_TUNE`（SB-2271、仮）。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `hp` | 28 | 歩兵1体の体力（仮） |
| `targetShare` | 0.6 | 敵の1発が機体ではなく歩兵へ行く割合（仮） |
| `postedMul` | 0.2 | 陣取った・待ち線で待つ兵が受けるダメージの倍率（仮） |
| `shellDamage` | 34 | 歩いている兵が砲撃で受けるダメージ（仮。1発で倒れる） |
| `shellDamageProne` | 17 | 陣取った・待ち線で待つ兵が砲撃で受けるダメージ（仮。2発で倒れる） |
| `hitChance` | 0.5 | 歩兵へ向けた1発が当たる確率（仮） |
| `sweepRadius` | 3 | m。機銃座の1発が、選んだ兵のまわりで薙ぐ半径（仮） |
| `shotDamage.grunt` | 7 | 仮。歩いている兵を4発で倒す |
| `shotDamage.assault` | 5 | 仮 |
| `shotDamage.heavy` | 28 | 仮。歩いている兵を1発で倒す |
| `shotDamage.emplacement` | 5 | 仮 |
| `targetedSec` | 1.5 | s。最後に狙われてから「狙われている」と見る長さ（仮。票2272の印が読む） |

要塞の壁と門の値は `CROWD_WALL_TUNE`（SB-2284、仮）。門は `CROWD_GATES`（`FORTRESS_TUNE.seaWallZ` の z に、`FORTRESS_TUNE.seaGate` の幅の海の門1つ）。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `gateMargin` | 2 | m。門の海側の面から、門に並ぶ点までの海側の距離（仮） |
| `wallRadius` | 0.6 | m。歩兵が要塞の壁に寄れる最短の距離（仮） |


### 敵

敵は `src/data/enemies.ts` の表 `ENEMIES`（`Record<EnemyKind, EnemyDef>`）に置く。値はどれも仮。種類は4つ: `grunt`（射撃。量産機）、`assault`（突撃。速くて柔く、近くまで詰めて撃つ）、`heavy`（重装。遅くて硬く、遠くから間隔の長い重い1発）、`emplacement`（機銃座。動かず、機体への向きを扇に掃射する）。

| 項目 | `grunt`（射撃） | `assault`（突撃） | `heavy`（重装） | `emplacement`（機銃座） | 単位・意味 |
|------|-----------------|-------------------|-----------------|--------------------------|------------|
| `hp` | 40 | 20 | 120 | 140 | 体力 |
| `height` | 3 | 2.4 | 3.5 | 2.2 | m。高さ。重装は射撃より高く自機 4m より低い |
| `radius` | 0.75 | 0.6 | 0.75 | 1.4 | m。当たりの半径（箱は `radius` の2倍四方で、高さは `height`） |
| `speed` | 3.5 | 6.5 | 2.2 | 0 | m/s。歩く速さ。突撃は自機の歩き 8 に近い。機銃座は動かない |
| `notice` | 120 | 120 | 120 | Infinity | m。この距離に機体が入ると起きる。機銃座は `notice` では起きず、台本の `wake` で起きる（置いた時は眠っている） |
| `stopDist` | 25 | 4 | 35 | 0 | m。ここまで近づき、機体への線が通っていれば歩くのをやめる（線が通らない間は止まらない） |
| `fireRange` | 80 | 30 | 100 | 180 | m。機体がこの中にいると撃つ。弾の射程もこれ |
| `fireInterval` | 1.5 | 1 | 3.5 | 2.4 | s。撃つ間隔。掃射を持つ種類では最初の掃射までの待ち |
| `damage` | 4 | 3 | 12 | 3 | 1発が減らす機体の装甲 |
| `bulletSpeed` | 150 | 150 | 130 | 170 | m/s。弾の速さ |
| `spread` | 3 | 5 | 2 | 3 | 度。撃つ向きのずれ |
| `static` | — | — | — | true | 省略できる。真なら歩かず、落ちず、ほかの敵に押されない。それでも撃つ |
| `burst` | — | — | — | あり | 省略できる。持つと1発ではなく掃射 |

- `hp` の内訳: `grunt` 40 は機関砲4発・砲1発、`assault` 20 は機関砲2発、`heavy` 120 は機関砲12発・砲2発、`emplacement` 140 は機関砲14発・砲3発で倒れる
- `burst`（`emplacement`）: `shots` 6・`arcDeg` 36・`interval` 0.16・`rest` 2.4。`shots` 発を `interval` 秒ごとに、機体への向きを `-arcDeg/2` から `+arcDeg/2` まで等分に回して撃ち、`rest` 秒待つ

`ENEMY_CHEST` = 0.7 は、敵が撃つ高さの、高さに対する割合。

波ごとの配分（`M1_WAVE_ENEMY`。種類は `map.spawns[波]` の順に並べる）:

| 波 | 出る数 | 種類（`map.spawns` の順） |
|----|--------|---------------------------|
| `b-squad` | 6 | `heavy`・`assault`・`grunt`・`grunt`・`assault`・`grunt` |
| `b-emplacements` | 6 | `emplacement`×6 |
| `depot-guard` | 4 | `grunt`・`grunt`・`grunt`・`emplacement` |
| `seawall-drop` | 6 | `assault`・`grunt`・`heavy`・`grunt`・`assault`・`grunt` |

M1 の台本（`M1.waves`）が出す波は `b-squad`・`b-emplacements`・`depot-guard` と、敵の居ない砲撃だけの波 `shelling`（SB-1820）で、敵の数は 6・6・4。`seawall-drop` は表と `M1B_HAND` の `spawns` に場所が無く、どの cue も出さない（防波堤の上から降りる仕組みの例として表に残す）。このほかに守備の2波 `line1-hold`・`pillbox-hold` が `beach` cue で5体ずつ出る（SB-2015。下の「持ち場」）。`b-emplacements` は `beach` cue（導入が終わる時）が `dormant` で6基とも置き、`ashore`（機体が艇を降りた）で一番手前の1基（`b-emplacements-1`、x −30・z 147）だけを `wake` し、`pillboxes` cue（B に入る）で残りを `wake` する（SB-1975）。置かれた時から見えていて撃って壊せるが、起きるまで `notice` では起きず撃たない。最初の掃射は起きてから `fireInterval`（2.4 秒、`burst.rest` と同じ値）を待ってからで、撃つのは射程の中に機体がいて線が通る基だけ。前の線のハリネズミが間にある基は機体が近づくまで撃たない。

敵の動き（`stepEnemy` in `src/logic/enemies.ts`。`EnemyState` は `id`・`wave`・`kind`・`x`・`z`・`y`・`vy`・`yaw`・`hp`・`awake`・`dormant`・`wait`・`burstLeft`・`fallback`・`fallbackHold`・`post`・`fallbackPost`・`holdOut`・`holdLeft`）:
- 出る: 台本の `spawn` で、波の名前が `M1_WAVE_ENEMY`（`src/data/enemies.ts`。波の名前ごとに `map.spawns[波]` の場所の順に並べた種類の配列）にあれば、i 番目の場所に i 番目の種類の敵を1体ずつ出す（`spawnWave` in `src/logic/game.ts`）。配列の長さが `map.spawns[波]` の場所の数と違う波は出さない。高さ `y` は `M1_WAVE_DROP`（`src/data/enemies.ts`。`seawall-drop` が防波堤の高さ `PROP_SIZE.seawall.h` = 6m。表に無い波は地面の 0）。id は `<波>-<番号>`（番号は1から）。場所が無ければ出さない。`spawn` に `dormant: true` を付けると眠ったまま置き、台本の `wake` まで `notice` では起きない。`beach-mortar`（迫撃砲）と `battery`（ボス）は表に入れず、出さない。出たとき出来事 `spawned`（`wave`・`count`）を残す
- 起こす: 台本の `wake` は、波の名前なら生きているその波の敵を全部、敵の id ならその1体を起こす（`wakeEnemies` in `src/logic/game.ts`）。倒れている敵は起こさない。起きた敵は `dormant` を下ろす
- 寝る: 起きる前は動かず撃たない。機体が地面での距離で `notice` に入ると起き、一度起きたら寝ない。`dormant` の敵は `notice` に入っても起きず、`wake` だけが起こす
- 降りる: `y` が 0 より大きい敵（表では `seawall-drop`。M1 の台本は今出さない）は、起きる前でも落ちる（`fall` in `src/logic/enemies.ts`）。毎フレーム `vy` を `DROP_GRAVITY`（20 m/s²）で下へ増やして `y` を動かし、同時に海（+z）へ `DROP_PUSH`（10 m/s）で跳ぶ（防波堤の海側の面 z −65 から離れて降りるため）。落ちている間は壁を無視し、撃たず、歩かない。`y` が 0 以下になったら地面に着き、`pushOutCircle` で壁の外へ押し出す。`enemyBox` の y は足元 `y` から `y` + `height`（機体の弾は落ちている敵にも当たる）。`src/view/enemies.ts` は `y` の分だけ上に描く
- 歩く: 起きると機体へ向く（`yaw`）。`static: true` の種類（機銃座）は歩かず、落ちず、押されない。それでも向きと撃つ判定は同じ。`stopDist` は種類ごとに違い（突撃 4m・射撃 25m・重装 35m・機銃座 0m）、`stopDist` の外では歩き、`stopDist` の中でも機体への線（撃つときと同じ判定）が通らない間は歩き続ける。線が通っていて `stopDist` 以内なら止まって撃つ。線が通って `stopDist` の外なら、`stopDist` を越えて進まない。歩く先は `navTarget`（下の「敵の道」）が返す点で、道が引けないときは機体そのもの。1フレームの歩幅は `speed` × dt で、歩く先を越えない。物の四角（`game.rects`）からは `pushOutCircle` で押し出されるので、壁に当たると壁に沿って滑る。マップの範囲（`bounds`）の中に `radius` 分だけ入った所から出ない
- 持ち場（SB-2015）: `line1-hold`・`pillbox-hold` の敵は `post`（`DEFENDER_POSTS` in `src/data/defenders.ts` の添字）を持ち、`stepHolder` が動かす。持ち場は隠れる点と身を出す点の2つで、`holdLeft` の間ずっと隠れ、`DEFENDER_TUNE.peekSec` の間だけ身を出し、線が通れば `DEFENDER_TUNE.fireInterval` ごとに1発撃つ。歩く敵のように機体へ寄らず、`notice` でも持ち場を離れない（`keepApart` も呼ばないので、持ち場から押されない）。身を出している間だけ撃ち、隠れている間は撃たない。`awake` は `notice` で立つが、立たなくても持ち場から動かない
- 崩れる（SB-2015）: 節目の `payoff` が `applyPayoff` から `routeDefenders` を呼ぶ。`breach` は `line1` の持ち場を、`bunker1` は `firstRout` の付いた（トーチカ1基目の周りの）`pillbox` の持ち場を、`bunker` は残りの `pillbox` の持ち場を、`post.next` の点へ走らせる（`fallback` と `fallbackPost`）。走る間は機体に背を向け、撃たない（歩く敵の `fallback` と同じ `stepEnemy` の道）。持ち場の敵の走りは `run` で、自分の線のハリネズミには押し出されず（敵の通る切れ目を使う扱い）、マップの外にだけ出ない。着くと `holdAt` がその点の持ち場に変え、隠れる/身を出すをやり直す。`next` が null の最後の線はそこで持ち続ける
| 名前（`DEFENDER_TUNE`） | 値 | 単位・意味 |
|------|----|------------|
| `hideSec` | 2.6 | s。持ち場で隠れている長さ |
| `peekSec` | 3 | s。身を出している長さ |
| `stepSpeed` | 4.5 | m/s。隠れる点と身を出す点を行き来する速さ |
| `arrive` | 0.5 | m。持ち場の点に着いたと見る距離 |
| `firstWait` | 1.2 | s。身を出してから最初の1発まで |
| `fireInterval` | 2.8 | s。身を出している間の1発から次まで |

- 離れる: 生きていて地面にいる他の敵が `SEPARATION_DIST`（2.5m）より近いと、その敵から遠ざかる向きに、近いほど強く押される（0 の距離で `SEPARATION_SPEED` = 3 m/s、`SEPARATION_DIST` で 0）。歩いていても止まっていても押される。全く同じ所の2体は id の順で左右に分かれる。押したあとも壁の外へ押し出す（`keepApart` in `src/logic/enemies.ts`）。機銃座は押されず、ほかの敵を押しもしない
- 撃つ: 機体が `fireRange` の中にいて、胸（高さの `ENEMY_CHEST`）から機体の胸への線が物の箱（`game.propBoxes`）と壊れていない目標の箱に遮られないとき（この判定はそのフレームの歩く前の位置で1回だけ行い、止まるかどうかの判定と撃つ判定に使う）、`wait` が 0 になるたびに1発撃ち、`wait` を `fireInterval` に戻す。起きた直後は `fireInterval` 待ってから。向きは `spreadDir(…, spread, stream('enemies'))` で散らす。遮られている間は撃たずに待つ（歩き続けて線の通る所を探す）
- 掃射: `burst` を持つ種類（機銃座）は、`wait` が 0 になるたびに `burstLeft` を1減らし、`index = shots - burstLeft - 1` から `-arcDeg/2 + arcDeg × index / (shots - 1)` 度だけ機体への水平の向きを回して撃つ（`spread` の散らしはその上に重ねる）。1発ごとに `wait` を `burst.interval` にし、最後の1発のあと `burstLeft` を `shots` に戻して `wait` を `burst.rest` にする。掃射の途中で線が通らなくなったら、その掃射をやめて `burstLeft` を `shots` に戻し、`burst.rest` 待つ（`stepPillbox` と同じ考え）。乱数は `stream('emplacements')` から引き、歩く敵の `enemies` の列を動かさない。`burst` を持たない種類は1発ずつ撃つ
- 敵の道（`src/logic/nav.ts`。何も import しない純粋なファイルで、検査の格子と同じ考え方）: 壁を回り込む道を、2m 四方の格子（`CELL`）と機体までの歩数で引く
  - 格子（`buildNavGrid`）: マップの範囲を 2m 四方に切り、中心が `game.rects` のどの四角からも「半径 + `NAV_MARGIN`（0.25m）」より近い格子を塞ぐ。半径は歩く敵の種類のうち最大の `radius`（`NAV_RADIUS` in `src/logic/game.ts`。0.75m で、塞ぐ距離は検査の機体と同じ 1m。動かない機銃座は入らない）。階段・坂・目標の四角も敵には壁（敵は登らないため）。壊した物は `game.rects` から抜けるので、`rectCount` が変わったら格子を作り直す。目標は `game.rects` から抜けないので、壊れたときに `game.nav.grid` を捨て、次の歩く敵のフレームで作り直す（`damageTarget` in `src/logic/game.ts`）
  - 歩数（`buildNavField`）: 機体のいる格子（塞がれていれば `NAV_GOAL_REACH` = 5 格子以内でいちばん近い空き）を 0 として、4方向の幅優先で各格子の歩数を数える。たどり着けない格子は `FAR`（65535）
  - 歩く先（`navTarget`）: 敵から機体への直線が塞がれた格子を通らなければ機体そのもの。通るなら、敵のいる格子から歩数の少ない隣（8方向。斜めは両側が空いているときだけ。同じ歩数なら機体に近いほう）を `NAV_LOOKAHEAD`（6）格子まで先へたどり、敵から直線で行ける最も遠い格子の中心を返す（角でだけ曲がる）。敵が壁沿いで塞がれた格子の中にいるときは、まわりでいちばん歩数の少ない格子から始める。機体が囲われていて歩数がつかないときは null（まっすぐ歩く）。直線の判定は `NAV_SAMPLE`（1m）ごとの点で、始まりの格子は数えない
  - 作り直し（`stepNav`）: `game.nav`（`NavState`）が持つ。生きていて `speed > 0` の敵がいるフレームだけ呼ぶ（機銃座だけが残ったら作らない）。格子は最初と `rectCount` が変わったとき、歩数は格子を作ったときと、機体が別の格子に移ったとき（前の作り直しから `NAV_REBUILD_GAP` = 0.25 秒以上たっていれば）に作り直す。M1 の手書きマップ（四角 603 個）で、歩数の作り直しは1回 約 0.3 ms、格子は約 3 ms（壊せる物が壊れたときだけ）
  - 保存: `nav` は四角から作り直せるので、チェックポイント（`snapshotOf`・`GameSnapshot`）にも中断（`suspendOf`・`SuspendedGame`）にも入れず、戻したときは `newNav()`
- 倒れる: 体力 0 の敵は `game.enemies` に残るが、動かず、撃たず、弾も当たらない。FCS の対象にもならない。出来事 `enemyDown`（`id`・`x`・`y`・`z`）を出し、`y` は倒れた所の面の高さ（`blastFaceHeight`）と敵の足元の高いほう（落ちている途中なら足元）。爆発はその高さに `BLAST_LIFT.small` を足した所に出る
- 波が終わる: 波の敵が全部倒れると、`checkWaves` が台本に `cleared`（`wave`）を渡す。台本が覚えるので1回だけ。敵を出さなかった波には渡さない
- FCS: 生きている敵も `fcsTargets` に入る。`aimTarget` は目標か敵の id
- 見えない相手には寄らない: 胸から相手の箱の中心への線が、物の箱か壊れていない目標の箱（相手自身の箱は除く）に先に当たる相手は、生きていても `fcsTargets` で生きていない扱いにする（トーチカの陰の敵にソフトロックとロック枠が寄らないため。`inSight` in `src/logic/game.ts`）
- 見た目: `src/view/enemies.ts` が種類ごとの `InstancedMesh`（名前 `sb-enemy-<kind>`、最大 64 体）で描く。歩兵は `src/view/mechProtoBake.ts` の `bakeProtoMech` が `src/data/enemyLooks.ts` の `ENEMY_KITS` のキットを立ち姿で焼いた形で、近距離用（`sb-enemy-<kind>`）と簡易用（`sb-enemy-<kind>-far`）の2つを作る。1体は塗装と発光の2グループなので2ドロー。兵は `ENEMY_DETAIL_DISTANCE`（grunt 45m・assault 40m・heavy 55m）の境目を ±3m の幅で切り替えるので、境目を行き来しても形がちらつかない。簡易形は板を面取りの無い箱にし、丸の分割を減らし、ピストンとボルトを省いた形（1体 2,500 三角形以下）で、頭の3つ目・肩のポッド・武器の輪郭は残す。カメラの後ろと霧（`MAP_FOG.far`）の外の兵はインスタンスに書かないので、描く数と三角形に入らない。形で役割が分かる: 射撃（`grunt`）は小柄で3つ目と小銃、突撃（`assault`）は両肩の4連ポッドとガトリング、重装（`heavy`）は広い胸と左肩の6連ポッド・小銃。機銃座（`emplacement`）は砂袋・銃・盾・射手の部品で描く（6章「敵」の上の節）。色は `PROTO_PALETTES.enemy`（暗い灰＋赤）を形に焼き、倒れた敵は高さを 0.35 倍にして `ENEMY_DOWN_TINT` を掛ける。持ち場で隠れている敵は高さを 0.55 倍にして、遮蔽の陰にしゃがんだ姿で描く（身を出すと元の高さ）。HUD の敵の名前は `target.<kind>`、レーダーの印は赤い点。弾の線は機体のものと敵のもので別々に `MAX_BULLET_LINES` = 96 本までで、6基が同時に掃射しても1基6発（36本）なので足りる（`test/integration/enemies.test.ts` が開放された野原で測る）
- 保存: 敵は `kind` の文字列ごと保存するので、種類を増やしても読める。機銃座の `burstLeft`（掃射の残り）は `EnemyState` の項目なのでチェックポイントと中断に入り、その版を 6 に上げた（5章）。持ち場の `post`・走る先 `fallbackPost`・隠れ/身を出す残りも `EnemyState` の項目なので同じに入り、`SUSPEND_VERSION` を 17 に上げた（SB-2015。5章）

### 中ボス（重装指揮機）

SB-1850。中庭の3つの波を片付けると、陸側の門の内側から中ボス「重装指揮機」が出る。正面は装甲板で硬く、横へ回り込むと背中の放熱板が効く。三連射・突進・（体力が半分以下で）肩の迫撃砲を使い、突進を壁か遮蔽で止めると2秒よろけて背中を出す。倒れると3秒煙を上げて爆発し、出来事 `wardenDown` を1回だけ出す（扉は L7 が開ける。この票では開けない）。値はどれも仮。定義は `src/data/enemies.ts` の `ENEMIES.warden`（体力・高さ・半径・`navRadius`・歩き・射程・一撃の威力・弾速）と `src/data/warden.ts` の `WARDEN_TUNE`（段階・予兆・隙・突進・迫撃砲・装甲・倒れ方）、動きは `src/logic/warden.ts` の `stepWarden` と `wardenDamageMul`、`src/logic/game.ts` の `stepEnemies`・`flyBullet`、見た目は `src/view/enemies.ts` の3つの箱と `src/view/play.ts` の赤い帯・煙。

| 名前（`WARDEN_TUNE`） | 値 | 単位・意味 |
|------|----|------------|
| `turnRate` | 1.2 | rad/s。機体へ向く速さ。遅いので横へ回り込める |
| `walkOutSec` | 3 | s。門を出てから最初の攻撃まで、撃たない |
| `phase2At` | 0.5 | 体力のこの割合以下で段階2（肩の迫撃砲が使える） |
| `burst.shots` / `burst.interval` | 3 / 0.18 | 三連射の弾数と、1発から次まで（s） |
| `burstTelegraph` | 0.6 | s。三連射の前に肩の灯が光る |
| `burstRest` | 1.5 | s。三連射のあと止まる |
| `charge.telegraph` | 0.8 | s。突進の前にしゃがみ、進む道へ赤い帯を出す |
| `charge.distance` / `charge.speed` | 25 / 16 | m と m/s。突進の距離と速さ |
| `charge.damage` / `charge.push` | 25 / 3 | 装甲と m。突進が機体に触れたときに1回だけ、装甲を減らし、走る道の横へ押しのける |
| `charge.stagger` | 2 | s。突進が壁か遮蔽で止まったときのよろけ。`exposed` の間は背中が開く |
| `mortar.count` / `mortar.radius` | 3 / 5 | 肩の迫撃砲の弾数と、1発の爆風（m） |
| `mortar.warn` / `mortar.damage` / `mortar.spread` | 2.5 / 20 / 8 | s・装甲・m。予告、威力、機体のまわりへの散らし |
| `mortarEvery` | 7 | s。段階1の突進、段階2の迫撃砲の間隔 |
| `frontMul` / `sideMul` / `backMul` | 0.25 / 1 / 2 | 正面・横・背中に当たったときのダメージの倍率。`exposed` 中は全部 `backMul` |
| `dieSec` | 3 | s。倒れてから爆発まで |
| `addsAt` | 0.5 | 体力のこの割合で突撃型2機を1回だけ呼ぶ |

`ENEMIES.warden` は `hp` 400・`height` 6・`radius` 2.5・`navRadius` 0.75・`speed` 4・`notice` 120・`stopDist` 12・`fireRange` 90・`fireInterval` 2.6・`damage` 6・`bulletSpeed` 150・`spread` 2。三連射の1発の威力は `ENEMIES.warden.damage` だけに置き、`WARDEN_TUNE` には置かない。`navRadius` は敵の道の格子を塞ぐ半径で、当たり半径 2.5 ではなく 0.75 を使う（`NAV_RADIUS` が広がらず、既存3種の道が変わらない）。

- 段階: `WardenPhase` は `walkout`・`burst`・`charge`・`stagger`・`mortar`・`dying`。`WardenState` は `phase`・`timer`・`burstLeft`・`chargeLeft`・`exposed`・`mortarT`・`rammed`・`called`・`dying` を持つ。`walkout` は `walkOutSec` 歩いて近づき、撃たない。`burst` は `burstTelegraph` ののち `burst.shots` 発を `burst.interval` ごとに撃ち、`burstRest` 休む。休みのあと `mortarT` が 0 なら段階1は突進、段階2は迫撃砲を始め、そうでなければ三連射に戻る
- 突進: `charge.telegraph` しゃがんで機体へ向き、`charge.speed` で前へ `charge.distance` まで走る。1フレームで `pushOutCircle` の前後を見て、進んだ距離が歩幅の半分未満なら壁か遮蔽で止まったとみなし、`charge.stagger` 秒 `stagger` にして `exposed` を同じ秒にする。`exposed` の間は向きを変えず、撃たない。走っている間に機体の円と中ボスの円（`radius` 2.5 + 機体の半径）が触れたら、その突進で1回だけ（`rammed`）`stepWarden` が `ram`（走る向き）を返し、`stepEnemies` の `ramMech` が `charge.damage` を `damageMech` で引き（出来事 `damaged`）、機体を走る道に直角な向きの、機体のいる側へ `charge.push` m 押して壁と遮蔽の外へ出す（カットシーン中は押さない）。突進はそのまま走り続ける
- 迫撃砲: `mortar` は `burstTelegraph` ののち `mortar.count` 発の `ShellState` を返す。各弾は機体のまわり `mortar.spread` 以内に落ち、`mortar.warn` 秒の予告の輪を `src/view/hazards.ts` の `drawHazards` がそのまま描く。型は増やさない
- 突撃型の呼び出し: 体力が `addsAt` 以下になったフレームに `M1_WAVE_ENEMY['warden-adds'] = ['assault', 'assault']` と `map.spawns['warden-adds']`（中庭の左右の扉 x −22・22, z −95）で2機を1回だけ出す（`spawnWave` と同じ形）
- 装甲: `wardenDamageMul(yaw, dx, dz, exposed)`。`exposed` なら `backMul`。そうでなければ弾の水平の向きと中ボスの前（`-sin yaw, -cos yaw`）の内積が −0.5 以下なら正面、0.5 以上なら背中、その間は横。`flyBullet` が敵に当たったとき、`warden` だけこの倍率を掛けて `damageEnemy` に渡す（他の敵と目標の扱いは変えない）
- 倒れる: 体力 0 で `dying` を `dieSec` から数え、煙を出しながら低い姿になり、`dieSec` 後に `wardenDown`（`id`・`x`・`z`）を1回だけ出す。`enemyDown` は体力 0 のフレームに従来どおり出るが、`warden` のとき `drawPlay` はその場の小爆発を描かず、煙と `wardenDown` の大爆発に任せる。音は `enemyDown` が `explosionSmall`（体力 0 の一撃）、`wardenDown` が `explosionLarge`（3秒後の大爆発）。殴りは `MELEE_DAMAGE_MUL.warden`（0.0625、仮）でほとんど効かず、正面・背中の倍率は掛けない。`enemyBox` は倒れている3秒の間も残るが、`hp` 0 なので弾も FCS も当たらない
- 乱数: `stepWarden` の散らしと迫撃砲の落ちる所は既存の `stream('enemies')` から引く。新しい `StreamName` は足さない
- 保存: `EnemyState.warden` はチェックポイントと中断に入る。`SUSPEND_VERSION` を 27 に上げた（26 は中庭の援護）。戻したとき（`retryFromCheckpoint`・`restoreSuspend`）は、飛んでいた弾と予告の弾が消えるので、`restartWarden` が途中の三連射・突進・よろけ・迫撃砲を捨て、`burstRest` 休んでから選び直す形（`phase` `burst`・`burstLeft` 0・`exposed` 0・`mortarT` は `mortarEvery`）にする。体力・`walkout`・倒れている途中・突撃型を呼んだか（`called`）はそのまま
- テスト: `test/unit/warden.test.ts`（予兆の秒・突進の停止と2秒の `exposed`・正面/横/背中の倍率・段階2の迫撃砲・3秒と `down` 1回・同じ種で同じ結果・三連射の威力が `ENEMIES.warden.damage` だけ）、`test/integration/warden.test.ts`（中庭の3波のあとに出る・同じ弾数で正面と背中の残り体力が違う・突進を壁で止めると背中が出る・突進が機体に触れて装甲を引き横へ押すのは1回・`wardenDown` が1回）、`test/integration/checkpoint.test.ts`・`suspend.test.ts`（戻すと段階の頭から）、`test/unit/enemies.test.ts`（`NAV_RADIUS` が 0.75 のまま）、`test/integration/m1Run.test.ts`（横へ回り込みながら中ボスを倒して先へ進む）

### トーチカ

トーチカは B トーチカ線の的で、近づくと撃ってくる。射程の中で銃眼から機体への線が通ると、予兆のあとに数発撃ち、間を空ける。値はどれも仮。定義は `src/data/pillbox.ts` の `PILLBOX_TUNE`、動きは `src/logic/pillbox.ts` と `src/logic/game.ts` の `stepPillboxes`、見た目は `src/view/play.ts` の予兆の光。

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
| `suppressSec` | 4 | s。弾が当たったトーチカの銃眼が黙る長さ（SB-2015。体力は減らない） |

装甲は `src/data/pillbox.ts` の `PILLBOX_ARMOR`（仮）で決まる。角度は地面の上で、弾が来た側から見た正面との角。SB-2015 から弾は体力を減らさないので、この倍率は正面に当たった火花の見た目だけに残る。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `frontMul` | 0.25 | 正面に当たったと見るときの倍率（SB-2015 からは火花の判定だけに使う） |
| `sideMul` | 1 | 横・後ろに当たったと見るときの倍率 |
| `frontArc` | 45 | 度。正面とみなす角の半分。来た側が正面の向きとの角でこれ以内なら正面 |

壊れたときの沈み方は `PILLBOX_BREAK`（仮）で決まる。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `sec` | 2.5 | s。爆発から、沈み切って傾き切るまで |
| `sink` | 1.6 | m。最後に砂へ沈む深さ |
| `lean` | 0.2 | rad。最後に陸側（-z）へ傾く角 |

- 撃つ条件（`stepPillbox`）: 生きている（`hp > 0`）トーチカの箱の中心から機体の足元までの水平距離が `range` 以内で、銃眼から機体の胸（`mech.y + MECH_TUNE.chestHeight`）への線が、物の箱（`game.propBoxes`）・ほかの壊れていない目標の箱・自分の箱に遮られないこと。自分の箱も遮る物に数えるので、真横・後ろに回ると撃てない。銃眼は `pillboxMuzzle` が返す、箱の正面（`pillboxFront`。`{ x: sin yaw, z: cos yaw }`）の外へ `muzzleGap` 出た所、高さ `box.maxY × muzzle`
- 流れ: 射線が通る間だけ `wait` を数え、0 になったフレームに予兆を `warn` 秒出して出来事 `pillboxWarn`（`target`・銃眼の `x` `y` `z`）を残す。予兆が終わると `burst` 発を `shotInterval` ごとに撃ち、最後の1発のあと `interval` 待つ。連射の途中で射線が通らなくなったら、その連射をやめて `interval` 待つ。弾は `PillboxBullet`（`pillbox` に撃ったトーチカの id、`left` は `range`）で、機体・物・壊れていない目標・地面で止まる（敵の弾と同じ）
- 制圧（SB-2015）: 機体の弾がトーチカに当たると、体力は 0 も減らず、`suppressPillbox` が `suppress` を `suppressSec` にし、その場で予兆と連射を止める（`warn`・`shots`・`shotWait` を 0、`wait` を `interval`）。`stepPillbox` は `suppress` の残りを数える間、何も見ず・予兆も撃ちもせずに返す。残りが 0 になると、`interval` 待ってからまた予兆を出す。同じ間に当てると `suppress` は長いほうを残す。弾では壊れず、爆破点の爆薬だけが壊す
- 乱数: 散らしは `stream('pillboxes')` から引く（`spreadDir`）
- 装甲（`pillboxDamageMul` in `src/logic/pillbox.ts`）: 弾の水平の向き `(dx, dz)` の逆（トーチカから撃った側へ向かう向き）と `pillboxFront` の正面との角を出す。角が `frontArc` 以内なら `frontMul`、そうでなければ `sideMul`。水平の長さが 0 のときは `sideMul`。`flyBullet` はこの倍率を `hit.deflected`（正面に当たった火花を出すか）にだけ使い、体力は減らさない。どこに当たっても `suppressPillbox` を呼ぶ
- 爆破点（SB-1540）: トーチカ2基の横と後ろに1点ずつ、計4点を `map.blasts` に置く（`line` は null、`target` に壊すトーチカの id）。F を長押しして仕掛け、離れて導火線が切れると、爆薬が `PILLBOX_BLAST.damage` をそのトーチカに与える。値は `TARGET_HP.pillbox` より大きいので1回で壊れ、爆薬は装甲の外にあるので `PILLBOX_ARMOR` の倍率は掛けない。SB-2015 からトーチカを壊せるのはこの爆薬だけで、機関砲も重い砲も壊さない。定義は `PILLBOX_BLAST` in src/data/pillbox.ts、点は `M1B_HAND.blasts` in src/data/maps/m1b-hand.ts、与え方は `damageTarget` in src/logic/game.ts
- 壊れた見た目（SB-1550）: 体力が 0 になったトーチカは、`PILLBOX_BREAK.sec` 秒かけて砂へ `sink` m 沈み、陸側（-z）へ `lean` rad 傾く（`mesh.position.y` と `mesh.rotation.x`。`rotation.y` の yaw はそのまま）。高さは `WRECK_SCALE_Y`（0.35）まで下がって色は `WRECK_COLOR` になり、なめらかに出入りする（`k = t²(3-2t)`）。沈みの経過は `World.breaks`（目標 id → 壊れてからの秒）に view だけが持ち、`GameModel`・中断・チェックポイントには入れない（`SUSPEND_VERSION` を上げない）。壊れた瞬間は出来事 `destroyed` を見た `drawPlay` が `World.breaks` に 0 を入れ、最初のフレームから沈み始める。チェックポイントや中断から戻した、すでに壊れているトーチカは `World.breaks` に id が無いので、最初から沈み切った姿で描く。爆発・黒煙・揺れは演出の鎖の `blast('large', ...)` と `planSounds` が出すものをそのまま使い、音は足さない。2基目が沈むと台本の `cp1` が無線 `m1.pillboxes-down` と旗 `pillboxes-down` を出す（8章）。定義は `PILLBOX_BREAK` in src/data/pillbox.ts、描き方は `syncWorld` in src/view/world.ts、出来事の受けは `drawPlay` in src/view/play.ts、トーチカ以外の目標はその場で低く暗くする
- カットシーンの間: `stepPillboxes` は何も数えず、予兆も撃ちもしない（`stepHazards`・`stepAllies` と同じ）
- 見た目: `src/view/play.ts` が予兆の光を `THREE.InstancedMesh` 1つ（名前 `sb-pillbox-warn`、最大 8、加算合成、`depthWrite: false`、色 `PILLBOX_WARN_COLOR`）で、目標の group に足して描く。毎フレーム `game.pillboxes` の `warn` から、`warn` が 0 より大きいトーチカの銃眼に光を出す（出来事 `pillboxWarn` は使わない）。壊れた（`hp` 0）トーチカは描かない。残り時間に合わせて少し縮め、0 で消える。`MAX_PILLBOX_WARNS`（8）を超えた分は描かない。大きさと縮み方は `play.ts` 頭の `const`
- 制圧の見た目（SB-2015）: `suppress` が 0 より大きいトーチカの銃眼に、灰色の煙の球を `THREE.InstancedMesh` 1つ（名前 `sb-pillbox-smoke`、最大 8、半透明、`depthWrite: false`、色 `PILLBOX_SMOKE_COLOR`）で描く。予兆の光は `suppress` の間 0 なので出ない（銃口の光が止まる）。残りの時間に合わせて少し縮める。数と大きさの `const` は `play.ts` 頭
- 弾かれた見た目: `hit.deflected` が true の当たりは、砂ぼこりの代わりに `PILLBOX_DEFLECT_COLOR` の小さく明るい火花を `burst` で当たった位置（`event.x`・`event.y`・`event.z`）に出す。数・速さ・寿命・重力は `play.ts` 頭の `const`。false の当たりは `spawnDust`
- 保存: `pillboxes` は `GameModel` の項目としてチェックポイントと中断に入る。`suppress` もその項目なので一緒に入る。チェックポイントから戻すと `wait` はコピーのまま、`warn`・`shots`・`shotWait`・`suppress` は 0 に戻る（飛んでいる弾は消えるので、途中の予兆と連射、制圧も切れる）。`retryFromCheckpoint` in `src/logic/game.ts`
- テスト: `test/unit/pillbox.test.ts`（射程・射線・自分の箱・予兆と連射の間隔・銃眼が箱の外・同じ種で同じ弾）と `test/integration/pillbox.test.ts`（物の後ろでは出ず、射線が通ると `pillboxWarn` の `warn` 秒後に `PillboxBullet` が出る。弾は体力を減らさず `suppressSec` の間だけ黙り、そのあとまた予兆を出す。カットシーンの間は止まる）、`test/integration/game.test.ts`（弾はトーチカを壊さず制圧だけ。正面と横のどちらでも同じ）、`test/integration/pillboxBlast.test.ts`（横の爆破点で仕掛けて爆破すると体力が 0 になり、同じフレームに `destroyed` が1回と台本への `destroyed` が出る。壊れたトーチカの点は `nearBlast` が返さない）、`test/e2e/pillboxBreak.test.ts`（爆薬で壊れた直後はまだ沈んでおらず、`PILLBOX_BREAK.sec` の後に沈み切って傾き切る。戻したトーチカは沈み直さない。2基目で無線 `m1.pillboxes-down`・旗 `pillboxes-down`・`checkpoint cp1`）

### 爆破点と爆薬

SB-1500・SB-1510。ハリネズミの線の海側に爆破点を置き、そこへ来た遊ぶ人が F を長押しして爆薬を仕掛け、離れて爆破する。2本の線は切れ目が無く、爆破点のどれかを爆破すると線に「穴の半幅 × 半奥行き」の四角い穴が開く。値はどれも仮で、`#view-breach` の調整パネルで決める。定義は `CHARGE_TUNE` in src/data/charge.ts、動きは `nearBlast`・`stepCharge`・`stepBlasts`・`blastPropIndexes`・`openBreach`・`newBlasts` in src/logic/blasts.ts（`GameModel` を import しない純粋な関数）、本体とのつなぎは `step` in src/logic/game.ts、見た目は `buildBlastView`・`drawBlasts`・`removeBlastView` in src/view/blasts.ts、色は `BLAST_POINT_COLOR`・`CHARGE_COLOR` in src/data/colors.ts。乱数は使わない。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `holdSec` | 1.5 | s。F を押し続けて爆薬が付くまで |
| `reach` | 5 | m。機体の中心から爆破点まで。これ以内で F を押すと長押しが始まる |
| `fuse` | 3 | s。仕掛けてから爆破まで |
| `blastRadius` | 9 | m。この中の機体が爆風で装甲を削られる |
| `damage` | 60 | 爆風で減る装甲（仮） |
| `holeHalfWidth` | 4 | m。爆破で開く穴の、点の x からの半幅 |
| `holeHalfDepth` | 10 | m。同じく線の中心 z からの半奥行き |

- 爆破点: `MapDef.blasts`（省略できる）に `BlastPlace`（`id`・`line`・`x`・`z`・`target?`・`fuse?`・`after?`）を並べる。`line` はその防御線の中心の z（線に属さない点は null。トーチカ用と要塞用）、`x`・`z` は地面の位置（m）。`fuse?` はその点の導火線（秒。省略は `CHARGE_TUNE.fuse`。要塞の `fort-bomb` が 20 秒）。`after?` は、その出来事が台本に届くまで仕掛けられない点につける（今は `'wardenDown'` だけ。要塞の `fort-bomb` が付ける）。仕掛けられない間は、`targetStands` が false を返すので、輪も光も「使う」の表示も出ない。`+z` が海で、点は線の最も海側の列の海側の面から 2m 前（ハリネズミの大きさ 3m×scale から計算する）。手書きの `M1B_HAND` は2本の線に2か所ずつ、計4か所（`l1-a`・`l1-b`・`l2-a`・`l2-b`。x は線1 −55・40、線2 −10・50）。線2の近い点 `l2-a` は機銃座の射線の真ん中、遠い点 `l2-b` は残骸の陰で射線の外れ（SB-2020）。`newGame` が `newBlasts(map)` で `game.blasts`（`BlastState`: `id`・`line`・`x`・`z`・`blasted`）にする
- トーチカの爆破点（SB-1540）: `line` が null で、`target` に壊すトーチカの id を持つ点。線の穴は開かない（`blastPropIndexes` は何も返さない）。爆薬が切れると `step` が `blastTarget` で id を引き、その目標が生きていれば `damageTarget(game, target, PILLBOX_BLAST.damage)` を呼ぶ（同じフレームに `destroyed` と台本への `destroyed`）。`nearBlast` は、`target` の目標が無いか `hp <= 0` の点を候補から外す。見た目は線の点と同じ輪で、目標が壊れている点は描かない
- 仕掛ける: `GameInput.use`（F。省略できる）を押している間は、`stepMech` と `stepWeapon` へ `fire: false`・`sub: false` を渡すので撃たない。`stepCharge` は、`use` が真・機体が `grounded` かつ `y === 0`・`nearBlast` がある間だけ `plant.hold` を `dt` ずつ増やす。`holdSec` に達すると `game.charges` に `{ blast, left: near.fuse, total: near.fuse }` を足し、出来事 `planted`（`id`・`x`・`z`）を残す。`use` を離す・空中・`reach` の外・候補が消えると `hold` は 0 に戻る。撃たれたこと（`damaged`）では戻さない。`game.plant` は長押しの途中（`blast`・`hold`）で、チェックポイントと中断に残る。爆破済みの点は `nearBlast` が返さないので、仕掛け直せない
- 爆発と穴: `stepBlasts` が各 `left` を `dt` ずつ減らし、0 以下になった爆薬を `charges` から抜いて、その爆破点と `hit`（機体の足元が `blastRadius` 以内か）を返す。`step` はまだ `blasted` でない点なら、`blastPropIndexes(map, blast)` の返す `map.props` の添字の物を `rects`・`propBoxes`・`propRefs` から抜く（箱の番号の大きい順に `splice`。階段・坂は1つの四角に箱を積むので、四角の番号は `rectIndexOfBox` と同じ考え方で先に引く）。`blastPropIndexes` は `kind === 'hedgehog'` で `|x - blast.x| <= holeHalfWidth` かつ `|z - blast.line| <= holeHalfDepth` の物の添字を返す。線に属さない点（`line` が null）は何も抜かない。抜いた物について `propDestroyed` は出さない。出来事 `blast`（`id`・`x`・`z`・`hit`）を残し、`blasted` を true にし、`hit` なら `damageMech(game, CHARGE_TUNE.damage, x - mech.x, z - mech.z)` を呼ぶ（`damaged` の向きは機体から爆破点へ）。`map` 自体は閉じた線のままで、`openBreach(map, ids)` はテストと確認用に穴を開けた写しを返す
- 見た目: `sb-blast-points`（爆破点の地面の輪。爆破済みでなく、仕掛けていない点だけ。カットシーンの間は出さない。最大 `MAX_BLAST_RINGS` = 12）と `sb-charges`（仕掛けた爆薬の小さな箱。導火線の残りに合わせて点滅する）の `InstancedMesh` 2つ。1フレームに新しい mesh・geometry・material は作らない。`clearPlay` が片付ける。爆破で開いた物は、`syncWorld`（`src/view/world.ts`）が `game.blasts` の `blasted` を見て、その爆破点の物の copy を `breakPropSlot` で低く暗い姿にする（中断・チェックポイントから戻ったときも、開いた線で描く）。出来事 `planted` は小さな砂ぼこり、`blast` は爆発（`spawnBoom('large', ...)` と揺れ・白み）にする
- 爆破点の光の目印（SB-2022。値は仮で `MARKER_TUNE` in `src/data/marker.ts`）: 柱 `sb-blast-pillars` と菱形 `sb-blast-diamonds` を、`blastMarks`（`src/logic/blastMarks.ts`）が選んだ点にだけ出す。SB-2017 の半分ほどに下げた（柱の高さ 7→3.5m、根元の半径 0.45→0.22m、菱形 1.5→0.8m・高さ 10→6m、明るさ 0.55）。出す条件は、(1) カットシーンの間は地面の輪も光も出さない、(2) トーチカの点は、そのトーチカが一度でも撃たれてから（`PillboxState.shot`。`suppressPillbox` が立てる。中断に保存、`SUSPEND_VERSION` 20）。線の点はトーチカの撃ちが無いので最初から出す。同じ線の別の点がもう爆破されていれば、その線の点は出さない、(3) 機体が `fadeStart`（15m）より近づくと光を小さくしていき、`fadeEnd`（使う距離 `CHARGE_TUNE.reach` = 5m）の中では消す（地面の輪と「F 長押し」の促しだけが残る）。レーダーのトーチカの爆破点の印も、撃たれてからにする。出し方は3つで、URL の `?marker=` と `#view-breach` の調整パネル（`MARKER_TUNE.mode`）で切り替える。既定は `next`（仮）: `dim` は条件を満たす点すべてに控えめな光、`map` は画面の中に光を出さず小さな地図の印だけ、`next` は光を1つだけ（撃たれて立っているトーチカのうち機体に近いほうの、近い点。線の点を含め一番近いもの）で、トーチカが壊れると次へ移る。`shots/marker-tone.shots.ts` が3つの出し方と SB-2017 の見た目を同じ場所から撮る
- 音: 出来事 `planted` は `charge`、`blast` は `explosionLarge`（10章）
- HUD: 6章の `HUD_TUNE` の `use`・`charge`
- 確認用の入口 `#view-breach`: 手書きマップの線1を `buildWorld` で描き、機体を (40, 150) に置く。右上の調整パネルが `CHARGE_TUNE` と `FORT_BLAST_TUNE`（要塞の爆薬の秒読み・中の機体の装甲）を書き換え、「仕掛ける」「爆破」「戻す」「この線を爆破で開く」「閉じた線に戻す」と、`FORT_BLAST_TUNE` の「要塞に仕掛ける」「20秒進める」「爆発」でその場で試せる。`window.sbBreachReport()` が機体・爆破点・爆薬・崩れた物の数・`fortressDown`・`?stats` の数字を JSON の文字列で返す
- テスト: `test/unit/blasts.test.ts`（届く距離・地上だけ・撃たれても戻らない・`holdSec` で仕掛かる・`fuse` で爆発・`hit`・`blastPropIndexes` の穴の四角・`openBreach`・同じ入力で同じ結果）と `test/integration/blasts.test.ts`（線1の手前で仕掛けて爆発、近いと装甲が減り遠いと減らない、撃たれても長押しが続く、`rects`・`propBoxes`・`propRefs` から同じ物が抜けて穴を通れる、爆破済みの点に仕掛け直せない、チェックポイントとやり直しで爆薬・長押し・開いた線が残る）、`test/unit/mapCheck.test.ts`（`blasts: []` の写しは `no-path`）、`test/integration/hud.test.ts`（`use`・`charge`）、`test/e2e/touch.test.ts`（`#btnUse` の長押し）、`test/e2e/props.test.ts`（爆破のあと線のハリネズミの copy が低くなる）

### 迫撃砲の砲撃と地雷

SB-190 の3枚目。迫撃砲の陣地は壊せない背景の脅威で、遊ぶ人が壊しに行く対象にはしない。値はどれも仮。定義は `src/data/hazards.ts`、動きは `src/logic/hazards.ts` と `src/logic/game.ts` の `stepHazards`、見た目は `src/view/hazards.ts`。

- 砲撃（表 `BARRAGES`: `Record<BarrageKind, BarrageDef>`。種類は `mortar`（迫撃砲）・`shelling`（要塞の手前の砲撃。SB-1820）・`battery`（沿岸砲台の副砲。「ボス（沿岸砲台）」））
  - 始まる: 台本の `spawn` で、波の名前が `M1_WAVE_BARRAGE`（`beach-mortar` が `mortar`、`shelling` が `shelling`、`battery` が `battery`）にあれば `startBarrage` が `game.barrages` に足す。同じ波では1回だけ。始まったら止まらない（迫撃砲の陣地は壊せないため、台本で止める仕組みは持たない。副砲も主砲が倒れたあとも続き、弾薬庫を壊して出撃が終わるまで止まらない）。`shelling` は隊長機の問いの `spawn shelling` で、寄る道と寄らない道の両方で始まる
  - 流れ（`stepBarrage`）: 機体の足元の z が `minZ` 以上 `maxZ` 以下の間だけ `wait` を数える（`inReach`。限りのない側は `-Infinity`・`Infinity`）。`slow`（`flag` と `mul`）を持つ砲撃は、台本のその印が立っている間、`wait` を `dt / mul` ずつ数える（間隔が `mul` 倍になる。`stepHazards` が `game.script.flags` を見て渡す）。0 になるたびに着弾予告 `ShellState` を `game.shells` に足し、出来事 `shellWarn`（`x`・`z`・`radius`）を出す。届かない間は数えない（届く所に戻ってから `interval` 後が最初の予告）
  - 狙い: 機体の位置から、向きは 0〜2π、距離は 0〜`aimJitter` の一様な乱数でずらした所。乱数の列は `stream('mortar')`
  - 落ちる: `shells` の `left` が `dt` ずつ減り、0 になった予告が落ちて `shellLand`（`x`・`y`・`z`・`hit`）を出す。`y` は落ちた所の面の高さ（`blastFaceHeight`）。機体の足元が半径 `radius` の円の中なら `hit` が true で、`damageMech` と同じ道で装甲が `damage` 減る（`damaged` の向きは機体から落ちた所へ）
- 狙う迫撃砲（`AIMED_MORTAR`）
  - 始まる: 台本の `spawn` の波の名前が `M1_WAVE_AIMED`（`beach-mortar`）にあれば `startAimed` が `game.aimed`（`anchor`・`still`）を作る。同じ波では1回だけ（`game.aimed` があれば何もしない）。`BARRAGES.mortar` の砲撃も同時に続き、`beach-mortar` は両方を始める
  - 区間: 機体の足元の z が `minZ` 以上 `maxZ` 以下の間（既存の `inReach` と同じ向き。+z が海）。`minZ` はトーチカ線の手前。`aimedInReach` が判定する
  - 同じ所にいる（`stepAimed`）: 機体の x・z が `anchor` から `stillRadius` 以内にいる時間を `still` に足す。`anchor` を出たら `anchor` を機体の位置にし、`still` を 0 に戻す。高さは見ない（跳んでいても x・z が同じなら数える）
  - 予告: `still` が `stillSec` に達したら 0 に戻し、そのときの機体の x・z を狙う `ShellState`（`radius`・`warn`・`left = warn`・`damage`）を `game.shells` に足し、出来事 `shellWarn` を出す。乱数は使わず（`stream('mortar')` を消費しない）、その場所を狙う
  - 遮蔽: 見ない。物の後ろでも来る。着弾の円から出れば当たらない
  - 着弾: 既存の `stepShells` と `stepHazards` の道。`shellLand` を出し、円の中なら `damageMech`（向きは機体から着弾点へ）
  - カットシーン: カットシーンの間は `still` を数えない。もう出た予告は落ちる
  - HUD・見た目・音: 既存の `warning`（円の中にいる間 `'shell'`）・`sb-shells` の輪・`shellWarn`/`shellLand` の音がそのまま効く
  - 保存: `aimed` をチェックポイントと中断に保存する。`shells` は持ち越さないので、戻すと予告中の弾は消えて `still` だけが残る（戻ってすぐに撃たれる場合がある）
- 地雷（`MINE_TUNE`）
  - 置き場所は `MapDef.mines`（`MinePlace` の一覧。省略できる）。省略した地図は地雷なしで、生成の地図と簡易エディタの地図は地雷を持たない。`newGame` が `game.mines`（`x`・`z`・`hp`）にする
  - 踏む: 機体の足元から `stepRadius` 以内で爆発する（跳んでいても高さは見ない）
  - 撃つ: 機体の弾は、地雷の箱（`size` の幅・高さ・奥行き）に当たると止まり、`hp` が威力の分だけ減る。0 で爆発する。弾が止まる順は、目標・敵・地雷・物・地面のうち、飛ぶ道の上でいちばん近いもの（敵の弾は地雷を素通りする）。当たりの出来事 `hit` は、地面と同じく目標・物・敵・機体のどれも空
  - 爆発（`blowUp`）: 地雷が `game.mines` から消え、出来事 `mineBlast`（`x`・`y`・`z`・`hit`）を出す。`y` は地雷の下の面の高さ（`blastFaceHeight`）。機体の足元が `blastRadius` 以内なら `hit` が true で、装甲が `damage` 減る
- チェックポイント: `shells` は持ち越さない（`retryFromCheckpoint` で空にする。`bullets` と同じ）。`barrages` と `mines` はコピーで、壊した地雷は戻らない
- 見た目（`src/view/hazards.ts`）
  - 着弾予告の輪: 落ちる所の面の輪を `InstancedMesh`（名前 `sb-shells`、最大 16）1つで描く。高さは `blastFaceHeight` に `SHELL_RING_LIFT`（0.06m）を足した所。輪の半径は爆発の半径のまま、落ちるまでの間に `SHELL_WARN_COLOR` から `SHELL_LAND_COLOR` へ明るくなる
  - 地雷: 地面の円盤を `InstancedMesh`（名前 `sb-mines`、最大 64）1つで描く。爆発したものは描かない
  - 落ちた・爆発したときは、その場に爆発（`spawnBoom('large', ...)` in `src/view/boom.ts`、下の「爆発」）を出し、揺れは爆発の表の距離の値で決める（近いほど強い）。面の高さは `blastFaceHeight`（`src/logic/game.ts`。機体の半径で足元の面を読み、`BLAST_FACE_TUNE.maxHeight` = 6.5m を上限にする）で取り、閃光・煙・砂柱はその高さに `BLAST_LIFT`（`src/data/boom.ts`）を足した所に出す（`shellLand`・`mineBlast` は `large`）。戦場の層の着弾も同じ面の高さに閃光と破片を出す。描く回数は輪1・地雷1に爆発の最大5つが加わる。`clearPlay` が片付ける
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
| `BARRAGES.shelling.interval` | 5 | s。予告から次の予告まで |
| `BARRAGES.shelling.warn` | 2.5 | s。予告から着弾まで |
| `BARRAGES.shelling.radius` | 7 | m。爆発の半径 |
| `BARRAGES.shelling.damage` | 25 | 当たったときに減る装甲 |
| `BARRAGES.shelling.aimJitter` | 10 | m。狙いのずれの最大 |
| `BARRAGES.shelling.minZ` | -68 | m。届くのはこの z より奥（要塞の海側の面） |
| `BARRAGES.shelling.maxZ` | -20 | m。届くのはこの z より海側（選択の区画の手前） |
| `BARRAGES.shelling.slow` | `depot-down` ×1.6 | 弾薬庫を壊すと間隔が1.6倍 |
| `BARRAGES.battery.minZ` | −Infinity | m。砲撃が届くのはこの z より奥 |
| `BARRAGES.battery.maxZ` | −135 | m。届くのは要塞の先の野だけ（z ≤ −135） |
| `AIMED_MORTAR.stillSec` | 5 | s。同じ所にいる時間 |
| `AIMED_MORTAR.stillRadius` | 3 | m。同じ所と見る半径 |
| `AIMED_MORTAR.warn` | 2.5 | s。予告から着弾まで |
| `AIMED_MORTAR.radius` | 6 | m。爆発の半径 |
| `AIMED_MORTAR.damage` | 20 | 当たったときに減る装甲 |
| `AIMED_MORTAR.minZ` | -10 | m。届くのはこの z より海側 |
| `AIMED_MORTAR.maxZ` | Infinity | m。上限なし |
| `MINE_TUNE.stepRadius` | 1.8 | m。踏んで爆発する距離 |
| `MINE_TUNE.blastRadius` | 4 | m。爆発で装甲が減る距離 |
| `MINE_TUNE.damage` | 30 | 爆発で減る装甲 |
| `MINE_TUNE.hp` | 10 | 機体の弾に対する体力 |
| `MINE_TUNE.size` | 1×0.3×1 | m。弾の当たる箱（幅・高さ・奥行き） |

### 爆発

SB-1340。敵や物が壊れたとき・目標・地雷・迫撃砲の着弾・艇の爆破・海に落ちた砲弾を、火球 → 黒い煙の柱 → 破片 → 砂柱（海の上では水柱）で出す。見た目だけで、当たり・体力・音は変えない。定義場所は `BoomKind`・`BOOM_DEFS`・`BOOM_CAP`・`BOOM_LOOK`・`BOOM_SHAKE`・`boomShakeAt` in `src/data/boom.ts`（表）、`spawnBoom`・`drawBooms`・`buildBooms`・`clearBooms`・`removeBooms`・`boomCounts`・`freeSlot` in `src/view/boom.ts`（描く）、`feelBoom` in `src/view/feel.ts`（揺れ）。色は `BOOM_COLOR` in `src/data/colors.ts`。

- 種類: `small`（敵・物が壊れる）・`large`（目標・地雷・迫撃砲の着弾・カットシーンの着弾）・`craft`（艇の爆破・沈む艇）・`water`（海に落ちた着弾。本体の着弾とカットシーンの着弾の両方で、z がマップの `maxZ` より先ならこれを使う）。表の行は火球（`radius`・`life`・`color`）、煙の柱（`count`・`rise`・`spread`・`size`・`grow`・`life`・`color`・`fade`）、破片（`count`・`speed`・`gravity`・`life`・`size`・`color`）、柱（`height`・`radius`・`life`・`color`）、揺れ（`shake`）を持つ。煙の寿命は 6〜12 秒。値はどれも仮で、`#view-boom` で決める。粒ごとのばらつき・火球が縮み始める割合・破片の跳ね返り・柱が残る割合は種類に依らないので `BOOM_LOOK` に置く
- 上限: 粒は種類ごとに1つの `InstancedMesh`（火球・煙・破片・砂柱・水柱の5つ。名前は `sb-boom-fire` など）。上限は `BOOM_CAP`（火球 20・煙 520・破片 560・柱 36＋36）。空いている枠を先に使い（`freeSlot`）、全部埋まっているときだけ古いものから使い回す。出ていない種類は描かないので、爆発で増える描く回数は最大5
- 煙: 半透明（不透明度 0.42）で `depthWrite: false`。色は黒から灰へ変わる。煙は `SMOKE_EMIT`（1.6 秒）の間に少しずつ地面を離れ、柱になって上がる。火球と閃光（`sb-boom-fire`）だけ `toneMapped: false` にして表の色をそのまま出し、煙・破片・柱はページのトーンマッピングを通す（ACES を通すと火球が暗くくすむため）
- 柱: `spawnBoom` の z が海（マップの `maxZ` より先）なら水柱、そうでなければ砂柱。`water` はいつでも水柱。水柱の根元は渡された高さではなく、海面（`SEA_LEVEL` in `src/view/shore.ts`）に置く
- 揺れ: `boomShakeAt(kind, distance)` が `BOOM_SHAKE.near`（10m）で行の `shake`、`BOOM_SHAKE.far`（90m）で 0 になる（距離の2乗で弱まる）。本体は機体から、カットシーンはそのカメラからの距離で `feelBoom` に足す。カットシーンのカメラにも同じ揺れを足す
- つなぐ所（`drawPlay`）: `destroyed` は目標の箱の真ん中で `large`、`enemyDown` と `propDestroyed` はその場所で `small`、`shellLand` と `mineBlast` はその場所で、z が海なら `water`、そうでなければ `large`。`hit` は砂ぼこりを、`x` `z` の面の高さ（`blastFaceHeight`）に出す。敵や壁の側面に当たっても、砂ぼこりは空中に出ず、平地では元の地面の 0.6m のまま。味方機の `allyDown` は `by` が `mortar` なら `shellBurst` と砂煙（`BLAST_DUST`）、`gun` なら砂煙（`HIT_DUST`）だけ。戦場の層の砲撃は `shellBurst` で出す
- カットシーン（`drawCutscene`）: `burst` は着弾点が海なら `water`、陸なら `large`、`sink` は艇の中ほどで `craft`。ランプの砂ぼこりは `spawnDust`
- 確認用の入口 `#view-boom`: 浜と海の境を固定カメラで見て、爆発の見た目と揺れを試す。種類 `small`・`large`・`craft`・`water` のボタン（とキー 1〜4）でその種類を選んで出し、右上の調整パネル（`BOOM_DEFS.<種類>` の行）で「大きさ（火球の半径）」「煙の数」「煙の寿命」「揺れ」をその場で書き換える（保存しない。「値をコピー」で `BOOM_DEFS.large.fire.radius: 6.4` の形になる）。今の値を文字で出し、`window.sbBoomReport()` が同じ値と粒の数・描く回数・三角形を JSON の文字列で返す。土の上は砂柱、海の上は水柱

### 戦場の層

本体の出撃と `#view-fx` が同じ層を出す。歩兵ドロイド・砲撃・煙・曳光弾・飛行機・砲弾穴で、歩兵の援護射撃は敵の体力と動き・射撃に効き（下の「歩兵の援護射撃」。SB-2240）、本体では敵の射撃の一部が歩兵の体力を削って倒す（下の「歩兵の体力と敵の射撃」。SB-2271）。それ以外は見た目だけで、機体にも弾にも当たらない。`#view-fx` は歩兵の体力も敵の歩兵への射撃も持たず、歩兵は今までどおり着弾と分隊で即死する。本体では状態を `GameModel`（`battle`・`sectors`・`battleTune`）が持ち、`step` が回し、view は描くだけ。`#view-fx` は `buildBattle` が自分で状態を持つ。値は `FX_TUNE`（段階 2）で、本体は `PLAY_BATTLE_TUNE`（`FX_TUNE` に `BATTLE_TUNE` の戦場の値だけを重ねたもの。`BATTLE_TUNE.allies` 20体・`BATTLE_TUNE.allyWaves` 10 秒おき・`BATTLE_TUNE.allySpeed` 3.5m/s・`BATTLE_TUNE.squads` 2 隊・`BATTLE_TUNE.squad` 5体・`BATTLE_TUNE.squadFallShare` 0（分隊は機銃座の射撃で倒れる）・`squadFallRadius` 10m・`shellFallRadius` 10m・`BATTLE_TUNE.shellFallShare` 0.5。機銃座と着弾で倒れる）を、`#view-fx` は `FX_TUNE`（歩兵ドロイド 300・5 秒・2m/s・分隊なし）を使う。`BATTLE_TUNE`・`PLAY_BATTLE_TUNE` の定義場所は `src/data/tune.ts`（`FX_TUNE` の隣）。層の定義場所は `buildBattle` in src/view/battle/index.ts（描く。外から `BattleState` を受け取ったときは状態を持たず、`draw` で描くだけ）、`newBattle`・`stepBattle` in src/logic/battle.ts（進行）、`spawnWave`・`stepCrowd`・`fallNear`・`hurtNear` in src/logic/crowd.ts、`pickInfantry`・`fireAtInfantry` in src/logic/infantryFire.ts（SB-2271）、`stepPlane` in src/logic/planes.ts、`scatterCraters` in src/logic/craters.ts。機銃座の場所は `M1_NEST_WAVE`（`b-emplacements`）の `map.spawns` から取る。

- 進行は `logic/battle.ts`（three も DOM も読まない）。`BattleState` は歩兵ドロイド `crowd` と次の砲撃までの秒 `shellT`。`newBattle(rng, bounds, tune, holdZ = null, nests = [])` が `crowd.holdZ` と `crowd.nests`（機銃座の場所）を入れ、`stepBattle(state, rng, dt, tune, at, held = false, infantry = null, walls = [])` が歩兵ドロイドを進め（`stepCrowd(crowd, rng, dt, tune, held, at.z, walls)`）、`shellT` が 0 になったら砲撃を1発落とす（`at` は機体の位置）。砲撃の場所は `at` から `shellNear`〜`shellFar` m の輪の中で、引く乱数は距離、角度の順。揺れは `shellShake * 10 / max(10, 距離)`。最初の1発は `shellEvery` の半分の秒、あとは `shellEvery` ごと。歩兵ドロイドは同時に `MAX_SOLDIERS`（1200）まで
- 歩兵ドロイドの追い付き（SB-2044）: 待ち線を離れて歩くドロイドは、機体より海側へ `allyCatchGap`（40m）以上遅れると `catchUp` in src/logic/crowd.ts が `allySpeed` に 1〜`allyCatchMul`（2.5）の倍率を掛ける（`allyCatchGap` の2倍の遅れで最大。機体の前や横なら1）。機体の z は `stepBattle` の `at` から `stepCrowd` へ渡り、`Crowd.leaderZ` に残る。新しい波（`spawnWave`）は、機体が海の縁から `allySpawnBehind`（60m）以上進んだあとは、海の縁ではなく機体の `allySpawnBehind` 後ろから出す。浜と線1のうちは今まで通り海の縁。`BATTLE_TUNE` の3つの値が `PLAY_BATTLE_TUNE` に入り、`#view-squad` の調整パネルで触れる
- 歩兵ドロイドの分隊（SB-1610）: 本体の波は 20体で、そのうち `BATTLE_TUNE.squads`（2）隊 × `squad`（5）体が分隊として来る。`spawnWave` は分隊ごとに `crowd.nests` の機銃座を先頭から順に1つ選び、その x のまわり `SQUAD_NEST_SPREAD`（3m）に寄せて海側から出し、隊のドロイドを `SQUAD_GAP_X`・`SQUAD_GAP_Z` の楔（横3・後ろ2）に置く。残りの10体は幅いっぱいに散らばる。分隊のうち `squadFallShare` の体は `fallAt` にその機銃座の場所を持ち、`stepCrowd` が `squadFallRadius`（10m）に入った所で倒す（`alive = false`・`fallen++`・`fell` に足す）。本体の `BATTLE_TUNE.squadFallShare` は 0 なので台本で倒れる兵はいない（SB-2271。`#view-fx` の `FX_TUNE` も 0）。分隊は機銃座へ歩き、機銃座の射撃が体力を削って倒す（下の「歩兵の体力と敵の射撃」）。`squads` か `squad` が 0 なら分隊を作らず、すべてが幅いっぱいに散らばる
- 着弾の近くの歩兵（SB-1610、SB-2271 で体力に）: 砲撃が落ちたフレーム、`stepBattle` が `shellFallRadius`（10m）の中の生きている歩兵ドロイドに `shellFallShare`（0.5）の確率で当たりを付け、`fell` に足す。乱数は砲撃の距離・角度の後に引くので、着弾の場所を動かさない。本体では当たりが体力を削り（`INFANTRY_TUNE.shellDamage` 34、陣取った・待ち線で待つ兵は `shellDamageProne` 17）、0 で倒れる（純粋な `hurtNear` in src/logic/crowd.ts。`stepBattle` には `INFANTRY_TUNE` を渡し、倒れた兵は `shellFell` で返す）。本体ではさらに `stepBattleLayer` が、機体を狙う迫撃砲・地雷の爆発（`shellLand`・`mineBlast` の出来事）でも `hurtNear` を呼び、その近くの歩兵の体力を同じ値で削る。`#view-fx` は `INFANTRY_TUNE` を渡さず、`fallNear` の即死のまま（`squads`・`squad`・`squadFallShare`・`squadFallRadius`・`shellFallRadius`・`shellFallShare` がすべて 0 なので、分隊も着弾の倒れも起きない）
- 歩兵ドロイドの待ちと区画（s3-3、SB-2020、SB-2210 で区画に）: 本体の歩兵ドロイドの待ち線は、戦線の区画で決まる（6章「戦場の層」の `M1_SECTORS`）。区画は手前から `beach`（待ち線 132）・`line1`（80）・`line2`（30。SB-2044 で 60 から。トーチカ線の手前の味方機の投稿のすぐ海側）・`pillboxes`（-6。トーチカの箱 z -19〜-11 の海側 5m）・`cband`（-47）・`gate`（-60）・`yard`（-85）・`plug`（-96）・`field1`（-150）・`field2`（-200）・`magazine`（-232。SB-2280 でトーチカ線の先の7区画を足した）で、区画を掃討したフレームに `Crowd.holdZ` がその区画の値へ動き（ただしその値が、まだ開いていない防御線より内陸なら、その線の z ＋ `lineMargin` 6m の海側で待つ。`sectorHold` が台本の爆破 `script.blasts` と `map.blasts` の `line` から決める）、`holdT` が 0 に戻る。爆破で線が開くと待ち線が区画の値へ動き、待っていた歩兵が穴から流れ込む。`holdZ` では区画が確保されるまで待つ（`sectorHold` の `held`。`magazine` が確保されると偽になり、奥へ歩く）。`Crowd.holdZ` は待つ z（null なら待たない）。`stepCrowd` の `held` が真で `holdZ` が null でないとき、生きている歩兵ドロイドの z は `holdZ` より小さくならず（`lineZ` の判定より前に戻すので `through` を増やさない）、新しい波も出さない（待つ間に `MAX_SOLDIERS` へ近づかないため）。待つ間は `allyDeathRate` の抽選をせず、待ち線に着いたドロイドは `waited` を立てて、`held` が偽になった後もその抽選で倒れない（敵の射撃・着弾・分隊の機銃では倒れる）。本体の `BATTLE_TUNE.allyDeathRate` は 0 なので（SB-2271）、歩いている間もこの抽選では倒れない（`#view-fx` は `FX_TUNE` の 0.1 のまま）。待ち線で待つ間に減るのは、実際の砲撃・地雷・爆発・敵の射撃に巻き込まれたときだけ（`hurtNear` と機銃。SB-2262 で本体の `PLAY_BATTLE_TUNE` の `holdLossRate`・`holdLossRamp`・`holdLossMax` を 0 にしたので、待つだけでは倒れない。SB-2020 の仕組みは `#view-fx` 用に `FX_TUNE` に残る）。上陸の開幕の「浜で味方が倒れる」演出（艇・沈没のカットシーン・波の中の倒れ方）は台本のカットシーン側で、この待ち線の損耗とは別に残る。待っているドロイドはその場で横揺れも歩きもせず、向きは陸（yaw 0）にする。`held` が偽で、待っていないドロイドは `lineZ` まで歩き、本体では `allyDeathRate` 0 なので抽選では倒れない。`spawnWave` は `lineZ` だけを毎回設定し、`holdZ` は変えない。`stepBattleLayer` in src/logic/game.ts が `stepSectors` を回し、`sectorHold` の待ち線と `held` を `stepBattle(game.battle, stream('crowd'), dt, game.battleTune, game.mech, hold.held, INFANTRY_TUNE, walls)` へ渡す（`walls` は下の「要塞の壁と門」。広場では渡さない）。待つ間も、生きている歩兵が0人になったら `SECTOR_TUNE.refill` 体の波を `spawnCrowd` で出す（海の縁、または自機の `allySpawnBehind` 後ろ。`holdT` は 0 に戻す）。区画はチェックポイント・中断に入り、復帰のときは `sectorHold` の待ち線で群れを作り直す。`#view-fx` は `buildBattle` に `holdZ` を渡さず（null）、`held` も渡さないので待たない
- 確保した区画に陣取る（SB-2262）: 区画を確保したフレームに、その区画の待ち線に着いた歩兵（`arrivedSoldiers`。すでに持ち場にいる兵は除く）それぞれへ持ち場 `Soldier.post` を割り当てる。点は純粋な `sectorPosts` in src/logic/sectors.ts が選び、区画の中の遮蔽物（`rects` のブロック・ハリネズミ・低い壁・残骸などと、`props` のクレーター）の海側（敵は陸側から来るので、遮蔽物の陰になる側）の面から `POST_COVER_GAP` 1.5m 海側の点を x の順に区画の幅へ均して優先し、足りない分は区画の待ち線にマップの幅いっぱい（左右 `POST_EDGE` 3m 内側）へ等間隔に並べる。要塞の中の区画（`yard`・`plug`）は `postRange`（x -26〜26）を持ち、どちらの点もその中に収める（壁の外の点には海側の門から歩いて着けない）。点は区画とマップの z の範囲（海へ出ない）に収め、ブロックなどの `rects` から `POST_CLEAR` 0.8m 以上離れた所だけを使う（待ち線上の点が塞がっていれば x にずらす）。兵と点はどちらも x の順に組み、歩く兵が交差しない。兵は `stepCrowd` が `allySpeed` でその点へ歩き、着くと止まって向きを陸（yaw 0）にし、`view/battle` は待ち線と同じしゃがみ（`ready`）で描く。次の区画を掃討したフレームに `releasePosts` が持ち場の歩兵の `SECTOR_TUNE.postStayShare`（0.5）を残し、残りを待ち線へ進ませる。`arrivedSoldiers` は持ち場の兵も着いた兵として数えるので、援護射撃は持ち場の兵も使う。確保の判定（`sectorSecured`）は前の区画に残った持ち場の兵を数えず、待ち線へ歩く兵（`post` が null）だけで `min(arriveMax, ceil(歩く兵 × arriveShare))` を見る（歩く兵がいなければそのまま確保）。`releasePosts` は少なくとも1体を進ませる。歩兵は中断に保存しないので `SUSPEND_VERSION` は上げない
- 要塞の壁と門（SB-2284）: 本体の歩兵は要塞の壁を素通りしない。`stepBattle` の最後の引数 `walls`（`readonly GroundRect[]`、既定は空）に `game.rects` から選んだ壁を渡し、`stepCrowd(crowd, rng, dt, tune, held, leaderZ, walls)` が歩くときに見る。壁にするのは要塞の箱の物だけ（`kind` が `fortWall` の物の矩形。`crowdWalls` in src/logic/game.ts が `game.rects` と `game.propRefs` を突き合わせて選ぶ）で、中庭の遮蔽・ハリネズミ・防波堤・防波堤の坂は壁にしない（陣取る兵は今までどおり `standable` が避けるだけ）。歩兵は壁の矩形に `CROWD_WALL_TUNE.wallRadius` 0.6m 以内に入れない（入る移動は移動前の位置へ戻し、x か z の片方だけで滑り、どちらも駄目ならそのフレームは動かない）。進む先（待ち線か持ち場）が壁より陸側で、まだ壁の海側にいる兵は、`CROWD_GATES`（海の門。x 0、`FORTRESS_TUNE.seaGate` 12m 幅）の手前（海側の面から `gateMargin` 2m 海側）へ x を寄せてから門をまっすぐ通り、そのあと本来の待ち線・持ち場へ向かう。門より海側で歩く先も海側なら今までどおり。陣取る兵（`post`）も同じ経路と守りを使う。陸の門は戸が `collapse` で爆破まで閉じているので `CROWD_GATES` に入れない。爆破で戸・陸側の壁・左右の壁が `game.rects` から消えてから、その場所を通れる（海側の壁は残る）。壁の矩形は毎フレーム `game.rects` から選び直すので、爆破で消えた壁は次のフレームから無い。壁が空（広場 `sectors: false` と `#view-fx`。どちらも `stepBattle` に `walls` を渡さない）なら、動きも乱数の順も今までと同じ。`Soldier` に項目は足さず、歩兵は中断に保存しないので `SUSPEND_VERSION` も上げない。値は `CROWD_WALL_TUNE`（仮）、門は `CROWD_GATES`（どちらも src/data/fortress.ts）
- 歩兵の体力と敵の射撃（SB-2271）: 歩兵は `Soldier.hp` 28（`INFANTRY_TUNE.hp`）を持ち、`spawnWave` が分隊と散らばりの両方でその値で作る。体力が 0 以下になった兵は今までの倒れ方（`alive = false`・`deadT = 0`・`crowd.fallen++`）で倒れる。敵のうち `stepEnemy` を通る歩く敵（湧き続け・反撃・波の `grunt`/`assault`/`heavy`）、持ち場の守り兵（`stepHolder`）、機銃座（`emplacement`）は、撃つたびに `stream('infantryFire')` で `INFANTRY_TUNE.targetShare` 0.6 を引き、歩兵を狙う発は弾にせず `infantryFire.ts` の `fireAtInfantry` で当てる（届く兵がいない発は今までどおり機体の弾になる）。中ボス `warden`・トーチカ・砲台・要塞の機関砲は今までどおり機体だけを狙う。狙う兵は、その敵の `fireRange` 内で `game.propBoxes` に遮られていない生きている兵のうち、前進中を先に、無ければ陣取った兵から（陣取った兵は `post` があるか、`waited` で今 `crowd.holdZ` の待ち線に立っている兵。待ち線を離れて歩き出した兵は `waited` が残っていても前進中の扱い。`isPosted`）一番近い者。`hitChance` 0.5 で当たり、当たると `shotDamage[敵の種類]`（`grunt` 7・`assault` 5・`heavy` 28・`emplacement` 5）だけ体力を削る。陣取った・待ち線で待つ兵は `postedMul` 0.2 倍。機銃座の1発は選んだ兵の `sweepRadius` 3m の中の生きている兵にも、遮蔽物に遮られていなければ同じ判定をする。狙われた兵は `Soldier.targetedT` に `targetedSec` 1.5秒を入れ（`stepCrowd` が毎フレーム減らす。次の票2272の印が読む）、狙われ始め・当たり・倒れは出来事 `infantryTargeted`・`infantryHit`・`battleFell`（`by: 'fire' | 'shell' | 'other'`、`by` は任意）に残す。本体の `BATTLE_TUNE.allyDeathRate` と `squadFallShare` は 0 にし、理由のない死と台本の死をやめた。歩兵は中断に保存しない（`Soldier` は `GameModel.battle` にあり、`restoreSuspend` が区画から作り直す）ので `SUSPEND_VERSION` は上げず、`EnemyState` にも項目を足さない。`game.sectors` が null の広場では歩兵を狙わない。
- 歩兵の被弾と戦死の知らせ（SB-2272）: 狙われている歩兵（`Soldier.targetedT > 0`）の頭上の 0.4m に、下向きの三角（▼）の印を出す。見下ろしでは足元が群れや遮蔽物と重なるので、印は空間の頭の上に出し、煙と同じくカメラを向けた板（`camera.quaternion`）にする。色は体力が満タンなら琥珀 `FEEDBACK_COLOR.mark`、当たって減ると `FEEDBACK_TUNE.markRedShare` 0.5 以下で赤 `FEEDBACK_COLOR.markHit` へ直線で寄る（点滅しない）。出すのは狙われた兵だけで、画面でカメラに近い順に `FEEDBACK_TUNE.maxMarks` 24 個まで。大きさは `FEEDBACK_TUNE.markSize` 1.2m（既定の見下ろしカメラで約24px）。最初に当たったフレーム（`infantryHit`）は兵の頭の高さ `sparkHeight` 1.6m にオレンジの粒 `sparkCount` 3つを、既定の `sparkSize` 2.5 倍の大きさで `burst` で出し、同じ兵は `sparkGap` 0.4 秒以内に続けて出さない。倒れた兵（`battleFell` の `by` が `fire` か `shell`）は、`Crowd.manDownAt` の区画ごとの時刻を見て `downRadioGap` 15 秒に1回だけ無線 `m1.man-down`（ja「歩兵がやられた！」／en「Man down!」）を `queueRadio` する（死んだ z で区画を決め、区画の外は最後の区画にまとめる。`by: 'other'` は出さない）。同じ秒に続けて倒れた分も、画面の右端の戦線ゲージの下 6px に「歩兵 戦死 ×N」（`hud.infantryFall`。色は琥珀 `HUD_COLOR.amber`）として `popSec` 2.5 秒（新しく死ぬたびに延び、数が増える）出し、間引かれた死も数に入れる。ポップの残り秒と数は view（`PlayHud.pop`）だけが持ち、`GameModel` にも中断にも入れない。カットシーンの間と広場（`game.sectors === null`）は出さない。`#view-fx` は歩兵が狙われないので印もポップも出ない。値は `FEEDBACK_TUNE`（仮）、色は `FEEDBACK_COLOR`、色と大きさと火花の間隔は純粋な `src/view/battleMarks.ts`、印と火花は `src/view/battle/index.ts`、無線の間引きは `queueManDownRadio` in src/logic/game.ts、ポップは `src/view/hud.ts`（`stepFallPop`）が `src/view/play.ts` の数えた `battleFell` から受ける
- 歩兵の援護射撃（SB-2240）: 待ち線に着いた歩兵だけが撃つ（走っている兵は撃たない）。待ち線が無い（`sectorHold` の `held` が偽）ときは撃たない。撃つ兵は `min(着いた兵, SUPPORT_TUNE.shooters 12)` 人で、強さの係数は `f = clamp(着いた兵 / factorPer 12, minFactor 0.35, maxFactor 1.15)`。1秒あたり `n × f / ((intervalMin 1.1 + intervalMax 1.7) / 2)` 発を、残り時間 `GameModel.supportT` に溜めて撃つ。1発ごとに着いた兵から1人を `stream('support')` で選び（歩兵の波・砲撃の乱数列 `crowd` を動かさない）、その兵から `range` 57m 以内の、生きていて `awake` で `dormant` でない一番近い敵を狙う（中ボス `warden` は撃たない。持ち場の守り兵は `holdOut` のときだけ。隠れている守り兵と眠っている機銃座、トーチカ `game.targets` は狙わない）。当たると `ENEMIES[kind].hp × (damageBase 0.07 + damagePer 0.17 × f)` の体力を `damageEnemy` で減らし（倒れたら今までどおり `enemyDown`）、`suppressSec` 2.6秒の制圧を置く。制圧の間は敵の撃つ間隔が `suppressFire` 2.5倍に伸び（`enemy.wait` を `1/2.5` の速さで数える）、歩く速さが `suppressMove` 0.55倍になる。機銃座も `stepEnemy` を通るので射撃が鈍り、持ち場の守り兵は `stepHolder` の待ちと歩きが鈍る。中ボス `warden` は的にしない（露出で受けるダメージが決まるので、歩兵が迂回しない）。曳光は出来事 `supportFire`（兵の位置 `from` と敵の胸 `to`）で、`src/view/play.ts` が `Battle.tracer` で兵の胸 1.2m から描く。計算は `SUPPORT_TUNE` と `src/logic/support.ts` の純粋な `stepSupport` が持ち、`game.ts` の `stepBattleLayer` が `stepBattle` のあとに呼ぶ（カットシーン中・`downed`・クリア後は呼ばない）。音は `src/view/sound.ts` が同じ出来事で `supportFire`（小さい小銃。兵の位置から。`SOUND_FRAME_LIMIT` で1フレーム2発までに間引く。SB-2262）を鳴らす
- 区画（SB-2210、SB-2220 で反撃と安定を足した）: 区画は `M1_SECTORS` in src/data/sectors.ts の11区画で、手前から（`id`・海側の縁 `seaZ`・陸側の縁 `landZ`・掃討後の待ち線 `holdZ`・反撃の敵の数 `counter`・湧き続けの予算 `budget`）`beach`（170・129・132・3・8）・`line1`（129・62・80・4・12）・`line2`（62・-11・30・6・16）・`pillboxes`（-11・-40・-6・8・20）・`cband`（-40・-55・-47・4・14）・`gate`（-55・-70・-60・6・12）・`yard`（-70・-100・-85・0・6）・`plug`（-100・-125・-96・0・0）・`field1`（-125・-175・-150・6・18）・`field2`（-175・-225・-200・8・20）・`magazine`（-225・-255・-232・0・12）。`goals`（SB-2283）は `pillboxes` がトーチカ `pillbox`、`gate` が要塞の機関砲 `fortressGun`、`yard` が旗 `yard-1-clear`・`yard-2-clear`・`yard-3-clear` の3つ（中庭の3波。波の間に敵が0になっても、3つ立つまで掃討にしない。2波目は陸側の門で出るので、帯の敵だけでは見えない）、`plug` が `wardenDown`（Warden が湧く前も、倒すまでも掃討にしない）、`magazine` が主砲2門 `gun`（弾薬庫そのもの `magazine` は入れない。壊すとミッションが終わる）。`cband`・`field1`・`field2` と手前の4区画は `goals` を持たず、敵だけで掃討を決める。判定は `src/logic/sectors.ts` の純粋な関数で、`stepSectors` は毎フレーム、手前から見て最初の `stable` でない区画だけを見る。掃討（`idle` → `advancing`）は、自機の z が `seaZ - enterDepth`（6m）以下で、z が `landZ` から `seaZ + seaMargin`（10m）までの生きている敵が0のとき（そのうえ区画の `goals` が全部倒れていること。`goals` は任意の並びで、`{ kind: 'target', target: TargetKind }` はその種類の目標が1つでも `hp > 0`、`{ kind: 'flag', name }` は旗がまだ立っていない、`{ kind: 'wardenDown' }` は `script.wardenDown` が偽のとき立っている。目標の見方は `src/logic/sectors.ts` の `goalsStanding(sector, { targets, flags, wardenDown })` に1か所でまとめ、`sectorClear` と湧き続けの `scriptedFoeIn` が使う。SB-2283）。確保（`advancing` → `secured`）は、待ち線へ歩く兵（`post` が null）のうち、z が `holdZ + arriveBand`（8m）以下のものが `min(arriveMax 11, ceil(歩く兵 × arriveShare 0.6))` 体以上になったとき。生きている兵が0人では確保しない（`refill` が次の波を出す）。確保のフレームで着いた兵の数 `arrived` を記録し、着いた兵に持ち場を割り当て（上の「確保した区画に陣取る」）、すぐに `counter` へ移って `counterLeft` をその区画の `counter` にし、`sectorSecured` と `sectorCounter` を出す（`secured` は通るだけの段階）。反撃（`counter`）の間は `counterEvery`（0.55秒）ごとに1体ずつ `sectorSpawn` を出す。`spawn`（矩形の並び。SB-2282）を持つ区画（`cband`・`gate`）は、i 番目（0から）の反撃を `zones[i % zones.length]` の矩形に割り当て、その矩形の奥行きの中央に、x は同じ矩形に当たる n 体で `minX`〜`maxX` を n 等分した中央に出す（`cband` は左右2つの矩形に2体ずつ、`gate` は2つに3体ずつ）。`spawn` の無い区画は、z が `landZ - counterBack`（12m 内陸）、x が `-counterSpread`〜`+counterSpread`（60m）に両端を含めて等間隔の点（`counter` が1なら x 0）。その点が地面の矩形 `rects` に `ENEMIES[counterKind].radius` 以内まで重なるなら、重からなくなるまで x を 2m ずつずらし（`spawn` の区画は矩形の x の範囲を出ない）、10回ずらしても重なるときは、`spawn` の区画は矩形の中の別の深さを同じように試し、それでも駄目なら最後に試した点に出す（反撃は必ず出る）。game.ts が `counter-<区画 id>-<n>` の敵を `newEnemy` で作り、`awake` にして `enemies` と区画の `counterIds` に足す。出し終わって `counterIds` の敵が全部 `hp <= 0` になったら `stable` にし、`arrived` が `weakArrived`（8体）未満なら弱い支配 `weak` を立てて `sectorStable` を出す。次の区画は手前が `stable` になってから判定する。`sectorHold` は最後に `advancing` 以上になった区画の `holdZ` を返し、どれも無ければ `startHoldZ`（160、波打ち際）。その z が、まだ爆破を覚えていない防御線（`map.blasts` の `line`。同じ線のどれか1点が `script.blasts` にあれば開いている）の `line + lineMargin`（6m）より内陸なら、その線の手前まで戻す。確保の判定は区画の `holdZ` で見るので、線を開けるまで待っている間は確保にならない。`sectorCleared` の無線 `m1.sector-cleared` のあと、待ち線が閉じた線に止められているときは `m1.sector-line-closed` で爆破を促す。`held` は `magazine` が `secured` 以上になるまで真（`pillboxes` を確保しても、最後の `magazine` まで待ち線は解けない）。`counter` が 0 の区画（`yard`・`plug`・`magazine`。台本の波が反撃の代わり）は、確保のフレームの次にすぐ `stable` になり、`sectorCounter` の無線 `m1.sector-counter` は出さない（`sectorSecured` と `sectorStable` は今までどおり出る）。`sectorCleared`・`sectorSecured`・`sectorCounter`・`sectorSpawn`・`sectorStable` は `game.events` の出来事になり、無線 `m1.sector-cleared`・`m1.sector-secured`・`m1.sector-counter`・`m1.sector-stable`（弱い支配は `m1.sector-weak`）を出す。`newGame` の `sectors: false`（広場）は区画を回さず、待ち線を `startHoldZ`・`held` を真のままにする。区画と湧き続けの配列が11になったので、中断セーブの `SUSPEND_VERSION` は 34（SB-2280）。`yard` は `trickleOnEntry` を持ち、`idle` の間は自機が `seaZ - enterDepth` より陸側に入るまで湧き続けを出さない（罠の前に中庭を敵で埋めない）。`test/integration/m1Run.test.ts` のボットは区画の仕組みを知らないので、区画・反撃・湧き続けを止めた `sectors: false` で流す（区画を通るボットは todo）
- 湧き続け（SB-2230）: 区画を確保するまで、その区画の奥から歩兵型の敵（`grunt`）を1体ずつ湧かせ続ける。状態は `GameModel.trickle`（次の敵までの秒 `t` と、区画ごとに出した数 `spent`。区画を回さない広場は null）で、定義は `TRICKLE_TUNE`・`TRICKLE_WAVE` in src/data/trickle.ts、判定は `src/logic/trickle.ts` の純粋な関数（`newTrickle`・`frontSector`・`stepTrickle`）。`game.ts` の `stepBattleLayer` が `stepSectors` のあとに `stepTrickle` を回し、返った場所に `newEnemy('trickle-<通し番号>', 'trickle', 'grunt', x, z)` を作って `awake` にし、`game.enemies` に足す。波の名前 `trickle` はミッションの波に無いので、台本の `cleared` は待たない
  - 戦線の区画は `frontSector` が `phase` の手前から最初の `idle` か `advancing` の区画とする（`secured`・`counter`・`stable` は戦線にしない）。全部が確保済みなら湧かせない。予算は戦線の区画の `budget` から引き、確保するとその区画の予算は使わなくなる（早く押して確保すれば、湧き切る前に止まる）
  - 湧く条件はすべて満たすとき: (1) `sectors` があり、カットシーン中でなく、`downed` でなく、クリア後でない（`game.ts` が `paused` にして渡す）、(2) 戦線の区画の `spent` が `budget` 未満、(3) 生きている歩兵型（`hp > 0`・`dormant` でない・`emplacement` と `warden` 以外。台本の敵も数える）が `maxAlive` 未満、(4) 戦線の区画が `idle` のときは、その区画（`landZ`〜`seaZ + seaMargin`）に `trickle` 以外の生きた敵か、`goalsStanding` で区画の `goals` が立っている（`pillboxes` はトーチカ、`gate` は機関砲、`yard` は旗 `yard-3-clear`、`plug` は `wardenDown`、`magazine` は主砲2門。残りが0になったら新しく湧かない。SB-2283。`advancing` のときはこの条件を外す）、(5) 次の敵までの秒 `t` が 0 以下。湧いたら `t` を `intervalMin`〜`intervalMax` の乱数にし、位置が見つからなければ予算を使わずに `retryT` 後へ回す
  - 湧く位置: 区画に `spawn`（矩形の並び）があれば、そのどれか1つを面積の比で選び、その中の x と z を一様に引く（乱数の順は矩形の選択、x、z。`spawnInZones` in src/logic/trickle.ts）。無ければ z は戦線の区画の `landZ` から `spawnBack`〜`spawnBack + spawnDepth` 内陸（`z = landZ - spawnBack - rand(0, spawnDepth)`）、x は `-spawnSpread`〜`+spawnSpread`（乱数の順は z、x）。条件は (a) 見下ろしのカメラの視野の外、(b) 自機から `minDist` 以上、(c) `game.rects` のどの矩形からも `ENEMIES.grunt.radius` より遠い、(d) マップの `bounds` の内側（`radius` ぶん内側）。最大 `tries` 回引き直し、見つからなければその回は湧かせない。乱数は `stream('trickle')`
  - 視野の外にする理由は、敵が画面の中で突然現れるのを避けるため。視野は `src/logic/viewGround.ts` の `viewGround(feet, QUARTER_TUNE, viewAspect, viewMargin)` が、`view/quarterCamera.ts` の `quarterPose`・`groundPoint` と同じ式（three を使わない）で、自機の足元の水平面に画面の四隅（ndc の (-1,1)・(1,1)・(1,-1)・(-1,-1)）を当てて四角形にする。四隅のどれかが地平線より上なら、その向きの `FAR_LIMIT`（400m）で打ち切る。`viewMargin` は四角形の各辺を外向きに広げる余白（カメラの遅れと地面の高さの差を受ける）。標準の縦横比 16/9・余白0で、自機を原点にした四隅は (-75.6, 8.4)・(8.4, -75.6)・(24.5, -7.9)・(-7.9, 24.5)（21/9 では (-88.7, 21.5)・(21.5, -88.7)・(29.6, -12.9)・(-12.9, 29.6)）。`insideQuad` が四角形の内側かを返す
  - 倒れた `trickle` の敵は、`EnemyState.fallenT`（倒れてからの秒）が `fallenKeep` たった所で `game.enemies` から取り除く（台本の敵は残す）。`checkWaves` の `cleared` はミッションに無い波を捨て、レーダーは生きている敵だけを出すので、取り除いても見え方は変わらない
- 区画の値（`SECTOR_TUNE`）: `startHoldZ` 160m（出撃時の待ち線）・`lineMargin` 6m（閉じた防御線の手前で待つ余白）・`enterDepth` 6m・`seaMargin` 10m・`arriveBand` 8m・`arriveShare` 0.6・`arriveMax` 11体・`surge` 12体（掃討で足す増援。`PAYOFF_TUNE.surgeAllies` と同じ値）・`refill` 12体（全滅したときの補充）・`counterEvery` 0.55秒（反撃の敵を1体ずつ出す間隔）・`counterBack` 12m（`spawn` の無い区画で、反撃の敵が区画の `landZ` から内陸へ出る距離）・`counterSpread` 60m（`spawn` の無い区画で、反撃の x の広がりの半分）・`weakArrived` 8体（これ未満の着いた兵で安定したら弱い支配）・`counterKind` `grunt`（反撃の敵の種類）・`postStayShare` 0.5（掃討で待ち線が動くとき、持ち場に残る歩兵の割合。SB-2262）。掃討の増援は、自機が先に進んでいれば海の縁ではなく自機の `allySpawnBehind`（60m）後ろに出る
- 歩兵の援護の値（`SUPPORT_TUNE` in src/data/sectors.ts。すべて仮）: `shooters` 12体（撃つ兵の上限）・`minFactor` 0.35・`maxFactor` 1.15・`factorPer` 12体（強さの係数 `f = clamp(着いた兵 / factorPer, minFactor, maxFactor)`）・`intervalMin` 1.1秒・`intervalMax` 1.7秒（1人あたりの撃つ間隔。`f` で割る）・`range` 57m（届く距離。スパイクの 240px を本家の縮尺に直した値）・`damageBase` 0.07・`damagePer` 0.17（1発のダメージを的の最大体力に対する割合で `damageBase + damagePer × f`。スパイクの `(2 + 5f) / 30` と同じ）・`suppressSec` 2.6秒（制圧の残り）・`suppressFire` 2.5（制圧中の射撃の間隔の倍率）・`suppressMove` 0.55（制圧中の動く速さの倍率）
- 湧き続けの値（`TRICKLE_TUNE` in src/data/trickle.ts。すべて仮）: `kind` `grunt`・`intervalMin` 1.1秒・`intervalMax` 1.9秒（次の敵までの間隔。スパイクの値）・`maxAlive` 11体（生きている歩兵型の上限。台本の敵も数える。スパイクの上限）・`minDist` 40m（自機からこれ以上離して出す。スパイクの 170px を 0.2375m/px で読み替えた値）・`spawnBack` 12m・`spawnDepth` 60m・`spawnSpread` 60m（湧く帯）・`tries` 8回・`retryT` 0.5秒（位置が見つからないときの待ち）・`viewAspect` 16/9（視野の四角形を出す縦横比）・`viewMargin` 8m（視野の外の余白）・`fallenKeep` 10秒（倒れた敵を並びに残す秒）。区画ごとの湧き位置 `M1_SECTORS[].spawn`（SB-2282。すべて仮）は、`cband` の左右の開けた地面 x -96〜-40・40〜96・z -64〜-45、`gate` の同じ左右 x -96〜-40・40〜96・z -64〜-56、`yard` の中庭の内側 x -26〜26・z -120〜-76。ほかの区画（`beach`・`line1`・`line2`・`pillboxes`・`plug`・`field1`・`field2`・`magazine`）は既定の帯（`spawnBack`・`spawnDepth`・`spawnSpread`）を使う（`plug` は予算0で湧かない）。区画ごとの予算 `M1_SECTORS[].budget` は `beach` 8・`line1` 12・`line2` 16・`pillboxes` 20・`cband` 14・`gate` 12・`yard` 6・`plug` 0・`field1` 18・`field2` 20・`magazine` 12（合計 138体。反撃の 45体とは別）
- 本体では `newGame` が `newBattle(stream('crowd'), map.bounds, battleTune, SECTOR_TUNE.startHoldZ, map.spawns[M1_NEST_WAVE] ?? [])` で作り、`step` の `stepBattleLayer` が `stepSectors` を回して掃討・確保・反撃・安定の出来事を残し、反撃の敵を出し、`Crowd.holdZ` を `sectorHold` の値へ動かし、掃討で `SECTOR_TUNE.surge` 体の波を `spawnCrowd` で足す。`buildPlayView` は `game.battle` を `buildBattle` に渡し、`drawPlay` は `view.battle.draw(dt, game.mech, sectorHold(game.sectors).held, game.events)` で描くだけ。旗の名前は `PILLBOXES_DOWN_FLAG` in src/data/missions/m1.ts（`PILLBOXES_FLAG` と同じ）
- 描くのは `view/battle/`。砲撃の閃光と破片は `shellBurst` in src/view/hazards.ts（機体を狙う迫撃砲の着弾予告とは別で、予告の輪も機体への当たりも無い）。煙・曳光弾・飛行機・砲弾穴の乱数も同じ列から引く
- 乱数は本体では `stream('crowd')`（歩兵ドロイドの波・砲撃の予定）と `stream('battle')`（煙・曳光弾・飛行機）と `stream('craters')`（穴）。`#view-fx` は自分で状態を持つので、歩兵ドロイドも見た目も `stream('battle')` から引く
- 本体の状態は `GameModel` が持ち、出撃・やり直し・復帰のたびに `newGame`・`retryFromCheckpoint`・`restoreSuspend` が作る。`buildPlayView` はその `game.battle` を渡して描くだけで、状態を持たない。区画 `sectors` はチェックポイント・中断に入り、復帰のときは `sectorHold` の待ち線で歩兵ドロイドを作り直す。logic の `battle.ts` に出したのは、進行をページなしでテストするため
- 砲撃の揺れは本体のカメラの揺れ `FeelState.shake` に足す。戦場の層（歩兵ドロイド・分隊・着弾・煙・飛行機）の時計を止めるかは `CutsceneDef` の `holdsBattle` で決め、今は導入（`landing`）だけが持つ。止めている間は揺れも足さない。操作を渡した瞬間から進め、最初の分隊が走って機銃座の手前で倒れるのをプレイヤーが見られるようにする。カットシーン自身の機銃の曳光だけは `Battle.drawTracersOnly` で動かす（`drawPlay`）
- 描く回数: 本体の出撃（導入のカットシーンを飛ばした 90 フレーム後）は 103 calls・280k tris、`#view-fx` の段階 2（40 フレーム後）は 103 calls・463k tris（headless Chromium。`test/e2e/battle.test.ts`・`test/e2e/fxView.test.ts` が出力する。SB-2085 の実測）。歩兵ドロイドは近い形 3,948 三角形（体 3,360・頭 588）・4 draws、遠い形 820 三角形（体 688・頭 132）・4 draws（SB-2087 で頭と色分けを作り直し、首を詰めた後の値）。カメラから `DROID_TUNE.nearDistance`（38m）以内の兵は近い形、残りは遠い形で、近い形は `nearCap`（48体）まで。同じ兵を両方の形で描かない。本体の calls が揺れるのは、地面の塊などの視錐台カリング（`cullChunks`）のため

### 節目（突破の手応え）

SB-2010・SB-2020。M1 の節目は3つで、線1の爆破（`line1-open`）、線2の爆破（`line2-open`）、トーチカ2基目が落ちた瞬間（cp1）。トーチカ1基目にも小さめの決めを入れる。決めは「大きな爆発・一瞬の溜め・低い重い音・短い見出し」で、そのあとの数秒に「敵が下がる・味方がなだれ込む・砲撃が弱まる・前線が動く」を置く。値はどれも仮。定義は `PAYOFFS`・`PAYOFF_TUNE` in src/data/payoff.ts、`FRONT_TUNE` in src/data/front.ts、歩兵の待ち線の区画 `SECTOR_TUNE`・`M1_SECTORS` in src/data/sectors.ts、`PILLBOX_BREAK` in src/data/pillbox.ts、爆発の `bunkerSmall`・`bunker`・`breach` in src/data/boom.ts、音の `explosionHeavy` in src/data/sounds.ts。

- 契機: 台本の cue が `payoff` の動きを出す。`line1-open` は `breach`（旗 `line1-open`）、`line2-open` は `breach2`（旗 `line2-open`）、`pillbox1`（`destroyed` の `count: 1`）は `bunker1`、`cp1` は `bunker`（旗 `pillboxes-down`）。`payoff` は `logic/script.ts` が検証して出来事にし、`logic/game.ts` の `applyPayoff` が溜め・砲撃の凪・敵の後退を当て、`payoff` の出来事（場所は線を開けた爆発か落ちた目標の中心）を残す

| 名前（`PAYOFF_TUNE`） | 値 | 単位・意味 |
|------|----|------------|
| `slowSec` / `slowScale` | 0.25 / 0.3 | s と割合。線1と2基目の溜めの長さ（実際の秒）と、その間の時間の進み |
| `firstSlowSec` / `firstSlowScale` | 0.12 / 0.5 | s と割合。1基目の小さい溜め |
| `calmSec` / `calmMul` | 4 / 2 | s と倍。敵の迫撃砲の間隔をこの秒の間その倍率にする |
| `headlineSec` | 1.3 | s。短い見出しを出す長さ |
| `cheerDelay` | 1 | s。爆発のあと、味方の歓声を無線の帯に出すまで待つ長さ |
| `holdDelay` | 4 | s。爆発のあと、線2の「迎撃が来る。障害物の手前で片付けてから進め」（`m1.line2-hold`）を出すまで待つ長さ。歓声が帯に出る1秒＋最低3秒（`RADIO_TUNE.minSec`）のあと（SB-2025） |
| `retreatSpeed` | 1.35 | 倍。下がる敵の速さ（歩く速さに掛ける） |
| `retreatHold` | 3 | s。次の遮蔽に着いてから留まる長さ |
| `retreatArrive` | 1.5 | m。遮蔽に着いたと見る距離 |
| `surgeAllies` | 12 | 体。節目で戦場の層に一度足す歩兵ドロイド |

- 溜め: `applyPayoff` が `game.slow`（残りの実際の秒 `left` と時間の割合 `scale`）を置く。`step` はそのフレームの世界の時間を `dt * scale` にし、`left` は実際の `dt` で減らすので、0.25 秒たつと必ず戻る。入力は止めない（機体も撃もその割合で進む）。`timeScale` を `src/app/play.ts` の `update` が描画の `dt` にも掛けるので、爆発・煙・戦場の層も同じ割合でゆっくり動く。チェックポイントと中断は `slow` をそのまま持ち、`SUSPEND_VERSION` は 16
- 砲撃の凪: `game.calm`（残り秒 `left` と間隔の倍率 `mul`）を置き、`stepHazards` が敵の迫撃砲（`barrage.kind === 'mortar'` と狙う迫撃砲）だけ間隔を `mul` 倍にする。砲台の副砲は弱めない
- 爆発と崩れ: 線1の爆破は `breach`、2基目のトーチカは `bunker`、1基目は `bunkerSmall` の爆発にする（`drawPlay`）。`bunker` は破片と煙の柱が多く、揺れも大きい。`PILLBOX_BREAK` は 1.6 秒で沈み、2.3m 沈んで 0.36rad 傾く（強く・速く）。揺れは `boomShakeAt` が距離で弱める
- 音: `payoff` の出来事が `explosionHeavy`（低く長い爆発）を鳴らす。`m1.line1-cheer`（「線が開いた！続け！」）・`m1.line2-cheer`（「第二線も開いた！押し上げろ！」）と `m1.pillboxes-down`（「トーチカ沈黙！押し上げろ！」）は言語ファイルの無線で、`radio` の `delay` に `PAYOFF_TUNE.cheerDelay` を渡す。`queueRadio` がその秒まで帯に出さず、前の行が残っていればそのあとに出る
- 短い見出し: `HudModel.headline` が `m1.breach`・`m1.breach2`・`m1.bunker-down` を `PAYOFF_TUNE.headlineSec` の間だけ返し、`src/view/hud.ts` が画面の上の方に出す。時刻は台本の `fired` から読むので、チェックポイントで戻っても同じように出る
- 前線: `frontOf` が旗から `beach`・`line1`・`line2`・`pillboxes` のどれかを返す（`FRONT_TUNE` の z と `FRONT_HOLD` の待ち線）。旗はチェックポイント・中断に入るので、前線も戻る。HUD はレーダーに破線で描く。歩兵の待ち線は戦線の区画で決まり（6章「戦場の層」）、この旗の前線とは別に動く
- 戦場の層: 歩兵の待ち線は区画で決まり（6章「戦場の層」）、`beach`（z 132）→ `line1`（z 80）→ `line2`（z 30）→ `pillboxes`（z -6）。区画の待ち線がまだ開いていない防御線より内陸なら、歩兵はその線の `lineMargin` 6m 海側で待ち、爆破で開くと区画の線まで流れ込む。区画を掃討したフレームに `stepBattleLayer` が `Crowd.holdZ` をその区画の値へ動かし、海側から `SECTOR_TUNE.surge` 体の波を一度足す。待ち線に歩兵が着いて確保すると反撃（`counter` 体。`SECTOR_TUNE.counterEvery` ごと）が出て、全部倒れると安定（`stable`。着いた兵が `weakArrived` に満たなければ弱い支配 `weak`）になり、安定するまで次の区画は判定しない。区画と湧き続けは、カットシーンの間・`downed`・クリア後は進めない（反撃も湧きも無線も出ない）。`pillboxes` を確保すると `held` が偽になり、歩兵ドロイドは奥へ歩く。`newGame`・`retryFromCheckpoint`・`restoreSuspend` は `sectorHold` の待ち線で戦場の層を作るので、チェックポイント・中断から戻っても歩兵ドロイドは取り直した区画の線から進む。待ち線で待つだけでは減らず、倒れるのは実際の砲撃・地雷・爆発に巻き込まれたときだけ（SB-2262。`BATTLE_TUNE` の `holdLossRate`・`holdLossRamp`・`holdLossMax` は 0）。確保した区画では着いた兵が遮蔽物の陸側へ散って陣取り、次の区画へ進むときは `SECTOR_TUNE.postStayShare`（0.5）が残って地面を味方の場所に見せる
- 敵: `applyPayoff` が、その線より海側（`fallback.lineZ` より +z）にいる生きている歩く敵（`static` でない敵）に、いちばん近い次の遮蔽の点 `EnemyState.fallback` と `fallbackHold` を置く。`stepEnemy` は着くまで mech に背を向けて走り、撃たず、着いたら向きを戻して `fallbackHold` の間そこに留まって撃つ。機銃座は固定なので下がらず、壊れていなければ撃ち続ける。線1は線2の後ろ（z 58）へ、線2はトーチカ線の後ろ（z -22）へ、cp1 もトーチカ線の後ろへ下がる
- 守備の崩れ（SB-2015）: 持ち場の敵（6章「敵」の `post`）は `routeDefenders` が動かす。線1の爆破で `line1` の5体が、線2の爆破で `line2` の5体（線1から来て線2の後ろに着いた5体）が、cp1 で `pillbox` の5体が一斉に `post.next` へ走る。トーチカ1基目だけはその周り（`firstRout` の2体）だけが走る。走る間は撃たず、着いた持ち場で隠れる/身を出すをやり直す。`PAYOFF_TUNE.retreatSpeed`・`retreatArrive` は歩く敵と共通。値の表は `DEFENDER_TUNE` in `src/data/defenders.ts`、調整は `#view-pillbox`・`#view-map` のパネル
- 流れ: 線1の爆破では、線1の向こうの持ち場の5体が一斉に線2の後ろへ走るので、下がる敵が画面に残る（SB-2015）。線1の先は機銃座（線2の海側）が撃ち、機体が B に入ると `b-squad` が起きて近づくので、押し進む間の撃ち合いは途切れない。線2の手前では味方機の援護射撃が機銃座を一時黙らせる（8章）。線2の爆破でも、その後ろの5体がトーチカ線の後ろへ走る。cp1 では、B の持ち場の5体（と線1・線2から来た10体）がトーチカ線の後ろへ下がる。持ち場の敵は幅 200m に散っているので、一度に見えるのは数体だけ
- テスト: `test/integration/payoff.test.ts`（前線・敵の後退・味方の前進・溜めが戻る・砲撃の凪・チェックポイントと中断・線2の前線）と `test/integration/defenders.test.ts`（持ち場から動かない・線1と線2で一斉に走る・1基目は周りだけ・着いたら次の持ち場・チェックポイントと中断）。`test/integration/rhythm.test.ts` は線2の近い点・遠い点の射線と、援護射撃の窓を見る。`test/integration/m1.test.ts` は cue の並びに `payoff` と守備の `spawn` を足す

### 台本の味方の機体

台本の `ally` が出す、機体の隣を走る味方。5機いて、区画ごとの遮蔽の後ろで止まって撃ち、2機が台本どおりに倒れる。当たり判定は無い。定義場所は `AllyState`・`newAlly`・`moveAlly`・`stepAlly`・`nearestIndex` in src/logic/allies.ts、`ALLY_TUNE`・`ALLY_FATES`・`ALLY_KITS`・`ALLY_FIRE_TUNE` in src/data/allies.ts、`PROTO_KITS`（`allySniper`・`allyScout`）・`PROTO_PALETTES` in src/data/mechProto.ts・src/data/colors.ts、`buildAllyMech`・`drawAllies`・`drawEnemyTracers` in src/view/allies.ts、`stepAllies`・`spawnAlly`・`moveAllyTo`・`stepAllyFire` in src/logic/game.ts、`stepAllyFire` in src/logic/allyFire.ts、`groundAt` in src/logic/collide.ts。

- M1 では5機が出る。出撃の最初（`intro` cue）から、`buddy`・`cover-b1`・`cover-b2`・`cover-b3`・`gunner` はプレイヤーの艇の両隣の艇（x −12 と 12、自分の艇と同じ z 175〜187）の甲板に乗っている（左舷に `buddy`・`cover-b1`・`cover-b2` を 1.3m 間隔で、右舷に `cover-b3`・`gunner` を同じ間隔で。割り当ては仮）。導入のカットシーンの間は甲板で待ち、操作を渡したフレームから、それぞれの艇のランプを降りて今の道に入る（`ashore` は待たない。SB-1967）。`buddy` は浜を走って迫撃砲に倒れ、3機と `gunner` は線1の海側の遮蔽（z 156 と `gunner-wait` (47,154)）で待つ。線1の爆破点（l1-a か l1-b）が爆破されると、台本の `line1-open`（trigger `blast`）が4機に `allyMove` を出し、**プレイヤーが最初に爆破した点の穴**を通る。覆いの3機は B の遮蔽の後ろ（z 110〜129）まで走って止まり、そこから撃ち続ける。`gunner` は開いた穴を抜けて B の手前（`b-mid` (45,112)）で機銃に倒れる（`pillboxes` の cue は gunner を出さない）。線2の爆破点が爆破されると（`line2-open`）、3機は線2の最初の穴を通ってトーチカ線の手前の投稿（z 0〜9）へ走る（SB-2044。それまでは `cp1` まで B の遮蔽で待ち、機体が 100m 先へ行っていた）。`cp1`（トーチカ2基が壊れた）で C の前の投稿（`c-front-1`〜`3`。機体の通り道 x 35 の抜けの先、z −54〜−60 の海側の門の手前）へ、`fortress-gun` が倒れて海側の門のシャッターが巻き上がる `gate-open` で中庭（x 0, z −95）へ（`yard-run-1`〜`3`）、`allyMove` で道を替えて走る。中庭の波が全部倒れて中ボスが出る `yard-clear` で、3機は中庭の真ん中（`yard-front-1`〜`3`、z −102〜−106）へ進み、`fortress-down`（陸側の壁の爆発）の後は壊れた陸側の門を抜けて砲台の手前の野原（`field-run-1`〜`3`、z −192〜−201）へ走る。同じ線の2つ目の点も仕掛けられ、穴が2つになるだけで、通る道は最初の穴のまま。道の選択は `HolePaths`（`lines` の各線で、`ScriptState.blasts` の順で最初に爆破された点が `paths` の key を決める）で、爆破済みの印はチェックポイント・中断にも残る。未爆破の線は `wayPath` が先頭の id で埋めるが、これは dev とテストのための逃げ道で、本編の cue はどれもその線の爆破後にしか出ない。座標は仮
- 出る所: `ally` の出来事で `spawnAlly` が `GameModel.allies` に足す。道は `mission.paths[path]`、`fate.at` の座標は `mission.places[at]`。`AllyState` は道の点と場所の座標を自分で持つ（チェックポイントのコピーだけで立つため）。名前が無ければ例外。`validateMission` も `paths`・`places`・`ALLY_FATES` の名前を確かめる
- 道を替える: `allyMove` の出来事で `moveAllyTo` が、その id の味方機に `moveAlly(ally, way)` を呼ぶ。倒れている味方機は動かさず、道が空なら例外。道はコピーし、`next` を 1 にして、今いる位置から新しい道の2点目へ向ける。新しい道の1点目は、前の投稿と同じ座標にする（テストで確かめる）。出ていない id なら何もしない（同じ cue の `ally` が先に来る順を守る）
- 走り方: `stepAlly` が `ALLY_TUNE.speed` で道の点を順に通る。運命の無い味方機が機体より海側へ `catchGap` 以上遅れると、`catchUp` が `speed` に1から `catchMul` までの倍率を掛け、機体に追い付くまで急がせる（機体の前や横にいるときは1。`stepAllies` が `game.mech` を渡す。SB-2044）。道の終わりに着いたら止まるが、撃つのは続ける。向き `yaw` は進む向き（0 が -z）
- 足元の高さ: `stepAllies` が毎フレーム `groundAt(x, z, ALLY_TUNE.groundRadius, game.rects, ALLY_TUNE.maxGround)` で足元の面を取り、上がるときはその高さにし、下がるときは `ALLY_TUNE.fallSpeed` ずつ下げて面で止める。M1 の道は坂も階段も通らず、味方機の足元は 0 のまま（坂や階段の上を通る道を引いたときだけ高さが変わる）
- 落ち方: `fate` の場所から `ALLY_TUNE.arrive` 以内に入った1フレームで落ち（`down`）、`stepAllies` が出来事 `allyDown`（`by` は `mortar` か `gun`）を1回出す。`fate.call` があれば、倒れる場所まで `ALLY_TUNE.callLead × ALLY_TUNE.speed`（m）より近づいたフレームで `called` を立て、`queueRadio` と出来事 `allyCall`（`id`・`line`）で1回だけ叫ぶ。同じフレームでも `allyCall` が `allyDown` より先に並ぶ。落ちたあとは動かず、出来事も出ない。当たり判定が無いので、機体も弾もすり抜け、ダメージも与えない
- カットシーンの間は `stepAllies` が動かさない（足元の高さだけは合わせる）。味方は `intro` から甲板にいて、導入（`landing`）が終わって操作を渡したフレームから、ランプを降りて道を走り出す（`script.ashore` は待たない。プレイヤーの機体は自分の手で降りる）。導入の間も5機は両隣の艇の甲板に描かれ、撃たない（`drawAllies` は `landing` の間だけ `shown` にし、撃つ所で止める。艇が浜へ進む間は艇と一緒に動かす）。ほかのカットシーンでは描かない
- 見た目: `buildAllyMech` が、味方の型のキット（`ALLY_KITS` の `sniper`・`scout` を `allySniper`・`allyScout` に当てたもの）を `buildProtoMech(ALLY_TUNE.height, ...)`（3.4m。機体は 4m）で作り、味方の印は肩の帯と番号の `PROTO_MARK_COLOR` で表す。材質ごとに1回なので1体4ドロー（機体と同じ4材質）。落ちたら同じ形を `allyWreck` のパレットで作ったものを `wreckTilt` 倒して置く（走る姿と残骸で8ドロー）。メッシュの名前は `ally`（機体の `mech-proto` と数え分ける）。走る姿と残骸の `userData.allyId` に味方機の id を入れる（e2e が5機の中の1機を探せるように）
- 撃つ弾（SB-2301）: 立っている味方機（`down` でない）は、`stepAllyFire` in src/logic/allyFire.ts が kit ごとの間隔で、kit の射程内の一番近い敵を撃つ。狙わないものは歩兵の援護射撃と同じで、`nearestFoe` in src/logic/support.ts を使い回す（死んだ敵・起きていない敵・`dormant`・中ボス `warden`・隠れている守り兵。射線は見ない）。1発は `ENEMIES[kind].hp × share`（sniper 0.35・scout 0.08）を `damageEnemy` で取り、倒れたら `enemyDown`、生きていれば `SUPPORT_TUNE.suppressSec` 2.6秒の制圧を置く。撃つ待ち `AllyState.fireT` は味方機ごとに `stream('allyFire')` の乱数で kit の間隔の中から始め、長いフレームでは来た分を全部撃つ。カットシーン中・`downed`・`cleared` は撃たない。出来事 `allyFire`（`id`・`kit`・`from`・`to`）を、同じフレームのダメージより先に出す
- 見た目: 撃った弾は出来事 `allyFire` で `drawPlay` が `Battle.tracer` で描く（`from` は味方機の `fireHeight`、`to` は敵の胸。速さは `ALLY_FIRE_TUNE` の `tracerSpeed`。sniper は `tracerLines` 2本を `tracerGap` だけ横にずらして太く見せ、scout は1本）。`drawAllies` は敵がいないときだけ、今までどおり `ALLY_TUNE.fireEvery` で向きの前へ曳光を出す（当たり無し）。敵がいる間は体を敵へ向けるだけで、撃つ見た目は出来事に任せる。敵から味方機へ返す曳光（`enemyTracerEvery`）はそのまま。音は `src/view/sound.ts` が `supportFire` の音を `allyFire` でも鳴らす
- 敵の曳光: 起きている（`awake`）生きている敵が、`enemyTracerRange` 以内の一番近い味方機へ、`enemyTracerEvery` ごとに1本、`enemyTracerSpreadDeg` の散らしで曳光を出す（敵の胸から味方機の胸 `fireHeight`）。当たりは無く、見た目だけ。敵の実弾（`EnemyBullet`）とは別の間隔で見せる（敵が撃てない時にも出る）。味方機がいなければ撃たずに次の間隔へ。乱数は `stream('allyFx')`
- 敵の曳光: 起きている（`awake`）生きている敵が、`enemyTracerRange` 以内の一番近い味方機へ、`enemyTracerEvery` ごとに1本、`enemyTracerSpreadDeg` の散らしで曳光を出す（敵の胸から味方機の胸 `fireHeight`）。当たりは無く、見た目だけ。敵の実弾（`EnemyBullet`）とは別の間隔で見せる（敵が撃てない時にも出る）。味方機がいなければ撃たずに次の間隔へ。乱数は `stream('allyFx')`
- 落ちたときの見た目: `allyDown` を `drawPlay` が受けて、`by` が `mortar` なら `shellBurst`（戦場の砲撃と同じ閃光と破片）と砂煙（`BLAST_DUST`）、`by` が `gun` なら砂煙（`HIT_DUST`）だけをその場に出す。どれも味方の足元の面の高さ（`blastFaceHeight`）に出す。機銃で倒れた機体を迫撃砲の着弾に見せない。着弾予告の輪は出さない

| 名前（`ALLY_TUNE`） | 値 | 単位・意味 |
|------|----|------------|
| `speed` | 9 | m/s。走る速さ |
| `catchGap` | 40 | m。運命の無い味方機が、機体の後ろ（海側）にこれより離れたら急ぎ出す（SB-2044） |
| `catchRamp` | 20 | m。`catchGap` からこれだけ離れると、急ぐ倍率が `catchMul` に届く（その間は直線で上がる） |
| `catchMul` | 2 | 倍。急ぐときの `speed` の倍率の上限。運命のある味方機（`buddy`・`gunner`）は急がない（叫ぶ位置を `callLead × speed` で決めているため） |
| `arrive` | 1.5 | m。場所にこの近さまで来たら着いたとする |
| `height` | 3.4 | m。味方の機体の高さ |
| `fireEvery` | 0.35 | s。敵がいないときに前へ出す曳光弾の間隔（敵への弾は `ALLY_FIRE_TUNE`） |
| `fireHeight` | 2.2 | m。曳光弾が出る高さ（足元から） |
| `fireAhead` | 1.6 | m。曳光弾が出る足元からの前への距離 |
| `tracerSpeed` | 80 | m/s。敵がいないときに前へ出す曳光と、敵から味方機へ返す曳光の速さ（敵への弾は `ALLY_FIRE_TUNE`） |
| `tracerSpread` | 6 | m/s。敵がいないときに曳光弾の速さへ足す横と上への散らし |
| `engageRange` | 70 | m。開発ビューが撃つ敵を探す距離（本体の体の向きと、前へ撃つ見た目を出すかの判断は kit の `range` を使う） |
| `aimSpreadDeg` | 1.5 | deg。今は使わない（敵への照準は出来事 `allyFire` が持つ。SB-2301） |
| `enemyTracerEvery` | 2.5 | s。1機の敵が味方機へ見せる曳光弾の間隔 |
| `enemyTracerRange` | 80 | m。敵が味方機へ曳光弾を向ける距離 |
| `enemyTracerSpreadDeg` | 2 | deg。敵から味方機への曳光弾の散らし |
| `wreckTilt` | 1.35 | rad。残骸が倒れる角度 |
| `callLead` | 4 | s。倒れる場所までこの秒数ぶんの距離（`speed` を掛けた m）より近づいたら無線で叫ぶ |
| `groundRadius` | 0.5 | m。`groundAt` に渡す足元の半径 |
| `maxGround` | 6.5 | m。味方機が上がれる高さの上限（防波堤の 6m を含む） |
| `fallSpeed` | 20 | m/s。高い所から低い所へ移るときに落ちる速さ |

味方機の撃つ弾の値（`ALLY_FIRE_TUNE` in src/data/allies.ts。すべて仮）:

| 名前 | sniper | scout | 単位・意味 |
|------|--------|-------|------------|
| `range` | 85 | 55 | m。1発の届く距離 |
| `every` | 2.4 | 0.8 | s。1発から次までの間隔 |
| `share` | 0.35 | 0.08 | 1発が取る、的の最大体力に対する割合 |
| `tracerSpeed` | 150 | 80 | m/s。曳光の速さ |
| `tracerLines` | 2 | 1 | 本。1発を何本の平行な曳光で描くか（2本で太く見せる） |
| `tracerGap` | 0.14 | 0 | m。平行な曳光どうしの間隔 |

### 中庭の囲まれと援護

SB-1840。要塞の中庭（z −122..−74）に入ると、三方の扉から量産機が出て機体を囲む。生き残った味方機 `cover-b1`〜`cover-b3` は海側の門の内側へ移り、台本の `assist` が決まった秒ごとに1機ずつ敵を倒す。当たり判定は無く、機体の当たり・体力・敵の狙いは変えない（D-19 と段階4の3はそのまま）。定義は `YARD_TUNE` in src/data/fortress.ts、`AssistState`・`newAssist`・`stepAssist` in src/logic/assist.ts、`stepAssist`・出来事 `assistFire` in src/logic/game.ts、曳光と砂煙は `drawPlay` in src/view/play.ts。

- 波: `fortress-yard` の cue が `yard-1`（左右の扉と中庭の真ん中から3）を出し、`YARD_TUNE.waveGapSec`（6秒）後に `yard-drop` が `yard-2`（中庭の奥から2）、`cleared yard-1` の `yard-gate` が `yard-3`（海側の門の脇から2）を出す。場所は `m1b-hand.ts` の `spawns`、種類は `M1_WAVE_ENEMY`。`yard-2` は壁の上からではなく中庭の奥の地面から出る（L1 に通路は無い）。落ちてくる途中（`y > 0`）の敵は `assist` が選ばない
- 旗: `cleared yard-1/2/3` で `yard-1-clear`・`yard-2-clear`・`yard-3-clear` を立て、`flag yard-3-clear` に `when` で3つを付けた `yard-clear` が `radio m1.yard-clear` を出す。L6 はこの cue に中ボスを足す
- `assist`: `{ kind: 'assist', waves }` の action と `ScriptOut`。台本は狙う波だけを持ち、撃つ間隔と状態はゲームが持つ（`GameModel.assist`）。`applyScriptOut` が状態を置き、ゲームの `stepAssist` が `YARD_TUNE.gate`（海側の門の上）から、指定した波の `hp > 0` かつ `y <= 0` の敵のうち一番近いものを、`assistEvery`（12秒。`depot-down` が立っていれば `assistEveryDepot` 8秒）ごとに1機選ぶ。当たり判定は無く、その敵の `hp` を0にするだけ。同じフレームに `assistFire`（曳光）の出来事を先に、`enemyDown` を後に出す。チェックポイント・中断に `assist` と `left` が入る
- 味方機: 新しい機体は出さない。`fortress-yard` の cue の `allyMove` が3機を `yard-cover`（門の内側、z −76〜−75）へ移す。集積所を壊しても通り過ぎても、3機とも生きている（SB-2046）。倒れている味方機への `allyMove` は何もしない
- 見た目: `assistFire` で `Battle.tracer` の1本を門の上（高さ `gateY`）から敵へ、倒れた所に砂煙（`assistDust` 倍）を出す。`MAX_TRACERS` を超える分は描かない。音は `enemyGun`

| 名前（`YARD_TUNE`） | 値 | 単位・意味 |
|------|----|------------|
| `gate` | (0, −68) | m。援護の曳光が出る所（海側の門の上） |
| `gateY` | 3 | m。その高さ |
| `assistEvery` | 12 | s。寄らなかったときの1機から次まで |
| `assistEveryDepot` | 8 | s。弾薬庫を壊したときの間隔 |
| `assistTracerSpeed` | 80 | m/s。曳光の速さ |
| `assistDust` | 1 | 倒れた敵の砂煙の倍率 |
| `waveGapSec` | 6 | s。`yard-1` から `yard-2` まで |

### ボス（沿岸砲台）

SB-200。M1 の要塞の先（z −235〜−250）にある砲台。主砲2門が海の上の味方の艇を撃っていて、機体には副砲（着弾予告つきの砲撃）と機銃で応じる。主砲を2門とも壊すと装甲のシャッターが開いて弾薬庫が見え、そこが弱点で、壊すと出撃が終わる。寄り道の弾薬集積所（`depot`）を壊していると、副砲の砲撃が間遠になる。値はどれも仮。定義は `src/data/battery.ts` と `src/data/hazards.ts`、動きは `src/logic/battery.ts` と `src/logic/game.ts`（`stepBattery`・`checkShutters`・`stepHazards`・`flyBullet`）、見た目は `src/view/world.ts` と `src/view/seaFire.ts`。

- シャッター（表 `M1_SHUTTERS`: `ShutterDef` の一覧。`target`・`opensWhen`・省略できる `opensOnFlag`・板の大きさ `w`×`h`×`d`・`gap`。2つ目は要塞の機関砲の板で、旗で開く。「要塞の機関砲」の「起動の前のシャッター」）
  - 守られる目標と、開くきっかけの目標は表で決める。M1 は `magazine` を、`main-gun-1`・`main-gun-2` が両方壊れると開く。守られる目標が地図に無ければシャッターも作らない（`newShutters`）
  - 閉じている間: 機体の弾は弾薬庫の箱で止まり、出来事 `hit`（`target` は弾薬庫の id）を出すが、体力は減らず `destroyed` も出ない（`shuttered`）。弾の止まる順は変わらない
  - 開く: きっかけの目標が全部壊れると `game.shutters` の `open` が true になり、出来事 `shutterOpen`（`target`）を1回だけ出す（`openShutters`）。弾が主砲を壊したフレームで（`destroyed` の直後に）開き、そのあとの弾は弾薬庫に当たる。毎フレームの `checkShutters` が、体力を別の道で 0 にした場合も拾う。台本の印 `shutter-open` と目標 `hit-magazine` は台本の cue が出す
  - 見た目: 弾薬庫の前（海側の面から `gap` 離れた所）の板を `THREE.Mesh`（名前 `sb-shutter-<target>`、色 `SHUTTER_COLOR`）で描く。`buildWorld` が `targetGroup` に足し、`syncWorld` が開いたものを隠す。当たりには関わらない（弾が止まるのは弾薬庫の箱）
- 副砲の砲撃（`BARRAGES.battery`）
  - 台本の波 `battery` が出ると始まる（`M1_WAVE_BARRAGE`）。届くのは機体が要塞の先の野（z ≤ −135）にいるとき。要塞の中庭や浜では撃たれない
  - 間隔・予告・半径・威力・ずらしは表のとおり。台本の印 `depot-down`（集積所を壊した）が立っている間は、間隔が `slow.mul` = 1.5 倍になる（`wait` を `dt / 1.5` ずつ数えるため、立った瞬間から効く）。乱数の列は `stream('mortar')`
  - 主砲が倒れたあとも続く
- 機銃（`GUN_TUNE`。`BatteryState.guns` に `kind` が `gun` の目標ごとの `GunState`（`id`・`wait`）を持つ）
  - 動き出す: 台本の波 `BATTERY_WAVE`（`battery`）が出ると `BatteryState.on` が true になる（`applyScriptOut`）。それまでは撃たない
  - 撃つ（`stepGun`）: 壊れていない主砲が、`wait` を `dt` ずつ減らし、0 になったとき、箱の中心から機体の足元までの水平距離が `range` 以内で、射線が物と、ほかの壊れていない目標に遮られないなら、1発撃って `wait` を `interval` に戻す。弾は主砲の箱の海側の面から `muzzleGap` 先の、箱の高さの `muzzle` 倍の所から、機体の胸へ向け、`spread` 度の範囲で散らして出る。最初の1発は動き出してから `interval` 後。乱数の列は `stream('battery')`
  - 弾: 型 `BatteryBullet`（`gun` に主砲の id）。速さ `bulletSpeed`、威力 `damage`、飛ぶ距離 `range`。扱いは敵の弾と同じ（機体・物・壊れていない目標・地面で止まり、機体に当たると装甲が減って `damaged` を出す）
- 主砲が海を撃つ見た目（`src/view/seaFire.ts`。当たりなし。ゲームの時計 `game.time` から決める）
  - 壊れていない主砲ごとに、`SEA_FIRE_PERIOD` ごとに箱の海側の面の砲口で閃光（`SEA_FLASH_COLOR`）を `FLASH_TIME` 出し、海の方（+z）へ曳光の線（`SEA_TRACER_COLOR`）を `TRACER_TIME` 走らせる。2門目の拍は `SEA_FIRE_OFFSET` ずらす。倒れた主砲は何も出さない。1門目が倒れて無線 `m1.gun1-down` が出ると、海を撃つのが片方止まる
  - 閃光の `Mesh`（名前 `sb-sea-flash`）と線の `Line`（名前 `sb-sea-tracer`）を主砲ごとに1つずつ作り、`buildSeaFire` が組み、`removeSeaFire` が片付ける（`clearPlay` から）
- チェックポイント: `shutters` と `battery` はコピーに入る（「本体のチェックポイントとやり直し」）。cp3 は波 `battery` を出した直後に取るので、戻すと機銃は動いたままで待ちはコピーの値、シャッターは閉じ、主砲は元の体力、副砲の砲撃は続く。落ちる前の予告 `shells` と飛んでいる弾は持ち越さない
- HUD: シャッターで守られていても、弾薬庫にロック枠と体力は出る。守られていることを示す文言や印は無い。旗で開くシャッター（起動の前の要塞の機関砲。SB-2051）は別で、閉じている間は `hudModel` が `enemy` と `lock` を null にし、体力のバーもロック枠も出さない

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
| `BARRAGES.battery.minZ` / `maxZ` | −Infinity / −135 | m。届くのは z が −135 以下の間（要塞の先の野） |
| `BARRAGES.battery.slow` | `depot-down` / 1.5 | 印が立っている間の間隔の倍率 |
| `M1_SHUTTERS[0]` | 10×8×1.5、`gap` 0.5 | m。弾薬庫の板の幅・高さ・厚さと、箱の面からの離れ |
| `SEA_FIRE_PERIOD` | 3.2 | s。主砲が海を撃つ間隔（`src/view/seaFire.ts`） |
| `SEA_FIRE_OFFSET` | 1.3 | s。2門目の拍のずれ |
| `FLASH_TIME` / `TRACER_TIME` | 0.15 / 0.9 | s。閃光と曳光の線が出ている間 |
| `TRACER_SPEED` / `TRACER_LENGTH` | 220 / 25 | m/s と m。線の頭の速さと長さ |

テスト: 純粋な関数は `test/unit/battery.test.ts`・`test/unit/hazards.test.ts`、ゲームの中の動き（シャッター・波・集積所・ボットでのクリア・チェックポイント・同じ seed で同じ出来事）は `test/integration/boss.test.ts`、描画は `test/e2e/battery.test.ts`。

### 要塞の機関砲

SB-1830。要塞の海側の壁の上に機関砲が1基あり、海側の門の前の開けた所を掃射する。同時に海の艇を撃っていて、壁の上からは閃光と線が海へ走る（艇の mesh は作らない）。目標は `fortress-gun`（種類 `fortressGun`）で、壊すと掃射が止まる。値はどれも仮で、`#view-fortress` の調整パネルで決める。定義は `src/data/fortress.ts` の `FORTRESS_GUN_TUNE`、動きは `src/logic/fortress.ts` の `stepFortressGun` と `src/logic/game.ts` の `stepFortressGunNest`、見た目は `src/view/fortGunModel.ts`（砲台）・`src/view/shutterModel.ts` と `src/view/world.ts`（シャッター）・`src/view/fortWallModel.ts`（壁。「物と目標の見た目」の `fortWall`）と `src/view/seaFire.ts`。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `range` | 160 | m。弾の出る所から機体がこの水平距離以内なら掃射する。弾の飛ぶ距離でもある |
| `damage` | 4 | 1発が減らす機体の装甲 |
| `shots` | 8 | 1回の掃射で撃つ数 |
| `arcDeg` | 60 | 度。機体への向きを `-arcDeg/2` から `+arcDeg/2` まで回す扇 |
| `interval` | 0.12 | s。掃射の中の1発から次まで |
| `rest` | 2.5 | s。掃射が終わってから次まで |
| `spread` | 2 | 度。1発ごとの狙いのずれ |
| `bulletSpeed` | 200 | m/s。弾の速さ |
| `muzzle` | 0.7 | 撃つ高さ。目標の箱の上端に対する割合 |
| `muzzleGap` | 0.3 | m。目標の箱の海側の面から弾が出る所まで |

シャッターの値は `FORTRESS_SHUTTER_TUNE`（`src/data/fortress.ts`。`#view-fortress` の調整パネルの2つ目の表）。

| 名前 | 値 | 単位・意味 |
|---|---|---|
| `openSec` | 0.9 | s。シャッターが巻き上がり、砲がせり出す秒数。最初の掃射は起動から `rest`（2.5 s）後なので、開き切ってから撃つ |
| `sink` | 7 | m。閉じている間、砲が壁の中へ沈む深さ（壁の高さ 12m の中） |
| `TARGET_SIZE.fortressGun` | 16×10×6 | m。幅・高さ・奥行き。奥行きは壁の厚みと同じで、箱は壁の足元の中に収まる |
| `TARGET_HP.fortressGun` | 300 | 体力（機関砲30発・砲5発。仮） |

- 置き場所: 目標は `TargetPlace.y` を持ち、箱の下端を地面から `y` m 上げる。`fortress-gun` は海側の壁の上（`FORTRESS_TUNE.wallH` = 12m）に載る。`targetBox` は `minY = y`・`maxY = y + TARGET_SIZE[place.kind].h` を返し、`buildTargets` は `mesh.position.y = y` に置く。`mapBlockers` は `y` を知らないが、箱の足元（z −74〜−68・x 12〜28）は `fortWall` の四角の内側なので、地面に見えない壁を足さない
- 撃つ（`stepFortressGun`）: `wait` を `dt` ずつ減らし、0 になったとき、弾の出る所（下記）から機体の足元までの水平距離が `range` 以内で、箱の中心・箱の上端の `muzzle` 倍の高さ・箱の海側の面から `muzzleGap` 先（弾の出る所）から機体の胸への線が、物の箱とほかの壊れていない目標の箱に遮られないなら、1発撃つ。弾の出る所は固定値を持たず、箱から決める。最初の掃射は `rest` 後。この関数は起動の条件を持たず、旗は `stepFortressGunNest` が見る（下の「起動の条件」）
- 掃射: 機体への水平の向きを、その発の掃射の中の位置で `-arcDeg/2` から `+arcDeg/2` まで等分に回し（`index` 0 が左端、`shots - 1` が右端。1発なら回さない）、`spread` の散らしを重ねる。1発ごとに機体の今の位置を狙い直す。1発のあと `wait` を `interval` にし、最後の1発のあと `rest` に戻す。掃射の途中で線が通らなくなったら、その掃射をやめて `rest` 待つ。乱数は `stream('battery')` から引く
- 起動の条件（SB-2045）: 台本の旗 `fortress-gun-awake` が立つまで、機関砲は撃たない（`stepFortressGunNest` が旗を見る。待ち `wait` も進めないので、起動から `rest` 秒後が最初の掃射）。旗は cue `fortress-gun-wake`（`enter fortress-approach`、`when` なし）が立てる。トーチカの区画を戦っている間は、射程 160m の中で線が通っても撃たれない。`fortress-approach` は問いのあとに `rearm` されるが、旗を立てるだけなので何度入っても同じ。起動の前に壊された機関砲は、旗が立っても撃たない（目標が倒れているので動かない）。旗は台本の状態 `flags` に入るので、チェックポイント・中断・retry で保たれる（保存の形は変わらず `SUSPEND_VERSION` はそのまま）
- 起動の前のシャッター（SB-2051）: 機関砲の前に装甲の板があり、旗が立つまで閉じている。これはボスの弾薬庫と同じ仕組みの `M1_SHUTTERS` の2つ目（`target` は `fortress-gun`、`opensWhen` は空、`opensOnFlag` は `FORTRESS_GUN_FLAG`、板は 16×10×1・`gap` 0.05）で、開く条件が目標でなく旗。`openShutters` は旗が立った次のフレームの `checkShutters` で開け、出来事 `shutterOpen` を1回出す
  - 閉じている間: 弾は目標の箱で止まるが体力は減らず（`damageTarget` の `shuttered`）、爆薬や拳も同じ。出来事 `hit` の `deflected` は true で、板の前面（箱の海側の面から `gap + d` の所）に火花を出す（トーチカの正面の弾きと同じ見せ方）。ソフトロックの候補にも円の中にも入れず（`fcsTargets` の `lockable`、`armoured`）、体力のバーもロック枠も出さない（`hudModel`）。目標は生きているので、狙いの線の止まりや陰になる相手の壁には数える。ボスのシャッター（旗で開かない）は `armoured` にならず、ロック枠も体力も今までどおり出る
  - 海を撃つ演出（`seaFire`）は閉じている間は止める。閉じた板の前から海を撃つと変なため。旗が立つと、シャッターが開いた次のフレームから続く
  - 見た目: 板は `THREE.Mesh`（`sb-shutter-fortress-gun`、壁の上に載る）。閉じている間、砲は `FORTRESS_SHUTTER_TUNE.sink` だけ壁の中へ沈む。開くと `openSec` 秒かけて、板が上の縁を止めたまま下から巻き上がり（`scale.y` が 1 から 0）、砲が元の高さまでせり出す（なめらかな往復、`syncWorld` の `rollShutter`）。巻き上がりの進みは板の `userData.open` に持つ。チェックポイント・中断で戻ったときに最初から開いている板は、巻き上げずに開いた形から始める。壊れた砲は動かさない
  - 起動の知らせ: 旗を立てる cue `fortress-gun-wake` が、無線 `m1.fortress-gun-wake`（「要塞の機関砲が出てくるぞ！」）を1回出す。開き切るまでの `openSec` と、最初の掃射までの `rest` が、予兆の間になる
  - 保存: シャッターの状態は `game.shutters` と台本の旗で決まり、中断・チェックポイントのコピーに入る（`shutters` は元から保存の対象）。シャッターの無い古い保存（機関砲の板より前）を読むときは、`restoreSuspend` が足りないシャッターを足し、旗が立っていれば開けておく（`SUSPEND_VERSION` はそのまま）
- 弾: 型 `FortressBullet`（`fort` に撃った目標の id）。速さ `bulletSpeed`、威力 `damage`、飛ぶ距離 `range`。扱いは敵の弾と同じ（機体・物・壊れていない目標・地面で止まり、機体に当たると装甲が減って `damaged` を出す）。`isHostileBullet` に入るので、敵の弾の線（`src/view/play.ts`）と敵の射撃の音（`src/view/sound.ts`）にそのまま乗る
- 主砲との違い: `newBattery` は `kind === 'gun'` の目標だけを `battery.guns` にする。`fortressGun` は入らず、主砲の機銃の値と動きは変えない
- 海を撃つ拍: `buildSeaFire` は `battery.guns` の後ろに `fortressGun` の目標を1つ足し、その箱から（主砲は `GUN_TUNE`、機関砲は `FORTRESS_GUN_TUNE` の）`muzzle`・`muzzleGap` の所に閃光（`sb-sea-flash`）と海へ向かう線（`sb-sea-tracer`）を出す。倒れた目標は何も出さない。艇の mesh は作らない（`camera.far` 260 の外で、要塞の前から海は見えない）。沈む艇の画は L7 の出現カットシーンで見せる
- 壁の上の波 `fortress-drop`: `fortress-gate` の cue が `spawn fortress-drop` を出し、`M1_WAVE_ENEMY['fortress-drop'] = ['assault', 'grunt', 'assault']` の3体が、海側の壁の上（`M1_WAVE_DROP['fortress-drop'] = FORTRESS_TUNE.wallH` = 12m）から海側へ降りる。場所は x −20・8・32、z −70 で、門（x −6〜6）と目標の箱（x 12〜28）を避ける。落ち方は `seawall-drop` と同じ `fall` で、海（+z）へ跳ねながら壁の海側に着地する
- テスト: 純粋な関数は `test/unit/fortress.test.ts`（`rest` 後の開始・`interval`・扇・射線が切れたら止まる・弾の出る所・同じ seed）、ゲームの中は `test/integration/fortressGun.test.ts`（開けた所では装甲が減り、遮蔽の陰では減らない・壊すと止まる・壁の上の波が降りて着地する・旗の前は撃っても体力が減らず火花が弾かれて照準も寄らない・旗のあとは当たって壊れる・中断とチェックポイントでシャッターが旗と合う）、`test/unit/battery.test.ts` の旗で開くシャッター、`test/integration/hud.test.ts` の目標の数、`test/e2e/battery.test.ts` の海を撃つ拍、`test/e2e/props.test.ts` の目標の高さとシャッター（閉じた沈み・巻き上がり・開いた高さ）。絵は `shots/fortress-gun-shutter.shots.ts`・`shots/fortress-detail.shots.ts`（SB-2052。壁・砲台・シャッターを前後で撮る）。形の寸法と三角形の数は `test/unit/fortModel.test.ts`

### 海側の門のシャッター

SB-2300。要塞の海側の門（x 0、幅 12m）は、海側の壁の上の機関砲 `fortress-gun` を倒すまでシャッターで閉じる。区画 `gate` は機関砲を倒すまで確保にならないので、閉じた門が中庭への抜け道を塞ぐ。機関砲が倒れると板が巻き上がり、待っていた歩兵と味方機と一緒に中庭へなだれ込む。値はどれも仮で、`GATE_SHUTTER`（`src/data/fortress.ts`）に置く。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `x` | 0 | m。門の中心 |
| `z` | `FORTRESS_TUNE.seaWallZ`（-71） | m。壁の厚みの中の門の中心 |
| `w` | `FORTRESS_TUNE.seaGate`（12） | m。板の幅（門の幅） |
| `h` | `FORTRESS_TUNE.wallH`（12） | m。板の高さ（壁の高さ） |
| `d` | 1.5 | m。板の厚さ（仮。壁の 6m より薄い） |
| `opensWhen` | `['fortress-gun']` | この目標が全部倒れたら開く |
| `openSec` | `FORTRESS_SHUTTER_TUNE.openSec`（0.9） | s。巻き上がる秒数（巣の板と同じ値） |

- 閉じている間: `game.rects` に門をふさぐ矩形（幅・厚さ・高さ、`top` は壁の高さ）が入り、自機・敵・歩兵を壁と同じに止める。弾は `flyBullet` が同じ大きさの箱で止める（自機の弾も敵の弾も。中庭の敵が閉じた門越しに撃てない）。`syncGate` in `src/logic/game.ts` が機関砲の体力から開閉を決め、全部倒れたフレームに矩形を `rects` から抜いて出来事 `gateOpen` を1回出す。`stepNav` は矩形の数が変わると敵の経路の格子を作り直すので、開くと敵も門を通れる。門はマップの物ではないので `mapCheck` の歩行判定は今までどおり（開いた後の道は既存の門の開口と同じ）。
- 台本: cue `gate-open`（trigger `destroyed fortress-gun`）が無線 `m1.gate-open`（ja「門が開いた！なだれ込め！」、en「The gate is open! Pour in!」）と、味方機3機の `allyMove`（`yard-run-1`〜`yard-run-3`）を出す。`fortress-gate` の cue からは `allyMove` を外した（味方機は当たりを持たず、閉じたシャッターを素通りしてしまうため）。`fortress-gate` の cp2・目的・無線・`fortress-drop` はそのまま。
- 見た目: 門の幅・壁の高さの板を `shutterPlateGeometry`・`shutterHousingGeometry`（`src/view/shutterModel.ts`）で作り、`World.gate` に置く。閉じている間は門に立ち、開くと `rollPlate` が巣の板と同じ秒数で巻き上げる。新しいモデルは作らない。
- 要塞の爆破・中断: 開いたかどうかは `fortress-gun` の体力から決まり、追加の状態を持たない。`fortressBlast` は機関砲を壊すので、そのときも開く（先に倒れていればもう開いている）。中断・チェックポイントは `rects` をそのまま持ち、`restoreSuspend`・`retryFromCheckpoint` が `syncGate` で体力から作り直す。門の矩形が無い古い保存は、機関砲が立っていれば閉じた矩形を足す。`SUSPEND_VERSION` は上げない。
- 歩兵: `CROWD_GATES` の門は今の形のまま。区画 `gate` を確保するまで歩兵は海側で待つので、閉じたシャッターへ向かう経路は無い。
- テスト: `test/integration/fortress.test.ts`（門の矩形・自機の通行・`gateOpen`・敵の経路の作り直し・爆破・中断）、`test/integration/allies.test.ts`（門の区域だけでは味方機が動かず、機関砲を倒すと `yard-run` へ）、`test/integration/m1.test.ts`（cue `gate-open`）、`test/integration/script-game.test.ts`（台本の通し）。

### 要塞の爆破と脱出

SB-1860。中ボスの `wardenDown` のあと、要塞の陸側の壁の中の弾薬庫（`fort-bomb`）に爆薬を仕掛けられる。20 秒の秒読みが HUD に出て、0 で要塞が爆発する。海側の門の外へ出ていれば無傷、中に残っていれば大きな傷を負う。爆発で壁が低い残骸になり、海側の壁の上の機関砲も壊れ、カットシーンのあと目標が「超重砲を止めろ」に変わって cp3 が立つ。値はどれも仮で、`#view-breach` の調整パネルで決める。定義は `FORT_BLAST_TUNE` in src/data/fortress.ts、仕掛けと秒読みは既存の `stepCharge`・`stepBlasts`（6章「爆破点と爆薬」）、爆破の処理と壁の崩れは `fortressBlast` in src/logic/game.ts、描き方は `syncWorld` in src/view/world.ts と `drawPlay` in src/view/play.ts、台本は `fortress-bomb`・`fortress-down`（8章）。

| 名前 | 値 | 単位・意味 |
|------|----|------------|
| `countdownSec` | 20 | s。仕掛けてから爆発まで（`fort-bomb` の `fuse`） |
| `damage` | 120 | 中に残った機体の装甲（仮） |

- 仕掛ける: 爆破点は `MapDef.blasts` の `fort-bomb`（`line: null`・x 0・z −119.5（陸側の壁の中庭側の面 z −122 から 2.5m 手前。壁と扉の厚みの外に立てる。SB-2047）・`fuse: FORT_BLAST_TUNE.countdownSec`・`after: 'wardenDown'`）。中ボスが倒れて台本が `wardenDown` を受けるまでは仕掛けられない。長押しは 1500 の `CHARGE_TUNE.holdSec`（1.5 秒）をそのまま使い、HUD の「使う」もそのまま。`BlastPlace.fuse` を省略した点は `CHARGE_TUNE.fuse`（3 秒）。`newBlasts` は `BlastState.fuse` に写し、`stepCharge` は `ChargeState` に `left` と `total` を同じ値で積む。20 秒の秒読みは HUD の `hud.charge`（「爆破まで」＋残り秒と棒）に出る。カットシーンの間は `stepBlasts` を数えない
- 陸側の扉: 陸側の門（x 0, z −125、幅 12m）に `fortWall` を1枚置き、`collapse: true` を付ける。`wardenDown` では開かず、爆発で外れる。海側の門が逃げ道で、中庭を横切って約 60m 走れば外に出る。陸側の壁と左右の壁（既存の `fortWall` 14枚）にも `collapse: true` を付け、`breakable` は付けない（弾では壊れない）。海側の壁（z −71）の6枚は `collapse` を付けず、爆発のあとも立つ（機関砲が載っている）
- 爆発: `stepBlasts` が `fort-bomb` の `blast` を返したフレームで、`fortressBlast` が次を行う。(1) 要塞の範囲（|x| ≤ 36、z −128〜−74）の `collapse` の物の添字を `game.brokenProps` に集め、`rects`・`propBoxes`・`propRefs` から箱の番号の大きい順に抜く（二重に入れない）。海側の壁（z −71）は範囲の外なので残る（`collapse` も付けていない）。(2) `fortress-gun` を 0 にし、`damaged` と同じ道で `destroyed` を出す（`damageTarget`）。(3) 機体が要塞の外（海側の門の外 z > −68、陸側の壁の外、または左右の壁の外）にいなければ `damageMech(game, FORT_BLAST_TUNE.damage, ...)`。外に出ていれば無傷（装甲が 0 なら `downed`）。(4) `sendToScript({ kind: 'fortressDown' })` を必ず送る（機関砲を先に壊していても送る）。`openBlastHole` は `line: null` なので何も開かない。出来事 `blast`（`hit` は 9m の値で、この点では使わない）は1回だけ出る
- 壁の崩れ: `GameModel.brokenProps`（`map.props` の添字）が正で、`syncWorld` が `world.broken` と合わせて一度だけ `breakPropSlot` で低く暗い残骸にする（`propDestroyed` は出さない。砂煙と音を大量に出さないため）。`view/outdoor.ts` の `slots` は `breakable` と `collapse` の物に作る。チェックポイントや中断から戻した、すでに崩れた壁も最初のフレームから低い
- 台本（8章）: `wardenDown` で `fortress-bomb`（目標 `bomb-fortress`・無線 `m1.bomb-armed`）、`fortressDown` で `fortress-down`（旗 `fortress-down`・カットシーン `fortress-blast`・`checkpoint cp3`・目標 `silence-battery`・`spawn battery`）。`fortress-out` は無線 `m1.get-out` だけ。cp3 のコピーは `cutscene` を null にして保存し、戻しても `fortress-blast` を再生しない
- カットシーン `fortress-blast`（10 秒。8章「カットシーンの演出」）: カメラのキーはすべて `rel: true`（機体の x・z からの差）。0 秒は海側の門の外から要塞、3 秒は奥の砲座、4 秒で海（機体の z から +178 = z 120）へ切り、4.02 秒で同じ姿勢を保って飛びにしない。7 秒は海の艇（z 180・184）を見て、10 秒は機体の後ろの三人称の姿勢（x +2.15・y 4.4・z +8.6、look は x +2.15・y 2.9・z 0）。本体は見下ろしなので、最後のキーと本体カメラの 0.5m 比較はしない（`landing` のテストだけ）。出来事は 0.2〜2.8 秒に壁の数か所の `burst`、2.5 秒に海の艇の `sink`、6 秒に仮の超重砲の `burst`（x 0, z −265）と海の `sink`。文は `cutscene.blast.fall`・`cutscene.blast.gun`
- 見た目: `drawPlay` は `game.script.fortressDown` の立ち上がりで、要塞の壁の数か所に `blast('large', ...)` を出す（1回だけ。すでに崩れた状態で始めた出撃は出さない）。`wardenDown` の扉の爆発は出さない（扉は爆発まで残る）
- 超重砲: この票では模型を作らない。カットシーンの `burst` と海の `sink` で表し、L8 が模型に差し替える
- テスト: `test/unit/blasts.test.ts`（`fuse` と `ChargeState.total`。長い導火線が 20 秒で爆発する）、`test/integration/fortressBlast.test.ts`（20 秒の秒読みと HUD・1回の `blast`・壁と扉が `rects` から消える・機関砲が壊れる・外なら無傷で中なら 120・装甲 0 で `downed`・cp3 と目標と `battery`・戻すとカットシーンを再生しない・カットシーンの間は秒読みが止まる）、`test/integration/mapM1.test.ts`（`fort-bomb` と扉の形）、`test/unit/mapCheck.test.ts`（`collapse` の物を避けない）、`test/e2e/props.test.ts`（崩れた壁の copy が低くなる）、`test/e2e/cutscene.test.ts`（`fortress-blast` の画）、`test/integration/m1Run.test.ts`（仕掛けて海側の門の外へ走る）

## 7. 確認用の入口

- `?fps`: 直近1秒に描いたコマ数と、最後のコマが描いた物を画面の上に出す
- `?stats`: 最後のコマが描いた物（描く回数と三角形の数）を、0.1秒ごとにページのタイトルへ書く
- `?seed=<n>`: 乱数の種を入れる。確認用の入口は起動（`boot()`）のあとに読み込むので、種が効くのはそのあとに引く乱数だけ。起動時に作る屋外は乱数を使っていない
- 調整パネル（`src/dev/tunePanel.ts`）: 表（`MOVE_TUNE` など）と、つまみの範囲（最小・最大・刻み）を渡すと、画面の右端に折りたためるパネルを作り、表の項目ごとにスライダーと数値の欄を並べる。動かすと表の値をその場で書き換え（ファイルは書き換えず、読み直すと元に戻る）、「値をコピー」が変えた値だけを `MOVE_TUNE.walk: 8` の形（表の名前と鍵）でクリップボードに入れる。クリップボードが使えないときは、同じ文字を欄に出して選べるようにする。「元に戻す」はパネルを開いたときの値に戻す（表示する表を切り替えた入口でも、それまでに表示した全部の表を戻す）。範囲に無い鍵を渡すと、黙って 0 にせずに読み込みの時点でエラーにする。`#view-boom`・`#view-map`・`#view-sound`・`#view-hurt` が使う
- `#view-field`: 起動時のカメラで止まった、空の屋外の絵にする
- `#view-scale…`: 寸法を見比べる試験コースを出す。`#view-scale` は全体を斜め上から、`#view-scale-<場所>`（`corridor`・`door`・`hall`・`step`・`ref`）はその場所を正面やや上から。`?mech=<m>` は機体の高さ（既定 8）、`?ceil=<m>` は部屋の天井の高さ（既定 18）、`?radius=<m>` は当たり半径（既定 2）
- `#view-props`: 防御物（ハリネズミ・`block`・`lowWall`・`bunker`）と揚陸艇を並べて、`DEFENSE_DETAIL` の調整パネルで形を見る入口。`src/dev/views/propsView.ts` が並べ（`src/dev/outdoor/defenseLineup.ts`）、変えるとその場で組み直す。保存はしない
- `#view-touch`: 同じ平らな地面で、タッチで機体を動かす入口。見下ろしのカメラで機体を追い、左 45% のスティックが移動、残りのドラッグが機体の向き、`#btnFire`（メイン）が撃つ、`#btnFire2`（サブ）が押した回数だけ、`#btnBoost`（ブースト）が押している間ブースト、`#btnMelee`（殴る）が押している間殴る、`#btnLock`（ロック）が LOCK の表示を切り替える。ジャンプは無い。ボタンの最初の配置は `src/data/touch.ts` の `TOUCH_DEFAULTS` のとおりで、右手側に寄せ、メインを少し大きくする。画面の上の「配置」で engine の配置の編集画面を開き、指で動かした座標と大きさを保存する。画面の左上に速さ・ゲージ・LOCK・押した回数・同時に触れた指の最大・「スティック＋視点＋メイン」と「スティック＋視点＋ブースト」が同時に効いた秒を出す。視点は `INPUT.look` が呼ばれた時刻から `LOOK_RECENT`（0.25 秒）以内なら使っていると数え、メインのボタンを押したままのドラッグも含める。画面の上の「結果」で、`window.sbTouchReport()` と同じ JSON（測った数字、ボタンの配置 `x`・`y`・`s`・`b`、画面の大きさと `devicePixelRatio`、`userAgent`）を出す
- `#view-arena`: 本編と同じ `step`・自機・カメラ・FCS・敵・撃つ見た目・音・HUD で、120m 四方の平らな砂地に置いたコンクリの遮蔽だけの広場を、機体から 30〜60m に来る量産機（grunt・assault・heavy）の組と撃ち合う入口。組を全部倒すと 3 秒後に次の組が来て終わらない。`?enemies=grunt:4,assault:2` で種類と数を選び（既定は grunt 3・assault 1。1 種は 20 体まで）、`?god=0` で本編どおり装甲が 0 になると倒れ（既定は倒れない）、`?ammo=inf` で弾が減らない（既定は本編の値で、R が満タンに戻す）。画面の左上に倒した数・経過時間・撃った数・当てた数・弾を出し、`window.sbArenaReport()` が同じ数字を JSON の文字列で返す。右上の調整パネルは Fullscreen ボタンの下（上から 44px）に置き、`MOVE_TUNE`・`FEEL_TUNE`・`FCS_QUARTER`（PC もタッチも同じ）の主な値を書き換える（保存しない）。機体は艇の通り道でも広場の端（`ARENA_MAP.bounds` の内側、機体の半径）で止まり、はみ出した向きの速さは 0 になる（広場に艇は無いので、本編が通す前の端を通さない）。広場は本編の `MOVE_TUNE`・`FEEL_TUNE`・`FCS_QUARTER` の値で開く（SB-2072）
- `#view-script`: M1「強襲上陸」の台本をボタンで動かす入口。3D は描かず、屋外の画面に DOM を重ねる。左に今の目標・地図の印・カットシーンと残りの秒・旗・結果、下の真ん中に無線の帯（1行を最低 `RADIO_TUNE.minSec` ずつ順に出す。カットシーンの間は止める）、右に出来事を入れるボタン（`enter b-line`・`enter fortress-gate`・各物の `destroyed`・`skip`）と時間の速さ（×1・×4）、右下に cue が発火した時刻と出来事のログを出す。毎フレーム `stepScript` を回し、`window.sbScriptReport()` が `fired`（cue → 時刻）と出来事の列を JSON の文字列で返す
- `#view-hud`: HUD の配置の見本を4案（A 四隅に散らす・B 下にまとめる・C 照準のまわりに寄せる・D A の配置に照準のまわりの細い計器を足す）で切り替えて見る入口。`#view-map` の浜のマップ（`buildMapScene`）を、機体の斜め後ろ上からの固定カメラで描き、機体の模型を置く。ゲームの状態にはつながず、見本の値（`src/dev/hud/plans.ts` の `HUD_SAMPLE`）で描く。`?plan=a|b|c|d`（既定 a）、`?cut=1`（カットシーンの帯）、`?touch=1`（タッチのボタンの輪）、数字キー 1〜4 で案を切り替える。ロック枠は `lockFrame` で描き、見本の四角（`LOCK_SAMPLE`）に出す。`window.sbHudReport()` が各要素の矩形を JSON の文字列で返す。弧・レーダー・点と円の描き方は `src/view/hudParts.ts` から読む（見本の値と動きは変えない）。要素の値の多く（装甲・熱・弾数・武器の枠（メインとサブの2つ）・レーダー）と、カットシーン中の表示（無線以外を隠す）は仮であること。見本には熱の欄が残る（本体は熱を持たない）。右上の調整パネルで `RADIO_TUNE` の `minSec` と `maxPending` を変えられ、「無線を2行流す」で1行ずつ順に出る様子を見られる
- `#view-mech`: 機体の見た目の案を5つ（A 重装ずんぐり・E 中量（A を細く）・F 中量・脚長・B 逆関節の軽め・D 四脚の戦車寄り）で切り替えて見る入口。`#view-hud` と同じ浜のマップに機体を置き、ゲームの状態にはつながない。`?pattern=a|e|f|b|d`（既定 a）、`?spin=0`（回転を止める）。数字キー 1〜5 と上のボタンで案を切り替え、`回転` のボタンで回転を入り切りする。`?kit=<名前>`（`player`・`ally`・`sniper`・`scout`・`enemy`・`enemyRifle`・`enemyGunner`・`enemyHeavy`・`boss`）を付けると、箱の案の代わりに試作の機体をそのキット（`PROTO_KITS` の部品と `PROTO_PALETTES` の色）で出す。`?proto`・`?compare` でも試作を出し、`?compare` は箱の案と並べる。キットのボタンでも切り替えられる。`ProtoKit.scale` はボスのように高さに掛けて大きくする値、`handL` は空いた手を爪に替える名前（SB-2084）。`window.sbMechReport()` が案・回転・キットと、箱の案の描く回数・三角形・箱の数・重さ、試作の描く回数・三角形・部品の数と、画面全体の直近の描く回数・三角形を JSON の文字列で返す。`歩く`・`ブースト`・`撃つ` のボタン（キー W・B・F）と`殴る`（キー Q）で機体の動きを見られる（`歩く`・`ブースト`・`撃つ` は押すたびに入り切り、`殴る` は1回の一撃を振る。速さは案の脚の種類の値で、案 B は逆関節、案 D は四脚の動きになる）。`window.sbMechReport()` の JSON には、動きの入り切り `acts` も入る。右上の調整パネルは `MECH_PAINT`（色ごとの汚れ・粒・傷の数）と `MECH_PAINT_TEX`（番号の大きさ・縞の間隔）を書き換え、その場で機体を描き直す（SB-1460）。部品の寸法・色・重さはどれも仮であること
- `#view-grunts`: 敵3種の役割を並べて見る入口。`#view-hud` と同じ浜のマップに `grunt`・`assault`・`heavy` を1体ずつ横一列に置き（正面、ゲームの状態にはつながない）、`?dist=<m>`（既定 10）の距離から見る。キー 1 が近く（10m）、2 が遠く（80m）。40m より遠いときは、浜の線の間が深くないので、正面ではなく横（-x 側）から見る（そのまま正面だとカメラが地図の外へ出る）。距離を変えるたびに `drawEnemies` で描き直すので、近距離の形と簡易形（`ENEMY_DETAIL_DISTANCE` と ±3m の幅）がその場で切り替わる。`window.sbGruntReport()` が距離・種類ごとの形（`near`・`far`・混在なら `near+far`）・実際の描く回数（塗装と発光の2グループ、見えている近距離用と簡易用の合計）・三角形・インスタンス数と、画面全体の直近の描く回数・三角形を JSON の文字列で返す。形の寸法と色は仮であること
- `#view-map`: M1 の手書きのマップ（浜・B トーチカ線・C・防波堤・要塞と砲台の場所）を歩く入口。`?src=hand|gen|edit` で手書き（`m1b-hand.ts`）・生成（`m1b-rules.ts`）・エディタが `localStorage` に保存したマップを選び（既定 `hand`、無いときは「保存されたマップが無い」）、`?seed=<n>` を生成の種にする。地面のタイルと物を `buildOutdoor`、目標を `buildTargets`、海と揚陸艇を `buildShore`、台本の場所を薄い枠、波の出る場所を小さな輪で描く。描き方は `src/view/world.ts` の `buildWorld` を使う。機体は `#view-touch` と同じ入力（見下ろしのカメラ・カーソルの方へ向く）で歩き、始まりは範囲の手前の真ん中。機体は物（`blocks` が真の物）と目標に入らず、斜めに当たると壁に沿って滑る（9章）。左上に種類ごとの物の数・目標の数・違反の一覧・描く回数と三角形の数を出し、`window.sbMapReport()` が同じ数字と機体の位置を JSON の文字列で返す。右上の調整パネルで `MOVE_TUNE`（歩く速さ・重力・ブースト）・`QUARTER_TUNE`（見下ろしのカメラ）・`FEEL_TUNE`（画角・揺れ・ヒットストップ・砂煙・連射）と、前線と節目の `FRONT_TUNE`・`PAYOFF_TUNE`、殴りの `MELEE_TUNE`（威力・扇・間隔・踏み込み・ヒットストップ・揺れ）を歩きながら変えられる（保存しない。`?walk=` などの URL の値の上に載る）
- `#view-fx`: M1 の B のマップ（手書き・生成・エディタが保存したもの）を機体で歩きながら、周りで戦闘が起きている迫力を試す入口。演出はゲームの状態に影響しない
  - 選ぶ: `?src=hand|gen|edit` で M1 の B の手書きのマップ・生成したマップ・エディタが `localStorage` に保存したマップを選び（既定 `hand`。`edit` で保存が無いときは「保存されたマップが無い」を出して空のマップで開く）、`?fx=0|1|2|3` で濃さを選び（0 は演出を全部切った見た目で、`mech=4` なら `#view-map` と同じ。1 は弱、2 は中、3 は強。既定 2）、`FX_TUNE` の各項目を同じ名前でさらに上書きできる（例 `?fx=3&pixel=0.4&tracers=6`）。`?seed=<n>` は場面の種
  - 機体の大きさ: `?mech=<m>` は機体の高さ（3〜8m、既定は `MECH_TUNE.height` の 4）で、仮の模型を `mech/4` 倍にし、足元は地面に付けたままにする。機体は `#view-map` と同じく物と目標に入らず、斜めに当たると壁に沿って滑る。当たり半径は `?mech=` とつまみに比例する（`MECH_TUNE.radius` × `mech/4`。`?mechMove=0` でも比例し、`?mech=8` で 2m）。`?mechMove=0` は歩き・ブーストの速さと加速・ジャンプの初速を `mech/4` に比例させない（ジャンプの初速は `sqrt(mech/4)`。既定は比例）。`MOVE_TUNE` は 4m 用で、`?mech=8` にすると 8m の機体用の値になる。物と歩兵ドロイドの大きさは 8m の機体を基準にした値で、`?mech=` に比例しない。機体の始まりは地図の手前の端から `QUARTER_TUNE.back`＋4m 内側で、機体もカメラも地図の範囲の中に収まる。カメラは `#view-touch`・`#view-map` と同じ見下ろしのカメラ（`QUARTER_TUNE`）で、カーソルの方へ向いて歩き、ジャンプはしない。見下ろしのカメラは機体の大きさに合わせて広げない（`QUARTER_TUNE` は 4m の機体のための値で、大きい機体は画面で大きく見えるだけ）
  - 戦場: 味方の歩兵ドロイドは海側から波で出て -z へ進み、倒れたドロイドと抜けたドロイドを数える。砲撃は機体のまわりの輪に落ちて閃光・破片・灰色の煙を出し、近いほどカメラを揺らす。残骸からは煙の柱が立ち、曳光弾が画面を横切り、飛行機はマップの左右の端の外側（`PLANE_MARGIN`）まで機体と関係なくマップの座標で横切る。地面には `stream('craters')` の種から散らした砲弾穴があり、`craterWater` の割合で水が溜まる（見た目だけで、地面の高さ・機体の歩き・当たり判定は変えない）。砲撃は `shellCrater` が 1 なら落ちた所に新しい穴を残し、`craterCap` を超えると古いものから消える
  - 画面: 見た目は `pixel` の解像度と canvas の CSS の `filter`（`saturate`・`contrast`・`sepia`）と霧で作る。`light` はシーンの全部の光の強さに掛ける倍率、`sun` はそのうち `DirectionalLight` だけにさらに掛ける倍率、`groundColor` は地面の色（海沿いの濡れの濃淡は残す）で、色は URL では10進の数値で上書きできる。煙の色は `smokeColor`・`smokeDark` で変えられる（URL のみ）
  - つまみと書き出し: 右上のつまみは `FX_TUNE` の主な値をスライダーで変え（歩兵ドロイドの体数・煙の上限・穴の数と上限・穴の半径と水の割合は「やり直し」で作り直す）、`mech` のスライダーと `mechMove` のチェックも置き、折りたためる。「書き出し」は今の値を JSON で `<textarea>` に出し、`window.sbFxReport()` が同じ JSON に機体の高さ・動きの比例のありなし・歩きとブーストの速さ・描く回数・三角形の数・直近の fps を足して文字列で返す。左上に選んだ `src`・前進・倒れ・抜けの体数（戦場の歩兵ドロイドが上限に当たっているときは「上限」も）・煙の塊の数と描く回数・三角形の数・fps を出し、`window.sbFxReport()` と書き出しの JSON にも `src` を出す
- `#view-boom`: 爆発の見た目と揺れを試す入口。仕様は6章「爆発」。
- `#view-gunfire`: 撃つ手応えの見た目（SB-1450）を試す入口。浜のマップに機体を置き、右肩越しの固定カメラで見る。「撃つ（機関砲）」「撃つ（重い砲）」で銃口炎と曳光の帯を出し、「当てる（金属）」「当てる（地面）」で目標と地面の火花と煙を出し、「敵の射撃」で敵の銃口炎と赤橙の帯を出す。右上の調整パネル（`GUNFIRE_TUNE`）で曳光の長さ・太さ・尾の明るさ、銃口炎の大きさ、火花と煙の数・大きさ・寿命をその場で書き換える（保存しない）。`window.sbGunfireReport()` が弾・帯・炎・火花・煙の数と描く回数・三角形を JSON の文字列で返す
- `#view-landing`: 本体の出撃を始め、導入のカットシーンを `?at=<秒>`（0〜11.95、既定 0。12 にすると `left` が 0 になって台本が導入を終える）の秒で止めて見る入口。`←`・`→` で 1/10 秒ずつ動かす。右上の調整パネルが、今の秒以前で一番近いカメラキーの6値（`CUTSCENES.landing.camera.<番号>.pos.0` など）と `LANDING_TUNE.startDepth`、選んだ同乗者の `LANDING_RIDERS.<番号>.x`・`.z`、`CUTSCENES.landing.events.<番号>.at` を書き換え、「値をコピー」で変えた値だけを表の形で出す。同乗者は「同乗者」の一覧で選ぶ。画面に今の秒・キーの秒・キーの番号・カメラの姿勢と、コピーの形を出し、`window.sbLandingReport()` が秒・キーの秒・姿勢・描く回数・三角形・同乗者の `id`・`x`・`z`・`fall`（0 が立ち、1 が甲板に倒れた）・`tracers` の出来事の数を JSON の文字列で返す
- `#view-breach`: 手書きマップの線1の爆破点と爆薬を、機体を (40, 150) に置いて見る入口。右上の調整パネルが `CHARGE_TUNE`（長押し・届く距離・導火線・爆風の半径と装甲・穴の半幅と半奥行き）と `ENEMIES.emplacement`（体力・射程・1発の装甲・掃射の弾数・弧・間隔・次の掃射まで）、`AIMED_MORTAR`（同じ所にいる秒・同じと見る半径・予告・爆風の半径・装甲・区間の手前）、`YARD_TUNE`（門の x・z・撃つ高さ・援護の間隔2つ・曳光の速さ・砂煙・`yard-1` から `yard-2` まで）、`FORT_BLAST_TUNE`（要塞の爆薬の `countdownSec`・`damage`）を書き換え、「仕掛ける」「爆破」「戻す」と「この線を爆破で開く」（`openBreach` の結果でシーンを作り直す）「閉じた線に戻す」、「機銃座を出す」（`M1B_HAND.spawns['b-emplacements']` の6か所に機銃座を置き、機体へ掃射させる。曳光はこの入口だけの線で描く）、「狙う迫撃砲を始める」（その場に立ち続けると予告の輪と着弾が出る。`still` の残りを画面に出す）、「中庭の波を出す」（`yard-1/2/3` の敵を `M1B_HAND.spawns` の場所に置く）、「援護を始める」（海側の門の上から1機ずつ撃ち、この入口だけの曳光で描く）、「要塞に仕掛ける」（機体を陸側の門の内側に置いて `fort-bomb` に爆薬を付ける）、「20秒進める」（要塞の爆薬の残りを 20 秒減らす）、「爆発」（残りを 0 にして次のフレームで爆発させる）でその場で試せる。`window.sbBreachReport()` が機体・爆破点・爆薬・機銃座の数・弾の数・狙う迫撃砲（`still`・予告の数）・援護（波と次の1機まで）・中庭の敵の数・崩れた物の数 `brokenProps`・`fortressDown`・`?stats` の数字を JSON の文字列で返す
- `#view-hurt`: 本体の出撃を始め、導入のカットシーンを飛ばして、撃たれている感（画面の縁の赤・近い着弾の白み・装甲が減ったときの暗み）を試す入口。右上の調整パネルが `HURT_TUNE` を書き換え、「右から被弾」「近くに着弾」「装甲25%」「装甲を戻す」でその場で3つの印を起こせる。装甲の割合を文字で出し、保存はしない
- `#view-pillbox`: 本体の出撃を始め、導入のカットシーンを飛ばして、機体をトーチカ1の横の爆破点の海側4m（陸向き）か、後ろの爆破点の陸側4m（海向き）に置く入口。点が画面の前に来る。右上の調整パネルが `PILLBOX_BLAST.damage`・`PILLBOX_TUNE.suppressSec`・`PILLBOX_BREAK`（`sec`・`sink`・`lean`）・`M1_SECTORS` の `holdZ`（区画ごとの歩兵ドロイドの待ち線。毎フレーム読むので動かすとすぐ効く）・`DEFENDER_TUNE`（守備の隠れ/身を出す秒と射撃の間隔）・`FRONT_TUNE`・`PAYOFF_TUNE` を書き換え、「横の爆破点へ」「後ろの爆破点へ」「トーチカ2基を壊す」「やり直す」でその場で試せる。「トーチカ2基を壊す」は2基の横の爆破点に導火線の切れた爆薬を置き、次のフレームで壊して沈みを始める（SB-2015: 弾では壊れない。無線・旗・cp1 も出る）。トーチカ線を確保すると歩兵ドロイドが待ち線を越えて進み、味方機3機が C の投稿へ動く。F を長押しして仕掛け、離れて爆破する。保存はしない
- `#view-ally`: 味方機1機の見た目を、近く（10m）・肩の帯と番号（4m）・遠く（60m）・倒れた姿の4つで見る入口。`sniper`・`scout` の2型をボタンで切り替える。`?shot=near|band|far|wreck` と `?kit=sniper|scout` で最初の絵を選ぶ。`window.sbAllyReport()` が今の絵・型・形・高さ・描く回数（材質ごとの4ドロー）・カメラの姿勢を JSON の文字列で返す
- `#view-allies`: 本体の出撃を始め、導入のカットシーンを飛ばして、味方機5機を試す入口。どのボタンも先に `ashore` を送って艇を降りた状態にする。「B の手前へ」は線1の l1-b を爆破してから機体を (0,140) に置いて `enter b-line` を起こし、4機（覆いの3機と `gunner`）が穴を抜ける所と、`gunner` が B の手前で倒れる所を見る。「C の手前へ」は線2の l2-a を爆破してから機体を (35,-30) に置き、トーチカ2基を壊して cp1 を起こし、3機が C の投稿へ動く所を見る。「要塞の門へ」は機体を (0,-60) に置いて `enter fortress-gate` を起こし、3機が海側の門から中庭へ動く所を見る。「B の手前に敵」「C の手前に敵」は、その区画の味方機の `engageRange` 以内に grunt を3体出し、味方機の曳光が敵へ、敵の曳光が味方機へ向くのを見る（当たりは無い）。「やり直す」で最初から。右上の調整パネルが `ALLY_TUNE`（走る速さ・着いたと見る距離・倒れる前に叫ぶ秒・足元の半径・上がれる高さ・落ちる速さ・撃つ敵を探す距離・味方機の散らし・敵の曳光の間隔・敵が探す距離・敵の散らし）と `RADIO_TUNE`（1行を出す秒・待たせる行の上限）を書き換える。`ALLY_TUNE` には遅れて急ぎ出す距離・全力で急ぐまでの距離・急ぐときの倍率（SB-2044）も入る。座標はこの入口の `const` に置き、本編のデータには置かない。保存はしない
- `#view-droid`: 浜の歩兵ドロイド1体を大きく見る入口。M1 の浜の開けた所（x 40・z 166）に1体を置き、正面・斜め・横のカメラと「回転」を出す。`?turn=front|quarter|side`（既定 `front`）、`?pose=stand|wait|fallen`（既定 `stand`。待ち線のしゃがみと仰向けの倒れ）と `?spin=0` で選べる。近くで見る所なので近い形（`DROID_PARTS.near`、味方の明るい灰・黄色・青緑）で描く。`window.sbDroidReport()` が向き・回転・ポーズ・描く回数・三角形・高さを JSON の文字列で返す。`#view-squad` の歩兵と `#view-landing` の同乗者は同じドロイドで、倒れ方も同じ `SOLDIER_POSE` を使う（同乗者はいつも近い形）
- `#view-squad`: 本体の出撃を始め、導入のカットシーンを飛ばして、戦場の層の歩兵ドロイドを試す入口。`?seed=<n>` は波の種。最初の波（20体）は海側から来て、5体の分隊2つが機銃座（`M1_NEST_WAVE` の `map.spawns`）へ歩く（`squadFallShare` 0 なので台本では倒れず、機銃座の射撃が体力で倒す。SB-2271）。残りの10体は幅いっぱいに散らばり、`allyDeathRate` 0 なので抽選では倒れない（敵の射撃が倒す）。砲撃の着弾は `hurtNear` が体力を削る。「B の手前へ」で機体を (0,140) に置いて `enter b-line` を起こす。「出撃し直す」は `startSortie` で群れを作り直すので、右上の調整パネルの `PLAY_BATTLE_TUNE`（1波の体数・波の間隔・歩く速さ・1秒に倒れる確率・分隊の数と体数・線で倒れる割合と機銃座からの距離・着弾で倒れる半径と確率）の変更はこのボタンで反映する。保存はしない
- `#view-fortress`: 手書きマップの要塞の海側の壁の上の機関砲を、機体を (0, −50) に置いて見る入口。右上の調整パネルが `FORTRESS_GUN_TUNE`（射程・1発の装甲・掃射の弾数・弧・間隔・次の掃射まで・散らし・弾の速さ・撃つ高さ・箱の面からの離れ）と `FORTRESS_SHUTTER_TUNE`（シャッターが開く秒数・閉じた砲の沈み）を書き換え、「掃射を始める」で壁の上から開けた所への掃射（この入口だけの曳光で描く）、「壁の上の波を出す」で `M1B_HAND.spawns['fortress-drop']` の3体を壁の上から降らせ、「戻す」で止めて状態を戻す。`window.sbFortressReport()` が機体・機関砲（体力・`y`・待ち・掃射の残り）・弾の数・敵の数・`?stats` の数字を JSON の文字列で返す
- `#view-warden`: 手書きマップの中庭に機体を (0, −95) に置き、陸側の門の内側 (0, −118) から中ボス「重装指揮機」を出して見る入口。右上の調整パネルが `WARDEN_TUNE`（旋回・出てから撃つまで・段階2の体力・三連射・予兆・突進・迫撃砲・装甲・倒れる秒・突撃型を呼ぶ割合・赤い帯の幅）を書き換え、「段階1」「段階2」「突進」「よろけ」「倒す」「戻す」でその場で試せる。`window.sbWardenReport()` が機体・中ボス（体力・段階・残り秒・露出・呼んだか・倒れている秒）・弾の数・迫撃砲の輪の数・`?stats` の数字を JSON の文字列で返す
- `#view-mapedit`: マップの簡易エディタ。上から見下ろすカメラで、ホイールかピンチで寄り・引き、右ドラッグか2本指で動かす。右の一覧で物の8種か目標の4種を選び、地面をクリックかタップすると置く。目標は `id` を一覧から選ぶ。置いた物はドラッグで動き、`R` か回転のボタンで15度ずつ回り、`Delete` か削除のボタンで消える。「手書き」「生成（種）」「空」から始められ、置くたびに `validateMapForMission` を回して違反を出し、通り道が無ければ赤くする。「書き出し」は JSON を `<textarea>` に出し、「読み込み」はその JSON を読む。編集は `localStorage` の `stormbreacher-dev-map` に保存し、`#view-map?src=edit` で歩ける
- `#view-sound`: 音の表の音を聞く入口。仕様は10章「音」。
- `#view-outdoor`: 上陸戦の浜辺のような広い屋外（地面・障害物・トーチカ・防波堤・崖・歩く敵の機体）を種から作り、その重さを測る入口。開いて2秒たってから10秒のあいだ、フレームの間隔・描く回数・三角形の数を記録し、終わると画面の右上に大きく出す（下の `textarea` は同じ結果の JSON）。`window.sbBenchReport()` は終わっていればその JSON の文字列、まだなら `null`
  - `?chunk=<m>`: 区画の一辺（`0`・`16`・`32`・`64`。既定 `32`。`0` は区画に分けない）。`?chunkMin=<n>`: 区画に分ける種類の三角形の数の下限（既定 `3000`）
  - `?far=<m>`: 描く距離と霧の終わり（`80`・`120`・`160`。既定 `120`）。霧の始まりは `far × 0.4`
  - `?enemies=<n>`: 歩く敵の数（`0`・`10`・`30`・`50`。既定 `30`。`0` は `?mechs=` の比べ用）。`?mechDraw=group|instanced`: 機体の描き方（既定 `group`）
  - `?mechs=<n>`: 比べ用に、防波堤の前に横一列で置く機体の数（既定 `0`。歩かない）。`?density=<倍率>`: 障害物の多さ（既定 `1`）
  - `?cam=path|fixed`: 見下ろしのカメラ（既定 `path`。`path` は海から防波堤まで歩いて折り返す、`fixed` は浜の中ほどに止まる）
  - スマホで開くときは `npx vite --port 8765 --host` で開発サーバーを立て、同じ Wi-Fi の端末から `http://<Mac の IP>:8765/games/stormbreacher/#view-outdoor` を開く

確認用の入口は開発サーバーでだけ読み込む（公開のビルドには入らない）。

## 8. 台本

ミッションの台本は「きっかけ → 動き」の行（cue）の並びで、`src/data/missions/<id>.ts` に置き、`src/logic/script.ts` が進める。台本は出来事を出すだけで、目標の文・無線の帯・地図の印・カットシーンはそれを読んで出す。`data/`・`logic/` は three も DOM も読まない。

- どの cue も1回だけ発火する。時刻は `dt` で進む台本の秒で、`Date.now()` や実時間は使わない
- `when`・`unless`（旗の一覧）を付けた cue も、発火は1回だけ。trigger が真でも条件が偽の間は発火せず、trigger と条件の両方が真になった最初のフレームで発火する
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
| `blast` | `{ kind: 'blast', ids }` | `ids` の爆破点のどれかが爆破されて、線の穴が開いた |
| `ashore` | `{ kind: 'ashore' }` | 機体が艇を降りた（`mech.z` が `map.bounds.maxZ` 以下になった）。本体の `step` が一度だけ `ashore` を渡す |
| `cleared` | `{ kind: 'cleared', wave }` | 出した波の敵が全部倒れた（M1 では使わないが、型と判定はある） |
| `after` | `{ kind: 'after', cue, sec }` | 別の cue が発火してから `sec` 秒後。`sec: 0` は同じフレームで続けて |
| `flag` | `{ kind: 'flag', name }` | 旗が立った（M1 では使わないが、型と判定はある） |
| `wardenDown` | `{ kind: 'wardenDown' }` | 中ボスが倒れて爆発した（本体の出来事 `wardenDown` を `sendToScript` で1回渡す。SB-1860） |
| `fortressDown` | `{ kind: 'fortressDown' }` | 要塞の爆薬が爆発した（`fortressBlast` が送る。SB-1860） |

場所は四角で持つ（`{ x, z, w, d }`。中心と、x の幅・z の奥行き m）。

`when`・`unless` は `Cue` の省略できる項目で、trigger の種類ではない。

- `when: ['a', 'b']` は a と b の両方が立っているとき、`unless: ['c']` は c が立っていないときだけ発火する。両方付けたら、両方を満たすときだけ
- 旗の名前は `MissionDef.flags` に並べる。`validateMission` が `when`・`unless`・`flag` の trigger・`flag` の action の名前をすべてその一覧と照らし、無い名前は例外にする。打ち間違いを読み込みで気づくため
- `start` の cue に `when`・`unless` を付けると、時刻 0 からその条件が満たされるのを待ち、満たされた最初のフレームで1回だけ発火する（条件のない `start` は時刻 0 の1フレームだけ）
- 旗は立つだけで消えない（`ScriptState.flags` は足すだけ）。そのため `unless` は、旗が「まだ立っていない」間にだけ発火できる cue を作る

### 動き

| `kind` | 形 | 意味 |
|--------|----|------|
| `objective` | `{ kind: 'objective', id }` | 目標を書き換える |
| `radio` | `{ kind: 'radio', line, delay?, callout? }` | 無線の1行（言語ファイルのキー）。`delay` の秒だけ帯に出すのを待つ（節目の歓声）。`callout` は、プレイヤーに動いてほしい行に付ける短い指示の言語キー（`m1.callout.*`。SB-2028）。その行が帯に出ている間、画面の中央から `--ring` だけ上にも出る |
| `spawn` | `{ kind: 'spawn', wave, dormant? }` | 敵の波を出す（中身はマップの側で決める）。`dormant: true` は眠ったまま置き、`wake` まで `notice` では起きない |
| `wake` | `{ kind: 'wake', wave }` または `{ kind: 'wake', enemy }` | 眠っている敵を起こす。波の名前ならその波の生きている敵を全部、`enemy` なら id の1体だけ。倒れている敵は起こさない |
| `ally` | `{ kind: 'ally', id, path, fate? }` | 味方の台本。本体は味方の機体を出す（6章「台本の味方の機体」）。`path` は道の名前か `HolePaths`（最初に爆破した点の穴で道を選ぶ）。`fate` は `{ at, by, call? }`（`at` は `places` の名前、`by` は `ALLY_FATES` の1つで `mortar` か `gun`、`call` は倒れる前に叫ぶ無線の言語キー） |
| `allyMove` | `{ kind: 'allyMove', id, path }` | すでに出ている味方の機体の道を、次の道に差し替える（`id` は `allies` の名前、`path` は `paths` の名前か `HolePaths`） |
| `suppress` | `{ kind: 'suppress', id, wave, sec }` | 味方機 `id` の援護射撃（SB-2020）。`wave` の生きている機銃座の次の連射を `sec` 秒待たせ、その間は撃たない（体力・起こしたかは変えない。黙らせるのは `EnemyState.wait`・`burstLeft` で、見せるための `GameModel.cover` を足す。SB-2024）。

援護射撃の見た目（SB-2024）: `suppress` の間、`stepCover` in `src/logic/game.ts` が `COVER_TUNE.fireEvery` ごとに生きている機銃座を1基ずつ順に選び、出来事 `coverFire`（撃つ側 `x,y,z`・機銃座 `tx,ty,tz`）を出す。撃つ側は `COVER_TUNE.allyRange` 以内でいちばん近い生きている味方機、いなければ機銃座の `seaDist` 海側（左右に `seaSpread`）。`src/view/play.ts` の `drawCoverFire` が `Battle.tracer` で曳光弾を飛ばし、着くころに火花と砂ぼこりを機銃座の上に出す。黙っている間は `drawNestSmoke` が機銃座ごとに煙を出し、窓が終わると消える（撃ち直しの合図）。窓が終わる `COVER_TUNE.warnBefore` 秒前に、無線 `m1.line2-ammo`（「味方機の弾が切れる。急げ」）を `radioQueue` に積む。見た目だけで、当たり判定とダメージは `suppress` のまま。値は `COVER_TUNE` in `src/data/allies.ts`（仮）。テストは `test/integration/rhythm.test.ts`（窓の間は毎秒 `coverFire` が出て、終わると出ない。無線が窓の終わる前に出る） |
| `cutscene` | `{ kind: 'cutscene', id }` | カットシーンに入る。`CUTSCENE_SEC` の秒だけ経つか、読み飛ばすまで、カットシーン中の状態にする |
| `checkpoint` | `{ kind: 'checkpoint', id }` | チェックポイント。台本の状態を深いコピーで残す |
| `flag` | `{ kind: 'flag', name }` | 旗を立てる（旗は立つだけで消えない） |
| `map` | `{ kind: 'map', mark, on }` | 戦況の地図の印を出す・消す |
| `payoff` | `{ kind: 'payoff', id }` | 節目の決め（SB-2010・SB-2020）。`id` は `PAYOFFS` の名前（`breach`・`breach2`・`bunker1`・`bunker`）で、溜め・砲撃の凪・敵の後退を本体が当て、見出しと前線は旗から読む |
| `end` | `{ kind: 'end', result }` | ミッションの終わり（`result` は `'cleared'`） |

決まり:

- `CUTSCENE_SEC`（`src/data/script.ts`）は `landing` 12 秒・`wave2-sinks` 6 秒・`beach-held` 8 秒・`fortress-blast` 10 秒（仮の値）。カットシーンの中でも台本の時間は進み、`after` の秒は数える
- `HolePaths` は `{ lines, paths }`。`lines` は道が渡る線ごとの爆破点の id の列（渡る順）、`paths` は各線で最初に爆破された点の id を `+` でつないだ key から道の名前への表。`validateMission` は全組み合わせの key と、指す道の名前を確かめる。まだ爆破されていない線は、その線の先頭の id で道を選ぶ（dev とテストのための逃げ道。本編の cue はその線の爆破後にしか出ない）
- 無線が重なったら、順番に積んで1行ずつ出す。1行は最低 `RADIO_TUNE.minSec`（3 秒）出す（画面の側の決まり。`RADIO_TUNE.maxPending` を超えたら新しい行を捨てる）
- 報酬は扱わない。ミッションの終わりでまとめて決める

### M1「強襲上陸」の cue

| cue | きっかけ | 動き |
|-----|----------|------|
| `intro` | `start` | `cutscene landing`・`ally buddy beach-run`（`fate { at: 'beach-mid', by: 'mortar', call: 'm1.buddy-call' }`）・`ally cover-b1 b1-wait`・`ally cover-b2 b2-wait`・`ally cover-b3 b3-wait`・`ally gunner gunner-wait`（`fate { at: 'b-mid', by: 'gun', call: 'm1.gunner-call' }`。5機は両隣の艇の甲板に乗って導入から出て、操作を渡されると艇を降りる） |
| `beach` | `after intro 0` | `objective reach-pillboxes`・`spawn beach-mortar`（狙う迫撃砲も始まる）・`spawn b-emplacements dormant`（機銃座6基を眠ったまま置く） |
| `ashore` | `ashore` | `wake b-emplacements-1`（一番手前の機銃座1基を起こす。味方は導入の終わりにすでに自分のランプを降り始めている） |
| `line1-open` | `blast l1-a / l1-b` | `payoff breach`・`flag line1-open`・`allyMove cover-b1 B1_WAYS`・`allyMove cover-b2 B2_WAYS`・`allyMove cover-b3 B3_WAYS`・`allyMove gunner GUNNER_WAYS`（線1の最初の穴を通る道へ進ませる）・`radio m1.line1-cheer` |
| `pillboxes` | `enter b-line` | `objective break-pillboxes`・`spawn b-squad`・`wake b-emplacements`（残り5基を起こす）・`radio m1.depot-hint`（`gunner` は出さない。線1の爆破で動く） |
| `line2-approach` | `enter line2-approach` | `suppress cover-b2 b-emplacements 9`（味方機の援護射撃。機銃座が9秒黙る）・`radio m1.line2-support`（指示 `m1.callout.line2-support`。窓が終わる2秒前に `m1.line2-ammo` が出る（指示 `m1.callout.line2-ammo`）） |
| `line2-open` | `blast l2-a / l2-b` | `payoff breach2`・`flag line2-open`・`allyMove cover-b1 C1_WAYS`・`allyMove cover-b2 C2_WAYS`・`allyMove cover-b3 C3_WAYS`（線2の最初の穴を通ってトーチカ線の手前の投稿へ。SB-2044）・`radio m1.line2-cheer`・`radio m1.line2-hold`（指示 `m1.callout.line2-hold`。歓声のあと `PAYOFF_TUNE.holdDelay` 秒後。「迎撃が来る。障害物の手前で片付けてから進め」）（近い点でも遠い点でも開く。味方機の道は最初に爆破した点で決まる） |
| `shelling-start` | `after cp1 10` | `spawn shelling`（砲撃が始まる。問いはない。SB-2046） |
| `depot-guard` | `enter depot-approach`（`unless depot-down`） | `spawn depot-guard`・`map depot on` |
| `depot` | `destroyed depot` | `flag depot-down`・`radio m1.depot-down` |
| `pillbox1` | `destroyed pillbox-1, pillbox-2`（どれか1つ） | `payoff bunker1`（1基目だけの小さい決め） |
| `cp1` | `destroyed pillbox-1, pillbox-2` | `radio m1.pillboxes-down`・`flag pillboxes-down`・`payoff bunker`・`checkpoint cp1`・`allyMove cover-b1/b2/b3 c-front-1/2/3`（C の前、機体の通り道の先の投稿へ） |
| `fortress-gun-wake` | `enter fortress-approach` | `flag fortress-gun-awake`（要塞の機関砲のシャッターが開き、撃ち始める。SB-2045・2051）・`radio m1.fortress-gun-wake` |
| `fortress-gate` | `enter fortress-gate` | `checkpoint cp2`・`objective stop-fortress-gun`・`radio m1.fortress-gate`・`spawn fortress-drop`（壁の上の3体を機体の後ろに降らせる） |
| `gate-open` | `destroyed fortress-gun` | `radio m1.gate-open`・`allyMove cover-b1/b2/b3 yard-run-1/2/3`（海側の門のシャッターが巻き上がり、中庭へなだれ込む。SB-2300） |
| `fortress-yard` | `enter fortress-yard` | `radio m1.fortress-yard`・`radio m1.yard-trap`・`spawn yard-1`・`assist ['yard-1','yard-2','yard-3']`・`allyMove cover-b1/b2/b3 yard-cover`（三方から囲まれ、生き残った味方機が門で撃ち始める） |
| `yard-drop` | `after fortress-yard 6` | `spawn yard-2`（中庭の奥から2機） |
| `yard-gate` | `cleared yard-1` | `flag yard-1-clear`・`spawn yard-3`（海側の門の脇から2機、退路を塞ぐ） |
| `yard-2-clear` | `cleared yard-2` | `flag yard-2-clear` |
| `yard-3-clear` | `cleared yard-3` | `flag yard-3-clear` |
| `yard-clear` | `flag yard-3-clear`（`when yard-1-clear / yard-2-clear / yard-3-clear`） | `radio m1.yard-clear`・`radio m1.warden`・`spawn warden`（陸側の門から中ボスが出る。SB-1850）・`allyMove cover-b1/b2/b3 yard-front-1/2/3`（中庭の真ん中へ。SB-2044） |
| `fortress-bomb` | `wardenDown` | `objective bomb-fortress`・`radio m1.bomb-armed`（陸側の壁の弾薬庫に仕掛けられる。SB-1860） |
| `fortress-down` | `fortressDown` | `flag fortress-down`・`cutscene fortress-blast`・`checkpoint cp3`・`objective silence-battery`・`spawn battery`（爆発で壁が崩れ、奥の超重砲が目標になる。SB-1860）・`allyMove cover-b1/b2/b3 field-run-1/2/3`（壊れた陸側の門を抜けて砲台の手前の野原へ。SB-2044） |
| `fortress-out` | `enter fortress-out` | `radio m1.get-out`（cp3 と目標と砲台の波は `fortress-down` へ移した） |
| `gun1` | `destroyed main-gun-1, main-gun-2`（どれか1つ） | `radio m1.gun1-down` |
| `shutter` | `destroyed main-gun-1, main-gun-2`（全部） | `flag shutter-open`・`objective hit-magazine` |
| `win` | `destroyed magazine` | `cutscene beach-held`・`end cleared` |

`cp1` の動きは無線 → 旗 → チェックポイントの順で、チェックポイントのコピーは cue の全部の動きの後に取るので、旗 `pillboxes-down` もコピーに入る（8章「チェックポイント」）。味方の `allyMove` はチェックポイントの後に置いてあるが、同じく全部の動きの後にコピーを取るのでコピーに入り、やり直しで同じ道を二度走らない。旗は段階3の歩兵ドロイドの前進（s3-3）が読む。

場所は手書きのマップ `M1B_HAND`（奥行き 470m・幅 200m、z −300〜170）に合わせた座標で、+z が海（マップの形と目標の座標は9章「マップ」）。`b-line` は中心 z 135・奥行き 30（z 120〜150）、`line2-approach` は中心 z 91・奥行き 18（z 82〜100、線2の近い点の手前。ここに入ると味方機の援護射撃が始まる）、幅はどれも 200。`depot-approach` は中心 (77.5, −40)・幅 35・奥行き 40（x 60〜95・z −60〜−20。右の崖下、集積所へ下りる窪地）。`fortress-approach` は中心 (0, −61.5)・幅 70・奥行き 13（z −68〜−55、海側の門の手前）、`fortress-gate` は中心 (0, −65)・幅 14・奥行き 10（x −7〜7・z −70〜−60、海側の門）、`fortress-yard` は中心 (0, −98)・幅 58・奥行き 48（z −122〜−74、三方の壁の内側）、`fortress-out` は中心 (0, −140)・幅 70・奥行き 20（z −150〜−130、陸側の門を抜けた野）。マップに置く目標の一覧と座標は9章「マップ」。波は `beach-mortar`・`b-squad`・`b-emplacements`・`depot-guard`・`shelling`・`fortress-drop`・`yard-1`・`yard-2`・`yard-3`・`warden`・`warden-adds`・`battery`、旗は `depot-down`・`line1-open`・`line2-open`・`pillboxes-down`・`fortress-down`・`shutter-open`・`yard-1-clear`・`yard-2-clear`・`yard-3-clear`、目標は `reach-pillboxes`・`break-pillboxes`・`stop-fortress-gun`・`bomb-fortress`・`silence-battery`・`hit-magazine`、印は `depot`、味方は `buddy`・`cover-b1`・`cover-b2`・`cover-b3`・`gunner`、道は `beach-run`・`b1-wait`・`b2-wait`・`b3-wait`・`gunner-wait`・`b1-run-l1a`・`b2-run-l1a`・`b3-run-l1a`・`b1-run-l1b`・`b2-run-l1b`・`b3-run-l1b`・`gunner-run-l1a`・`gunner-run-l1b`・`c1-run-l2a`・`c1-run-l2b`・`c2-run-l2a`・`c2-run-l2b`・`c3-run-l2a`・`c3-run-l2b`・`boss1-run`・`boss2-run`・`boss3-run`・`yard-cover`、場所は `beach-mid`・`b-mid`。道と場所の座標は `M1` の `paths`・`places`（`MissionDef`）に置く: `beach-run` は (-13.3,177)・(-13.3,170.2)・(10,166)・(24,156)・(44,156)・(44,151) を順に通り（最初の2点が左舷の艇の甲板とランプの下、残りは z 154 の低い壁を避ける）、`beach-mid` は (44,151)。`b1-wait` は (-12,177)・(-12,170.2)・(0,166)・(24,156)、`b2-wait` は (-10.7,177)・(-10.7,170.2)・(-5,164)・(20,156)、`b3-wait` は (10.7,177)・(10.7,170.2)・(20,164)・(28,156) で、3機は線1の海側で待つ。`gunner-wait` は (13.3,177)・(13.3,170.2)・(47,154) で、`gunner` はここで4機と待つ。甲板とランプの下の点は仮（艇の寸法は `CRAFT_TUNE`。両隣の艇の中心は x −12 と 12、甲板の3機は 1.3m 間隔）。線1の道は最初の穴で選ぶ: l1-a（x -55）は `b1-run-l1a` (24,156)・(-48,156)・(-55,146)・(-55,106)・(-48,106)・(0,110)・(20,110)、`b2-run-l1a` (20,156)・(-48,156)・(-55,146)・(-55,122)・(0,122)・(30,118)、`b3-run-l1a` (28,156)・(-48,156)・(-55,146)・(-55,122)・(0,122)・(40,126)・(55,129)。l1-b（x 40）は `b1-run-l1b` (24,156)・(36,156)・(40,150)・(40,122)・(20,120)・(20,110)、`b2-run-l1b` (20,156)・(36,156)・(40,150)・(40,122)・(30,118)、`b3-run-l1b` (28,156)・(36,156)・(40,150)・(40,122)・(55,129)。`gunner-run-l1a` は (47,154)・(47,158)・(-48,158)・(-55,146)・(-55,106)・(-48,106)・(-30,106)・(0,120)・(45,112)、`gunner-run-l1b` は (47,154)・(40,146)・(40,122)・(45,112) で、`b-mid` は (45,112)。C への道は線2の最初の穴の x（l2-a は -10、l2-b は 50）で決まり、投稿（`cover-b1` は (20,110)、`cover-b2` は (30,118)、`cover-b3` は (55,129)）から (0,98)・(l2x,98)・(l2x,58) を通る（(30,110) の残骸と (20,104) の塊を海側でよける。`cover-b3` だけは (20,118) を先に通る）。穴を抜けたあとは、l2-a は `cover-b1` が (0,44)・(0,20)・(0,6)、`cover-b2` が (0,44)・(0,20)・(-7,6)・(-7,1)、`cover-b3` が (40,46)・(40,20)・(45,9) へ、l2-b は (10,40)・(0,20)（c1・c2。c2 はさらに (-7,6)・(-7,1)）と (40,46)・(40,20)（c3）を通って C の投稿へ走る（(30,54) の塊、(10,44) の塊、(0,0) の塊、(45,3) の残骸を避ける）。`boss1-run` は (0,6)・(35,-4)・(35,-20)・(35,-30)・(35,-46)・(35,-58)・(20,-60)・(0,-62)・(0,-68)・(0,-95)、`boss2-run` は (-7,1)・(-7,8)・(35,-4) から同じ道を通って (0,-95)、`boss3-run` は (45,9)・(35,9)・(35,-20) から同じ道を通って (0,-95)。(35,-4) は、沈んだ pillbox-2 の箱（x 16〜28・z −19〜−11）を避けて x 35 の開けた所へ出る点。ボスの道は C の x 35 の突破口から海側の門（x 0, z −68）を抜けて中庭（x 0, z −95）へ入る。座標は仮。

#### 集積所（道の上の目標）

弾薬庫は道の上の普通の目標で、問いも選択も損耗も無い（SB-2046。SB-1820 の寄り道の選択をやめた）。cp1 の10秒後に `shelling-start` が砲撃を始める。

- 守り: 右の `depot-approach`（x 60〜95・z −60〜−20）に入ると、cue `depot-guard` が `depot-guard`（量産機3・機銃座1）の波を出し、`depot` の印を地図に出す。入る時が cp1 の前でも後でも同じ。`depot` を壊すと `depot-down` が立つ（立った後は入っても出ない）。効くのはこの旗だけで、入っただけでは弱くならない
- 通り過ぎる道: 壊さずに要塞へ進んでもよい。何も失わず、要塞の門（`fortress-gate`）は機関砲を倒すと開く（SB-2300。旗は待たない）。味方機の `cover-b3` も倒れない
- `depot-down` の効き: `BARRAGES.shelling` の間隔が1.6倍（`slow`）、弾薬庫の報酬 2,000cr が付く。沈む艇の数は L10、中庭の援護は L5。報酬の式は変えない
- 台本の仕組みで残したもの: action `rearm`（area に入った記録を忘れる。今の M1 は使わない）と、cue の `when`・`unless`。ほかの場面で使える。action `loss` と `GameModel.losses` と結果の損耗の行はやめた
- 値: `DEPOT_CHOICE_TUNE` in `src/data/fortress.ts`（`shellingSec` 10。仮）。`#view-breach` の調整パネルで触る


### チェックポイント

- `checkpoint` は台本の状態を深いコピーで残す。コピーを取るのは、その cue の動きを全部当て終わってから（M1 の `fortress-gate` は cp2 のあとに味方機の次の道を出すので、途中で取ると戻したときに出ない）。コピーの `cutscene` は null にする（`fortress-down` はカットシーンのあとに cp3 を取るので、そのまま戻すと `fortress-blast` を再生してしまう。SB-1860）。保存しない項目はチェックポイント自身だけで、前のチェックポイントを入れ子にしない
- `restoreCheckpoint` は最後のチェックポイントの深いコピーを返す。取った時点より後の cue は発火していない状態に戻る。戻した状態も同じチェックポイントを持つので、戻ったあとにまたやられても同じ所へ戻れる
- `checkpointReplay` は、戻したあとに画面を組み直す出来事（今の目標、出ている地図の印、出してまだ倒していない波）を返す。状態は出した波を `spawned` に持つ
- 報酬はチェックポイントで確定しない（ミッションの終わりでまとめて決める）

#### 本体のチェックポイントとやり直し

台本が `checkpoint` を出すと、本体も自分の状態を残す。やられたら、そこからか最初からやり直せる。定義場所は `GameSnapshot`・`retryFromCheckpoint`・`restartGame` in src/logic/game.ts。

- 取る所: `applyScriptOut` が、そのフレームの台本の出来事を全部当て終えたあとに、`checkpoint` の出来事があれば `GameModel.checkpoint` に深いコピー（`structuredClone`）を取る。cue の `spawn` が同じフレームにあっても、出した敵がコピーに入るため
- コピーの形: `GameSnapshot` は `GameModel` から保存しない項目を除いたもの + 取った id。除く項目は `events`（空）・`bullets`（飛んでいる弾は持ち越さない）・`checkpoint`（入れ子にしない）・`battle`・`battleTune`（戦場の層。区画の待ち線から作り直す）。項目を足したときは、除く項目に書かない限りコピーされる。区画 `sectors` はコピーに残る。`map` と `mission` は書き換えない定義なので、コピーせず同じものを指す。爆破点 `blasts`・仕掛けた爆薬 `charges`（導火線の残り）・長押しの途中 `plant` もコピーに残る（SB-1500）。要塞の爆破で崩れた物 `brokenProps` も残り、戻すと壁は崩れたまま（SB-1860）
- `retryFromCheckpoint(game)` は、コピーをもう一度深くコピーして新しい `GameModel` を返す（元は変わらない）
  - 戻る: 機体の位置・時計・敵（波は出し直さない）・目標・壊せる物・台本（`restoreCheckpoint` と同じ中身）・無線（今出している行 `radio` と、その次に出す列 `radioQueue` を同じ順で戻す）・味方の機体 `allies`（走っている位置・足元の高さ `y`・道と次の点・叫んだか `called`・落ちた印。取ったときが走っている途中なら、そこからまた走って落ちる）・爆破点 `blasts`・仕掛けた爆薬 `charges`（導火線は取ったときの残りから続く）・長押しの途中 `plant`（そこから押し続けると仕掛かる）・狙う迫撃砲 `aimed`（`anchor`・`still`）・崩れた物 `brokenProps`（壁は崩れたまま）
  - 満タンに戻る: 装甲（`MECH_TUNE.armor`）、メインとサブの弾数と待ち（`M1_LOADOUT` の表）。`downed`・`cleared` は false、`fcs` は新しく、`aimTarget` は null、`bullets` と `shells` は空（着弾予告は持ち越さない）。砲撃 `barrages`・地雷 `mines`・砲台の状態（`shutters`・`battery`。機銃の待ちと動き出したか）・トーチカの状態（`pillboxes`。待ち `wait` はコピーのまま、予兆 `warn`・連射 `shots`・`shotWait`・制圧 `suppress` は 0 に戻す）はチェックポイントのまま
  - `retries` は前の値 + 1（やり直した回数。修理費と弾の積み直しの請求は SB-210 が使う）。`checkpoint` は同じものを持つので、続けてやられても同じ所へ戻る。`events` は `{ kind: 'retried', from: <id> }`
  - チェックポイントが無いときは例外
- `restartGame(game)` は `newGame(game.map, game.mission, { battleTune: game.battleTune })` で最初から。`retries` は前の値 + 1、`events` は `{ kind: 'retried', from: null }`、`checkpoint` は null

### 本体とのつながり

- 本体が台本に渡す入力: 壊れた目標の `destroyed`、入った場所の `enter`、爆破点の `blast`、機体が艇を降りたとき一度だけの `ashore`、波の敵が全部倒れたときの `cleared`、中ボスの爆発の `wardenDown`（出来事から1回）、要塞の爆薬の `fortressDown`（`fortressBlast` から）
- 台本の出来事を本体が受ける所: `radio` は最後の1行を覚える、`spawn` は波の敵を出す、`ally` は味方の機体を出す、`allyMove` は出ている味方機の道を替える、`end` で出撃が終わる、ほかは出来事に残すだけ
- 味方の機体が落ちたことは台本に返さない（台本の trigger に味方の種類が無い）。本体の出来事 `allyDown`（`id`・`x`・`z`・`by`）で画面に知らせる。倒れる前の無線は `allyCall`（`id`・`line`）で、これも画面には使わない（`queueRadio` が無線の列に積む）
- M1 の `main-gun-1`・`main-gun-2`・`magazine` は `M1B_HAND` の要塞の先（z −235・−250）にあり、撃って壊すと台本に `destroyed` が渡る。`fortress-gate` は海側の門（x 0, z −68）、`fortress-yard` は三方の壁の内側、`fortress-out` は陸側の門を抜けた野（z −150〜−130）で、x 0 を歩いて門を抜けると入る。海側の門から台本の終わりまでは `test/integration/battery.test.ts` が入力で通す
- カットシーンの間の入力と、カットシーンの画面は、8章「カットシーンの演出」

### カットシーンの演出

台本の `cutscene` の間、カメラの通り道・文・見た目の出来事・戦場の時計を止めるか（`holdsBattle`。`landing` だけが持つ）を表で持ち、上下に黒い帯を出して流す。定義場所は `CUTSCENES` in src/data/cutscenes.ts（表）、`cutscenePose`・`keyPose`・`cutsceneLine`・`cutsceneEvents`・`cutsceneMech`・`cutsceneSail`・`cutsceneElapsed`・`sinkBlastZ`・`riderFall`・`hasCutscene` in src/logic/cutscene.ts（時刻から引く純粋な関数）、`buildCutsceneView`・`drawCutscene` in src/view/cutscene.ts（帯・カメラ・艇・着弾・砲台の崩れ・同乗者）、`buildRiders`・`drawRiders` in src/view/riders.ts（甲板の同乗者ドロイド。形は浜の歩兵と同じ）、`LANDING_RIDERS` in src/data/landing.ts、`SOLDIER_POSE` in src/data/soldiers.ts（浜の歩兵ドロイドと共通の姿。体の高さと頭の高さ、仰向けに倒れたときの体の高さ。頭は首の上に載ったまま一緒に倒れる）、`armSkip`・`takeSkip` in src/app/skip.ts（飛ばす）。

- 表（`CutsceneDef`）: カットシーンの id ごとに、時刻は流し始めからの秒で持つ
  - `camera`: キーフレームの列 `{ at, pos, look, rel? }`（時刻・カメラの位置・見る点。マップの座標）。最初のキーより前は最初の姿勢、最後のキーより後は最後の姿勢
  - `rel: true` のキーは、`pos` と `look` の x・z が機体の x・z からの差（y は高さのまま）。機体がどこにいるか決まっていないカットシーン（`wave2-sinks`・`fortress-blast`）で機体の位置から始めて機体の位置に戻すためと、艇が浜へ進む `landing` で絵を艇に合わせるために使う。`cutscenePose(id, elapsed, mech)` が `keyPose` でマップの座標にしてから混ぜる（`rel` のキーがあるのに `mech` を渡さなければ例外）。画面は、機体の道があれば `cutsceneMech` の描く位置（導入では艇と一緒に進む）、なければ `game.mech` を渡す
  - `mech`（省略可）: 機体の道 `{ at, pos }` の列（時刻・足元の位置。マップの座標）。キーとキーの間は直線を一定の速さで歩く。最初のキーより前は最初の位置、最後のキーより後は最後の位置に立つ。省くと機体を描かない。`landing` だけが持つ。その道は甲板の1点（x 0・y 1.8・z 177、`newGame` の `game.mech` と同じ位置）だけで、`sail` の間は `cutsceneSail` のぶんだけ海側へずらして描くので、機体は甲板に立ったまま艇と一緒に浜へ進む。脚は振らない（速さ 0。unit テストが比べる）
  - `lines`: 文の時間割 `{ from, to, key }`（出す秒・消す秒・言語キー）。重ならない。間は何も出ない
  - `events`: 見た目の出来事。座標はマップの座標
    - `sail`: 始まりの艇と両隣の2隻が、`from` m 海側から `sec` 秒かけて今の場所（浜）へ同じ速さで進む。`cutsceneSail` が経過秒から海側への残り距離を返し、艇・ランプ・同乗者・味方機・機体の絵がそろって進む
    - `sink`: `x`・`z`（艇の船体の始まり。省くと始まりの艇の z）の艇が `sec` 秒かけて傾いて沈む。沈み始めに艇の中ほどで爆発する。`sail` のある表では、`at` まで3隻と同じ列を同じ速さで進み、`at` の場所で止まって沈む
    - `arrive`: `x`・`z` の艇が、`from` の z から `sec` 秒かけて進んで着く
    - `burst`: `x`・`z` に砲弾が落ちて爆発する（`spawnBoom('large', ...)` in src/view/boom.ts）
    - `collapse`: `targets`（ミッションの物の id）が `sec` 秒かけて沈んで傾く
    - `ramp`: 始まりの艇のランプが `sec` 秒かけて上がった形から下りる
    - `riders`: `ids`（`LANDING_RIDERS` の id）の同乗者が `sec` 秒かけて甲板に倒れる
    - `tracers`: `(x, z)` へ `n` 本の機銃の曳光が飛び込む（出どころ・高さ・速さ・散らばりは `LANDING_TUNE.tracer`）
  - 表の時刻は `CUTSCENE_SEC`（8章「動き」）を超えない。`landing` の最後のキーは `CUTSCENE_SEC` ちょうどにして、機体の始まりの位置から x +2.15・y +4.4（足元から）・z +8.6、見る点 x +2.15・y +2.9・z 0 に固定する（unit テストが定数と比べる）。操作が戻ると、その姿勢から `followQuarter` が見下ろしへ寄せる。`wave2-sinks` は防波堤の上を見せるため合わせず、最後のキーで止めて終わると、その姿勢から本体の見下ろしへ切り替わる。`beach-held` は結果の画面へ進むので合わせない。`fortress-blast` の最後のキーは三人称の姿勢のままにしてあるが、本体は見下ろしなので 0.5m の比較はしない（実装して絵で見る。SB-1860）
- カメラ: キーとキーの間は、時刻をなめらかに（`u*u*(3-2u)`）して位置と見る点を線形に混ぜる。そのためキーの時刻ちょうどは、そのキーの値で、前後で速さが 0 になる。画角は `FOV_TUNE.cutscene`。カットシーンが終わると、次のコマから本体のカメラに戻る。カットシーンの間、本体のカメラの追従の始まり（`view.quarter.pose`）はカットシーンが今映している三人称の姿勢にしておき、操作が戻った最初のコマから `followQuarter` で見下ろしの位置へ寄せる。そのため三人称の姿勢から見下ろしへ跳ばず、`lag` の速さで動く
- 文: `cutsceneLine` が今の秒の言語キーを返す（なければ null）。下の帯の中に、`t(key)` の文字で出す
- 見た目の出来事: `cutsceneEvents(id, from, to)` は `from` より後で `to` 以前の出来事を返すので、コマごとに呼ぶと各出来事は1回だけ出る。画面はこれで爆発を出す。爆発は `explosionLarge` を、カットシーンのカメラからその場所までの距離の gain と pitch で鳴らす（艇の爆破・着弾・水柱とも。`blast` in src/view/cutscene.ts）。`tracers` は `view/battle` の `Battle.tracer(at, velocity)` を呼び、`view/battle` が持つ線（`tracerMesh`）を使い回す（新しい線・材質を作らない）。`riders` は `view/riders.ts` が読み、音も出さない。文が変わったフレームは `radio` を1回鳴らす。`SoundName` は増やさない。艇の沈み方・着き方・ランプの角度・物の崩れ方・同乗者の倒れ方は、経過秒と表の `at`・`sec` から毎コマ決める（見た目だけで、当たり判定・マップの検査には入らない）
- 帯: 上下に高さ 12vh の黒い帯（`#sbCutscene`。`#view-hud?cut=1` の見本の帯に合わせる）。文は下の帯の中の真ん中。カットシーンの間は HUD（`#sbPlayHud`）とタッチの層（`#touch`。タッチの端末で出している間だけ）を隠し、終わると出す。隠すときに押しっぱなしのスティック・視点・ボタンは離した扱いにする（`releaseTouch` in `src/app/touch.ts`。終わった瞬間に歩いたり撃ったりしない）。タップで飛ばすのは window で受けるので、隠れていても飛ばせる。帯は `pointer-events:none`
- 海の艇: 表の `sink`・`arrive` の数だけ、始まりの艇と同じ作り（`buildCraft` in src/view/shore.ts）の艇を置く。そのカットシーンの間だけ見え、`sink` は沈み終えると消える。プレイヤーの艇の両隣の、味方機を乗せた艇は `buildShore` が同じ `buildCraft` で置き、導入の外の画にも見え、沈まずに浜に残る（艇の名は `craftAllyPort`・`craftAllyStarboard`）。`sail` の間は `drawCutscene` が3隻の艇の z を同じだけ動かし、両隣のランプも始まりの艇と同じ角度にする（導入の外では3隻とも下りた形）。物の崩れ（`collapse`）は、`buildCutsceneView` が渡された `world.targets` の模型の高さと傾きを動かす（`COLLAPSE_DEPTH` 3m・`COLLAPSE_TILT` 0.35 rad。1つおきに逆へ傾く。崩す物の id が無ければ例外）。始まりの艇のランプは別のメッシュ（`${CRAFT_NAME}Ramp`）で、カットシーンの外では下りた形
- 入力: 台本の `cutscene` の間（`game.script.cutscene` が null でない間）は、`step` が機体に何も押していない入力を渡す。動かず、撃たず（メインもサブも）、ジャンプもブーストもしない。台本が最初の `stepScript` でカットシーンに入るので、出撃の最初の1コマだけは入力が通る
- 止まるものと進むもの（`stepEnemies`・`stepPillboxes`・`stepBattery`・`stepHazards`・`stepAllies`・`stepBullets` in `src/logic/game.ts`）: 表にあるどのカットシーンの間も、次のとおり
  - 台本の時間: 止まらず進む（`after` の秒も数える）
  - 砲撃の予告: `game.barrages` と狙う迫撃砲（`game.aimed`）は数えず、着弾予告を出さない（`stepHazards` in `src/logic/game.ts`）。もう予告した砲弾は落ちる。機体が艇の上（`mech.z` が `map.bounds.maxZ` より大きい）間も同じく数えず、ランプを降りた所から数え始める（機体が動けない間や艇の上にいる間に被弾しないため）
  - 敵: `stepEnemies` は止まり、歩かず撃たない（`y` が 0 より大きい敵も、カットシーンの終わりまで降りない）
  - トーチカ: `stepPillboxes` は止まり、予兆も撃ちもしない
  - 砲台: `stepBattery` は止まり、機銃を撃たない
  - 味方機: `stepAllies` は止まり、その場に立つ
  - 弾: `stepBullets` は止まらず進む。機体で止まった弾は装甲を減らさず（`damageMech` in `src/logic/game.ts`。機体が動けない間に倒されないため）、被弾の音（`mechHit`）も鳴らさない
- 機体: 表に `mech`（機体の道）があるカットシーン（`landing`）の間は、模型を道に沿って描く。`landing` の道は甲板の1点（x 0・y 1.8・z 177、`newGame` の機体と同じ所）だけで、`sail` の間は `cutsceneMech` が `cutsceneSail` のぶんだけ z を海側へずらす。機体は甲板に立ったまま艇と一緒に浜へ進み、ランプが下りるのを見る。歩かないので脚も振らない（`cutsceneMech` in `src/logic/cutscene.ts` が位置と地面の上の速さを返し、`drawMechWalk` in `src/view/mechDrive.ts` が `mechMotion` の歩きにその速さを渡す）。見た目だけの動きで、ゲームの機体（`game.mech`）は始まりの位置のまま動かさない。飛ばし・チェックポイント・中断で整合を取る必要がなく、飛ばすと次のコマから模型はゲームの機体（始まりの位置）に戻る。機体の道が無いカットシーン（`wave2-sinks`・`beach-held`・`fortress-blast`）の間は、模型を描かない（`drawPlay` in `src/view/play.ts`）
- 飛ばし方: クリック・タップ（`pointerdown`）・Enter・Space・Esc のどれでも飛ばせる。出撃の開始より前の押し込み（出撃を始めたクリックや Enter）と、押しっぱなしの繰り返し（`repeat`）は数えない。始まって `CUTSCENE_SKIP_GUARD_SEC`（0.4 秒）の間は飛ばさず、その間の押し込みは捨てる（同じフレームの Space・射撃・Enter が始めたカットシーンを1コマで飛ばさないため。`CUTSCENE_SKIP_GUARD_SEC` in `src/data/script.ts`、`update` in `src/app/play.ts`）。ポインターロックは使わないので、Esc の `keydown` がそのまま飛ばしの要求になる。`update` が `step` の後に要求を取り、`game.script.cutscene` があれば台本に `skip` を渡す（`cutsceneEnd` が出て、次のコマから本体のカメラと HUD）。飛ばしても台本の状態は、最後まで見たときと同じ（台本の時計だけ、見た秒の分だけ小さい）。飛ばしたマウスの押し下げは、離すまで撃つ入力にしない（`holdMouseFireUntilRelease` in `src/app/keyboard.ts`）
- 中断から戻ったとき: カットシーンの途中なら、`CutsceneView` をその秒から始めるので、過ぎた見た目の出来事は出し直さない（`buildPlayView` in `src/view/play.ts`、`elapsed` in `buildCutsceneView` in `src/view/cutscene.ts`）。始まったばかりのカットシーンは -1 から始め、0 秒の出来事を1回出す（`cutsceneElapsed` in `src/logic/cutscene.ts`）
- 表に無いカットシーン: 表の無い id は流さず、`update` が `step` の直後に台本へ `skip` を渡すので、描かれる前に終わる。台本の出来事（`cutscene` と `cutsceneEnd`）は出る
- やり直し: 最初からのやり直し（`restartGame`）は台本が最初に戻るので、また流れる。チェックポイントからのやり直しは、`intro` が済んだ状態に戻るので流れない
- 文言: `cutscene.landing.wave`・`cutscene.landing.hit`・`cutscene.landing.shell`・`cutscene.landing.ramp`・`cutscene.landing.sweep`・`cutscene.wave2.hit`・`cutscene.wave2.none`・`cutscene.held.silent`・`cutscene.held.landing`・`cutscene.blast.fall`・`cutscene.blast.gun`（ja・en）
- `landing`（12 秒）: 0〜5.4 秒は艇の外の画。カメラのキーはすべて機体（甲板の x 0・z 177）からの相対で、`sail` の間は3隻と一緒に浜へ進む。0 秒 自分の艇を画の真ん中に置いた後ろ斜め上（x 7・y 12・z +47、見る点 x 0・y 2.4・z +3）→ 2 秒 左へ振って艇の列（x −1・y 11・z +41、見る点 x −30・y 2・z +1）→ 4 秒 左舷の艇が沈む所（x −8・y 10・z +31、見る点 x −42・y 2・z +2）→ 5.4 秒 自分の艇へ戻る（x 1・y 8.8・z +23、見る点 x 0・y 2.8・z +3）。切らずに 6.6 秒 船尾の上（x 0.9・y 7・z +12、見る点 x 0.3・y 3.2・z +1）→ 7.4 秒 艇の中の機体の後ろ・少し上（x 0.9・y 4.9・z +4.2、見る点 x 0.4・y 3.4・z −2.4）へ入り、8.4 秒 少し寄る（x 0.6・y 4.7・z +4.5、見る点 x 0.2・y 3.2・z −2.8）→ 10.8 秒 ランプが下りきる（x 2・y 4.6・z +4.2、見る点 x 0.8・y 3.2・z −2.4）→ 12 秒 最後のキー（x 2.15・y 6.2・z +8.6、見る点 x 2.15・y 4.7・z 0）。中に入ってからは前（ランプ）を向いたままで、真横を向くキーは無い。艇は3隻が x −12・0・12（船体の間 5m）で同じ列に並び、0 秒から 8.4 秒まで 45m 海側から同じ速さで進んで同時に浜へ着く。カメラは操舵室の箱（艇の x ±1.5・z 182.5〜185.5・y 1.7〜4.3。`CRAFT_TUNE.wheelhouse` と `craftZ`）と船尾の壁（上端 4.7m）に入らず、艇の中のキーは機体の胸から 4m 以上離す（unit テストが 0.05 秒ごとに、動く艇の箱で見る。機体が半透明にならない）。文は 0.4〜2.8 秒「第1波、上陸」、3.6〜5.4 秒「2番艇、被弾」、6.6〜8.0 秒「至近弾」、8.6〜10.2 秒「ランプ、下ろせ」、10.9〜11.8 秒「機銃、掃射」。出来事は、列の3隻が x −36（z 171）・x −48（z 173）・x −24（z 175）で、1.2 秒に x −36・z 215.6 へ、2.2 秒に x −48・z 212.2 へ着弾して、それぞれ 1.3 秒から 1.8 秒、2.3 秒から 2.0 秒かけて沈み、3.2 秒に左舷のすぐ横の艇（x −24）が 2.2 秒かけて沈む（3隻とも外の画の中で沈み終わる。着弾と沈みの z は 3隻の z に合わせた仮の値）。沈む3隻には乗員が乗る（`SINKING_CREWS`・`SINKING_CREW_TUNE` in `src/data/landing.ts`。値は仮）。歩兵ドロイドが x −36 の艇に 6 体・x −48 に 7 体・x −24 に 8 体と、x −24 の艇に味方機 1 機（型は `allyKit`。台本で決まっていないので、味方の既定の `sniper`）。歩兵は遠い形（`soldierMeshes` の `far`）の1組の `InstancedMesh` を全艇で分け合い、艇の甲板の上で、艇の沈み（y）と傾き（`rotation.z`）に付いて動く。着弾のとき、船体の中ほどから `blastRadius`（2.8m）以内の歩兵は海へ投げ出され（横・上・少し舳先へ。落ちながら回る）、残りは艇と一緒に沈む。味方機は着弾のあと傾いて舷の外へ滑り、艇の沈みに付いて下りる。歩兵は頭の上端（体の傾きで回した先）が水面（`SEA_LEVEL`）の下に入るまで描き、全員が沈んだら描かない。味方機は水に隠れたら `visible = false` にする。導入（`landing`）の間だけ描く見た目だけの動きで、ゲームの状態は書かない（`drawSinkingCrews` in `src/view/sinkingCrews.ts`。カットシーンの view を外すとき `removeSinkingCrews` が geometry と材質を `dispose` する）。9.2 秒から3隻のランプが 1.6 秒かけて同時に下りる。同乗者のドロイドは甲板の前寄りに6体（`LANDING_RIDERS`）いて、6.4 秒に左舷の舳先の海（x −6・z 185.7）へ着弾すると r1・r5 が倒れる。この着弾は上がったランプの陰で見えず、揺れ・音・同乗者の倒れで伝える。ランプが下りきったあとの 11.0〜11.4 秒に機銃の曳光（`tracers`）が艇の中へ飛び込み、r2・r3 が倒れ、11.2 秒の曳光が着いたあとの 11.6 秒に r4 が倒れる。r6 は立ったまま。倒れ方は `riderFall` が決め、浜の歩兵ドロイドと同じ `SOLDIER_POSE` を使う（見た目だけで、機体は傷つかない）。最後の1.5秒（10.5〜12 秒）には着弾（`burst`）も沈む艇（`sink`）も置かない（揺れが残ると最後のキーとの差が 0.5m を超える）。機銃の曳光と同乗者の倒れは揺れないので、ランプが下りきったあとの 11.0〜11.9 秒に置き、11.5 秒以降には爆発も曳光も置かない。機体は 12 秒まで甲板（x 0・y 1.8・z 177、`newGame` の機体と同じ所）に立ったままで、操作はランプが下りたあとの 12 秒に渡る。味方機5機は両隣の艇の甲板にいて、操作を渡したフレームから自分のランプを降りて道に入る
- `wave2-sinks`（6 秒）: 表だけがあり、M1 の台本のどの cue も流さない。カメラは 0 秒 機体の後ろ（x 0・z +10・高さ 7、相対）から海を見る → 1.8 秒 浜の端（z 150）から沖の艇の列 → 3.6 秒 浜の端（z 165）でさらに近く → 5.2 秒 機体の後ろ（x 2.15・z +14・高さ 9、相対）から防波堤の方（z −50）を見て、6 秒まで止まる。艇は4隻（x −40・−14・16・42、z 205・222・208・226）で、1.4・1.9・2.4・2.9 秒に 1.8 秒かけて沈み、その 0.2 秒前に近くへ着弾する。文は 0.6〜3.2 秒「第2波、被弾」、3.4〜5.9 秒「後続、来ず」
- `beach-held`（8 秒）: 台本の `win`（弾薬庫を壊した）で流れ、終わると結果の画面。カメラは 0 秒 要塞の陸側の門の先（x 0・z −140・高さ 14）から砲台（z −235〜−250）→ 3 秒 少し進んで（z −145）砲台 → 5 秒 浜（z 140）から海 → 8 秒 浜の上（z 110）から浜の奥（z 40）。最後のキーは結果の画面へ進むので本体のカメラに合わせない。出来事は 0.3・0.6・1 秒に主砲 2 基（x −45・45, z −235）と弾薬庫（x 0, z −250）へ着弾、0.8 秒から 2.2 秒かけて主砲 2 基（`main-gun-1`・`main-gun-2`）と弾薬庫（`magazine`）が沈む、3.2 秒に x −35（2.5 秒かけて z 230 から）、3.6 秒に x 40（z 240 から）の艇が浜（z 175）へ着く。文は 0.5〜3.5 秒「砲台、沈黙」、4.5〜7.5 秒「上陸、再開」。浜の歩兵ドロイドは戦場の層（`view/battle/`）の味方が歩いているのをそのまま映す
- `fortress-blast`（10 秒）: 台本の `fortress-down`（要塞の爆薬が爆発した）で流れ、終わると操作に戻る。カメラのキーはすべて `rel: true`（機体の x・z からの差。機体は海側の門の外 z −58 あたり）。0 秒 海側の門の外から要塞（x 0・y 18・z −8、見る点は z −128）→ 3 秒 奥の砲座へ（y 14・z −14、見る点は z −240）→ 4 秒 海へ切り（y 16・z +178、見る点は z +258）、4.02 秒まで同じ姿勢を保つ（飛びにしない）→ 7 秒 海の艇（y 14・z +198、見る点は z +278）→ 10 秒 機体の後ろの三人称の姿勢（x +2.15・y 4.4・z +8.6、見る点は x +2.15・y 2.9・z 0）。最後のキーと本体カメラの 0.5m 比較はしない（`landing` のテストだけ）。出来事は 0.2〜2.8 秒に壁の3か所（x −30・0・30, z −120）・海側の壁（x ±24, z −71）・陸側の壁（x ±12, z −125）・中庭（x 0・±32, z −100）への `burst`、2.5 秒に海の艇（x 0, z 180）が 2 秒かけて沈む、6 秒に仮の超重砲（x 0, z −265）の `burst` と海の艇（x 30, z 184）の `sink`。文は 0.5〜3.6 秒「要塞、崩壊」、6.2〜9.4 秒「奥に大型砲」。崩れた壁は `game.brokenProps` から `syncWorld` が描き、カットシーンの `collapse` では動かさない。海の艇はカメラの z から 260m 以内に置く

## 9. マップ

M1 の浜・B トーチカ線・C・防波堤・要塞と砲台の場所（z −300〜170、x −100〜100）を、手書き・生成・簡易エディタの3つの作り方で同じ形のデータにする。決めるのは遊ぶ人と Claude で、どの作り方がよいかはこの仕様では決めない。

- `MapDef`（`src/data/types.ts`）は `id`・`bounds`（`minX`・`maxX`・`minZ`・`maxZ`）・`props`・`targets`・`spawns` と、省略できる `mines`（`MinePlace`: `x`・`z`）・`blasts`（`BlastPlace`: `id`・`line`・`x`・`z`・`target?`・`fuse?`・`after?`。6章「爆破点と爆薬」「要塞の爆破と脱出」）を持つ。`bounds` の外は作らない
- `Prop` は `kind`・`x`・`z`・`yaw`・`scale`・`breakable?`・`collapse?`。種類（`PropKind`）は `tile`（地面）・`hedgehog`・`block`・`bunker`・`seawall`・`cliff`・`crater`（低い凹み）・`wreck`（壊れた艇や車両）・`lowWall`（低い障害物）・`stairs`（防波堤へ上る階段1本）・`ramp`（防波堤へ上る坂1本）・`fortWall`（要塞の壁）。`breakable: true` は撃つと壊れる物の印、`collapse: true` は要塞の爆破で崩れる物の印（弾では壊れない。SB-1860）。体力は種類ごとに `PROP_HP`（仮）で、`hedgehog` 30・`block` 60・`bunker` 150・`seawall` 120・`wreck` 80・`cliff` 300・`lowWall` 40（`tile`・`crater`・`stairs`・`ramp` は 0。階段と坂は壊さない）。壊れると機体の当たりと弾の箱から外れて通れる。見た目は低い暗い残骸（`BROKEN_SCALE_Y`）で、`InstancedMesh` と描く回数は増えない
- `TargetPlace` は `id`・`kind`・`x`・`z`・`yaw` と、省略できる `y`（箱の下端の地面からの高さ。m。省略は 0）。種類（`TargetKind`）は `pillbox`・`depot`・`gun`・`magazine`・`fortressGun`（要塞の海側の壁の上の機関砲）。`spawns` は波の名前 → `SpawnPoint`（`x`・`z`）の一覧
- 見た目の質感（SB-1360。値はどれも仮で、`shots/surfaces.shots.ts` の3か所と `shots/surfaces-landing.shots.ts` の上陸直後の絵を見て決める）: 絵の値は `src/data/surfaces.ts`（種・大きさ・繰り返し・汚れの量・濡れの幅・波の速さ）、名前を付けた色は `src/data/colors.ts`（`DRY_SAND_COLOR`・`WET_SAND_COLOR`・`RUST_COLOR`・`BURNT_COLOR`・`FOAM_COLOR`・`SKY_TOP_COLOR`）。絵は `src/view/surfaces.ts` が engine の `defineTexture`・`defineMaterial`（engine の SPEC 7.3節）で描き、名前で引く。絵は起動後に1回だけ作り、毎フレームは作らない。node の単体テストには canvas が無いので、絵の無い材質に切り替える
  - 地面: `tile` は種類ごとの `InstancedMesh` をやめ、範囲を覆う1枚の平面（名前 `tile`）にする。UV はワールドの x・z を `SAND_SURFACE.repeatM`（12m）で割ったもので、砂の絵（粒・まだら・轍・足跡）がタイルの継ぎ目なく繰り返す。海の縁から `wetBand`（15m）は頂点色で `WET_SAND_COLOR` の比まで暗くし、奥は乾いた `DRY_SAND_COLOR` にする。地面は1回で描き、区画には分けない
  - 物: `block`・`bunker`・`seawall`・`lowWall`・`stairs`・`ramp` はコンクリートの絵（汚れ・雨だれの筋・欠け）、`hedgehog` は錆びた鉄、`wreck` は焦げた鉄。目標は `pillbox`・`magazine` がコンクリート、`gun` が錆びた鉄、`depot` が木。絵は灰色で、色は物の `instanceColor` か目標ごとの材質で付ける。コンクリートは 0x8a8780 のまわりの灰色に落とし、錆は 0x4a3f38 の暗い灰褐色に赤茶の斑点を混ぜる（周りのコンクリートより暗い）。大きさ・置き場所と、種類ごとに1回の描く回数は変えない（形は下の「防御物と艇の形」の範囲で作り込む）。坂は手で並べた形なので、UV を位置から作る（幅で u、上る向きと高さで v）
  - 海: 1枚の平面の頂点色を、曇りの日の荒れた海の灰緑〜灰青 `SEA_COLOR`（0x3d5560）から浜の白波（`FOAM_COLOR` 0x9aa5a3、幅 `foamWidth`・薄れ `foamFade`・揺れ `foamWobble`）へ変える。白波は幅 2.4m・薄れ 2.5m の細い線にし、白に飛ばないよう白そのものは使わない。平面の奥行きは `foamRows` の行に分け、1行を白波の幅の半分より細かくして、白波がぼかしではなく線に見えるようにする。波の絵は `waveSpeed` で流す（`onBeforeRender` で `offset` を書くだけで、毎フレーム絵は作らない）。海の描く回数は1回のまま
  - 空と光: トーンマッピング（`ACESFilmicToneMapping` と露出 `TONE.exposure` 0.85、`src/data/looks.ts`）は STORMBREACHER のページ全体に掛かり、確認用の入口（`#view-map`・`#view-boom`・`#view-fx` など）も同じレンダラーで描くので同じく掛かる。engine のレンダラーは他のゲームと共有なので、設定は `src/view/look.ts` の `applyToneBase` が `initRender` のあとに STORMBREACHER の側で行う。空はカメラの位置に付く大きな内向きの球（`toneMapped: false`・`fog: false`・`depthTest: false`）の縦グラデーションで、赤道（地平）は霧の色 `fogColor`、上は `skyColor` を `SKY_TOP_COLOR` へ `SKY_TOP_MIX` 混ぜた色にする。背景の絵（`scene.background`）はトーンマッピングを通るが、Lambert の霧はトーンマッピングの後に混ざるので、絵では地平で空と霧の色がずれる。球はトーンマッピングを通さないので、地平で霧と同じ値になる。絵は `src/view/sky.ts` が作り、色が変わったときだけ描き直す。太陽の向き（`BASE_LIGHTS.sunAt`）は横からにして、箱の面ごとに陰影を付ける（影の計算はしない）。上を向いた面の光は 1 を超えるので、露出を 1 未満にして白に飛ばさない
- 防御物と艇の形（SB-1470。値は `src/data/defenses.ts` の `DEFENSE_DETAIL`、色は `src/data/colors.ts` の `DEFENSE_COLOR`・`CRAFT_COLOR`。物の値は `PROP_SIZE` へ `fitBox` で合わせる前の長さ（m）、艇の値は実寸（m）。`#view-props` の調整パネルで変える。当たりの箱 `PROP_SIZE`・`TARGET_SIZE` は変えず、形はその外へ大きく出さない）
  - `hedgehog`: 3本の梁を L 字の断面（細い箱2枚）にし、交点に板を溶接した形。錆の絵はそのまま。1体の三角形は 84 に抑える
  - `bunker`: 胴と屋根の角を落とした（面取り）コンクリの塊。正面に横長の銃眼があり、奥は暗い箱、手前の柱と上下の枠で奥行きを出す。屋根に土嚢と草、左側面に暗い入口。壊れた物は同じ形のまま `BROKEN_SCALE_Y` で低く暗くする（形とは別）
  - 目標の `pillbox`（SB-2050）: `src/view/pillboxModel.ts` が頂点色つきの1つの形（約6,900三角形、1基1メッシュ・1回の描画）で作る。材質の色は中立のコンクリートの灰（`TARGET_COLORS.pillbox`）で、目標の印の赤は頂点色（屋根の縁の赤白の縞と、銃眼の上の赤い帯）に持たせる。銃眼は前の壁を実際にくり抜き（鉄の枠・庇・リベット・中の銃）、左の壁に入口と開いた扉、前に4段の土嚢、屋根に網・見張り台・通風管、壁に型枠の継ぎ目・ひび・欠けと鉄筋・雨だれ・瓦礫を付ける。銃眼の高さ・当たりの箱（12 x 6 x 8m）・爆破点は変えない。壊れた姿は同じ形を縮めて沈める（`syncWorld`）
  - `fortWall`（SB-2052）: `src/view/fortWallModel.ts` が頂点色つきの1つの形（1枚 約2,900三角形）で作る。21枚が1つの `InstancedMesh`・1回の描画で、チャンクには割らない（`WHOLE_KINDS` in `src/view/outdoor.ts`。割ると描く回数が増える）。面取りの土台・厚さ 5m の胴・窓の下の笠木・先細りの控え壁（足に黄黒の警告縞）・両縁に並ぶ胸壁・実際にくり抜いた銃眼（鉄の枠・庇・奥の暗がり）を、海側（+z）と中庭側（-z）に同じく付け、型枠の継ぎ目・打継ぎの溝・ボルト穴・砲撃の傷と出た鉄筋・ひび・雨だれ・錆・煤・投光器を足す。中庭側にははしごと安全かごがある。色はコンクリートの灰（`KIND_COLOR.fortWall`）への掛け率。高さ 12m・当たりの箱・2048 の透かしの対象外は変えない
  - 目標の `fortressGun`（SB-2052）: `src/view/fortGunModel.ts` が頂点色つきの1つの形（約7,400三角形）で作る。材質はトーチカと同じコンクリートの灰（`TARGET_COLORS.fortressGun`）で、鉄は暗い頂点色、目標の印の赤白の縞は甲板の縁。面取りの甲板・装甲の台座（斜めの前面・左右の翼に弾薬庫と発電機）・旋回輪と胴・八角の砲塔・5枚の盾（砲口が2つ）・二連の砲身（受け台・防盾・冷却の帯・砲口制退機）・弾帯・薬莢・後ろの射手の囲い（のぞき窓・はしご）・マスト・土嚢を付ける。砲口（箱の高さの 0.7 の所、海側の面）と当たりの箱（16×10×6m）は変えない
  - シャッター（SB-2052）: `src/view/shutterModel.ts` が板（`shutterPlateGeometry`）と巻き上げの機械（`shutterHousingGeometry`）を作る。板は厚い胴に箱割りの装甲板をリベットで留め、I 形の梁・斜めの筋交い・足の吊り棒と黄黒の縞・両側の案内溝・傷と錆を付ける。機械は上端に立つ巻き胴・歯車の箱・電動機・警告灯で、板の子の `Mesh` として付き、板が巻き上がっても高さを保つ（`rollShutter` in `src/view/world.ts` が板の縮みを打ち消す）。板が見えなくなれば機械も隠れる。大きさ・巻き上がる 0.9 秒は変えない
  - `block`・`lowWall`: 上の角（低い壁は端）を欠かし、欠けた所から鉄筋を出し、正面に細い割れを入れる。欠けは箱を2段に分けて作る（削る計算はしない）
  - `揚陸艇`（`src/view/shore.ts`）: 船体の側面に板の継ぎ目、ランプに桟・蝶番・鎖、操舵室に窓、船首に波よけ。船体・甲板・ランプの3つの `Mesh`（船体の group は2つ）は変えず、色は頂点色で分ける
  - どの作り込みも頂点色（`color`）で部品の色を分け、物は種類ごとの `InstancedMesh` 1つ、艇は共有の材質1つにまとめる。描く回数は種類ごとに1回のまま（前後の数は `test/e2e/battle.test.ts` で見る）、三角形だけが増える
- 物と目標の大きさは `src/data/props.ts` の `PROP_SIZE`（物）・`TARGET_SIZE`（目標）に置く。`PropSize` は `w`（x の幅）・`h`（高さ）・`d`（z の奥行き）・`blocks`（機体の通り道を塞ぐか）。物の大きさは高さ 8m・当たり半径 2m の機体を基準にする。機体は 4m・当たり半径 1m（`MECH_TUNE`）で、ジャンプの最高点は約 2.5m なので、対戦車障害物（3m）は跳んでも越えられない。描く形（`src/view/outdoor.ts`）も検査も当たりもこの表を読む。`breakable` の物は同じ形のまま色を少し赤っぽくし、種類ごとの `InstancedMesh` と描く回数は増やさない（`instanceColor`）
- 低い障害物 `lowWall` は 6×0.85×1m（`PROP_SIZE`）。段差 `MOVE_TUNE.stepHeight`（0.75m）より高く歩いては乗れないので、回り込む障害物になる。ジャンプのロジック（`MOVE_TUNE.jump`）の最高点は約 2.5m だが、本体の入力からはジャンプを出せないので越えられない
- 階段 `stairs`（`STAIRS_TUNE`・`STAIR_RISE` in `src/data/props.ts`）は幅 8m で、1つの物が段ごとの四角になる（`mapBlockers` が `STAIRS_TUNE.steps`＝9 の四角を出す。`propRects` in `src/logic/mapShapes.ts`）
  - 段は奥行き `STAIRS_TUNE.run`（1.5m）、1段の高さ `STAIR_RISE` は防波堤の高さ（`PROP_SIZE.seawall.h` 6m）を段の数で割った 0.667m で、段差 0.75m 以下。n 段目の `top` は `STAIR_RISE × n`、最上段は防波堤と同じ高さ。`scale` は幅・段の奥行き・高さに掛かる
  - `yaw` 0 で -z の向きへ上り、最も低い段が +z 側。`yaw` で段の並びごと回る（`yaw` π/2 で -x の向きへ上る）。壊れず（`PROP_HP` 0）、斜めの面の当たりは無い（四角は段ごと）。`blockingPropIndexes` は四角ごとに元の物の番号を返すので、階段は段の数だけ同じ番号が並ぶ
  - 見た目は段の箱ではなく坂（手前の上の辺を地面まで下げた箱）で、段ごとの `top` の奥の辺を通る。種類ごとに `InstancedMesh` 1つで、描く回数は増えない
- 坂 `ramp`（`RAMP_TUNE` in `src/data/props.ts`）は幅 8m・長さ 18m・高さ 6m（防波堤と同じ）のくさび形で、1つの物が1つの四角になる（`mapBlockers` が `ramp: true` の四角を1つ出す。`propRects` in `src/logic/mapShapes.ts`）
  - `yaw` 0 で -z の向きへ上り、低い端が +z 側。`yaw` で坂ごと回る（`yaw` π/2 で -x の向きへ上る）。壊れず（`PROP_HP` 0）。四角の `top` は高い端の高さで、`logic/collide.ts` の `surfaceAt` が四角の上の位置から低い端の 0 へ線形に下げる
  - 機体の足元は `groundAt` が返す坂の面の高さをそのまま使う（段差 `stepHeight` は使わない）。坂の中央が四角の上にあるときだけ面を読み、`radius` の重なりでは読まない（低い端は地面から段なく入り、高い端は防波堤の上面に段なく続く）。坂の横の面はどの高さでも壁で、坂の上にいる機体は `pushOutCircle` が当たり半径の分だけ幅の内側に留める（低い端と高い端は面の高さに応じて通す）。
  - 傾きは `atan2(高さ, 長さ)` で約 18.4°。歩いて上がれる傾きの上限 `RAMP_TUNE.maxSlopeDeg`（20°）を超えたら物の表の検査（`test/unit/ramp.test.ts`）が落ちる。テストは 6m・18m・20° を値で持ち、上限を上げて通す形にはしない
  - 見た目は、低い端の辺から高い端の上辺へ上がる斜めの面と、両側の三角形の側面で、色と質感は階段と同じ。斜めの面は手で並べた頂点で法線を上向きにする
  - M1 での置き場所は下の「手書き」（`ramp`）。階段 `stairs` の種類はエディタと確認用の入口のために残す
- 目標の体力は `TARGET_HP`（仮。`pillbox` 100・`depot` 60・`gun` 200・`magazine` 80・`fortressGun` 300。武器の表の威力で減る。トーチカだけは弾で減らず、爆破点の爆薬でだけ壊れる（SB-2015。6章「トーチカ」）。SB-190 で決め直す）
- 目標の描画（SB-1550）: 目標は `buildTargets`（`src/view/outdoor.ts`）が id を名前にした `THREE.Mesh` で作り、位置 (x, y ?? 0, z)・向き yaw だけを持つ。`buildWorld` が `World.targets` に id で持ち、`syncWorld(world, game, dt)` が毎フレーム、体力 0 の目標を低く暗くする。トーチカだけは `PILLBOX_BREAK` に従って時間で沈み・傾き（6章「トーチカ」）、ほかの目標はその場で `WRECK_SCALE_Y`（0.35）・`WRECK_COLOR` になる。`World.breaks` は view だけが持ち、保存しない。壊れた目標の地面の四角の `top` も `TARGET_SIZE[kind].h × WRECK_SCALE_Y` にする（`damageTarget` in `src/logic/game.ts`）。`WRECK_SCALE_Y` の定義は `src/data/props.ts`。古い中断データの四角は読み込み時に、チェックポイントの四角は作るときと戻すときに直す（`lowerBrokenTargetRects`・`snapshotOf`・`retryFromCheckpoint` in `src/logic/game.ts`、`restoreSuspend` in `src/logic/suspend.ts`）
- 手書きは `src/data/maps/m1b-hand.ts`。範囲は x −100〜100・z −300〜170。物は1行に1つ書き、数を数える関数は置かない。目標は `pillbox-1`・`pillbox-2`・`depot` と、要塞の海側の壁の上の `fortress-gun`、砲台の `main-gun-1`・`main-gun-2`・`magazine`、波は `b-squad`・`b-emplacements`・`depot-guard`・`fortress-drop`。地雷は浜（z 148〜162、x −60〜60）に6個で、機体が艇を降りた所（x 0, z 166）から 6m 以上離す。爆破点は2本の線に2か所ずつ計4か所と、トーチカ2基に横・後ろの1か所ずつ計4か所、要塞の陸側の壁の弾薬庫に1か所（`fort-bomb`、x 0・z −119.5・`fuse` 20秒。6章「爆破点と爆薬」「トーチカ」「要塞の爆破と脱出」）。線2の点は、近い点 `l2-a`（x −10, z 75.5）が機銃座2〜3基の射線の真ん中に立ち、遠い点 `l2-b`（x 50, z 75.5）は x 25, z 78 の残骸の陰で射線の外れになる（SB-2020）。トーチカの点は `blast-pillbox-1-side`（x −41, z −15）・`blast-pillbox-1-back`（−33, −23）・`blast-pillbox-2-side`（30, −17）・`blast-pillbox-2-back`（21, −23）で、箱の外・地面の空いた所に置き、物は足さない。生成マップ（`M1B_RULES`）は爆破点を持たない
  - B は「二重の防御線」（SB-2020）: z 128〜146（線1）・z 62〜74（線2）に、それぞれ対戦車障害物を3列（列の間 4〜6m、同じ列の中は 4.4m 以下の間隔で均等に並べる）。2本とも切れ目が無く、各列の旧い突破口（線1 x −55・40、線2 x −10）と旧い壊せる区間（線2 x 50 前後）は埋めた。同じ列の中の隣との四角の距離は 2m 未満（最大 約 1.3m）で、当たり半径 1m の機体は爆破で穴を開けなければ列を抜けられない。爆破点は各線の海側の面の 2m 前に2か所ずつ（計4か所）あり、どれか1つを爆破すると `holeHalfWidth`（4m）× `holeHalfDepth`（10m）の四角のハリネズミが抜けて 9m 前後の穴が開く。爆破点のハリネズミは `breakable` ではなく、弾では壊れない。線1の爆破点の列から線2の爆破点の列までは約 71m、線2からトーチカ線までは約 91m ある（前は約 50m おきに3本だった）。C の手前（z −55〜−35）の2列は SB-1820 で外した（下の「C の手前」）
  - 防波堤は z −75〜−65 に `seawall`（8×6×4m）を z −73・−70・−67 の3列、x −96〜−40 と 40〜96 に 8m おきに並べる（3列は1m ずつ重なる）。中央の x −36〜36 は無く、そこに要塞の海側の壁と門が立つ。防波堤の上（高さ 6m）は残るが、M1 には坂も階段も無いので上れない
  - 要塞（`FORTRESS_TUNE` in `src/data/fortress.ts`）は外寸 70×60m・壁 12m 角（高さ 12m・厚さ 6m。`fortWall`）で、内側の中庭は 58×48m（x ±29・z −74〜−122）。海側の壁は中心 z −71、陸側は中心 z −125、左右は中心 x ±32 に 12m 角の `fortWall` を重ねて並べ、内側の面を設計の線に合わせる。海側・陸側の門はどちらも幅 12m（x −6〜6）の開口で、陸側の門には `fortWall` の扉を1枚（x 0・z −125・`collapse: true`）置き、爆薬が爆発するまで閉じる（SB-1860）。海側の門はマップの物ではなく、`GATE_SHUTTER` の矩形と板で機関砲を倒すまで閉じる（SB-2300）。陸側の壁と左右の壁も `collapse: true` で、海側の壁は付けない（爆発のあとも立つ）。壁はどれも弾では壊れない。中庭には遮蔽 9 個（`block` 4・`wreck` 2・`crater` 3）を置き、門から門への x 0 の通り道は空ける。三方の壁には L5 の敵の出入り口の目印として短い `lowWall` を3個置く。海側の壁の上（x 20・z −71・`y` 12）には機関砲 `fortress-gun` を置き、その箱（16×10×6）は壁の厚みの中に収める。門の前の開けた所（z −55〜−68）には遮蔽 4 個（`block` 2・`wreck` 2）を互い違いに置き、壁の上の掃射が全部の場所には通らないようにする（SB-1830）
  - 坂 `ramp` と階段 `stairs` の種類はエディタと確認用の入口のために残すが、M1 では使わない（防波堤の上へ上がる道は無い）
  - 低い障害物 `lowWall` は浜（z 154）に5個（x −42・−18・6・30・54）。間は 14m 以上あいて回り込めて、地雷と重ならず、機体が艇を降りた所（x 0, z 166）から 4m 以上離れる
  - C の手前（z −55〜−35）は線にせず、`lowWall` と `wreck` を散らす（SB-1820）。右の崖下（x 80〜95・z −20〜−60）は集積所へ下りる道として物を置かない。線2の先、トーチカ線の手前に6個ほど置く（SB-2020）
  - 砲台の部位は要塞の先の野の奥（z −228〜−255）に目標として置く: `main-gun-1`（種類 `gun`、x −45, z −235）・`main-gun-2`（`gun`、x 45, z −235）・`magazine`（弾薬庫、x 0, z −250）。大きさは `TARGET_SIZE`（`gun` 14×8×14m、`magazine` 10×8×10m）で、主砲の間は 90m、主砲と弾薬庫の間は約 47m。台本はこの3つの名前で主砲2門 → 弾薬庫の順に進む（8章）。仮の置き場所で、L8 が超重砲の副砲・コアに作り直す。シャッターと、砲台が撃ってくる動きは「ボス（沿岸砲台）」
  - 砲台の前の野（z −140〜−225）の遮蔽物は塊 7 個と残骸 4 個（1行に1つ。以前の防波堤の陸側から移した）。どの2つの間も中心で 20m 以上あいて機体（当たり半径 1m）が通れ、陸側の門から砲台へは遮蔽物で視線の一部が遮られる。主砲と弾薬庫のまわり（z −228 より奥）には置かない
  - 目標は `pillbox-1`（x −33, z −15）・`pillbox-2`（x 22, z −15）・`depot`（x 75, z −40。右の崖下の窪地）・`fortress-gun`（`fortressGun`、x 20, z −71, `y` 12。海側の壁の上）。`b-squad` はトーチカの後ろ（z −25〜−35）。3基目のトーチカ `pillbox-3` は外した（爆破点を持たず壊せないため。SB-2023）。`depot-guard` の4か所は集積所のまわり（(65,−30)・(88,−45)・(70,−55)・(84,−22)。量産機3と機銃座1）。`b-emplacements` の6か所は各線の海側（線1 z 147 の x −75・−30・45、線2 z 84 の x −70・−40・8）。線2の3基は近い点 x −10 の前を横に掃射し、遠い点 x 50 は x 25, z 78 の残骸が射線を遮る（SB-2020）。一番手前は同じ z 147 の3基のうち、艇の進路 x 0 に近い x −30 の1基（`b-emplacements-1`）で、`ashore` で起きる。ほかの5基は `pillboxes` cue まで眠っている。`fortress-drop` の3か所は海側の壁の上（x −20・8・32、z −70。門の x −6〜6 と目標の箱 x 12〜28 を避ける）で、着地は壁の海側（z 約 −59）になる。崖は右の辺（x 100）を z −300 まで伸ばす
- 生成は `generateMap(rng, rules, anchors)`（`src/logic/mapgen.ts`）。`MapRules` は帯（`minZ`・`maxZ`・`kind`・`count`・`minGap`）・防御線（`lines`）・右の辺の崖・目標のまわりの空き（`clear`、既定 10m）・道筋の帯（`lanes`）を持つ。目標と波の出る場所は物語に関わるので生成せず `anchors` で受ける。M1 の B の規則は `src/data/maps/m1b-rules.ts` の `M1B_RULES`（`lanes` は空で、列の中はすき間が 2m 未満に閉じているので、通り道は防御線の突破口が決める）
- `MapLine` は `z`（線の真ん中）・`depth`（奥行き）・`rows`（列の数）・`kind`・`spacing`（同じ列の中の間隔）・`gaps`（突破口の真ん中と、四角の間の幅）・`breakable`（壊せる区間の真ん中と幅）を持つ。生成は列ごとに `spacing` で x に並べ、奇数の列を `spacing / 2` ずらし、位置を ±1m・向きと倍率（0.9〜1.1）を少し揺らす。隣の物との四角の距離が `CRACK`（1.5m）を超えたら前の物へ引き寄せる。列の左の端は辺から `CRACK` 以内に寄せ、右は崖の遠い側の面から `CRACK` 以内に届くまで並べる。`spacing` は 4.4（3m の逆茂木の間を 2m 未満に保つ）。`gaps` には四角が入らないように物を置かず、`breakable` の区間の物に `breakable: true` を付ける。帯の物は防御線の z の範囲には置かない
- 生成は物を置いたあと通り道を調べ、通れなければ種をずらして作り直す（最大10回。だめなら例外）。`rng` は `logic/rng.ts` の `stream('map')` から引く
- 簡易エディタは `#view-mapedit`（`src/dev/views/mapEdit.ts`）。編集は `localStorage` の `stormbreacher-dev-map` に保存し、`#view-map?src=edit` が読む。開発用なので保存キーは `src/dev/map/store.ts` に置く
  - 目標の id は最初「選んで」（空）で、空のまま目標を置こうとすると置かずに「id を選んで」と出す。すでにある id を選んで置くと、増やさずにその目標をクリックした所へ動かす
  - 物を選んでいるとき「壊せる」で `breakable` を切り替える。書き出しの JSON には `breakable: true` のときだけ出す
- `validateMapForMission(map, mission, skip)`（`src/logic/mapCheck.ts`）は違反の一覧 `{ kind, message }[]` を返す（例外にしない）。`skip` は範囲の外にある波と目標の名前
  - 台本の `targets` が全部マップにあり、マップにしか無い目標が無い。同じ id の目標が2つあれば `target-duplicate`。台本で `spawn` する波が全部 `spawns` にある
  - 物と目標が `bounds` の中にあり、目標どうしが 12m より近くない
  - 道は防波堤が無い地図で1区間、ある地図で2区間を見る。どちらも当たり半径 `MECH_TUNE.radius`（1m）の機体が通れる道があるか。調べ方は区間ごとに下のとおり
  - 区間1: 範囲の手前（`maxZ`）から奥（`minZ`）まで、当たり半径 `MECH_TUNE.radius`（1m）の機体が通れる道があるか。2m 四方の格子にして幅優先で調べ、`PROP_SIZE` の `blocks` が真の物と目標を、表の `w`×`d` に `scale` を掛け `yaw` で回した四角として避ける。爆破点は機体が爆破して開けられる所なので、`map.blasts` の各点の `blastPropIndexes` の物を外した、開いた形で歩く。爆破前の線が閉じていることは `blasts: []` の写しで確かめる。`breakable` の区間は塞ぐ物として数える。格子の点から四角までの距離が 1m より近ければ塞がれている。`crater` と `tile` は避けない。階段（`stairs`）と坂（`ramp`）は低い端から歩いて上がる物なので、検査では塞ぐ物に数えない（突破口の真後ろの階段や坂で道が閉じないため）。物が範囲の外に出ているかは中心で見る。防波堤（`seawall`）がある地図では、機体は階段か坂で上がるので、区間1は「手前から防波堤の海側の面の手前（面から当たり半径 1m と格子1つ分あけた行）まで」で終わる（`goalRow` in `src/logic/mapCheck.ts`）。防波堤が無い地図（生成）は奥の端まで見る。階段と坂は検査では歩かず、上がれることは歩く結合テストで確かめる
  - 区間2（防波堤がある地図で、防波堤の陸側の面より奥に目標がある場合だけ。`checkBehind` in `src/logic/mapCheck.ts`）: 陸側の面から当たり半径 1m 以上離れた最も手前の行の空いた格子点をどこからでも始めて、陸側の面より奥にある目標ごとに、その四角の縁から `TARGET_REACH`（4m）以内の空いた格子点へ着けること。降りる所は防波堤の上のどこでもよいので、区間1の続きにはせず陸側の面の行から始める。着けない目標ごとに `no-path` を1つ出す。階段や坂を下りる歩きは検査せず、結合テストが防波堤の上から歩いて降りる
  - 生成（`generateMap`）は、規則の `bounds` の外にある目標を作る地図に入れない。M1 の規則（z −60〜170）は手書きの `fortress-gun`・`main-gun-1`・`main-gun-2`・`magazine` を持たず、防波堤も置かないので、区間1だけを見る
- 機体は、`mapBlockers`（`src/logic/mapShapes.ts`）が作る四角（`blocks` が真の物と全部の目標。表の `w`×`d` に `scale` を掛け `yaw` で回したもの。通り道の検査と同じ）から、当たり半径 `MECH_TUNE.radius` 以上離れた所に押し出される（`pushOutCircle` in `src/logic/collide.ts`）
- 押し出したあと、壁へ向かう速さだけを消し、壁に沿う速さは残すので、斜めに当たると滑る（`stepMech` in `src/logic/mech.ts`）。1歩は `MOVE_TUNE.maxStep` 以下に刻むので、ブーストでも薄い物を抜けない。`MechWorld` に `bounds` を渡したときは、機体の真ん中が当たり半径 `radius` の分だけ範囲の内側に留まり、外へ向かう速さも消える（本体は渡し、艇のランプの幅だけ前の縁から艇の船尾までを許す）
- 高さを見る。物と目標の四角は上の面の高さ `top`（m）を持ち（`GroundRect.top`。`mapBlockers` が物は `PROP_SIZE` の `h` × `scale`、目標は `TARGET_SIZE` の `h` を入れる）、`top` の無い四角はどの高さからも越えられない壁になる。坂（`ramp`）の四角は `ramp: true` で、`top` を高い端の高さとし、`surfaceAt` in `src/logic/collide.ts` が位置に応じて低い端の 0 まで線形に下げる。弾とカメラの線が当たる箱は `rectBoxes` が作り、坂は面に沿った段の箱の集まりにするので、低い端の上の空間を飛ぶ弾は坂に当たらない。地面にいる機体は、足元から `MOVE_TUNE.stepHeight`（仮 0.75m）までの物には歩いて乗る。それより高い物は壁になり、押し出される。坂の上では足元の高さを面の高さそのものにし、下りでは stepHeight 以内の下がりを歩いて降りる（ほかの物から歩いて外れると、その高さから地面へ落ちる）。坂の横の面はどの高さでも壁で、坂の上にいる機体は幅の外へ歩き出せない。跳んでいる機体は、足より低い物の上を越えられ、その上に降りられる。`breakable` の物も壊れるまでは当たる
- 効くのは `#view-map` と `#view-fx`。平らな地面の入口（`#view-touch`）の的には当たらない
- 海と揚陸艇（`buildShore` in `src/view/shore.ts`）: `buildWorld` が作り、`#view-map`・`#view-fx`・本体が同じ関数を通る。出撃をやり直すと `World.shore` ごと外す。艇の寸法は `CRAFT_TUNE`（`src/data/craft.ts`）に置き、描く形と歩ける面が同じ値を使う
  - 海: 範囲の手前の端（`maxZ`）から +z へ 260m（`SEA_DEPTH`）、x は範囲の両側に 160m ずつ広げた平面を1枚。高さは砂より少し低い -0.1m。頂点色は `SEA_COLOR`（`data/colors.ts`、曇りの日の荒れた海の暗い灰緑〜灰青 0x3d5560）から浜の白波（`FOAM_COLOR` 0x9aa5a3、白ではない灰白）へ変わり、波の絵（`src/view/surfaces.ts`）を `onBeforeRender` で流す。ミッションの見た目の表（`LOOKS`）は海に掛からず、霧の色だけが遠くを溶かす
  - 揚陸艇: 範囲の手前の端から 5m 後ろ（z 175）から +z へ長さ 12m の船体（幅 7m、甲板の高さ 1.7m、水に 0.6m 沈む）と、両脇の壁、後ろの壁、操舵室、浜（-z）へ下ろした開いたランプ（長さ 5m、先が砂に着く）。x は範囲の真ん中（機体の始まりの真後ろ）。箱の組み合わせで、船体（灰）と甲板（暗い灰）の2つのメッシュ（`buildCraft`。グループ名 `craft`）と、甲板の前の縁を蝶番にしたランプのメッシュ（暗い灰。グループ名 `craftRamp`。カットシーンで上げ下げする。8章「カットシーンの演出」）。甲板・両脇の壁・船尾・操舵室・ランプは `craftRects`（`src/logic/craft.ts`）が同じ寸法から `rects` の四角にするので、機体は描かれた艇の上を歩ける（甲板の面 1.8m、両脇の壁 3.3m、船尾 4.7m、操舵室 4.3m）。ランプは坂の四角（`ramp`）で、蝶番の 1.7m から砂の 0m へ下りる。艇の船尾まで行けるのはランプの幅（船体の幅 7m から当たり半径を引いた所）の中だけで、機体が艇の上にいる間は浜の迫撃砲が予告を出さない。艇は物ではないので弾は止めず、`propBoxes` にも入れない。同じ作りの艇がもう2隻、味方機を乗せて両隣（x −12 と 12。船体の間は `sideGap` の 5m）に並び、導入の外の画にも見える（グループ名 `craftAllyPort`・`craftAllyStarboard`。`ALLY_CRAFT_SIDES`・`craftSideX` in `src/data/craft.ts`）。この2隻の甲板・壁・ランプの四角は `allyCraftRects` が `craftRectsAt` で作り、味方機が導入の間立つ高さと、操作を渡されてランプを降りる道の ground になる。機体はマップの手前の端に止められてこの2隻には入れない
  - 描く回数は海1・揚陸艇3隻（各2）・ランプ3の10回（カメラの視錐台の外にあるあいだは省かれる）
- M1 では防波堤へ上がる道が無い（坂・階段とも使わない。種類はエディタと確認用の入口のために残す）。要塞の門は開いた開口で、壁と壁の間を歩いて抜ける。M1 の範囲の外（浜より海側）に当たるものは置かない

## 10. 音

出撃の効果音と浜の環境音を、engine の合成音（`@engine/audio` の `noiseBurst`・`sweepTone`・`audioNow`）だけで鳴らす。音のファイルは使わず、音楽（BGM）は無い。値はすべて仮で、`#view-sound` で聞いて決める。

- 表: `src/data/sounds.ts`。音は `SoundName` の18種で、`SOUND_NAMES` が並び順を持つ。`SOUND_LAYERS` は音ごとの層の列で、`tone` は `sweepTone` に、`noise` は `noiseBurst` に渡す周波数（`f0`・`f1`）・長さ（`dur`）・音量（`vol`）・遅れ（`at`）・フィルタの種類を持つ。`SOUND_FRAME_LIMIT` は1フレームに鳴らす上限、`SOUND_DISTANCE` は距離の扱い、`SOUND_TRIM` は6つの音（`impactArmor`・`shellWarn`・`mechHit`・`charge`・`radio`・`downed`）の大きさの微調整（`playSound` が層の `vol` に掛ける。表に無い音は1）、`SOUND_VOLUME` は全体の音量、`SOUND_AMBIENT` は環境音の間隔と音量。鳴らす所（`src/view/sound.ts` と `src/dev/views/sound.ts`）に音の値は置かない（画面の作りの数値は除く）
- 鳴らす: `src/view/sound.ts` の `planSounds` が、そのフレームの出来事と、増えた敵の弾から `{ name, gain, pitch }` の列を返す（純粋。`planSounds` in `src/view/sound.ts`）。`playSound` が `SOUND_LAYERS` を `audioNow()` から鳴らし、`soundFrame` を `src/app/play.ts` の `update` が `step` のあとに毎フレーム呼ぶ。カットシーンの間も同じように鳴らす（`update` の飛ばしの分岐の外で呼ぶ）。カットシーンの `drawCutscene` の `blast`（艇の爆破 `craft`・着弾 `large`・`water`）も、`drawPlay` の爆発と同じく `explosionLarge` をカメラからの距離で鳴らす
- 出来事 → 音: `shot` は `weapon` が `autocannon` なら `autocannon`、`heavyGun` なら `heavyGun`。`melee` は `hit` なら `meleeHit`（重い金属の音）、空振りなら `meleeMiss`（軽い風切りの音）。`hit` は機体で止まった弾（`mech`）なら `mechHit`、目標か敵に当たったら `impactArmor`、物か地面なら `impactDirt`。`damaged` も `mechHit`（地雷・迫撃砲は `hit` を出さないため。弾の `hit` と `damaged` が同じフレームに来ても、1フレームの上限で1回だけ鳴る）。機体の `hit` はカットシーン中にも出るが、カットシーン中は金属音を鳴らさない（`SoundInput.cutscene`）。`destroyed` は `explosionLarge`、`enemyDown`・`propDestroyed` は `explosionSmall`、`allyDown` は `by` が `gun` なら `impactArmor`、`mortar` なら `explosionSmall`、`mineBlast`・`wardenDown` は `explosionLarge`、`planted` は `charge`、`blast` は `explosionLarge`、`shellWarn` は `shellWarn`、`shellLand` は `shellLand`、`supportFire`（歩兵の援護射撃。SB-2262）は `supportFire`（小さめの小銃。兵の位置から）、`downed` は `downed`、`script` の `radio` は `radio`。無線の声は、画面に出ている行のオブジェクト（`stepRadio` が行を上げるたびに作り直す）が前のフレームと別のときに1回だけ鳴らす（`soundFrame` が前のフレームの `game.radio` を持つ）。カットシーンの間は表示中の行の `time` が毎フレーム進むが、同じオブジェクトなので鳴らさない。同じ文の行が続けて上がれば、別のオブジェクトなので2回鳴る。`destroyed` の位置は目標の箱の真ん中、ほかは出来事の位置、機体の音は機体の位置
- `damaged` は機体の被弾だけ。目標・敵への着弾は `hit` で判定する
- 歩兵の戦死の無線（SB-2272）は、無線の行 `m1.man-down` として既存の `radio` の音で鳴る。新しい音は足していない
- 敵の射撃: 敵・砲台・トーチカの弾には `shot` の出来事が無いので、`soundFrame` が前のフレームで聞いていない敵の弾を見つけたら `enemyGun` を鳴らす。弾のオブジェクトを `WeakSet` で覚えるので、同じフレームに古い弾が消えても新しい弾を見落とさない
- 上限: 1フレームに同じ種類の音を `SOUND_FRAME_LIMIT` までしか鳴らさない（機関砲2・敵の射撃2・歩兵の援護射撃2・着弾2・小爆発2・大爆発1・迫撃砲の予告2・着弾2、ほかは1）。多数の着弾や連射が1つの大きな音に重ならないため。上限を超えた分は出来事の順に捨てる
- 距離: 機体からの水平距離で、`SOUND_DISTANCE.near`（12m）までが音量1・高さ1、`far`（200m）から先が音量 `minGain`（0.12）・高さ `farPitch`（0.55）。その間は直線で下げる。音量は層の `vol` と `SOUND_TRIM`（表にある音だけ）に掛け、高さは `f0`・`f1` に掛けるので、遠い音は小さく、低くこもる（`soundMix` in `src/view/sound.ts`）
- 環境音: 出撃の間、波のうねり（`wave`。2.6〜3.4秒ごとに低いノイズを重ねる）と、遠い砲声（`distantBoom`。4〜11秒ごとに90〜200mの距離として鳴らす）を流す。間隔と距離は `SOUND_AMBIENT` に置く。乱数は音だけの固定シードの生成器（`createRng(SOUND_AMBIENT.seed)`。`logic/rng.ts` の `createRng` と同じ形）から引き、`Math.random` も `logic/rng.ts` の `stream` も使わない（ゲームの乱数の流れを変えず、同じ出撃は同じ環境音になる）。`soundFrame` が `update` から呼ばれた分だけ進むので、一時停止・結果・タイトルでは呼ばれず、音も止まる
- 音量と解錠: `src/app/boot.ts` が起動時に `setVolumes(SOUND_VOLUME.sfx, SOUND_VOLUME.bgm)` を1回呼び、`unlockAudio()` で最初のクリック・キー・タップから音を出せるようにする。`SOUND_VOLUME` は効果音0.75・BGM0。タイトルに音量の設定は無い
- 確認用: `#view-sound`（`src/dev/views/sound.ts`）。音の表の全部（`SOUND_NAMES`）をボタンで並べ、押すとその音を鳴らす。距離のつまみ（0〜200m）が `SOUND_DISTANCE` の距離の扱い（`soundMix`）を通すので、遠い音の小ささ・こもり方も試せる。右上の調整パネルで `SOUND_DISTANCE`（近い・遠い・遠くの音量と高さ）・`SOUND_TRIM`（6つの音の大きさ）・`SOUND_VOLUME.sfx`（効果音の音量）も変えられる。`#sbSound` に並び、ボタンは `data-sound` に音の名前を持つ（7章）。
