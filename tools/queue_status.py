#!/usr/bin/env python3
"""Write the state of the tickets (.tasks/) as one Markdown page, to look at away from the machine.

The page lists each ticket with what it is about and where it stands (waiting / running / to review / sent back /
PR #n), the open PRs, the drafts and the last lines of the queue's log. .tasks/ is not committed, so this page is how
the state is seen from elsewhere (the Obsidian vault the page is written into syncs to the phone).

  python3 tools/queue_status.py                 # print it
  python3 tools/queue_status.py --out <file>    # write it (tools/run_queue.sh does this when QUEUE_STATUS_FILE is set)

The open PRs come from `gh pr list`; without gh (or offline) that part is left out.
"""

import argparse
import datetime
import json
import re
import subprocess
from pathlib import Path

LOG_TAIL = 8  # lines of .tasks/queue.log shown at the end
JST = datetime.timezone(datetime.timedelta(hours=9))


def repo_root() -> Path:
    # the main checkout, also when run from a worktree (.tasks/ lives there)
    common = subprocess.run(
        ["git", "-C", str(Path(__file__).parent), "rev-parse", "--path-format=absolute", "--git-common-dir"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    return Path(common).parent


def title_of(path: Path) -> str:
    try:
        first = path.read_text(encoding="utf-8").splitlines()[0]
    except (OSError, IndexError):
        return ""
    return re.sub(r"^#\s*(タスク:\s*)?", "", first).strip()


def branch_of(name: str) -> str:
    # "870-perf-sdx-court-rails-instanced" -> "perf/sdx-court-rails-instanced" (CLAUDE.md: the ticket's name is the
    # branch's with "/" made "-")
    rest = name.split("-", 1)[1] if "-" in name else name
    return rest.replace("-", "/", 1)


def open_prs(root: Path) -> list[dict]:
    try:
        out = subprocess.run(
            ["gh", "pr", "list", "--state", "open", "--json", "number,title,headRefName,isDraft,url"],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []
    if out.returncode != 0:
        return []
    try:
        return json.loads(out.stdout)
    except json.JSONDecodeError:
        return []


def last_log_lines(log: Path) -> dict[str, str]:
    # the latest line of the queue's log for each ticket number ("11-08 01:04:20 票870: ...")
    latest: dict[str, str] = {}
    if log.exists():
        for line in log.read_text(encoding="utf-8").splitlines():
            m = re.match(r"\S+ \S+ 票(\d+):\s*(.*)", line)
            if m:
                latest[m.group(1)] = m.group(2)
    return latest


def state_of(root: Path, num: str, name: str, queued: set[str], latest: dict[str, str], prs: dict[str, dict]) -> str:
    branch = branch_of(name)
    if branch in prs:
        return f"PR #{prs[branch]['number']}"
    tasks = root / ".tasks"
    copies = [tasks / f"{name}.md", root / ".wt" / f"t{num}" / ".tasks" / f"{name}.md"]
    sent_back = any(p.exists() and "差し戻し" in p.read_text(encoding="utf-8") for p in copies)
    done = (tasks / f"{name}.result.md").exists()
    log = latest.get(num, "")
    if sent_back and not log.startswith(("回す", "起動")):
        return "差し戻し中"
    if log.startswith(("回す", "起動")):
        return "回している"
    if "止める" in log or "result が無い" in log:
        return "止まった"
    if done or "WIP" in log or "コードの変更なし" in log:
        return "レビュー待ち"
    if num in queued:
        return "キュー待ち"
    return "待ち"


def build(root: Path) -> str:
    tasks = root / ".tasks"
    queue = tasks / "queue.txt"
    order: list[str] = []
    if queue.exists():
        for line in queue.read_text(encoding="utf-8").splitlines():
            line = line.split("#", 1)[0].strip()
            if line:
                order.append(line.split()[0])
    queued = set(order)
    latest = last_log_lines(tasks / "queue.log")
    pr_list = open_prs(root)
    prs = {p["headRefName"]: p for p in pr_list}

    tickets = sorted(
        (p for p in tasks.glob("[0-9]*-*.md") if not re.search(r"\.(result|review-[a-z]+)\.md$", p.name)),
        key=lambda p: int(p.name.split("-", 1)[0]),
    )
    now = datetime.datetime.now(JST).strftime("%Y-%m-%d %H:%M")
    out = [
        "# mini-games の票の状態",
        "",
        f"`tools/queue_status.py` が書いたページ（{now} JST）。手で直さない。",
        "",
        "## 票",
        "",
    ]
    if tickets:
        out += ["| 番号 | 状態 | 内容 |", "| --- | --- | --- |"]
        for p in tickets:
            name = p.name[:-3]
            num = name.split("-", 1)[0]
            out.append(f"| {num} | {state_of(root, num, name, queued, latest, prs)} | {title_of(p)} |")
    else:
        out.append("票は無い。")

    out += ["", "## 開いている PR", ""]
    if not pr_list:
        out.append("無い（または gh で取れなかった）。")
    for p in sorted(pr_list, key=lambda p: p["number"]):
        draft = "（Draft）" if p.get("isDraft") else ""
        out.append(f"- [#{p['number']}]({p['url']}) {p['title']}{draft}")

    drafts = sorted((tasks / "draft").glob("*.md")) if (tasks / "draft").exists() else []
    out += ["", "## 下書き（票に上げる前・保留）", ""]
    if drafts:
        for p in drafts:
            text = p.read_text(encoding="utf-8")
            hold = "（保留）" if "## 保留" in text else ""
            out.append(f"- `{p.name}` {title_of(p)}{hold}")
    else:
        out.append("無い。")

    log = tasks / "queue.log"
    if log.exists():
        tail = log.read_text(encoding="utf-8").splitlines()[-LOG_TAIL:]
        out += ["", "## キューのログ（最後の数行）", "", "```", *tail, "```"]
    return "\n".join(out) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", help="write the page to this file instead of printing it")
    args = ap.parse_args()
    page = build(repo_root())
    if args.out:
        Path(args.out).write_text(page, encoding="utf-8")
    else:
        print(page, end="")


if __name__ == "__main__":
    main()
