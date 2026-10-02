# engine 仕様

ゲームをまたいで使うコアの仕様。ファイルと関数の一覧は [README.md](README.md)、考え方と構造の図は [ARCHITECTURE.md](ARCHITECTURE.md)。

## 1. 基本

- 開発・ビルド・テストのコマンドはリポジトリの README「開発」、型や名前の付け方は STYLE.md
- engine が外に見せる型（設定オブジェクト・システム・world のオブジェクト・言語ファイルの形など）は、持ち主のモジュールから export する。ブラウザ固有の古い API の型は `engine/src/vendor.d.ts`
- **engine はゲームを import しない**。ゲームの状態や操作は、設定オブジェクト（`LOOP`, `INPUT`, `TOUCH_LAYOUT`）、登録用の関数（`setI18nHook`, `addSystem`, `spawn`）、ゲームが中身を入れる器（`SFX`, `MUSIC_STYLES`, `LAYER_MIX`）で受け取る
- 他のモジュールの変数には代入できないので、ゲームや engine の状態を外から変えるときは、持ち主のモジュールの関数（`setTileWorld`, `setVolumes` など）を呼ぶ
- モジュールの読み込み時は、宣言とイベントの登録だけにする。ほかのモジュールの値を使う起動処理は、入口（`games/<id>/src/main.ts`）が全部を読み込んだあとに呼ぶ（import が循環していると、読み込みの順番は保証されないため）
- engine が前提にする HTML の要素（`<canvas id="gl">`, `#touch` など）は README の表に書く

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
- `cover[k]` は腰の高さの遮蔽物（高さは `hgt` に入れる。既定は `COVER_H` = 1.2m、高台は `DECK_H` = 2m）
- **段差の規則**: 足元より `STEP` (0.7m) 以上高いところへは進めない。降りるのは自由
  - 当たり判定は、進む向きの先端（中央と両脇）で見る。段の上から半分はみ出していても、離れる向きには歩ける
  - 着地して段にめり込んだときは押し出す（`depenetrate`）
- `moveCircle(o, dx, dz, r)`: 軸ごとに動かして、壁か段で止まったら true。`o.fy`（足の高さ）が無いものは壁とだけ当たる
- `hasLOS(x0, z0, x1, z1, y0, y1)`: 壁で視線が切れるか。高さを渡すと、間にある高い床や遮蔽物でも切れる
- **経路（フローフィールド）**: `computeFlow(i, j)` で、目標のタイルまでの歩数を全タイルに入れる（段差の規則に従う）。`flowDir(x, z)` は歩数が減る隣への単位ベクトル
- ゲームは地形を生成して `setTileWorld({ W, H, grid, hgt, ramp, cover, flow, flowQ })` で渡す（渡したキーだけ入れ替わる）

### 4.1 ダンジョンの生成と固定マップ（world/dungeon.ts, world/tilemap.ts）

- `generateDungeon(opts, rng)` は、部屋を置く → 近い順に通路でつなぐ（部屋が5つより多ければ輪になる通路を1本足す）→ 部屋ごとに高台か柱と瓦礫 → 橋、の順に作る。乱数はこの順に `rng` から引くので、同じシードなら同じ結果になる（順番を変えると地形が変わる）
- 返す `maps`（`TileMaps`: `grid`, `hgt`, `ramp`, `cover`, `roomOf`）は上の章の配列と同じ決まりで、`setTileWorld` に渡せる。`rooms` は部屋の長方形（`plat` は高台のある部屋）
- 高台は大きい部屋（6タイル四方以上）の内側だけで、外周は地面のまま残る。橋は両側が壁の直線通路（5タイル以上）が、両端に坂の付いた高い通路になる。瓦礫は部屋の中央・坂・高台・ほかの瓦礫の隣には置かない
- `addPlatform`, `addRubble`, `addBridges` は単体でも使える。`generateArena` は柱の位置を渡す開けた四角いアリーナ
- `tileMapFromRows(rows, legend?, rooms?)` は文字の行から同じ形のマップを作る（凡例は README の表）。手で描いたステージと、地形が決まっていてほしいテストに使う

## 5. 弾（world/projectiles.ts）

- engine は「動かす」「何かに触れたら知らせる」まで。当たったあとの処理（ダメージ・盾・貫通・爆発など）はゲームが判定関数で渡す
- `stepProjectile(b, dt, maxStep, visit, speed)`: 重力（`b.grav`）をかけてから、1回が `maxStep` m 以下になるよう刻んで動かし、刻むたびに `visit(b)` を呼ぶ。true が返ったら止める。速い弾でも壁や敵をすり抜けない
- `projHitsTerrain(b, ceil, pad)`: 壁の中、床より下（`pad` の余裕つき）、`ceil` より上
- `steerToward`: 速さを保ったまま、向きを目標へ寄せる（追尾弾）
- `ringAngles(n, offset)`: 全方位に等間隔の角度。`aimFan(...)`: 狙った方向を中心に扇に広げた単位ベクトル
- `takeFromPool` / `clearPool`: メッシュを使い回すプール。上限まで埋まっているときは null を返す。`recycle` を付けると、いちばん前に渡した弾を使い回して返す（新しい弾を落とさない）

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
- `hitdir.ts`: 被弾方向の弧（視界の外から当たったときだけ。振り向いても攻撃元を指し、`time` 秒で薄れる）。ゲームが `container`・`view`・`camera` を渡す
- `share.ts`: 画像のシェアのブラウザ側の部品（共有シート・コピー・保存・X 投稿）。パネルと文言はゲームが持つ
- `minimap.ts`: タイルの地図を canvas に描く（ゲームが渡したタイルの色・重ね塗り・印と、見ている人の矢印）
- `settings.ts`: 設定パネル。ゲームが並べた項目（オン・オフ、切り替え、スライダー、ボタン）を、ページの `[data-settings]` の要素すべてに描き、どれかで変えるとそろえる。変更のたびに `SETTINGS.onChange(key)` を呼ぶ
- `touchlayout.ts`: タッチボタン（`data-lb`）の配置と、ドラッグで動かす・大きさを変える編集画面（`#layoutBar`）

## 10. 文言（core/i18n.ts）

- 言語ファイルが `LANG.<code> = { name, ui, data }` を登録する。`ja` は必須で、キーが無いときの予備
- `t(key, values)`: `{name}` を値で置き換える。文言が関数なら値のオブジェクトを渡して呼ぶ
- HTML は `data-i18n="キー"`（中身の文字）、`data-i18n-aria` / `-alt` / `-content`（属性）で引く。`setLang` のたびに書き換える
- `setLang(code)` は、ゲームが `setI18nHook(fn)` で登録した関数があれば `fn(data)` を呼ぶ（定義に名前と説明を流し込むため）。`fillData` は ID・キー・添字で対応させて上書きする
- `defaultLang()`: ブラウザの言語が日本語なら `ja`、それ以外は `en`

## 11. セーブ（core/store.ts）

- `loadStore(key, defaults)`: 既定値に保存済みの値を重ねる。オブジェクトはキーごとに深く重ね、配列やそれ以外の値は置き換える。新しい版で足した項目は、古いセーブでも既定値で補われる。`__proto__`・`constructor`・`prototype` のキーは重ねない（貼り付けたセーブコードから、すべてのオブジェクトに項目を足されないように）
- 返り値の `raw` は保存されていたそのままの値。古い版からの変換はゲームが `raw` を見て行う
- `prefGet` / `prefSet`: タブの記憶など、失っても困らない小さな値
- **セーブのコード**: `encodeStore(tag, obj)` はセーブを1行の文字列にする（別の端末へ移すため）。`decodeStore(tag, code)` は戻す。形式は `<tag>:<base64url>.<チェックサム8桁>`
  - 暗号化ではない。JSON を鍵で XOR して Base64 にし、ぱっと見では読めず、手で書き換えにくくするだけ。チェックサム（元の JSON の FNV-1a）が合わない・タグが違う・途中で切れているときは `null`
  - 空白や改行は無視するので、折り返されたコードを貼ってもよい。ゲームごとにタグを変える（Sector Dive は `SD1`）

## 12. キャッシュ対策（engine/src/core/stale.ts と vite.config.js）

- GitHub Pages は html も js も約10分キャッシュする。古い js と新しい html が混ざると動かないことがある
- ビルドした JS はファイル名に中身のハッシュが付くので、古い JS と新しい HTML が混ざることはない。ただし公開し直すと古い JS はサーバーから消えるので、キャッシュに残った古い HTML は読み込みに失敗する
- ビルドは、ページの `<meta name="build" content="dev">` をビルドの時刻に書き換え、同じ値を `games/<id>/version.json` に出す。開発サーバーでは `dev` のまま（比べない）
- `stale.ts` はビルドのときにページの `<head>` に直接埋め込む（JS にまとめると、古いページでは読み込めずに動かないため）。起動時に `version.json` を取りに行き、`<meta name="build">` と違えば `?b=<版>` 付きの URL に移って読み直す（同じ版への切り替えは1セッションに1回まで）

## 13. 感想フォーム（core/feedback.ts）

- 全ゲームで Google フォームを1つ共有する。記入済みにする質問は「ゲーム」「ビルド」「プレイ情報」の3つで、残り（感想・不具合など）はプレイヤーが書く
- フォームの場所と3つの質問の ID は `FEEDBACK_FORM`（`url` は `.../viewform` のアドレス）。フォームの「事前入力したURLを取得」で3つを埋めてリンクを作ると、`entry.<ID>=<値>` として ID が分かる。`url` が空の間は `feedbackReady()` が false で、`openFeedback` は何もしない
- ゲームは起動時に `FEEDBACK.game` に自分の ID を入れ、`feedbackReady()` のときだけ送信の導線を出す。押されたら今の状況（到達地点・装備・強化など）をテキストにして `openFeedback(info)` に渡す。ビルドはページの `<meta name="build">`（開発サーバーでは `dev`）
- `info` は `FEEDBACK_INFO_MAX`（1500文字）で切る（アドレスが長くなりすぎないように）。個人を特定できる値は入れない
- 送られた内容はフォームの回答（スプレッドシート）にたまる。プライバシーポリシー（`privacy.html`）に記載済み

## 14. アクセス解析（engine/src/core/analytics.ts と vite.config.js）

- ビルドが、公開する全ページ（engine のテストを除く）に GA4 のタグを入れる。測定 ID は `vite.config.js` の `GA_ID`（空にするとどのページにも入らない）
- タグは公開先のホスト（`beatdjam.github.io`）で開いたときだけ動く。開発サーバー・テスト・手元の `npm run preview` では何も送らない
- ゲームは起動時に `ANALYTICS.game` に自分の ID を入れる。全イベントに `game` として付く
- ゲームは `track(name, params)` でイベントを送る。タグがあれば `gtag('event', name, params)` を呼び、どのページでも `TRACK_LOG` に直近50件を残す（テストで確かめるため）
- 名前は snake_case で40文字以内、パラメータは文字列・数値・真偽値だけで25個まで（GA4 の決まり）。個人を特定できる値は送らない
- **パラメータを GA のレポートで使うには、GA の管理画面でカスタム定義に登録する**（管理 → カスタム定義。分類で見るものはイベント範囲のカスタム ディメンション、合計・平均で見るものはカスタム指標。登録前のデータには効かない）。パラメータは全ゲームで共有なので、ゲーム固有の言葉を避けた一般的な名前にして、同じ意味なら使い回す。GA の推奨イベント（`share` の `method`、`earn_virtual_currency` の `value`・`virtual_currency_name` など）に合う所はその名前に寄せる
  - GA に登録済み（2026-09-28。`stage_role` は追加分）: ディメンション `game` `result` `method` `level` `start_level` `stage` `stage_type` `stage_role` `target` `item_name` `virtual_currency_name`、指標 `value` `count` `upgrades` `duration_sec`
  - GA が予約している名前（`currency` など EC 用のもの）は登録できない。登録で弾かれたら、推奨イベントの名前に置き換える
  - 意味: `level` 深度・ステージ番号などの段階 / `stage` その中の区切り / `stage_type` ステージの種類 / `stage_role` 部屋の役割（`normal` / `boss` など。何番目かに頼らず絞るため） / `target` 倒した・挑んだ相手 / `item_name` 使っている道具 / `value`＋`virtual_currency_name` 手に入れた通貨の量と種類 / `count` 倒した・こなした数 / `upgrades` 取得した強化の数 / `duration_sec` かかった秒数
  - 新しいパラメータを足したら、この一覧に足して、登録してもらうよう伝える

## 15. 確認用フックとテスト

- `core/dev.ts`: `devHook('view-x', fn)` は URL の `#view-x…` で動く確認用の入口
- **engine のテスト**: `engine/test/*.test.ts`（Vitest のブラウザモードで Chromium の中で動かす。`npm run test:engine`）。engine が前提にする画面の要素は `engine/test/setup.ts` が作る
  - engine を変えたら、engine のテストと、engine を使う全ゲームのスモークテストを流す（`npm test` が両方を流す。README「開発」）
- 確認用のコードは公開版に入れない: ゲームは入口で `if (import.meta.env.DEV) import('./src/dev/dev.ts')` のように読み込む。テスト（engine の `test/`、各ゲームの `test/`）はビルドには入らない（Vitest が直接動かす）
