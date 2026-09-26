# mini-games
自分用ミニゲーム集リポジトリ

公開ページ: https://beatdjam.github.io/mini-games/

## 構成

```
index.html                  トップページ（ゲーム一覧）
games/<game-id>/index.html  各ゲームの入口
games/<game-id>/SPEC.md     各ゲームの仕様書兼説明書
.nojekyll                   GitHub PagesでJekyll処理をしない
```

## 仕様書のルール

各ゲームの仕様（数値・ルール・操作）は `games/<game-id>/SPEC.md` にまとめる。仕様を変えたら同じコミットで SPEC.md も更新する。

## ゲームの追加手順

1. `games/<game-id>/index.html` を置く（外部ライブラリはCDNから読み込む）
2. `index.html` の `<ul class="games">` に `<li>` を1つ足す
3. ゲーム側に一覧へ戻るリンク `<a href="../../">` を入れておく
4. master に push すると GitHub Pages に反映される

## ゲーム一覧

| ID | 名前 | 概要 |
|----|------|------|
| sector-dive | Sector Dive | ランダム生成ローグライトFPS（Three.js、スマホ対応）。仕様: [SPEC.md](games/sector-dive/SPEC.md) |
