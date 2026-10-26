# このリポジトリで OpenCode が作業するとき

OpenCode は、Claude が書いたタスク票（`.tasks/<ブランチ名>.md`）に沿って実装する役。計画・レビュー・コミット・PR は Claude が受け持つ。Claude 向けの決まりは CLAUDE.md にあるが、OpenCode はこのファイルと STYLE.md（`opencode.json` の `instructions` で読み込む）に従う。

## やること

- タスク票に書かれた変更だけを行う。票にない改善やリファクタはしない
- 読むのは票で指定されたファイルと範囲。それ以外は必要になったときだけ読む
  - SPEC.md（`games/<game-id>/SPEC.md`）は数万字あるので丸ごと読まない。`grep -n '^#'` で見出しを出すか、用語で grep して、関係する所だけを読む
- 数値・ルール・操作・表示を変えたら、`games/<game-id>/SPEC.md` の対応する記述も直す
- コードを書いたら `npm run format` で整える
- 終わったら票の完了条件のコマンドを流す
  - `npm test` は出力が長いので、ファイルに書いて末尾だけを見る: `npm test > "${TMPDIR:-/tmp}/test.log" 2>&1; tail -n 15 "${TMPDIR:-/tmp}/test.log"`。失敗したら `grep -n FAIL` で場所を探す
- 結果は `.tasks/<ブランチ名>.result.md` に書く（変えたファイル、完了条件それぞれの結果、決められなかったこと）

## やらないこと

- commit・push・ブランチの切り替え・PR の作成（`opencode.json` でも止めている）
- 仕様がはっきりしない所を推測で埋めること。そこで止めて、result に書く
- バランスの数値（敵・ボス・武器・チップの強さ、体力や被ダメージ）を票の指定から変えること
- `.tasks/` 以外の場所にメモや一時ファイルを残すこと
