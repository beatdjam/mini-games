# mini-games
自分用ミニゲーム集リポジトリ

公開ページ: https://beatdjam.github.io/mini-games/

## 構成

```
index.html                   トップページ（ゲーム一覧）
engine/src/                  ゲームをまたいで使うコア（ループ・描画・当たり判定・弾・音・入力・文言など。engine/SPEC.md）
engine/test/                 engine のテスト（Vitest）
games/<game-id>/test/        各ゲームのスモークテスト（Vitest）と、そのページの用意（setup.ts）
vitest.config.ts             テストの設定（Vitest のブラウザモード。Chromium で動かす）
vitest.build.config.ts       ビルドのテストの設定（Node で動かす）
games/<game-id>/index.html   各ゲームのページ。入口の src/main.ts を1つ読む
games/<game-id>/src/main.ts  入口。全モジュールを読み込み、最後に起動処理をする
games/<game-id>/src/         ゲームのモジュール（data・i18n・core・world・actors・flow・ui・dev）
games/<game-id>/SPEC.md      各ゲームの仕様書兼説明書
games/<game-id>/updates.html 更新履歴（公開ごと、Actions が生成）
public/                      名前を変えずにそのまま出すファイル（PWA の manifest とアイコン）
tools/                       文言キーとスタイルの確認、ビルドのテスト（build.test.ts）、更新履歴の生成と Changelog 行の確認
vite.config.js               開発サーバーとビルドの設定
eslint.config.js             ESLint の設定（値の変え方の決まり。npm run lint が流す）
CLAUDE.md                    Claude Code が作業時に守る決まり（コミット前の確認、サブエージェントへの振り分け）
STYLE.md                     コードと文書の書き方の決まり（型・名前の付け方・文言・テストなど。一部は npm run lint で確認）
.claude/agents/              Claude Code のサブエージェント（worker: 決まった変更の実行、scout: 調べるだけ）
.github/workflows/pages.yml  GitHub Pages への公開（テストとビルドをして dist/ を出す）
.github/workflows/changelog.yml  PR の Changelog 行の確認
.github/workflows/checks.yml PR ごとの確認（型チェック・lint・テスト・ビルド。公開ジョブと同じ）
```

## 開発

- TypeScript の ES モジュール（import / export）＋ Vite。three.js は npm の `three`（0.128.0 に固定、型は `@types/three`）
- Node は 24（`.nvmrc`。CI も同じ版を使う）。22.12 以上なら動く（`package.json` の `engines`）
- 最初に `npm install`
- `npm run dev`: 開発サーバー（http://localhost:8765/）。ファイルを保存すればブラウザに反映される
- `npm run typecheck`: 型チェック（`tsconfig.json` の1本でリポジトリ全体を見る。型の決まりは STYLE.md）。Vite は型を取り除いて動かすだけなので、型の間違いはこれで見つける
- `npm run lint`: コードの書式（Prettier。`npm run format` で整える）と、ESLint（`eslint.config.js`。変えない値は `const`、1つの文で代入は1つ、引数へ代入しない）と、STYLE.md の決まりのうち機械で確かめられるもの（`tools/check_style.js`）と、全ゲームの文言キーの照合（`tools/check_i18n.js`）
- `npm run build`: 公開用に `dist/` を作る。`npm run preview` で、公開と同じ `/mini-games/` の下で確かめられる
- `npm test`: engine のテストと、各ゲームのスモークテスト（`games/<game-id>/test/`）を Vitest で流す。Chromium の中で動かし、テスト1件ずつが結果に出る。どれか失敗すると終了コード1。Chrome の場所は `CHROME=...` で指定する（無ければ Playwright のもの）
- `npm run test:engine`: engine のテストだけ（`vitest run --project engine`。`npx vitest` なら変更を見張って流し直す）
- `npm run test:build`: 公開用のビルドを `dist-test/` へ作り、全ゲームについて、版番号が `version.json` と合うこと、GA のタグが入っていること、Chromium でページを開いてエラーが出ず拠点画面が出ることを確かめる（`tools/build.test.ts`）
- 確認用のコード（各ゲームの `src/dev/`：`#view-…` などのフック）は、開発サーバーにだけ入る。公開用のビルド（`npm run build`）には入らない
- アクセス解析: 公開したページには、ビルドが GA4 のタグを入れる（`vite.config.js` の `GA_ID`。公開先のホストで開いたときだけ動く）。ゲーム内の出来事は engine の `track()` で送る（engine/SPEC.md「アクセス解析」）。GA の利用規約に沿って、`privacy.html`（プライバシーポリシー）をトップと各ゲームの設定から開けるようにしておく。送る内容の種類を増やしたら、この文面も見直す
- PR を作ると、Actions（`checks.yml`）が型チェック・lint・テスト（`npm test` と `npm run test:build`）・ビルドを流す。マージの前に、ここが通っていることを確かめる。テストの結果は Actions の実行画面のサマリに出て、JUnit と HTML のレポート（`test-results/`）は実行結果の Artifacts（`test-report`）からダウンロードできる
- 公開: master に push すると、Actions が同じ確認をもう一度してから GitHub Pages に出す（どれかが失敗すれば公開しない）。ビルドのたびに版番号が付き、キャッシュに残った古いページは最新版に切り替わる（engine/SPEC.md「キャッシュ対策」）

## 更新履歴のルール

`updates.html` は公開のたびに GitHub Actions（`.github/workflows/pages.yml`）が生成する。手で編集しない。

- 遊ぶ人に関係する変更（追加・調整・修正）のコミットには、メッセージの末尾に次の行を書く（1変更1行）

  ```
  Changelog: 調整 | ショットガンの押し返しは1発につき1回に
  ```

  種類は `追加` / `調整` / `修正` のどれか。リファクタ・テスト・開発用など遊ぶ人に関係しない変更には `Changelog: なし` と書く（更新履歴には載らない）
- 書き忘れは PR の CI（`.github/workflows/changelog.yml` → `tools/check_changelog.py`）で止まる。ゲームのフォルダ（`games/<game-id>/`）を触ったコミットに、どちらの行もなければ失敗する。開発用のコード（`src/dev/`）と Markdown だけのコミットは対象外
- 生成スクリプト（`tools/build_updates.py`）は、`updates.html` に `<!-- updates:start` の目印があるゲームを全部処理する。Actions の実行履歴から公開の時刻（JST）と head のコミットを取り、`Changelog:` 行を push ごとにまとめる。対象はそのゲームのフォルダを触ったコミットだけ
- 2026-09-27 22:35 までの分は `updates-archive.json` に手書きで固定してある
- 生成に失敗しても公開は止めない（コミット済みのページがそのまま出る）
- 手元で `python3 tools/build_updates.py` を実行すると過去分だけで作る（`GITHUB_TOKEN` を渡すと実行履歴も読む）

## ゲームの追加手順

1. `games/<game-id>/index.html` と入口の `src/main.ts` を置く（`<script type="module" src="./src/main.ts">`）。engine は `@engine/...`（`engine/src/` の別名）から import する。版番号を使うなら `<meta name="build" content="dev">` を入れる（ビルドが書き換える）
2. `index.html` の `<ul class="games">` に `<li>` を1つ足す
3. ゲーム側に一覧へ戻るリンク `<a href="../../">` を入れておく
4. 更新履歴を付けるなら、`games/sector-dive/updates.html` を参考に `updates.html` を置く（`<!-- updates:start -->` と `<!-- updates:end -->` の目印を入れる）。ゲームのフォルダの `.html` はビルドに自動で入る
5. master に push すると GitHub Actions がビルドして GitHub Pages に公開する
6. 2本目以降のゲームは、生成スクリプトをそのゲームで試していない。最初の push のあと、Actions の「各ゲームの更新履歴を生成」が成功しているか、新しいゲームの `updates.html` に `Changelog:` 行が載っているか、既存のゲームの履歴にまぎれていないかを確かめる

## ゲーム一覧

| ID | 名前 | 概要 |
|----|------|------|
| sector-dive | Sector Dive | ランダム生成ローグライトFPS（three.js、スマホ対応）。仕様: [SPEC.md](games/sector-dive/SPEC.md) |
