#!/usr/bin/env python3
"""各ゲームの更新履歴ページ（games/<game-id>/updates.html）を生成する。

対象は updates.html に `<!-- updates:start` の目印があるゲーム全部。
- 過去分: games/<game-id>/updates-archive.json（手書き、固定。無ければ無し）
- それ以降: コミットメッセージの `Changelog: 追加|調整|修正 | 本文` 行を、
  GitHub Pages の公開（ワークフローの実行）ごとにまとめる。そのゲームのフォルダを触ったコミットだけを見る
公開の時刻と head は GitHub Actions の実行履歴から取る。GITHUB_TOKEN が無いときは過去分だけで作る。
"""
import datetime, html, json, os, re, subprocess, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARK = '<!-- updates:start'
REPO = os.environ.get('GITHUB_REPOSITORY', 'beatdjam/mini-games')
# 旧来のブランチ公開（dynamic/pages/...）と、このリポジトリの公開ワークフロー
DEPLOY_PATHS = ('dynamic/pages/pages-build-deployment', '.github/workflows/pages.yml')
TAGS = {'追加': 'new', '調整': 'bal', '修正': 'fix'}
JST = datetime.timezone(datetime.timedelta(hours=9))
LINE = re.compile(r'^Changelog:\s*(追加|調整|修正)\s*\|\s*(.+?)\s*$', re.M)


def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True).stdout


def api(path):
    req = urllib.request.Request('https://api.github.com/repos/' + REPO + path, headers={
        'Authorization': 'Bearer ' + os.environ['GITHUB_TOKEN'],
        'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def deploys():
    """公開の一覧 [(JST時刻, head sha)]。古い順。"""
    runs, page = [], 1
    while True:
        d = api(f'/actions/runs?per_page=100&page={page}')
        runs += d['workflow_runs']
        if len(d['workflow_runs']) < 100:
            break
        page += 1
    me = os.environ.get('GITHUB_RUN_ID')
    seen, out = set(), []
    for r in sorted(runs, key=lambda r: r['created_at']):
        if r['path'] not in DEPLOY_PATHS or r['head_sha'] in seen:
            continue
        # 失敗した公開は飛ばす（その分のコミットは次の公開に入る）。実行中の自分自身は含める
        if r['conclusion'] != 'success' and str(r['id']) != me:
            continue
        seen.add(r['head_sha'])
        t = datetime.datetime.fromisoformat(r['created_at'].replace('Z', '+00:00')).astimezone(JST)
        out.append((t.strftime('%Y-%m-%d %H:%M'), r['head_sha']))
    return out


def reachable(sha):
    return subprocess.run(['git', 'cat-file', '-e', sha + '^{commit}'], cwd=ROOT, capture_output=True).returncode == 0


def changelog(game_path, prev, head):
    rng = f'{prev}..{head}' if prev else head
    log = git('log', '--reverse', '--format=%x1e%B', rng, '--', game_path)
    return [[m.group(1), m.group(2)] for body in log.split('\x1e') for m in LINE.finditer(body)]


def entries(game_path, deps):
    archive = os.path.join(ROOT, game_path, 'updates-archive.json')
    rel = json.load(open(archive, encoding='utf-8')) if os.path.exists(archive) else []  # 新しい順
    new, prev = [], None
    for t, sha in deps:
        if not reachable(sha):
            continue
        items = changelog(game_path, prev, sha)
        prev = sha
        if items:
            new.append({'time': t, 'sha': sha[:7], 'items': items})
    return new[::-1] + rel


def render(es):
    out, day = [], None
    for i, e in enumerate(es):
        d, hm = e['time'].split()
        if d != day:
            if day:
                out.append('  </div>\n')
            out.append(f'  <h2 class="day">{d}</h2>\n  <div class="list">\n')
            day = d
        cls = ' latest' if i == 0 else ''
        eid = 'u' + d.replace('-', '') + '-' + hm.replace(':', '')
        out.append(f'    <section class="release{cls}" id="{eid}">\n'
                   f'      <div class="rhead"><span class="date">{hm}</span><span class="sha">{e["sha"]}</span></div>\n'
                   '      <ul>\n')
        for tag, text in e['items']:
            out.append(f'        <li><span class="tag {TAGS[tag]}">{tag}</span>{html.escape(text, quote=False)}</li>\n')
        out.append('      </ul>\n    </section>\n')
    if day:
        out.append('  </div>\n')
    return ''.join(out)


def games():
    base = os.path.join(ROOT, 'games')
    for gid in sorted(os.listdir(base)):
        page = os.path.join(base, gid, 'updates.html')
        if os.path.exists(page) and MARK in open(page, encoding='utf-8').read():
            yield os.path.join('games', gid), page


def main():
    if os.environ.get('GITHUB_TOKEN'):
        deps = deploys()
    else:
        print('GITHUB_TOKEN が無いので過去分だけで作る', file=sys.stderr)
        deps = []
    for game_path, page in games():
        es = entries(game_path, deps)
        t = open(page, encoding='utf-8').read()
        a = t.index('-->', t.index(MARK)) + 4
        b = t.index('  <!-- updates:end -->')
        open(page, 'w', encoding='utf-8').write(t[:a] + render(es) + t[b:])
        print(f'{game_path}: {len(es)} 件', file=sys.stderr)


if __name__ == '__main__':
    main()
