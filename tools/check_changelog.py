#!/usr/bin/env python3
"""PR のコミットに Changelog 行の書き忘れがないかを確かめる（.github/workflows/changelog.yml から呼ぶ）。

  python3 tools/check_changelog.py <base> <head>

<base>..<head> のコミット（マージコミットは除く）のうち、ゲームのフォルダ（games/<game-id>/）を触ったものは、
メッセージに次のどれかの行が要る。
- `Changelog: 追加|調整|修正 | 本文`  更新履歴に載る（tools/build_updates.py が拾う）
- `Changelog: なし`                   遊ぶ人に関係しない変更（リファクタ・テスト・仕様書だけ等）。更新履歴には載らない
開発用のコード（js/dev/）と Markdown（SPEC.md など）だけを触ったコミットは対象外。
"""
import re, subprocess, sys

LINE = re.compile(r'^Changelog:\s*(?:(追加|調整|修正)\s*\|\s*\S.*|なし\s*)$', re.M)
GAME = re.compile(r'^games/[^/]+/')
EXEMPT = re.compile(r'(^games/[^/]+/js/dev/|\.md$)')


def git(*args):
    return subprocess.run(['git', *args], capture_output=True, text=True, check=True).stdout


def main():
    base, head = sys.argv[1], sys.argv[2]
    missing = []
    for sha in git('rev-list', '--no-merges', '--reverse', f'{base}..{head}').split():
        files = git('show', '--format=', '--name-only', sha).split('\n')
        if not any(GAME.match(f) and not EXEMPT.search(f) for f in files if f):
            continue
        if not LINE.search(git('log', '-1', '--format=%B', sha)):
            missing.append(sha[:7] + ' ' + git('log', '-1', '--format=%s', sha).strip())
    if missing:
        print('Changelog 行のないコミットがあります（README の「更新履歴のルール」）:')
        for m in missing:
            print('  ' + m)
        print('遊ぶ人に関係する変更なら `Changelog: 追加|調整|修正 | 本文`、そうでなければ `Changelog: なし` を書いてください。')
        sys.exit(1)
    print('ok')


if __name__ == '__main__':
    main()
