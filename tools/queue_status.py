#!/usr/bin/env python3
"""Write the state of the tickets (.tasks/) as one Markdown page, to look at away from the machine.

When the queue gave up (tools/run_queue.sh logged "…止める", e.g. OpenCode's usage ran out), the page starts with that
line, so it is noticed from the phone. The page lists each ticket with what it is about and where it stands (waiting / running / to review / sent back /
PR #n), the open PRs, the drafts and the last lines of the queue's log. .tasks/ is not committed, so this page is how
the state is seen from elsewhere (the Obsidian vault the page is written into syncs to the phone).

  python3 tools/queue_status.py                 # print it
  python3 tools/queue_status.py --out <file>    # write it (tools/run_queue.sh does this when QUEUE_STATUS_FILE is set)

The state is inferred from what exists, not only from what was marked: the PRs (open ones and the last 50 merged ones,
tied to a ticket by the branch name or by "票<番号>" / "SB-<番号>" in the title or body), the queue's log and the worktrees
in .wt/ that have commits ahead of origin/master. The PRs come from `gh pr list`; without gh (or offline) that part is left out.
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


def gh_prs(root: Path, state: str, limit: int | None = None) -> list[dict]:
    cmd = ["gh", "pr", "list", "--state", state, "--json", "number,title,body,headRefName,isDraft,url,updatedAt"]
    if limit:
        cmd += ["--limit", str(limit)]
    try:
        out = subprocess.run(cmd, cwd=root, capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired):
        return []
    if out.returncode != 0:
        return []
    try:
        prs = json.loads(out.stdout)
    except json.JSONDecodeError:
        return []
    if not isinstance(prs, list):
        return []
    for p in prs:
        p["state"] = state
    return prs


def open_prs(root: Path) -> list[dict]:
    return gh_prs(root, "open")


def merged_prs(root: Path) -> list[dict]:
    return gh_prs(root, "merged", 50)


def pr_for(num: str, name: str, prs: list[dict]) -> dict | None:
    # a PR is the ticket's when its branch is the ticket's branch, or its title / body names the ticket ("票1850", "SB-1850")
    branch = branch_of(name)
    ref = re.compile(rf"(票|SB-){re.escape(num)}(?!\d)")
    found = [
        p
        for p in prs
        if p.get("headRefName") == branch or ref.search(f"{p.get('title') or ''}\n{p.get('body') or ''}")
    ]
    if not found:
        return None
    # merged first, then the newest
    return max(found, key=lambda p: (p["state"] == "merged", p.get("updatedAt") or "", p["number"]))


def parse_utc(text: str) -> datetime.datetime | None:
    try:
        return datetime.datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def log_times(log: Path) -> dict[str, datetime.datetime]:
    # when the latest line of each ticket was written ("11-08 01:04:20 票870: ...": no year, JST)
    times: dict[str, datetime.datetime] = {}
    if not log.exists():
        return times
    now = datetime.datetime.now(JST)
    for line in log.read_text(encoding="utf-8").splitlines():
        m = re.match(r"(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d) 票(\d+):", line)
        if not m:
            continue
        mo, d, h, mi, sec = (int(m.group(i)) for i in range(1, 6))
        try:
            t = datetime.datetime(now.year, mo, d, h, mi, sec, tzinfo=JST)
        except ValueError:
            continue
        if t > now + datetime.timedelta(days=1):  # a line of the last year
            t = t.replace(year=now.year - 1)
        times[m.group(6)] = t
    return times


def worktrees(root: Path) -> list[tuple[Path, str]]:
    # the worktrees with commits ahead of origin/master: (path, branch or folder name)
    try:
        out = subprocess.run(
            ["git", "-C", str(root), "worktree", "list", "--porcelain"], capture_output=True, text=True, timeout=30
        )
    except (OSError, subprocess.TimeoutExpired):
        return []
    if out.returncode != 0:
        return []
    found: list[tuple[Path, str]] = []
    for block in out.stdout.split("\n\n"):
        path = branch = ""
        for line in block.splitlines():
            if line.startswith("worktree "):
                path = line[len("worktree ") :]
            elif line.startswith("branch "):
                branch = re.sub(r"^refs/heads/", "", line[len("branch ") :])
        if not path or Path(path) == root:
            continue
        try:
            ahead = subprocess.run(
                ["git", "-C", path, "rev-list", "--count", "origin/master..HEAD"],
                capture_output=True,
                text=True,
                timeout=30,
            )
        except (OSError, subprocess.TimeoutExpired):
            continue
        if ahead.returncode == 0 and ahead.stdout.strip().isdigit() and int(ahead.stdout.strip()) > 0:
            found.append((Path(path), branch or Path(path).name))
    return found


def working_branch(num: str, trees: list[tuple[Path, str]]) -> str:
    ref = re.compile(rf"(?<!\d){re.escape(num)}(?!\d)")
    for path, branch in trees:
        if ref.search(branch) or ref.search(path.name):
            return branch
    return ""


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
    prs: list[dict],
    latest_review: dict[str, str] | None = None,
    times: dict[str, datetime.datetime] | None = None,
    trees: list[tuple[Path, str]] | None = None,
) -> str:
    pr = pr_for(num, name, prs)
    if pr:
        label = f"済み（#{pr['number']} マージ）" if pr["state"] == "merged" else f"PR #{pr['number']}"
        # the queue's log wins when its line is newer than the PR (e.g. sent back after the PR and run again)
        log_time = (times or {}).get(num)
        pr_time = parse_utc(pr.get("updatedAt") or "")
        if log_time and pr_time and log_time > pr_time:
            newer = state_of(root, num, name, queued, latest, [], latest_review, times, None)
            if newer in ("Claude が回している", "レビュー中", "回している"):
                return newer
        return label
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
    # a worktree of the ticket with commits ahead of origin/master, and no PR yet: someone is on it
    work = working_branch(num, trees or [])
    if work:
        return f"作業中（{work}）"
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
    prs = pr_list + merged_prs(root)
    times = log_times(tasks / "queue.log")
    trees = worktrees(root)

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
        "状態は印（queue.log）だけでなく実物から推す。PR（開いている・直近 50 本のマージ済み。ブランチ名か、タイトル・本文の「票<番号>」「SB-<番号>」で結ぶ）、"
        "queue.log、`.wt/` の作業ツリー（origin/master より先の commit がある）の順に強い。queue.log の行が PR より新しければ、queue.log を出す。",
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
            out.append(f"| {num} | {lane} | {state_of(root, num, name, queued, latest, prs, latest_review, times, trees)} | {title_of(p)} |")
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
