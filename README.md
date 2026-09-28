# mini-games
自分用ミニゲーム集リポジトリ

公開ページ: https://beatdjam.github.io/mini-games/

## 構成

```
index.html                   トップページ（ゲーム一覧）
engine/                      ゲームをまたいで使うコア（ループ・描画・当たり判定・弾・音・入力・文言など。engine/SPEC.md）
engine/test/                 engine のテスト
games/<game-id>/index.html   各ゲームのページ。入口の main.ts を1つ読む
games/<game-id>/main.ts      入口。全モジュールを読み込み、最後に起動処理をする
games/<game-id>/js/          ゲームのモジュール
games/<game-id>/SPEC.md      各ゲームの仕様書兼説明書
games/<game-id>/updates.html 更新履歴（公開ごと、Actions が生成）
public/                      名前を変えずにそのまま出すファイル（PWA の manifest とアイコン）
tools/                       文言キーの照合、ヘッドレス確認、更新履歴の生成
vite.config.js               開発サーバーとビルドの設定
.github/workflows/pages.yml  GitHub Pages への公開（ビルドして dist/ を出す）
```

## 開発

- TypeScript の ES モジュール（import / export）＋ Vite。three.js は npm の `three`（0.128.0 に固定、型は `@types/three`）
- 最初に `npm install`
- `npm run dev`: 開発サーバー（http://localhost:8765/）。ファイルを保存すればブラウザに反映される
- `npm run typecheck`: 型チェック（下の「TypeScript」）。Vite は型を取り除いて動かすだけなので、型の間違いはこれで見つける
- `npm run build`: 公開用に `dist/` を作る。`npm run preview` で、公開と同じ `/mini-games/` の下で確かめられる
- 確認: `tools/headless.sh 'games/<game-id>/#smoke' 200000`（ゲームのスモークテスト）、`tools/headless.sh 'engine/test/' 20000`（engine のテスト）。開発サーバーが動いていなければ立てる
- アクセス解析: 公開したページには、ビルドが GA4 のタグを入れる（`vite.config.js` の `GA_ID`。公開先のホストで開いたときだけ動く）。ゲーム内の出来事は engine の `track()` で送る（engine/SPEC.md「アクセス解析」）
- 公開: master に push すると、Actions が型チェックとビルドをして GitHub Pages に出す（型エラーがあれば公開しない）。ビルドのたびに版番号が付き、キャッシュに残った古いページは最新版に切り替わる（engine/SPEC.md「キャッシュ対策」）

## TypeScript

- 型チェックは `tsconfig.json` の1本で、リポジトリ全体を厳しい設定（`strict: true`）で見る。`npm run typecheck` でエラー0を保つ
- 型の置き場所: engine の型は持ち主のモジュールから export する（`System`, `WorldObject`, `InputConfig`, `TouchLayoutConfig`, `LangPack` など）。ゲームの定義の型は `games/<id>/js/data/types.ts`
- あとから項目が増えるオブジェクト（敵やボス、弾）は、今は任意の項目を許す型（`[k: string]: any`）にしている。さらに固くするときは項目を書き並べて、これを外す
- `$()` は戻り値が `any`。型を効かせたい所では `el<T>()` か `querySelector<T>()` を使う
- 言語ファイルが後から埋める項目（名前・説明文など）は型では省略可能になっている。表示時に必ず入っているものは `!` で受けている

## 仕様書のルール

各ゲームの仕様（数値・ルール・操作）は `games/<game-id>/SPEC.md` にまとめる。仕様を変えたら同じコミットで SPEC.md も更新する。

## 更新履歴のルール

`updates.html` は公開のたびに GitHub Actions（`.github/workflows/pages.yml`）が生成する。手で編集しない。

- 遊ぶ人に関係する変更（追加・調整・修正）のコミットには、メッセージの末尾に次の行を書く（1変更1行）

  ```
  Changelog: 調整 | ショットガンの押し返しは1発につき1回に
  ```

  種類は `追加` / `調整` / `修正` のどれか。リファクタや開発用の変更には書かない
- 生成スクリプト（`tools/build_updates.py`）は、`updates.html` に `<!-- updates:start` の目印があるゲームを全部処理する。Actions の実行履歴から公開の時刻（JST）と head のコミットを取り、`Changelog:` 行を push ごとにまとめる。対象はそのゲームのフォルダを触ったコミットだけ
- 2026-09-27 22:35 までの分は `updates-archive.json` に手書きで固定してある
- 生成に失敗しても公開は止めない（コミット済みのページがそのまま出る）
- 手元で `python3 tools/build_updates.py` を実行すると過去分だけで作る（`GITHUB_TOKEN` を渡すと実行履歴も読む）

## ゲームの追加手順

1. `games/<game-id>/index.html` と入口の `main.ts` を置く（`<script type="module" src="./main.ts">`）。engine は `../../engine/...` から import する。版番号を使うなら `<meta name="build" content="dev">` を入れる（ビルドが書き換える）
2. `index.html` の `<ul class="games">` に `<li>` を1つ足す
3. ゲーム側に一覧へ戻るリンク `<a href="../../">` を入れておく
4. 更新履歴を付けるなら、`games/sector-dive/updates.html` を参考に `updates.html` を置く（`<!-- updates:start -->` と `<!-- updates:end -->` の目印を入れる）。ゲームのフォルダの `.html` はビルドに自動で入る
5. master に push すると GitHub Actions がビルドして GitHub Pages に公開する
6. 2本目以降のゲームは、生成スクリプトをそのゲームで試していない。最初の push のあと、Actions の「各ゲームの更新履歴を生成」が成功しているか、新しいゲームの `updates.html` に `Changelog:` 行が載っているか、既存のゲームの履歴にまぎれていないかを確かめる

## ゲーム一覧

| ID | 名前 | 概要 |
|----|------|------|
| sector-dive | Sector Dive | ランダム生成ローグライトFPS（Three.ts、スマホ対応）。仕様: [SPEC.md](games/sector-dive/SPEC.md) |
