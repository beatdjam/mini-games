# engine 仕様

ゲームをまたいで使うコアの仕様。ファイルと関数の一覧は [README.md](README.md)、考え方と構造の図は [ARCHITECTURE.md](ARCHITECTURE.md)。

## 1. 基本

- TypeScript の ES モジュール（import / export）。Vite で開発・ビルドする（リポジトリの README「開発」「TypeScript」）。three.js は npm の `three` 0.128.0
- engine が外に見せる型（設定オブジェクト・システム・world のオブジェクト・言語ファイルの形など）は、持ち主のモジュールから export する。ブラウザ固有の古い API の型は `engine/vendor.d.ts`
- **engine はゲームを import しない**。ゲームの状態や操作は、設定オブジェクト（`LOOP`, `INPUT`, `TOUCH_LAYOUT`）、登録用の関数（`setI18nHook`, `addSystem`, `spawn`）、ゲームが中身を入れる器（`SFX`, `MUSIC_STYLES`, `LAYER_MIX`）で受け取る
- 他のモジュールの変数には代入できないので、ゲームや engine の状態を外から変えるときは、持ち主のモジュールの関数（`setTileWorld`, `setVolumes` など）を呼ぶ
- モジュールの読み込み時は、宣言とイベントの登録だけにする。ほかのモジュールの値を使う起動処理は、入口（`games/<id>/main.ts`）が全部を読み込んだあとに呼ぶ（import が循環していると、読み込みの順番は保証されないため）
- engine が前提にする HTML の要素（`<canvas id="gl">`, `#touch` など）は README の表に書く
- 描画は three.js r128（npm の `three`）

## 2. ループ・モード・システム（core/loop.ts）

- engine が `requestAnimationFrame` を持ち、毎フレーム「システムを順に実行 → `renderer.render(scene, camera)` → 手に持つ銃の描画」を行う。dt は `LOOP.maxDt`（0.05秒）で頭打ち
- **モード**: ゲームは `LOOP.mode = () => 今のモード名` を渡す。フレームの頭で1回だけ読むので、フレームの途中でモードが変わっても、そのフレームの残りは元のモードのまま進む
- **システム**: `addSystem({ name, order, modes, update })`。`order` の小さい順に実行する。`modes` に今のモードが含まれるものだけ動く（省略すると全モード）。戻り値のシステムの `modes` や `enabled` はあとから変えられる
- `stopFrame()` を呼ぶと、そのフレームの残りのシステムを飛ばす（次の区画に移った直後など）
- `runSystems(dt, mode)` で1ステップを手で進められる（テスト用）

## 3. 振る舞いを持つオブジェクト（core/world.ts）

- `spawn(obj)` で登録したオブジェクトは、毎フレーム `obj.update(dt)` が呼ばれる（Unity の MonoBehaviour に近い）
- 登録順に呼ぶ。更新の途中で `spawn` されたものも、同じフレームのうちに呼ばれる
- `obj.dead = true` にすると、そのグループの更新が終わったところでリストから外れる。そのとき `obj.onRemove()` があれば呼び、`obj.mesh` が画面に残っていれば破棄する
- `obj.tag` でまとめる。`query(tag)` で生きているものを取り出し、`clearWorld(tag)` でまとめて消す（タグなしは全部）
- **グループ**: `worldGroup(tag, order)` で、そのタグのオブジェクトを別のリストとシステムに分けて、更新の順番を決められる。それ以外のタグは順番30の既定のグループに入る。グループのリストは作り直さず同じ配列を使い続けるので、ゲーム側で参照を持っていてよい
- 各グループのシステムは `group.system`（既定は `WORLD.system`）。動くモードは `.modes` で指定する

## 4. タイルの世界（world/tiles.ts）

- 1タイルは `T` = 4m 四方。`grid[k] === 1` が歩ける床、それ以外は壁。`k = j * W + i`
- `hgt[k]` は床の高さ。`ramp[k]` が 0〜3 ならその向き（0:+x 1:-x 2:+z 3:-z）へ `RISE` だけ上る坂、-1 は平ら
- `cover[k]` は腰の高さの遮蔽物（高さはゲームが決める）
- **段差の規則**: 足元より `STEP` (0.7m) 以上高いところへは進めない。降りるのは自由
  - 当たり判定は、進む向きの先端（中央と両脇）で見る。段の上から半分はみ出していても、離れる向きには歩ける
  - 着地して段にめり込んだときは押し出す（`depenetrate`）
- `moveCircle(o, dx, dz, r)`: 軸ごとに動かして、壁か段で止まったら true。`o.fy`（足の高さ）が無いものは壁とだけ当たる
- `hasLOS(x0, z0, x1, z1, y0, y1)`: 壁で視線が切れるか。高さを渡すと、間にある高い床や遮蔽物でも切れる
- **経路（フローフィールド）**: `computeFlow(i, j)` で、目標のタイルまでの歩数を全タイルに入れる（段差の規則に従う）。`flowDir(x, z)` は歩数が減る隣への単位ベクトル
- ゲームは地形を生成して `setTileWorld({ W, H, grid, hgt, ramp, cover, flow, flowQ })` で渡す（渡したキーだけ入れ替わる）

## 5. 弾（world/projectiles.ts）

- engine は「動かす」「何かに触れたら知らせる」まで。当たったあとの処理（ダメージ・盾・貫通・爆発など）はゲームが判定関数で渡す
- `stepProjectile(b, dt, maxStep, visit, speed)`: 重力（`b.grav`）をかけてから、1回が `maxStep` m 以下になるよう刻んで動かし、刻むたびに `visit(b)` を呼ぶ。true が返ったら止める。速い弾でも壁や敵をすり抜けない
- `projHitsTerrain(b, ceil, pad)`: 壁の中、床より下（`pad` の余裕つき）、`ceil` より上
- `steerToward`: 速さを保ったまま、向きを目標へ寄せる（追尾弾）
- `ringAngles(n, offset)`: 全方位に等間隔の角度。`aimFan(...)`: 狙った方向を中心に扇に広げた単位ベクトル
- `takeFromPool` / `clearPool`: メッシュを使い回すプール

## 6. 追跡（world/steer.ts）

- `steerChase`: 目標が見えていれば真っすぐ近づく。`keep` m より近ければ、60%の速さで周りを回る（ときどき向きを変える）。見えなければ経路をたどる。仲間どうしは押し合って重ならない

## 7. 描画（render/）

- `render.ts`: レンダラー（`<canvas id="gl">`）、シーン、カメラ、画面サイズへの追従。`shared()` を付けたジオメトリとマテリアルは `disposeTree` で破棄しない
- **手に持つ銃**: 専用のシーン（`gunScene`）に置き、世界を描いたあと奥行きをリセットしてから描く（`renderGun`）。壁や半透明の床に隠れず、銃の部品どうしは奥行きで正しく重なる。形は部品の一覧を `buildViewmodel` に渡して組み立てる
- `fx.ts`: パーティクルと爆発の光。engine がシステムとして自分で更新する（`FX.particles` / `FX.fireballs` の `modes` で動くモードを決める）

## 8. 音（audio/）

- 効果音も BGM も、音声ファイルを使わず Web Audio で合成する
- 効果音: `sfx(name)` が `SFX[name]` を鳴らす（`SFX` は engine の器で、ゲームが `Object.assign(SFX, {...})` で中身を入れる）。同じ音が短い間に重なりすぎないよう間引く。出口に軽いコンプレッサー
- BGM: `MUSIC_STYLES`（調・音階・和音の進行・テンポ・パターン。ゲームが中身を入れる）を鳴らす。層（pad / arp / bass / drums / tension）の混ぜ方は `LAYER_MIX` を `setMusicMix(kind)` で切り替える。ボス戦は同じ曲調を速く激しくしたアレンジにできる
- 音量はゲームが `setVolumes(sfx, bgm)`（0〜1）で入れる。最初のタップかクリックまで音は出ない（`audioInit`）。ゲームは起動時に `unlockAudio()` を1回呼ぶ。スマホではタッチの pointerdown では音を出せない（指を離したときなら出せる）ので、音が実際に動き出すまで、どの入力でも試し直す

## 9. 画面の部品と入力（ui/）

- `ui.ts`: トースト（`#toast`）、バナー（`#banner`）、全画面（横向きに固定を試みる）
- `input.ts`: PC はキーとマウス（ポインタロック）、タッチは左45%が移動スティック、残りが視点ドラッグ。射撃ボタンは押したままドラッグすると視点も動く。ゲームは `INPUT` に `active`（今操作を受け付けるか）, `look`, `sens`, `key`, `pause`, `lockChanged` を入れる
  - ロックが外れたとき、ページが裏に回ったときは、`INPUT.active()` なら `INPUT.pause()` を呼ぶ
  - メニューを開く直前に要求したロックがあとから効いた場合（Firefox で起きやすい）は、すぐ外す
- `touchlayout.ts`: タッチボタン（`data-lb`）の配置と、ドラッグで動かす・大きさを変える編集画面（`#layoutBar`）

## 10. 文言（core/i18n.ts）

- 言語ファイルが `LANG.<code> = { name, ui, data }` を登録する。`ja` は必須で、キーが無いときの予備
- `t(key, values)`: `{name}` を値で置き換える。文言が関数なら値のオブジェクトを渡して呼ぶ
- HTML は `data-i18n="キー"`（中身の文字）、`data-i18n-aria` / `-alt` / `-content`（属性）で引く。`setLang` のたびに書き換える
- `setLang(code)` は、ゲームが `setI18nHook(fn)` で登録した関数があれば `fn(data)` を呼ぶ（定義に名前と説明を流し込むため）。`fillData` は ID・キー・添字で対応させて上書きする
- `defaultLang()`: ブラウザの言語が日本語なら `ja`、それ以外は `en`

## 11. セーブ（core/store.ts）

- `loadStore(key, defaults)`: 既定値に保存済みの値を重ねる。オブジェクトはキーごとに深く重ね、配列やそれ以外の値は置き換える。新しい版で足した項目は、古いセーブでも既定値で補われる
- 返り値の `raw` は保存されていたそのままの値。古い版からの変換はゲームが `raw` を見て行う
- `prefGet` / `prefSet`: タブの記憶など、失っても困らない小さな値

## 12. キャッシュ対策（core/stale.ts と vite.config.js）

- GitHub Pages は html も js も約10分キャッシュする。古い js と新しい html が混ざると動かないことがある
- ビルドした JS はファイル名に中身のハッシュが付くので、古い JS と新しい HTML が混ざることはない。ただし公開し直すと古い JS はサーバーから消えるので、キャッシュに残った古い HTML は読み込みに失敗する
- ビルドは、ページの `<meta name="build" content="dev">` をビルドの時刻に書き換え、同じ値を `games/<id>/version.json` に出す。開発サーバーでは `dev` のまま（比べない）
- `stale.ts` はビルドのときにページの `<head>` に直接埋め込む（JS にまとめると、古いページでは読み込めずに動かないため）。起動時に `version.json` を取りに行き、`<meta name="build">` と違えば `?b=<版>` 付きの URL に移って読み直す（同じ版への切り替えは1セッションに1回まで）

## 13. アクセス解析（core/analytics.ts と vite.config.js）

- ビルドが、公開する全ページ（engine のテストを除く）に GA4 のタグを入れる。測定 ID は `vite.config.js` の `GA_ID`（空にするとどのページにも入らない）
- タグは公開先のホスト（`beatdjam.github.io`）で開いたときだけ動く。開発サーバー・テスト・手元の `npm run preview` では何も送らない
- ゲームは `track(name, params)` でイベントを送る。タグがあれば `gtag('event', name, params)` を呼び、どのページでも `TRACK_LOG` に直近50件を残す（テストで確かめるため）
- 名前は snake_case で40文字以内、パラメータは文字列・数値・真偽値だけで25個まで（GA4 の決まり）。個人を特定できる値は送らない

## 14. 確認用フックとテスト

- `core/dev.ts`: `devHook('view-x', fn)` は URL の `#view-x…` で動く確認用の入口。`devSmoke(fn)` は `#smoke` で fn を実行し、エラー（`SMOKE ERR` / `SMOKE FAIL`）、版番号の一致（`SMOKE build ok`）、終わり（`SMOKE DONE`）をコンソールに出す
- **engine のテスト**: 開発サーバーで `engine/test/` を開くか、`tools/headless.sh 'engine/test/' 20000` を実行する。各テストが `TEST ok` / `TEST FAIL` を出し、最後に `TEST DONE 通った数/全体`
  - engine を変えたら、engine のテストと、engine を使う全ゲームのスモークテスト（`tools/headless.sh 'games/<game-id>/#smoke' 200000`）を流す
  - engine に機能を足したら、`engine/test/tests.ts` にテストを足す
- 文言キーの照合: `node tools/check_i18n.js games/<game-id>`
