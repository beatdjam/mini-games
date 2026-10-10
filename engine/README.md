# engine

考え方と構造の図は [ARCHITECTURE.md](ARCHITECTURE.md)、仕様は [SPEC.md](SPEC.md)、テストは `engine/test/`（Vitest。`npm run test:engine`）。

ゲームをまたいで使うコア。ES モジュールで、ソースは `engine/src/` にあり、ゲームは `@engine/<フォルダ>/<名前>.ts`（`engine/src/` の別名。`tsconfig.json`・`vite.config.js`・`vitest.config.ts` で設定）から必要なものを import する。engine はゲームを import しない。

テストやビルドの道具（`tools/`）の使い方は、リポジトリの README「開発」にまとめてある。

`engine/src/` のフォルダは関心ごとに分けている: `core/`（ループ・world・文言・セーブ・感想フォーム・アクセス解析・確認用フック・古いページ検出・小さな関数）、`render/`（描画）、`world/`（タイルの世界・ダンジョン生成と固定マップ・複数階・ドア・弾・追跡）、`audio/`（効果音と BGM）、`ui/`（画面の部品と入力）。下の表もこの順に並べている。

| ファイル | 中身 | ゲームに用意してもらうもの |
|---|---|---|
| `src/core/loop.ts` | メインループ。`requestAnimationFrame`、dt の上限、システムの実行、描画（`renderer.render` と手の銃）。`addSystem({ name, order, modes, update })`, `stopFrame()`, `runSystems(dt, mode)`, `startLoop()` | `LOOP.mode = () => 今のモード名`。動かしたいものを `addSystem` で登録し、最後に `startLoop()` |
| `src/core/world.ts` | 振る舞いを持つオブジェクト（Unity の MonoBehaviour に近い）。`spawn(obj)` で毎フレーム `obj.update(dt)`、`obj.dead = true` で片付け（`onRemove` と、画面に残っているメッシュの破棄）、`query(tag)`, `clearWorld(tag)`。`worldGroup(tag, order)` でタグごとに更新の順番を分けられる（リストは同じ配列のまま使い続けられる） | 各グループの `.system.modes` に動くモード。オブジェクトに `tag`, `update`, `mesh` |
| `src/core/util.ts` | `el`, `rand`, `randi`, `pick`, `clamp`, `shuffle`, `createRng(seed)`（同じシードなら同じ並びになる乱数。`rand`・`randi`・`pick`・`shuffle` を持つ）, `pct`, `distXZ`（x-z 平面の距離）, `isTouch`（body に `touch` / `desk` クラスを付ける） | — |
| `src/core/i18n.ts` | `LANG`, `lang`, `t(key, values)`, `setLang(code)`, `setI18nHook(fn)`, `fillData`, `applyStaticText`, `defaultLang` | `LANG.<code>` を登録する言語ファイル（`ja` は必須で、キーが無いときの予備）。定義に名前を流し込むなら `setI18nHook(fn)` で関数を登録 |
| `src/core/langslots.ts` | `withLang(table, blank)`（定義の表の各項目に、言語ファイルが入れる項目（名前・説明）の空の値を先に入れる。配列でもオブジェクトでもよい。何も import しないので、データのファイルが読み込み時に呼べる） | 言語ファイルが入れる項目の空の値。中身は `setLang` のときに `fillData` で入れる |
| `src/core/store.ts` | `encodeStore` / `decodeStore`（セーブを端末間で移す1行のコード。暗号化ではなく、読みにくく・書き換えにくくするだけ）、`loadStore(key, defaults)`（保存済みの値を既定値に深く重ねて `{ data, raw }` を返す）, `saveStore`, `clearStore`, `prefGet` / `prefSet`（タブの記憶など小さな値） | 既定値を返す関数。古い版からの変換は `raw` を見てゲーム側でやる |
| `src/core/stale.ts` | 古いページ検出。キャッシュに残った古いページなら、最新版の URL へ1回だけ切り替える | `<meta name="build" content="dev">`（ビルドが版番号に書き換え、`version.json` も出す。このファイルはページに埋め込まれる） |
| `src/core/feedback.ts` | `openFeedback(info)`（全ゲーム共通の Google フォームを、ゲーム名・ビルド・`info` を記入済みで開く）、`feedbackReady()`、`FEEDBACK.game`、`FEEDBACK_FORM` | 起動時に `FEEDBACK.game` へゲームID。`feedbackReady()` のときだけ送信ボタンを出し、押されたら今の状況をテキストにして `openFeedback` に渡す |
| `src/core/analytics.ts` | `track(name, params)`（GA4 のイベントを送る。タグの無いページでは記録だけ）、`TRACK_LOG`（直近50件）、`ANALYTICS.game` | 起動時に `ANALYTICS.game` へゲームID。送りたい出来事で `track` を呼ぶ。タグはビルドが入れる（`vite.config.js` の `GA_ID`） |
| `src/core/dev.ts` | `devHook('view-x', rest => ...)`（URL の `#view-x…` で動く確認用の入口） | テストの中身 |
| `src/render/render.ts` | `canvas`（`#gl`）, `renderer`, `scene`, `camera`, `dynGroup`, `resize`, `shared`, `basicMat`, `lineMat`, `disposeTree`, `textSprite`、手に持つ銃（部品の一覧から組み立てる `buildViewmodel` と、別パスで描く `gunScene`, `gun`, `renderGun`） | `<canvas id="gl">`。毎フレーム `renderer.render(scene, camera)` のあとに `renderGun()` |
| `src/render/paint.ts` | 絵を描く道具。`paintTex(seed, fn, size?, repeat?)`（シードから描く正方形の絵のテクスチャ。同じシードなら同じ絵）, `paintRand(seed)`（その乱数）, `canvasTex(w, h, fn)`（好きな大きさの絵）, `poolTex()`（白い柔らかい光だまり。色はマテリアルで付ける）、筆づかい `grime`（汚れ）, `grain`（細かい粒）, `oval`, `smudge`（隣のタイルへ続くぼかし）, `stripes`（斜めの警告の縞）, `words`（引き伸ばされる面に書く文字）, `block`（左上から照らした箱）, `soil`（下の方の汚れと点）、型 `Paint`、`PAINT_SIZE`（256） | 描く関数（2D コンテキストと乱数を受ける）とシード、絵の大きさ。全体を覆う筆づかいは、渡さなければキャンバスの大きさを使う |
| `src/render/windows.ts` | 外が見える窓。`buildWindowPanes(faces, wallH)`（窓のガラスに、ステンシルに印を付ける板を置く。型 `WindowFace`）, `buildBackdrop(map, radius, height)`（目のまわりの円筒の遠景を、印の所にだけ描く）, `WINDOW_ORDER`。壁に穴は開けない | 窓のある面とガラスの長方形（面の 0〜1）、遠景の絵（円筒に巻く横長の絵）と円筒の大きさ。遠景は、動かないグループに入れる |
| `src/render/fx.ts` | パーティクル（`burst`）と爆発の光（`fireball`）、`clearFx()`。システム `FX.particles` / `FX.fireballs` をエンジンが登録する | 動かすモードを `FX.particles.modes` などに入れる（入れなければ全モードで動く） |
| `src/render/materials.ts` | ステージと敵で共通の、名前で引くテクスチャとマテリアル。`defineTexture(name, { src, size?, repeat? })`（描く関数か画像の URL）, `defineMaterial(name, def)`（表面 `map`・光る部分 `glow`・色・発光・ライトの有無・透明度）, `texture(name)`, `material(name)`（共有）, `ownMaterial(name)`（1体用。被弾で光らせる）, `texturesReady()`（画像の読み込み待ち）, `buildParts(parts, { own? })`（箱・円柱などの部品から模型を組む。ジオメトリは共有） | テーマのテクスチャ（描き方か画像）とマテリアルの定義、敵や小物の部品の並び |
| `src/world/tiles.ts` | タイルの世界。地形1枚を表すオブジェクト `TileGrid`（`createTileGrid(world)` で作る。`inBounds`, `isSolid`, `isFloor`, `solidAt`, `tileIndex`, `floorY`, `blocked`, `blockedDir`, `depenetrate`, `moveCircle`, `hasLOS`, `walkable`, `edgeH`, `passable`, `computeFlow`, `flowAt`, `flowDir` のメソッドを持つ。複数作っても互いに影響しない）。同じ名前のモジュール関数は「今の地形」（`activeTileGrid()`）に対するもの。そのほか `T`=4, `STEP`, `RISE`, `DECK_H`, `COVER_H`, `DOOR_PASS`（ドアが開いているとみなす開き具合）、今の地形の `W`, `H`, `grid`, `hgt`, `ramp`, `cover`, `flow`、地形に依存しない `tileCoord`, `tileCenter`、辺の番号（`SIDE_PX`・`SIDE_NX`・`SIDE_PZ`・`SIDE_NZ`, `SIDE_STEP`, `OPPOSITE_SIDE`） | 地形を生成して `setTileWorld({ W, H, grid, hgt, ramp, cover, flow, flowQ })` で今の地形に渡す。複数の地形を持つときは、`TileWorld` ごとに `createTileGrid` する。ドアを使うなら `TileWorld` に任意の `door`・`doorOpen` を足す（ロックは `doorLock`。`lockDoor` が作る）（無い地形は今までと同じ計算。詳しくは下の `doors.ts` と SPEC 4.3） |
| `src/world/dungeon.ts` | 部屋と通路のダンジョン生成: `generateDungeon(opts, rng)` → `{ W, H, maps, rooms }`（部屋を置く・通路でつなぐ・大きい部屋に高台か柱・瓦礫・橋）、入口が1つだけの部屋を足す `hall` オプション（ボス部屋など。通路はその部屋を避け、ドア付きの通路1本でつなぐ。結果の `hall` に部屋の番号とドアのタイル）、開けたアリーナ `generateArena(size, from, to, pillars)`、マップから `TileWorld` を作る `tileWorldOf(data)`（配列はそのまま、`flow` は新しく）、単体で使える `addPlatform`, `addRubble`, `addBridges`、部屋の全タイルを回る `forEachRoomTile(room, fn)`、部屋の出入口にドアを置く `addDoorways(maps, size)`（`doors: true` で `generateDungeon` が呼ぶ）、ドアを1つ置く `setDoor(maps, k)`、型 `Room`, `TileMaps`（`grid`, `hgt`, `ramp`, `cover`, `roomOf`、ドアのあるマップだけ `door`, `doorOpen`）, `DungeonOptions`。乱数は渡した `Rng` だけから引く（同じシードなら同じ地形） | 生成の設定（`DungeonOptions`: 広さ・部屋数・部屋の大きさ・通路の幅・高台の確率・瓦礫の確率・橋の数・高さ・`doors`）と `Rng`。結果の `maps` はそのまま `setTileWorld` に渡せる。危険床・開始部屋など、ゲームのルールで決める部分はゲームが足す |
| `src/world/tilemap.ts` | 文字の行から作る固定マップ: `tileMapFromRows(rows, legend?, rooms?)` → `{ W, H, maps, rooms }`、`DEFAULT_LEGEND`（ドアの文字 `+` を含む。ドアのある行があるときだけ `maps.door`・`maps.doorOpen` ができる） | 行の配列。凡例（下）を変えたいときは `legend` |
| `src/world/floors.ts` | 階を重ねたマップ。`createFloors(worlds, baseY, links)` が `Floors`（階ごとの `TileGrid`、各階の床の基準の高さ `baseY`、リンク `FloorLink`）を作る（リンクの誤りは、どのリンクが悪いか書いた例外）。`feetY(f, floor, x, z)`（その階の床の高さ。ワールド座標）, `linksAt(f, floor, i, j)`（そのタイルのリンク。`createFloors` で引ける形にしてある）, `floorReach(f, from, use?)`（`from` から歩いて＋リンクを通って行ける床を、階ごとの `Uint8Array`（1 = 行ける）で返す。渡るのは `use` が true のリンクだけ（省略で全部）。ドアは開閉に関係なく床）, `unreachableFloorTiles(f, from, use?)`（行けない床の `FloorSpot` の一覧。生成したマップの検査用。階段だけで全部の階に行けるか、なども見られる）, `floorFlow(f, target, use)`（全部の階にまたがる `target` への経路で各階の `flow` を上書き。渡るのは `use` が true のリンクだけ）, `flowLink(f, floor, i, j, use)`（そのタイルから目標に近づくリンク）, `crossLink(f, m, use)`（立っているタイルのリンクの反対側へ移す。出てきたタイルから出るまでは渡り直さない）, `otherEnd(l, floor, i, j)`。型 `FloorSpot`（`floor`, `i`, `j`）, `FloorLink`（`kind`, `a`, `b`）, `Floors`, `FloorMover`（`floor`, `x`, `z`, `linkTile?`） | 階ごとの `TileWorld` と `baseY`、リンクの一覧。リンクの `kind`（'stairs' など）はゲームが決める文字列で、engine は読まない。どのリンクを使うか（`use`）と、いつ渡るか（踏んだらすぐ、エレベーターが動き終わったら、など）はゲームが決める |
| `src/world/floorgen.ts` | 複数階のランダム生成。`generateFloors(o, rng)` → `{ maps, links, floors }`（階ごとの `generateDungeon` を、隣り合う階どうし階段（既定 1本。0 の組はエレベーターだけでつなぐ）とエレベーターでつなぐ。`liftRooms` でエレベーターでしか行けない部屋も掘る。リンクの端は部屋の中の平らな床）。既定値 `FLOOR_H`, `STAIRS_KIND`, `LIFT_KIND`, `LIFT_ROOM_SIZE` | `FloorGenOptions`（階の数、階ごとの `DungeonOptions`、組ごとの階段・エレベーターの数、エレベーター専用の部屋の数と大きさ、階の高さ、リンクの `kind`）と乱数 |
| `src/world/walls.ts` | 壁のタイルの向きと外壁。`floorSides(d, k)`（床から見える面の向き）, `wallSide(d, k)`（`'outer'` 外壁・`'inner'` 1タイルの厚さの間の壁・`null`）, `facesToward(d, k, [dx, dz])`（その向きを見る面があるか）、型 `WallMap`（`W`・`H`・`maps.grid`）。乱数なし | どの絵をどの壁に出すか（窓は外壁だけ、など）と、どの向きを何と見るか（夕日の向きなど） |
| `src/world/slots.ts` | 小物の置き場所。`slotsOf(data)`（壁の面・部屋の隅・真ん中・部屋の床・通路・ドアの置き場所 `Slot`）, `placeProps(data, rules, rng, keep?)`（`PropRule` の小物を置き場所に割り当てて `Placement`（`id`, `slot`）を返す。ふさぐ小物は通路・ドアの前・`keep` を避け、歩いて行ける範囲を減らさない） | テーマの `PropRule`（id、置ける種類、ふさぐか、数、同じ小物の間隔）と、空けておくタイル `keep`。メッシュとふさぐ小物の当たり判定はゲームが作る |
| `src/world/doors.ts` | 近づくと開くドア。`updateDoors(grid, movers, dt, cfg?)` が、`grid.world.door` の印のあるタイルの `doorOpen`（0 = 閉、1 = 全開）を動かす。`movers`（`{ x, z, r }` の並び）のだれかがドアのタイルの中心から `sense` m 以内か、タイルに重なっていると開き、全員がいなくなって `closeDelay` 秒たつと閉じる。重なっている間は閉じない。速さ・感知する距離・閉じるまでの待ちは `DOOR_SPEED`・`DOOR_SENSE_R`・`DOOR_CLOSE_DELAY`（`DoorConfig` で差し替え可）。ドアのタイルの一覧は最初の呼び出しで作る。乱数なし。`lockDoor(world, k, on?)` でドアをロックすると、だれが近くにいても開かず、すぐ閉じる（タイルに重なっているキャラがいる間だけ待つ）。経路と到達チェックもロック中のドアへは入らない。`isDoorLocked(world, k)` で読める。型 `DoorConfig`, `DoorMover`、`DOOR_DEFAULTS` | その階（地形）にいるキャラの一覧を毎フレーム `movers` に渡す。`doorOpen` を見て、ドアの見た目（スライドなど）を動かす。閉じ込める部屋や、条件を満たすまで開けないドアは `lockDoor` でロックする |
| `src/world/lifts.ts` | 乗ると自分で動くエレベーター。`createLift(link)` が `Lift` を作り、`updateLift(f, lift, rider, dt, cfg?)` を毎フレーム呼ぶ（乗り場に `wait` 秒立つと `'depart'`、`ride` 秒で反対側へ移して `'arrive'`）。`liftProgress(lift)`（0〜1）, `liftTarget(lift)`（行き先）, `useFloor(f, floor)`（その階の地形をモジュールの関数に渡す）。既定値 `LIFT_WAIT`, `LIFT_RIDE` | どのリンクをエレベーターにするか、乗れるキャラ（`rider`）、`cfg`（`Partial<LiftConfig>`）。乗っている間の見せ方とキャラを止めるのはゲーム |
| `src/world/projectiles.ts` | 弾の汎用部分: プール（`takeFromPool`, `clearPool`）、細かく刻んだ移動（`stepProjectile`。刻むたびにゲームの判定を呼ぶ）、地形との当たり（`projHitsTerrain`）、追尾（`steerToward`）、弾幕の方向（`ringAngles`, `aimFan`） | 弾の項目と、当たったときの処理（判定関数として渡す） |
| `src/world/steer.ts` | `steerChase`: 見えていれば近づく（近すぎたら回り込む）、見えなければ経路をたどる、仲間と押し合う | 速さ・保つ距離・押し合う相手のリスト |
| `src/audio/audio.ts` | 効果音の合成（`tone`, `noiseBurst`, `sweepTone`, `gunshot`）、`sfx(name)`、`audioInit`, `sfxVolume` | `Object.assign(SFX, { 名前: () => {...} })` で効果音のレシピを入れる。音量は `setVolumes(sfx, bgm)`（0〜1） |
| `src/audio/music.ts` | BGM の再生（`setMusic(name, boss)`, `setMusicMix(kind)`, `musicVolume(duck)`, `musicTick`）、`SCALES` | `MUSIC_STYLES`（曲調）と `LAYER_MIX`（層の混ぜ方）に `Object.assign` で中身を入れる。名前の扱いは `MUSIC`（`fallback`: 予備の曲の名前、`mixOf(name, boss)`: 混ぜ方の選び方、`fadeOf(mix)`: その混ぜ方に切り替わる速さ）にも `Object.assign` で渡す（SPEC「音」） |
| `src/ui/ui.ts` | `toast(msg, ms)`, `banner(code, sub)`, 全画面（`enterFs`, `exitFs`, `toggleFs`, `isFullscreen`）, `keepAwake(on)`（画面のスリープを止める Screen Wake Lock。on の間は、ページが裏に回って外れても、見えるようになったときに取り直す。`navigator.wakeLock` が無い環境や取得の失敗では何もしない） | `#toast`, `#banner`（`#bannerCode`, `#bannerSub`）。遊んでいる間だけ `keepAwake(true)`、終わったら `keepAwake(false)` |
| `src/ui/dom.ts` | HTML の文字列で組む画面の小さな部品。`rowsHTML(rows)`（ラベルと値の組を `<dl>` の中身にする）, `onDataClick(root, ...table)`（`[data-属性]` の付いた要素のクリックを、表の最初に当たった属性の関数へ値つきで渡す。型 `DataClick`） | `<dl>` の見た目と、`data-` 属性を付けた HTML |
| `src/ui/hitdir.ts` | 被弾方向の表示。`createHitDirs({ container, view, camera, time, max?, className? })` が `{ show(x, z), update(dt), list }` を返す。視界の外から当たったときだけ、攻撃元を指す弧を出し、振り向きに合わせて向きを追って薄れる | `container`（照準の中心に置いた幅0・高さ0の要素。Sector Dive は `#hitDirs`）、`view()`（`x`・`z`・`yaw`。yaw は左が正）、`camera`、表示時間 `time`（秒）、弧の見た目の CSS（`className`、既定 `hdir`）。被弾で `show`、毎フレーム `update` |
| `src/ui/minimap.ts` | 上から見たタイルの地図。`drawTileMap(canvas, ctx, { tile, overlay?, markers, viewer, viewerColor? })` が、タイル（`tile(k)` が色と濃さを返したものだけ）→ 重ね塗り → 印（`square`・`ring`・`dot`、ラベル付きも可）→ 見ている人の向きの矢印、の順に描く。大きさの単位はキャンバスの幅の 1/160 | どのタイルを何色で描くか（見た場所だけ、など）と、印の一覧（位置はワールドの x・z） |
| `src/ui/floormap3d.ts` | 3D の詳細マップ。`createFloorMap3D(canvas)` → `{ build(floors, style, tileSize), draw(view), yaw, pitch, dispose() }`。全部の階をタイルの板として重ね、リンクを線、自分を矢印で描く。1本指のドラッグで回し、2本指でズームと移動（マウスはホイールと右ドラッグ）。自分の WebGL レンダラーで描く | 表示するタイルと色（`style.tile(floor, k)`）、リンクの色（`style.link(l)`）、階の間隔 `gap`、自分の階と位置・向き、印 |
| `src/ui/settings.ts` | 設定パネル。`SETTINGS.items` に並べた設定を、ページの `[data-settings="<場所>"]` の要素すべてに描き、どれかで変えると全部を描き直す（スライダーは動かしている間、ほかのパネルのつまみと値だけを追わせる）。種類は `toggle`（オン・オフ）・`choice`（切り替えボタン）・`range`（スライダー。`format` を渡すと値も出す）・`button`。`show()` が false の項目は出さない。言語と全画面は `languageSetting(label, change)`・`fullscreenSetting(label)` で作れる。`renderSettings()` | `SETTINGS.items`（ラベル・値の読み書き）、`SETTINGS.onOff`（オン・オフの文言）、`SETTINGS.onChange(key)`（保存や反映）。見た目はゲームの CSS（`.toggle`・`.seg`・`.sens`） |
| `src/ui/share.ts` | 画像のシェアのブラウザ側の部品。`canShareFile(file)`, `shareNative(file, text)`（`'shared'`・`'cancelled'`・`'failed'`）, `canCopyImage()`, `copyImage(blob)`（成功したか）, `saveFile(blob, filename)`（画像に限らず Blob をファイルとして保存）, `openXPost(text)`（X の投稿画面を開く） | 画像（`Blob`）と投稿文、ファイル名。パネルの要素・文言・解析イベントはゲームが持つ（スマホは `shareNative`、失敗したらパネル、PC はコピー・保存・X 投稿のボタン） |
| `src/ui/input.ts` | キー（`keys`。右の Shift などは左のキーとして入る。`normalizeCode`）、マウスとポインタロック（`requestLock`, `exitLock`, `locked`, `mouseFire`）、タッチの移動スティック（`joy`）と視点ドラッグ、押しっぱなしの射撃ボタン（`fireHeld`, `fire2Held`）、`tapBtn(btn, fn)`, `releaseInputs` | `INPUT` に `active`, `look`, `sens`, `key`, `pause`, `lockChanged` を入れる。`#touch`, `#joyBase`, `#joyKnob`, `#btnFire`, `#btnFire2`, `<canvas id="gl">` |
| `src/ui/keymap.ts` | 操作 → キーの割り当て。操作の名前はゲームが決め、engine は何をする操作か知らない。`defineActions([{ id, keys }])`（操作と既定のキー。1操作に `KEYS_PER_ACTION` = 2つまで。既定が重なる・3つ以上・同じ操作の二重定義は例外。呼び直すと全部を置き換える）, `actionDown(action)`（そのキーのどれかが押されているか）, `actionOf(code)`（キーがどの操作か。無ければ null）, `keysOf(action)`, `bindKey(action, slot, code)`（スロットにキーを割り当てる。ほかの操作が持っているキーはその操作から外し、外れた操作の名前を返す。同じ操作の別スロットのキーなら入れ替える）, `resetBindings()`, `exportBindings()`（全部の操作のキー）, `changedBindings()` / `importBindings(saved)`（セーブ用の形 `{ 操作: [キー, …] }` の出し入れ。保存するのは既定と違う操作だけなので、あとで既定を変えると、触っていない操作には新しい既定が届く。読み込みは、知らない操作・おかしな値を無視し、無い操作は既定のキーで補う）, `keyLabel(code)`（画面用の短い名前: `KeyW` → W、`ArrowUp` → ↑、`ShiftLeft` → Shift）。知らない操作の名前は例外（打ち間違いを見逃さない）。右の Shift・Ctrl・Alt・Meta は左と同じキーとして扱う（`input.ts` の `normalizeCode`） | 起動時に `defineActions` で操作と既定のキーを登録し、保存した割り当てを `importBindings` で入れる。キーを調べるときは `keys.KeyW` ではなく `actionDown('forward')`、`INPUT.key(e)` では `actionOf(e.code)`。割り当てを変える画面（キーの待ち受け）と文言はゲームが作り、変えたら `changedBindings()` をセーブに入れる |
| `src/ui/touchlayout.ts` | タッチボタンの配置（`applyLayout`, `buttonLayout`）と配置の編集（`openLayoutEditor`, `closeLayoutEditor`） | `TOUCH_LAYOUT` に `defs`, `first`, `edits`, `reset`, `save`, `afterApply`, `onOpen`, `onClose` を入れる。`data-lb` の付いたボタン、`#layoutBar`, `#lbName` |

`tileMapFromRows` の凡例（`DEFAULT_LEGEND`。`legend` で文字と高さを差し替えられる）:

| 文字 | 意味 | `grid` / `hgt` / `ramp` / `cover` |
|------|------|-----------------------------------|
| `#` | 壁 | 0 / 0 / -1 / 0 |
| `.` | 床 | 1 / 0 / -1 / 0 |
| `=` | 高台（高さ `deckH` = `DECK_H` 2m） | 1 / `deckH` / -1 / 0 |
| `c` | 遮蔽物（高さ `coverH` = `COVER_H` 1.2m） | 1 / `coverH` / -1 / 1 |
| `>` `<` `v` `^` | 坂。上る向きが +x / -x / +z（次の行）/ -z（前の行）。`ramp` は順に 0 / 1 / 2 / 3 | 1 / 0 / 向き / 0 |
| `+` | ドア（床のタイルに `door` = 1、`doorOpen` = 0 で閉。`DEFAULT_LEGEND.door`） | 1 / 0 / -1 / 0 |
| `A`〜`Z` | 床。部屋の目印（A = 部屋0 …）。`rooms` を渡さないときだけ部屋になる | 1 / 0 / -1 / 0 |

- 坂のタイルの高さは 0 で、`RISE` 上った先が同じ高さの高台なら、坂の隣に `=` を置けば上がれる
- 行の長さが違う、凡例にない文字、`A` から途切れた部屋の文字は例外にする
- `rooms` を渡したときは、その長方形の中のタイルに `roomOf` を入れる（文字の目印は使わない）

- engine のファイルは、ゲーム固有の名前を読み込み時に使わない（実行時に使うものは上の表の右列だけ）
- engine を変えたら、使っている全ゲームで確認する。今のところ使っているのは Sector Dive と Sector Dive Extended

## まだ切り出していないもの

どのゲームでもそのまま使えるものは engine に置く。迷うものはゲームに置き、2本目のゲームで要るとわかったときに engine を広げる。今のところ候補は次のもの（どれも Sector Dive の中にある）:

- ヒットマーカー（FPS なら共通。`ui/hud.ts` の `hitMark`。タイマーをビネット・画面の揺れと同じ `screenFx` で回しているので、切り出すならそれらとまとめて）

切り出すときの方針:

- ゲームの状態や操作を engine から直接呼ばず、設定オブジェクト（`INPUT`, `TOUCH_LAYOUT` のような形）やフック関数でゲームから渡す
- HTML の要素の ID を engine が前提にするときは、上の表に書く
