# このリポジトリで作業するとき

詳しいルールは README.md。コミットの前に必ず次を守る。

- **更新履歴**: ゲームのフォルダ（`games/<game-id>/`）を触るコミットには、メッセージの末尾に `Changelog:` 行を書く（1変更1行）
  - 遊ぶ人に関係する変更: `Changelog: 追加|調整|修正 | 本文`（本文は遊ぶ人向けの日本語。更新履歴のページにそのまま載る）
  - 関係しない変更（リファクタ・テスト・開発用）: `Changelog: なし`（更新履歴には載らない）
  - 書き忘れは PR の CI（`.github/workflows/changelog.yml`）で止まる。`python3 tools/check_changelog.py origin/master HEAD` で手元でも確かめられる
- **仕様書**: 数値・ルール・操作・表示を変えたら、同じコミットで `games/<game-id>/SPEC.md` も直す
- **確認**: `npx tsc --noEmit`、`node tools/check_i18n.js games/<game-id>`、`npm test`（Chrome は `CHROME=` で指定）を通してから push する
- **PR**: 1つの修正・調整につき1本。マージはユーザーがする
