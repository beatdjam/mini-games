#!/usr/bin/env python3
"""文書（SPEC.md・README.md など）を読みやすく組み直したときに、書いてあったことが落ちていないかを確かめる。

    python3 tools/check_doc_facts.py [比べる先] [ファイル ...]

Markdown のファイルごとに、比べる先（指定しなければ origin/master）の版と比べて、次のものが減っていないかを出す。
ファイルを指定しなければ、比べる先から変わった .md を全部見る。

- バッククォートの中（関数・ファイル・キー・値の名前）
- バッククォートの外に書いた src/ のパス
- 数値（番号付きの箇条の番号は数えない）
- 理由（「ため」）

1か所にまとめた・同じことを2回書いていたのを1回にした、というものも「減った」と出る。出たものは1つずつ見て、
意図して減らしたものは PR の説明に理由を書く。減ったものがあれば終了コード 1。
"""
import re
import subprocess
import sys
from collections import Counter

LIST_NUMBER = re.compile(r'^\s*\d+\.\s', re.M)  # 番号付きの箇条の頭の「1. 」
CODE = re.compile(r'`([^`\n]+)`')
PATH = re.compile(r'(?<![`\w/])src/[\w./-]+')
NUMBER = re.compile(r'\d+(?:\.\d+)?')


def facts(text: str) -> dict:
    plain = CODE.sub(' ', text)  # （バッククォートの中の数値とパスは、コードとして数える）
    return {
        'code': Counter(CODE.findall(text)),
        'path': Counter(p.rstrip('.') for p in PATH.findall(plain)),
        'number': Counter(NUMBER.findall(LIST_NUMBER.sub('', plain))),
        'reason': Counter({'ため': plain.count('ため')}),
    }


def git(*args: str) -> str:
    return subprocess.run(['git', *args], capture_output=True, text=True, check=True).stdout


def main() -> int:
    args = sys.argv[1:]
    base = args.pop(0) if args and not args[0].endswith('.md') else 'origin/master'
    files = args or [f for f in git('diff', '--name-only', base, '--', '*.md').split() if f]
    fewer_any = False
    for f in files:
        try:
            before = git('show', f'{base}:{f}')
        except subprocess.CalledProcessError:
            continue  # （新しいファイル: 減るものが無い）
        with open(f, encoding='utf-8') as fh:
            after = fh.read()
        fb, fa = facts(before), facts(after)
        lines = []
        for kind in fb:
            lost = fb[kind] - fa[kind]
            if lost:
                lines.append(f'  {kind}: ' + ', '.join(f'{k} x{n}' if n > 1 else k for k, n in sorted(lost.items())))
        print(f'{f}: ' + ('減ったものがある' if lines else '減ったものは無い'))
        for line in lines:
            print(line)
        fewer_any = fewer_any or bool(lines)
    return 1 if fewer_any else 0


if __name__ == '__main__':
    sys.exit(main())
