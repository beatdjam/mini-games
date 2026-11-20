#!/usr/bin/env bash
# tools/run_queue.sh のテスト（OpenCode の使える量が尽きたとき）: bash tools/run_queue_test.sh
# 一時のフォルダに git リポジトリと .tasks/ を作り、ツールと偽の OpenCode で回す（本物の .tasks/ と OpenCode には触らない）。
set -u
SRC=$(cd "$(dirname "$0")" && pwd)
D=$(mktemp -d "${TMPDIR:-/tmp}/run_queue_test.XXXXXX") || exit 1
trap 'rm -rf "$D"' EXIT
fail=0
ok() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; fail=1; fi; }

git -C "$D" init -q
git -C "$D" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
git -C "$D" update-ref refs/remotes/origin/master HEAD
mkdir -p "$D/tools" "$D/.tasks" "$D/node_modules"
cp "$SRC/run_queue.sh" "$SRC/queue_status.py" "$D/tools/"
T=$D/.tasks
printf '# タスク: ひとつめ\n\ngit switch chore/one\n' >"$T/10-chore-one.md"
printf '# タスク: ふたつめ\n\ngit switch chore/two\n' >"$T/20-chore-two.md"
printf '10 master\n20 master\n' >"$T/queue.txt"

# 偽の OpenCode: run は --title を覚えて、使える量が尽きたときのエラーを出して終わる。session list は覚えた title を出す
FAKE=$D/fake-opencode
cat >"$FAKE" <<EOF
#!/usr/bin/env bash
if [ "\$1" = session ]; then cat "$D/titles" 2>/dev/null; exit 0; fi
while [ \$# -gt 0 ]; do [ "\$1" = --title ] && { echo "ses_x \$2" >>"$D/titles"; }; shift; done
printf '> build\n\033[91mError: \033[0mOpenCode Go usage limit reached (monthly, resets in 5d 11h). To keep going now, turn on Extra Usage.\n'
exit 1
EOF
chmod +x "$FAKE"

QUEUE_CAFFEINATED=1 QUEUE_OPENCODE=$FAKE QUEUE_STATUS_FILE=$D/status.md bash "$D/tools/run_queue.sh" >/dev/null 2>&1
code=$?
ok "使える量が尽きたら終了コード 1" "[ $code = 1 ]"
ok "理由をログに書く" "grep -q '票10: OpenCode の使える量が尽きた（usage limit reached (monthly, resets in 5d 11h)）。キューを止める' '$T/queue.log'"
ok "混雑のときのように待って回し直さない" "! grep -q '混雑で止まった' '$T/queue.log'"
ok "次の票に進まない" "! grep -q '票20' '$T/queue.log'"
ok "状態ページの頭に止まっていることが出る" "grep -A2 '^## キューが止まっている' '$D/status.md' | grep -q 'usage limit reached'"

# 回し直したら（開始が書かれたら）、止まっている印は消える
echo "11-21 10:00:00 ---- 開始 ----" >>"$T/queue.log"
ok "開始のあとは止まっている印が出ない" "! python3 '$D/tools/queue_status.py' | grep -q 'キューが止まっている'"

[ $fail = 0 ] && echo "全部通った" || echo "失敗あり"
exit $fail
