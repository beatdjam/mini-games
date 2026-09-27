# mini-games
自分用ミニゲーム集リポジトリ

公開ページ: https://beatdjam.github.io/mini-games/

## 構成

```
index.html                  トップページ（ゲーム一覧）
games/<game-id>/index.html  各ゲームの入口
games/<game-id>/SPEC.md     各ゲームの仕様書兼説明書
games/<game-id>/updates.html 更新履歴（公開ごと、Actions が生成）
.github/workflows/pages.yml GitHub Pages への公開
.nojekyll                   GitHub PagesでJekyll処理をしない
```

## 仕様書のルール

各ゲームの仕様（数値・ルール・操作）は `games/<game-id>/SPEC.md` にまとめる。仕様を変えたら同じコミットで SPEC.md も更新する。

## 更新履歴のルール

`updates.html` は公開のたびに GitHub Actions（`.github/workflows/pages.yml`）が生成する。手で編集しない。

- 遊ぶ人に関係する変更（追加・調整・修正）のコミットには、メッセージの末尾に次の行を書く（1変更1行）

  ```
  Changelog: 調整 | ショットガンの押し返しは1発につき1回に
  ```

  種類は `追加` / `調整` / `修正` のどれか。リファクタや開発用の変更には書かない
- 生成スクリプト（`games/<game-id>/tools/build_updates.py`）は、Actions の実行履歴から公開の時刻（JST）と head のコミットを取り、`Changelog:` 行を push ごとにまとめる。対象はそのゲームのフォルダを触ったコミットだけ
- 2026-09-27 22:35 までの分は `updates-archive.json` に手書きで固定してある
- 手元で `python3 games/sector-dive/tools/build_updates.py` を実行すると過去分だけで作る（`GITHUB_TOKEN` を渡すと実行履歴も読む）

## ゲームの追加手順

1. `games/<game-id>/index.html` を置く（外部ライブラリはCDNから読み込む）
2. `index.html` の `<ul class="games">` に `<li>` を1つ足す
3. ゲーム側に一覧へ戻るリンク `<a href="../../">` を入れておく
4. master に push すると GitHub Actions が GitHub Pages に公開する

## ゲーム一覧

| ID | 名前 | 概要 |
|----|------|------|
| sector-dive | Sector Dive | ランダム生成ローグライトFPS（Three.js、スマホ対応）。仕様: [SPEC.md](games/sector-dive/SPEC.md) |
