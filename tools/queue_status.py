#!/usr/bin/env python3
"""Write the state of the tickets (.tasks/) as one Markdown page, to look at away from the machine.

When the queue gave up (tools/run_queue.sh logged "…止める", e.g. OpenCode's usage ran out), the page starts with that
line, so it is noticed from the phone. The page lists each ticket with what it is about and where it stands (waiting / running / to review / sent back /
PR #n), the open PRs, the drafts and the last lines of the queue's log. .tasks/ is not committed, so this page is how
the state is seen from elsewhere (the Obsidian vault the page is written into syncs to the phone).

  python3 tools/queue_status.py                 # print it
  python3 tools/queue_status.py --out <file>    # write it (tools/run_queue.sh does this when QUEUE_STATUS_FILE is set)

The open PRs come from `gh pr list`; without gh (or offline) that part is left out.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
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


def last_log_lines(log: Path) -> tuple[dict[str, str], dict[str, str]]:
    # the latest line of the queue's log for each ticket number ("11-08 01:04:20 票870: ..."),
    # apart for the implementation and the first review (their own logs and outcomes)
    impl: dict[str, str] = {}
    review: dict[str, str] = {}
    if log.exists():
        for line in log.read_text(encoding="utf-8").splitlines():
            m = re.match(r"\S+ \S+ 票(\d+):\s*(.*)", line)
            if not m:
                continue
            if lane_of(m.group(2)) == "review":
                review[m.group(1)] = m.group(2)
            else:
                impl[m.group(1)] = m.group(2)
    return impl, review


def queue_kinds(queue: Path) -> dict[str, list[str]]:
    # the lane of each queued ticket, from the marker at the end of its line (no marker: @browser)
    kinds: dict[str, list[str]] = {}
    if queue.exists():
        for line in queue.read_text(encoding="utf-8").splitlines():
            line = line.split("#", 1)[0].strip()
            if not line:
                continue
            tokens = line.split()
            kind = "browser"
            for token in tokens[1:]:
                if token in ("@browser", "@node", "@review"):
                    kind = token[1:]
            names = kinds.setdefault(tokens[0], [])
            if kind not in names:
                names.append(kind)
    return kinds


def lane_of(message: str) -> str | None:
    m = re.search(r"レーン (browser|node|review)", message)
    return m.group(1) if m else None


def lane_cap(kind: str) -> str:
    if kind == "browser":
        return "1本ずつ"
    var = "NODE_LANES" if kind == "node" else "REVIEW_LANES"
    try:
        count = int(os.environ.get(var, "3"))
    except ValueError:
        count = 3
    return f"{count}本まで"


def stop_line(log: Path) -> str:
    # tools/run_queue.sh writes "---- 開始 ----" / "---- 終わり ----" around a run and "…止める" when it gives up.
    # When the latest of those is a stop, the queue is not running any more and someone should look; return that line
    if not log.exists():
        return ""
    last = ""
    for line in log.read_text(encoding="utf-8").splitlines():
        if "---- 開始 ----" in line or "---- 終わり ----" in line:
            last = ""
        elif "止める" in line and "ほかのレーンは続ける" not in line:
            # (a stop of one ticket's lane is not a stop of the queue: its line says the other lanes go on)
            last = line
    return last


def state_of(
    root: Path,
    num: str,
    name: str,
    queued: set[str],
    latest: dict[str, str],
    prs: dict[str, dict],
    latest_review: dict[str, str] | None = None,
) -> str:
    branch = branch_of(name)
    if branch in prs:
        return f"PR #{prs[branch]['number']}"
    tasks = root / ".tasks"
    copies = [tasks / f"{name}.md", root / ".wt" / f"t{num}" / ".tasks" / f"{name}.md"]
    sent_back = any(p.exists() and "差し戻し" in p.read_text(encoding="utf-8") for p in copies)
    done = (tasks / f"{name}.result.md").exists()
    log = latest.get(num, "")
    # Claude took the ticket over (tools/queue_mark.sh)
    if log.startswith("Claude が回している"):
        return "Claude が回している"
    if log.startswith("Claude が回した"):
        return "レビュー待ち"
    # a review was started on it: by hand (tools/queue_mark.sh reviewing, a line without a lane) or by the queue's
    # @review lane (a "回す" / "起動" line of the review lane, kept apart in latest_review). Not while the implementation runs
    review_log = (latest_review or {}).get(num, "")
    if log.startswith("レビュー中") or (review_log.startswith(("回す", "起動", "混雑で止まった")) and not log.startswith(("回す", "起動"))):
        return "レビュー中"
    if sent_back and not log.startswith(("回す", "起動", "混雑で止まった")):
        return "差し戻し中"
    if log.startswith(("回す", "起動", "混雑で止まった")):
        return "回している"
    # the log says "止まった（レーン …）" for a stopped ticket and "…止める" when a step gave up. A line that only
    # mentions waiting ("混雑で止まったので、…待って続きから回す") is not a stop, and "実装の result が無いので…" is only
    # the review's own line and is not a stop of the ticket
    # ("土台の票N が回らないので回さない" は、土台が止まって回せなかった票。待ちではなく止まりに出す)
    if (
        log.startswith("止まった")
        or ("止める" in log and not log.startswith("実装の result が無い"))
        or "が回らないので回さない" in log
    ):
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
    kinds = queue_kinds(queue)
    latest, latest_review = last_log_lines(tasks / "queue.log")
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
    ]
    stopped = stop_line(tasks / "queue.log")
    if stopped:
        out += [
            "## キューが止まっている",
            "",
            f"> {stopped}",
            "",
            "ログと作業ツリーを確かめてから、`tools/run_queue.sh` を回し直す。",
            "",
        ]
    out += [
        "## 票",
        "",
    ]
    if tickets:
        out += ["| 番号 | レーン | 状態 | 内容 |", "| --- | --- | --- | --- |"]
        for p in tickets:
            name = p.name[:-3]
            num = name.split("-", 1)[0]
            lane = lane_of(latest.get(num, "")) or "/".join(kinds.get(num, [])) or "-"
            out.append(f"| {num} | {lane} | {state_of(root, num, name, queued, latest, prs, latest_review)} | {title_of(p)} |")
    else:
        out.append("票は無い。")

    running: dict[str, list[str]] = {"browser": [], "node": [], "review": []}
    for p in tickets:
        name = p.name[:-3]
        num = name.split("-", 1)[0]
        impl = latest.get(num, "")
        rev = latest_review.get(num, "")
        if impl.startswith(("回す", "起動", "混雑で止まった")):
            lane = lane_of(impl) or (kinds.get(num) or ["browser"])[-1]
            running.setdefault(lane, []).append(num)
        if rev.startswith(("回す", "起動", "混雑で止まった")):
            running["review"].append(num)
    out += ["", "## レーン（今回っている票）", ""]
    for kind in ("browser", "node", "review"):
        nums = running.get(kind, [])
        shown = "、".join(f"票{n}" for n in nums) if nums else "なし"
        out.append(f"- {kind}（{lane_cap(kind)}）: {shown}")

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
        out = Path(args.out)
        # write beside it and rename, so a reader (the phone) never sees a half page
        # (the name has the PID: run_queue.sh and queue_mark.sh may write at the same time)
        tmp = out.with_name(f"{out.name}.{os.getpid()}.tmp")
        tmp.write_text(page, encoding="utf-8")
        tmp.replace(out)
    else:
        print(page, end="")


if __name__ == "__main__":
    main()
