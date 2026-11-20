#!/usr/bin/env bash
# tools/queue_mark.sh のテスト: bash tools/queue_mark_test.sh
# 一時のフォルダに git リポジトリと .tasks/ を作り、ツールをそこへ写して回す（本物の .tasks/ には触らない）。
set -u
SRC=$(cd "$(dirname "$0")" && pwd)
D=$(mktemp -d "${TMPDIR:-/tmp}/queue_mark_test.XXXXXX") || exit 1
trap 'rm -rf "$D"' EXIT
fail=0
ok() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; fail=1; fi; }

git -C "$D" init -q
git -C "$D" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
mkdir -p "$D/tools" "$D/.tasks" "$D/.wt/t10/.tasks"
cp "$SRC/queue_mark.sh" "$SRC/queue_status.py" "$SRC/run_queue.sh" "$D/tools/"
T=$D/.tasks
printf '# タスク: ひとつめ\n\ngit switch -c chore/one origin/master\n' >"$T/10-chore-one.md"
printf '# タスク: ふたつめ\n\ngit switch -c chore/two origin/master\n' >"$T/20-chore-two.md"
printf '# result 10\n' >"$D/.wt/t10/.tasks/10-chore-one.result.md"
printf 'review\n' >"$T/review-codex-10.md"
printf '# comment\n10 master\n\n20 10 # two\n' >"$T/queue.txt"
printf '11-15 10:00:00 票20: 起動した（x）\n' >"$T/queue.log"
M=$D/tools/queue_mark.sh
state() { python3 "$D/tools/queue_status.py" | grep -E "^\| $1 " ; }
export QUEUE_STATUS_FILE=$D/status.md

# 使い方エラー
bash "$M" 99 claude 2>/dev/null; ok "票が無いと終了コード 1" "[ $? = 1 ]"
bash "$M" 10 foo 2>/dev/null; ok "印が違うと終了コード 1" "[ $? = 1 ]"
ok "エラーでログが増えない" "[ \$(wc -l <'$T/queue.log') = 1 ]"

# claude
bash "$M" 10 claude >/dev/null
ok "claude: ログ" "tail -1 '$T/queue.log' | grep -q '票10: Claude が回している'"
ok "claude: 状態" "state 10 | grep -q 'Claude が回している'"
ok "claude: 状態ページが書き直される" "grep -q 'Claude が回している' '$D/status.md'"
out=$(bash "$D/tools/run_queue.sh" --dry-run 2>&1)
ok "DRY=1 で Claude が回している票が飛ばされる" "printf '%s' '$out' | grep -q '票10: Claude が回しているので飛ばす'"
ok "DRY=1 で他の票は残る" "printf '%s' '$out' | grep -q '^票20 '"

# review
bash "$M" 10 review >/dev/null
ok "review: result が本体に写る" "grep -q 'result 10' '$T/10-chore-one.result.md'"
ok "review: ログ" "tail -1 '$T/queue.log' | grep -q '票10: Claude が回した（レビュー待ち）'"
ok "review: 状態" "state 10 | grep -q 'レビュー待ち'"
out=$(bash "$D/tools/run_queue.sh" --dry-run 2>&1)
ok "review 後は result があるので飛ばされる" "printf '%s' '$out' | grep -q '票10: result があるので飛ばす'"

# reviewing
bash "$M" 10 reviewing >/dev/null
ok "reviewing: ログ" "tail -1 '$T/queue.log' | grep -q '票10: レビュー中'"
ok "reviewing: 状態" "state 10 | grep -q 'レビュー中'"
ok "reviewing: 状態ページが書き直される" "grep -q 'レビュー中' '$D/status.md'"

# done
bash "$M" 10 done 535 >/dev/null
ok "done: 票・result・review が done/ に移る" "[ -f '$T/done/10-chore-one.md' ] && [ -f '$T/done/10-chore-one.result.md' ] && [ -f '$T/done/review-codex-10.md' ]"
ok "done: 元の場所に残らない" "[ ! -e '$T/10-chore-one.md' ] && [ ! -e '$T/10-chore-one.result.md' ] && [ ! -e '$T/review-codex-10.md' ]"
ok "done: queue.txt の番号の行だけ消える" "[ \"\$(cat '$T/queue.txt')\" = \"\$(printf '# comment\n\n20 10 # two')\" ]"
ok "done: ログ" "tail -1 '$T/queue.log' | grep -q '票10: 済み（PR #535）'"
ok "done: 他の票は残る" "[ -f '$T/20-chore-two.md' ]"

[ $fail = 0 ] && echo "全部通った" || echo "失敗あり"
exit $fail
