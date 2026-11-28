#!/usr/bin/env bash
# tools/run_queue.sh のテスト: bash tools/run_queue_test.sh
# 一時のフォルダに git リポジトリと .tasks/ を作り、ツールをそこへ写して回す（本物の .tasks/ には触らない）。
# 前半は DRY=1 の出力、後半は偽の実行役（OPENCODE_BIN・QUEUE_OPENCODE・CLAUDE_BIN）で本番の経路を流す。
# 回帰を捕まえるように、直した点ごとに「直しを外すと落ちる」形にしてある（2031 の二次レビュー）。
set -u
SRC=$(cd "$(dirname "$0")" && pwd)
D=$(mktemp -d "${TMPDIR:-/tmp}/run_queue_test.XXXXXX") || exit 1
trap 'rm -rf "$D"' EXIT
fail=0
ok() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; fail=1; fi; }

git -C "$D" init -q
git -C "$D" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
mkdir -p "$D/tools" "$D/.tasks"
cp "$SRC/run_queue.sh" "$SRC/queue_status.py" "$D/tools/"
T=$D/.tasks
out=$D/out.txt

ticket() { printf '# タスク: %s\n\ngit switch %s\n' "$2" "$3" >"$T/$1"; }
ticket 10-chore-one.md ひとつめ chore/one
ticket 20-chore-two.md ふたつめ chore/two
ticket 30-chore-three.md みっつめ chore/three
ticket 40-chore-four.md よっつめ chore/four
ticket 50-chore-five.md いつつめ chore/five
ticket 60-chore-six.md むっつめ chore/six
printf '# result 50\n' >"$T/50-chore-five.result.md"
printf '# result 60\n' >"$T/60-chore-six.result.md"

run() { DRY=1 bash "$D/tools/run_queue.sh" >"$out" 2>&1; }
in_section() { awk -v sec="$1" -v tick="$2" '/^\[/{s=$0} $0 ~ "^"tick" " && index(s, sec) {f=1} END{exit(f?0:1)}' "$out"; }
line_of() { grep -n "^$1 " "$out" | cut -d: -f1 | head -1; }

# 印が無いときは、今までどおり全部 browser で、queue.txt の順
printf '10 master\n20 10 # comment\n' >"$T/queue.txt"
run
ok "印が無ければ browser" "grep -q '^\[browser\]' '$out' && ! grep -q '^\[node\]' '$out' && ! grep -q '^\[review\]' '$out'"
ok "印が無ければ順のまま" "[ \"\$(line_of 票10)\" -lt \"\$(line_of 票20)\" ]"
ok "土台の票は (票N の WIP)" "grep -q '票20 .*土台: (票10 の WIP)' '$out'"
ok "実行役を出す" "grep -q '実行役: opencode' '$out'"

# 印あり: browser 2本・node 2本・review 2本、土台の依存あり
printf '10 master @node\n20 10 @node\n30 master @browser\n40 30 @browser\n50 master @review\n60 master @review\n' >"$T/queue.txt"
run
ok "node の2本が出る" "in_section '[node]' '票10' && in_section '[node]' '票20'"
ok "browser の2本が出る" "in_section '[browser]' '票30' && in_section '[browser]' '票40'"
ok "review の2本が出る" "in_section '[review]' '票50' && in_section '[review]' '票60'"
ok "node は土台の順" "[ \"\$(line_of 票10)\" -lt \"\$(line_of 票20)\" ]"
ok "browser は queue.txt の順" "[ \"\$(line_of 票30)\" -lt \"\$(line_of 票40)\" ]"
ok "review は queue.txt の順" "[ \"\$(line_of 票50)\" -lt \"\$(line_of 票60)\" ]"
ok "実装の result がある票をレビューする" "! grep -q '票50: 実装の result が無い' '$out'"

# 同じ番号の実装と一次レビューを、別のレーンとして回す
printf '10 master @node\n10 10 @review\n' >"$T/queue.txt"
run
ok "同じ番号でも実装とレビューを分ける" "in_section '[node]' '票10' && in_section '[review]' '票10'"

printf '10 master @node\n20 10 @node\n30 master @browser\n40 30 @browser\n50 master @review\n60 master @review\n' >"$T/queue.txt"

# result がある票は飛ばす
printf '# result 20\n' >"$T/20-chore-two.result.md"
run
ok "result がある票は飛ばす" "grep -q '票20: result があるので飛ばす' '$out' && ! in_section '[node]' '票20'"

# 一次レビュー済みの票は飛ばす
printf '# review 60\n' >"$T/review-60.md"
run
ok "一次レビュー済みの票は飛ばす" "grep -q '票60: 一次レビューの結果があるので飛ばす' '$out' && ! in_section '[review]' '票60'"

# 状態のページにレーンの列と節が出る（回している票は、そのレーンに出す）
printf '11-15 10:00:00 票30: 回す（check/c、土台 origin/master、レーン browser）\n' >>"$T/queue.log"
page=$D/status.md
python3 "$D/tools/queue_status.py" --out "$page" >/dev/null 2>&1
ok "状態のページにレーンの列" "grep -q '^| 30 | browser |' '$page'"
ok "状態のページにレーンの節" "grep -q '^## レーン（今回っている票）' '$page'"
ok "状態のページに回している票" "grep -q '^- browser（1本ずつ）: 票30' '$page'"

# 状態の判定: 「止まった（レーン …）」は止まった。review の行は実装の状態に使わない
printf '11-15 10:01:00 票30: 止まった（レーン browser）。ほかのレーンは続ける\n' >>"$T/queue.log"
printf '11-15 10:02:00 票40: 止まった（レーン review）。ほかのレーンは続ける\n' >>"$T/queue.log"
printf '11-15 10:03:00 票50: 回す（check/e、土台 master、レーン review）\n' >>"$T/queue.log"
printf '11-15 10:04:00 票60: 実装の result が無いので一次レビューを回さない\n' >>"$T/queue.log"
python3 "$D/tools/queue_status.py" --out "$page" >/dev/null 2>&1
ok "「止まった（レーン …）」を止まったと出す" "grep -q '^| 30 | browser | 止まった |' '$page'"
ok "review の止まりは実装の状態に使わない" "! grep -q '^| 40 |.*| 止まった |' '$page'"
ok "実装の result が無いを止まったにしない" "! grep -q '^| 60 |.*| 止まった |' '$page'"
ok "review の行はレーンの節に出す" "grep -q '^- review（3本まで）: 票50' '$page'"

# 状態の判定（二次レビュー 2）: 混雑で待っている行を「止まった」にしない。
# 一次レビューのレーンが回している票は「レビュー中」（#555 の queue_mark.sh reviewing と同じ表示）
state() { # 実装の行... （---- で区切って）レビューの行...
  printf '' >"$T/queue.log"
  local mode=impl l
  for l in "$@"; do
    if [ "$l" = ---- ]; then mode=rev; continue; fi
    printf '11-15 11:00:00 票70: %s\n' "$l" >>"$T/queue.log"
  done
  ticket 70-chore-seven.md ななつめ chore/seven
  python3 "$D/tools/queue_status.py" --out "$page" >/dev/null 2>&1
  grep '^| 70 |' "$page"
}
ok "混雑で待っている行は回している" "state '混雑で止まったので、60秒待って続きから回す（1 回目、レーン node）' | grep -q '| 回している |'"
ok "混雑の行をレーンの節に出す" "grep -q '^- node（3本まで）: 票70' '$page'"
ok "止まった（レーン …）は止まった" "state '止まった（レーン node）。ほかのレーンは続ける' | grep -q '| 止まった |'"
ok "手で書く「レビュー中」は レビュー中" "state 'レビュー中' | grep -q '| レビュー中 |'"
ok "一次レビューのレーンが回している票は レビュー中" "state 'WIP をコミットした（abc）' '回す（chore/seven、土台 master、レーン review）' | grep -q '| レビュー中 |'"
ok "一次レビューを書いたあとは レビュー中 でない" "! state 'WIP をコミットした（abc）' '一次レビューを書いた（レーン review、ななつめ）' | grep -q '| レビュー中 |'"
ok "実装が回っている間は一次レビューの行を見ない" "state '回す（chore/seven、土台 master、レーン node）' '回す（chore/seven、土台 master、レーン review）' | grep -q '| 回している |'"
# ページの頭の「キューが止まっている」: 1つのレーンだけの止まりは出さない
printf '11-15 11:00:00 ---- 開始 ----\n11-15 11:00:01 票70: 土台の票1 が回っていない。止める（レーン node。ほかのレーンは続ける）\n' >"$T/queue.log"
ok "1つのレーンの止まりを、キューの止まりと出さない" "! python3 '$D/tools/queue_status.py' | grep -q 'キューが止まっている'"
printf '11-15 11:00:02 票70: OpenCode の使える量が尽きた（usage limit reached）。キューを止める\n' >>"$T/queue.log"
ok "キューごとの止まりは出す" "python3 '$D/tools/queue_status.py' | grep -q 'キューが止まっている'"
# 状態ページの一時ファイルは書き手ごとに別の名前（queue_mark.sh と親が重ならない）
ok "ページの一時ファイル名に PID が入る" "grep -q 'os.getpid()' '$D/tools/queue_status.py'"

# --dry-run は本番の .tasks/ を見るだけで、ロックを消さず、状態のページも書かない
sleep 300 &
LIVE=$!
for l in start worktree queue; do
  mkdir -p "$T/.$l.lock"
  echo "$LIVE" >"$T/.$l.lock/pid"
  echo 99 >"$T/.$l.lock/who"
done
printf '10 master @node\n' >"$T/queue.txt"
rm -f "$D/dry-status.md"
DRY=1 QUEUE_STATUS_FILE="$D/dry-status.md" bash "$D/tools/run_queue.sh" >"$out" 2>&1
ok "--dry-run は生きたロックを消さない" "[ -f '$T/.start.lock/pid' ] && [ -f '$T/.worktree.lock/pid' ] && [ -f '$T/.queue.lock/pid' ]"
ok "--dry-run は状態のページを書かない" "[ ! -e '$D/dry-status.md' ]"
bash "$D/tools/run_queue.sh" --dry-run >"$out" 2>&1
ok "--dry-run（引数）も生きたロックを消さない" "[ -f '$T/.start.lock/pid' ] && [ -f '$T/.queue.lock/pid' ]"
# 別のキューが動いている（.queue.lock が生きている）なら、始めず、そのロックも消さない
echo '票1: 一つ目のキューの止めた理由' >"$T/.queue-stop"
QUEUE_CAFFEINATED=1 bash "$D/tools/run_queue.sh" >"$out" 2>&1
code=$?
ok "別のキューが動いていれば始めない（終了コード 1）" "[ $code = 1 ] && grep -q '別のキューが動いている' '$out'"
ok "始めなかったキューは、持ち主の違うロックを消さない" "[ -f '$T/.queue.lock/pid' ] && [ -f '$T/.start.lock/pid' ] && [ -f '$T/.worktree.lock/pid' ]"
ok "始めなかったキューは、一つ目の .queue-stop を消さない" "[ -f '$T/.queue-stop' ]"
rm -f "$T/.queue-stop"
kill "$LIVE" 2>/dev/null
wait "$LIVE" 2>/dev/null
rm -rf "$T/.start.lock" "$T/.worktree.lock" "$T/.queue.lock"

# ---- 本番の経路（DRY=1 でない）: 偽の実行役で、レーンの同時動作・土台の順・止めたときの子を見る ----
# 偽の opencode: run は FAKE_SLEEP 秒眠って result と変更を書く。session list は起動した --title を返す
#   FAKE_STATE のフォルダに titles・pids・lanepids・events を残す
#   FAKE_LIMIT_FOR=<番号>: その番号の票は、使える量が尽きたエラーを出してすぐ終わる
#   FAKE_IGNORE_TERM=1: TERM を無視する（止めている最中の2回目のシグナルの確かめ用）
#   FAKE_LIST_HANG=1: session list が返らない
#   FAKE_DIRTY=1: 起動してすぐ、作業ツリーに途中の変更（partial-<番号>.txt）を書く（止められたとき、変更が残っている形）
#   FAKE_STOPFILE=<パス>: そのファイルを書いて、result なしで終わる（.queue-stop が残った状態を作る）
#   $FAKE_STATE/hide があるあいだは、session list に何も出さない（起動の確かめが終わらない）
mkfakes() { # 置き場
  mkdir -p "$1"
  cat >"$1/fake-opencode" <<'EOS'
#!/usr/bin/env bash
S=${FAKE_STATE:?}
mkdir -p "$S"
if [ "${1:-}" = "session" ]; then
  [ -n "${FAKE_LIST_HANG:-}" ] && exec sleep 300
  [ -f "$S/hide" ] && exit 0
  [ -f "$S/titles" ] && cat "$S/titles"
  exit 0
fi
title= prompt=
while [ $# -gt 0 ]; do
  case "$1" in
    --title) title=$2; shift 2 ;;
    --session) shift 2 ;;
    -m) shift 2 ;;
    run | --standalone) shift ;;
    *) prompt=$1; shift ;;
  esac
done
n=${title%%-*}
[ -n "${FAKE_IGNORE_TERM:-}" ] && trap '' TERM
echo "$title" >>"$S/titles"
echo "$$ $title" >>"$S/pids"
echo "$PPID $title" >>"$S/lanepids"
echo "start $title $(date +%s) HEAD=$(git log -1 --format=%s)" >>"$S/events"
echo "prompt $title $prompt" >>"$S/prompts"
echo "fake run $title"
[ -n "${FAKE_DIRTY:-}" ] && echo partial >>"partial-$n.txt"
if [ -n "${FAKE_STOPFILE:-}" ]; then
  echo "票$n: テストの止め" >"$FAKE_STOPFILE"
  exit 1
fi
if [ "${FAKE_LIMIT_FOR:-}" = "$n" ]; then
  printf '> build\n\033[91mError: \033[0mOpenCode Go usage limit reached (monthly, resets in 5d 11h). To keep going now, turn on Extra Usage.\n'
  exit 1
fi
# sleep を前景で待つと、TERM を無視するときにシグナルの配送が遅れる。細かく眠る
for ((k=0;k<${FAKE_SLEEP:-8}*5;k++)); do sleep 0.2; done
mkdir -p .tasks
if printf '%s' "$prompt" | grep -q "review-$n.md"; then
  printf '# fake review %s\n' "$n" >".tasks/review-$n.md"
else
  name=$(printf '%s' "$prompt" | sed -n 's|^\.tasks/\([^ ]*\)\.md.*|\1|p')
  printf '# fake %s\n' "$name" >".tasks/$name.result.md"
  printf 'fake change %s\n' "$name" >>fake-change.txt
fi
echo "end $title" >>"$S/events"
EOS
  # 偽の claude: 引数と標準入力を控えて、result を書く。FAKE_CLAUDE_EXIT があれば、その終了コードで終わる
  cat >"$1/fake-claude" <<'EOS'
#!/usr/bin/env bash
S=${FAKE_STATE:?}
mkdir -p "$S"
echo "$*" >>"$S/claude-args"
cat >"$S/claude-stdin"
name=$(sed -n 's|^\.tasks/\([^ ]*\)\.md.*|\1|p' "$S/claude-stdin")
mkdir -p .tasks
printf '# fake claude %s\n' "$name" >".tasks/$name.result.md"
printf 'fake claude change %s\n' "$name" >>fake-change.txt
exit "${FAKE_CLAUDE_EXIT:-0}"
EOS
  chmod +x "$1/fake-opencode" "$1/fake-claude"
}
mkrepo() { # フォルダ
  local r=$1
  mkdir -p "$r/tools" "$r/.tasks"
  cp "$SRC/run_queue.sh" "$SRC/queue_status.py" "$r/tools/"
  git -C "$r" init -q
  git -C "$r" config user.email t@t
  git -C "$r" config user.name t
  git -C "$r" commit -q --allow-empty -m init
  git init -q --bare "$r.origin.git"
  git -C "$r" remote add origin "$r.origin.git"
  git -C "$r" push -q origin HEAD:refs/heads/master
  git -C "$r" fetch -q origin
  mkfakes "$r/bin"
  local t="$r/.tasks" nm
  for nm in "10 one" "20 two" "30 three" "40 four" "50 five" "70 seven" "80 eight" "90 nine"; do
    set -- $nm
    printf '# タスク: %s\n\ngit switch chore/%s\n' "$2" "$2" >"$t/$1-chore-$2.md"
  done
  printf '# タスク: ブランチなし\n\n票にブランチが書かれていない\n' >"$t/95-chore-nobranch.md"
}
# 本番の経路で回す。名前 out [env ...]
real() { # 作業のフォルダ 状態のフォルダ名 出力名 [env ...]
  local r=$1 st=$D/$2 out=$1/$3
  shift 3
  rm -rf "$st"
  mkdir -p "$st"
  env QUEUE_CAFFEINATED=1 OPENCODE_BIN="$r/bin/fake-opencode" CLAUDE_BIN="$r/bin/fake-claude" \
    FAKE_STATE="$st" "$@" bash "$r/tools/run_queue.sh" >"$out" 2>&1
}
# 偽の実行役の子が残っていないか（pids の全部が死んでいる）
all_dead() { # pids ファイル
  local p
  [ -f "$1" ] || return 0
  while read -r p _; do kill -0 "$p" 2>/dev/null && return 1; done <"$1"
  return 0
}

R2=$D/repo2
mkrepo "$R2"
T2=$R2/.tasks

# 2本の node レーンが並んで走る（両方が終わる前に、2本とも始まっている）
printf '10 master @node\n20 master @node\n' >"$T2/queue.txt"
real "$R2" state1 out1.txt FAKE_SLEEP=8 NODE_LANES=2 QUEUE_STATUS_FILE="$D/state1.md"
ok "本番の経路: 終了コード 0" "[ $? = 0 ]"
ok "2本のレーンが並んで走る" "awk '/^start /{s++} /^end /&&s==2{f=1} END{exit(f?0:1)}' '$D/state1/events'"
ok "起動は1本ずつ確かめる（2本目は5秒ほど後）" "awk '/^start /{if(!t){t=\$3} else if(\$3-t>=4){f=1}} END{exit(f?0:1)}' '$D/state1/events'"
ok "WIP のコミットができる" "git -C '$R2' log --oneline chore/one | grep -q 'WIP（未レビュー）: 票10'"
ok "result を .tasks/ に写す" "[ -f '$T2/10-chore-one.result.md' ]"
ok "実装のログは oc-<番号>.log" "grep -q 'fake run 10-' '$R2/.wt/t10/.tasks/oc-10.log'"
ok "終わったあとのロックが残らない" "[ ! -e '$T2/.worktree.lock' ] && [ ! -e '$T2/.start.lock' ] && [ ! -e '$T2/.queue.lock' ]"
ok "状態のページの最後が「終わり」まで書かれる（間引かれない）" "[ -f '$D/state1.md' ] && grep -q -- '---- 終わり ----' '$D/state1.md'"
ok "プロンプトに、テストを裏（バックグラウンド）に回さない決まりが入る" "grep -q 'テスト・e2e・撮影は、裏（バックグラウンド）に回さず、前で流して終わるまで待つ' '$D/state1/prompts'"

# 土台の票は、WIP のコミットの後に次が始まる（次の票は土台の WIP から始まる）。
# commit を遅らせて（pre-commit で 7 秒眠る）、その間に親の巡が回るようにする。
# 直しを外す（result を commit の前に写す・土台が走っている間も result だけで進める）と、40 が commit の最中に始まって落ちる
mkdir -p "$R2/.git/hooks"
printf '#!/bin/sh\nsleep 7\n' >"$R2/.git/hooks/pre-commit"
chmod +x "$R2/.git/hooks/pre-commit"
printf '30 master @node\n40 30 @node\n' >"$T2/queue.txt"
real "$R2" state2 out2.txt FAKE_SLEEP=6 NODE_LANES=2
ok "土台の後の終了コード 0" "[ $? = 0 ]"
rm -f "$R2/.git/hooks/pre-commit"
ok "土台の WIP の後に次が始まる" "awk '/^start 30-/{a=NR} /^end 30-/{b=NR} /^start 40-/{c=NR} END{exit(a&&b&&c&&b<c?0:1)}' '$D/state2/events'"
ok "次の票は土台の WIP から始まる（commit の最中に始まらない）" "grep '^start 40-' '$D/state2/events' | grep -q '票30'"

# 一次レビューのログは、実装のログと別のファイル
printf '10 master @review\n' >"$T2/queue.txt"
real "$R2" state3 out3.txt FAKE_SLEEP=1 REVIEW_LANES=1
ok "レビューの終了コード 0" "[ $? = 0 ]"
ok "レビューのログは oc-review-<番号>.log" "grep -q 'fake run 10-' '$R2/.wt/t10/.tasks/oc-review-10.log'"
ok "実装のログは切り詰めない" "grep -q 'fake run 10-' '$R2/.wt/t10/.tasks/oc-10.log'"
ok "一次レビューの result を写す" "[ -f '$T2/review-10.md' ]"

# RUNNER=claude は、プロンプトを標準入力で渡し、git -C の commit も封じる
printf '50 master @node\n' >"$T2/queue.txt"
real "$R2" state4 out4.txt RUNNER=claude
ok "claude の終了コード 0" "[ $? = 0 ]"
ok "claude はプロンプトを標準入力で渡す" "grep -q '.tasks/50-chore-five.md' '$D/state4/claude-stdin'"
ok "claude の引数にプロンプトが無い" "! grep -q '.tasks/50-chore-five.md' '$D/state4/claude-args'"
ok "claude は git -C の commit も封じる" "grep -F -q 'Bash(git -C:*)' '$D/state4/claude-args'"
ok "claude のログは claude-<番号>.log" "[ -f '$R2/.wt/t50/.tasks/claude-50.log' ]"

# 同じ番号の行が2つ（印だけ違う）あっても、同時に2本目を起動しない
printf '90 master @node\n90 master @browser\n' >"$T2/queue.txt"
real "$R2" state6 out6.txt FAKE_SLEEP=1 NODE_LANES=2
ok "同じ番号でも終了コード 0" "[ $? = 0 ]"
ok "同じ番号は1本だけ起動する" "[ \$(grep -c '^start 90-' '$D/state6/events') = 1 ]"

# 止まった票があれば終了コード 1。ほかのレーンは続ける
R3=$D/repo3
mkrepo "$R3"
T3=$R3/.tasks
printf '95 master @node\n10 master @node\n' >"$T3/queue.txt"
real "$R3" state7 out7.txt FAKE_SLEEP=1 NODE_LANES=2
code=$?
ok "止まった票があれば終了コード 1" "[ $code = 1 ]"
ok "止まった票のログ" "grep -q '票95: ブランチが読めない' '$R3/.tasks/queue.log' && grep -q '票95: 止まった（レーン node）' '$R3/.tasks/queue.log'"
ok "ほかのレーンは続けて WIP になる" "git -C '$R3' log --oneline chore/one | grep -q 'WIP（未レビュー）: 票10'"

# 同じ番号の行が別のレーンにもあって、先の行が止まって終わったあとでも、同じ票をもう一度回さない
R11=$D/repo11
mkrepo "$R11"
printf '10 master @browser\n95 master @browser\n95 master @node\n' >"$R11/.tasks/queue.txt"
real "$R11" state14 out14.txt FAKE_SLEEP=6
ok "止まった票を、別のレーンの同じ番号の行で回し直さない" "[ \$(grep -c '票95: ブランチが読めない' '$R11/.tasks/queue.log') = 1 ]"

# claude が 0 以外で終わっても、result が書けていれば WIP まで進む
R4=$D/repo4
mkrepo "$R4"
printf '10 master @node\n' >"$R4/.tasks/queue.txt"
real "$R4" state8 out8.txt RUNNER=claude FAKE_CLAUDE_EXIT=3
ok "claude が非0でも result があれば終了コード 0" "[ $? = 0 ]"
ok "claude が非0でも WIP のコミットができる" "git -C '$R4' log --oneline chore/one | grep -q 'WIP（未レビュー）: 票10'"
ok "claude の終了コードをログに残す" "grep -q '終了コード 3' '$R4/.tasks/queue.log'"

# OpenCode の使える量が尽きたら、理由をログに書き、ほかのレーンも止めて、キューごと止まる（#556）
R5=$D/repo5
mkrepo "$R5"
T5=$R5/.tasks
printf '10 master @node\n20 master @node\n30 master @browser\n40 master @node\n' >"$T5/queue.txt"
real "$R5" state9 out9.txt FAKE_LIMIT_FOR=10 FAKE_SLEEP=60 NODE_LANES=2 QUEUE_STATUS_FILE="$D/state9.md" QUEUE_OPENCODE="$R5/bin/fake-opencode"
code=$?
ok "使える量が尽きたら終了コード 1" "[ $code = 1 ]"
ok "理由をログに書く" "grep -q '票10: OpenCode の使える量が尽きた（usage limit reached (monthly, resets in 5d 11h)）。キューを止める' '$T5/queue.log'"
ok "混雑のときのように待って回し直さない" "! grep -q '混雑で止まった' '$T5/queue.log'"
ok "ほかのレーンの子も止める" "all_dead '$D/state9/pids'"
ok "次の票を起動しない" "! grep -q '^start 40-' '$D/state9/events' && ! grep -q '票40: 回す' '$T5/queue.log'"
ok "止めた理由が、ログの最後の「止める」の行になる" "grep '止める' '$T5/queue.log' | tail -1 | grep -q 'usage limit reached'"
ok "「終わり」を書かない" "! tail -3 '$T5/queue.log' | grep -q -- '---- 終わり ----'"
ok "状態ページの頭に止まっていることが出る" "grep -A2 '^## キューが止まっている' '$D/state9.md' | grep -q 'usage limit reached'"
ok "止めたあとロックが残らない" "[ ! -e '$T5/.worktree.lock' ] && [ ! -e '$T5/.start.lock' ] && [ ! -e '$T5/.queue.lock' ]"
echo "11-21 10:00:00 ---- 開始 ----" >>"$T5/queue.log"
ok "開始のあとは止まっている印が出ない" "! python3 '$R5/tools/queue_status.py' | grep -q 'キューが止まっている'"

# session list が返らなくても、起動の確かめが上限で戻る（起動のロックを持ったまま止まらない）
R6=$D/repo6
mkrepo "$R6"
printf '10 master @node\n' >"$R6/.tasks/queue.txt"
real "$R6" state10 out10.txt FAKE_LIST_HANG=1 FAKE_SLEEP=30 SESSION_TIMEOUT=1 START_POLLS=2 START_POLL_SEC=1 START_TRIES=2 &
hp=$!
for i in $(seq 1 60); do kill -0 "$hp" 2>/dev/null || break; sleep 1; done
alive=0
kill -0 "$hp" 2>/dev/null && { alive=1; pkill -TERM -P "$hp" 2>/dev/null; kill -TERM "$hp" 2>/dev/null; }
wait "$hp" 2>/dev/null
ok "session list が返らなくても、60秒以内に戻る" "[ $alive = 0 ]"
ok "起動できなければ止まった票になる（終了コード 1）" "grep -q 'セッションが出てこないので起動し直す' '$R6/.tasks/queue.log' && grep -q '票10: 起動できない。止める' '$R6/.tasks/queue.log'"
ok "返らなかったあと、ロックが残らない" "[ ! -e '$R6/.tasks/.start.lock' ]"
ok "起動し直した前の子が残らない" "all_dead '$D/state10/pids'"

# レーンだけが死んだ（外から kill -9）ら、そのレーンが取っていた起動のロックを親が消して、次のレーンが進む
R7=$D/repo7
mkrepo "$R7"
T7=$R7/.tasks
printf '10 master @node\n20 master @node\n' >"$T7/queue.txt"
S7=$D/state11
rm -rf "$S7"
mkdir -p "$S7"
touch "$S7/hide"
env QUEUE_CAFFEINATED=1 OPENCODE_BIN="$R7/bin/fake-opencode" FAKE_STATE="$S7" FAKE_SLEEP=3 NODE_LANES=2 \
  bash "$R7/tools/run_queue.sh" >"$R7/out.txt" 2>&1 &
qp=$!
for i in $(seq 1 30); do [ -f "$S7/lanepids" ] && [ -d "$T7/.start.lock" ] && break; sleep 1; done
ok "1本目が起動の確かめの途中でロックを持っている" "[ -d '$T7/.start.lock' ] && [ \"\$(cat '$T7/.start.lock/who')\" = 10 ]"
lanepid=$(awk 'NR==1{print $1}' "$S7/lanepids")
kill -9 "$lanepid" 2>/dev/null
rm -f "$S7/hide"
for i in $(seq 1 40); do grep -q '^start 20-' "$S7/events" 2>/dev/null && break; sleep 1; done
ok "死んだレーンのロックを親が消し、2本目が起動する" "grep -q '^start 20-' '$S7/events'"
ok "死んだレーンの子（偽の opencode）が残らない" "! kill -0 \$(awk 'NR==1{print \$1}' '$S7/pids') 2>/dev/null"
ok "死んだレーンをログに残す" "grep -q '票10: 止まった（レーン node）' '$T7/queue.log'"
# 直しが無いとロックを待ち続けるので、30秒で止める
for i in $(seq 1 30); do kill -0 "$qp" 2>/dev/null || break; sleep 1; done
kill -0 "$qp" 2>/dev/null && kill -TERM "$qp" 2>/dev/null
wait "$qp" 2>/dev/null
ok "レーンが死んだキューの終了コードは 1" "[ $? = 1 ]"

# 止めると、レーンの子が残らず、ロックも残らない。起動の確かめの最中に止める（ロックを持っているとき）
printf '70 master @node\n80 master @node\n' >"$T2/queue.txt"
S5=$D/state5
rm -rf "$S5"
mkdir -p "$S5"
env QUEUE_CAFFEINATED=1 OPENCODE_BIN="$R2/bin/fake-opencode" CLAUDE_BIN="$R2/bin/fake-claude" \
  FAKE_STATE="$S5" FAKE_SLEEP=60 NODE_LANES=2 bash "$R2/tools/run_queue.sh" >"$R2/out5.txt" 2>&1 &
qp=$!
for i in $(seq 1 40); do
  [ -f "$S5/pids" ] && [ "$(wc -l <"$S5/pids")" -ge 2 ] && break
  sleep 1
done
ok "止める前に2本の子が起動した" "[ -f '$S5/pids' ] && [ \$(wc -l <'$S5/pids') -ge 2 ]"
kill -TERM "$qp" 2>/dev/null
wait "$qp"
st=$?
alive=1
for i in $(seq 1 10); do
  alive=0
  all_dead "$S5/pids" || alive=1
  [ "$alive" = 0 ] && break
  sleep 1
done
ok "止めると終了コードは 0 でない（143）" "[ $st = 143 ]"
ok "止めると子のプロセスが残らない" "[ $alive = 0 ]"
ok "止めるとロックが残らない" "[ ! -e '$T2/.worktree.lock' ] && [ ! -e '$T2/.start.lock' ] && [ ! -e '$T2/.queue.lock' ]"
ok "止めたことをログに書く" "grep -q '止められた' '$T2/queue.log'"

# 起動の確かめの最中（.start.lock を持っている間）に止める。ロックを消す処理が無いと、ロックが残る
R8=$D/repo8
mkrepo "$R8"
T8=$R8/.tasks
printf '10 master @node\n' >"$T8/queue.txt"
S8=$D/state12
rm -rf "$S8"
mkdir -p "$S8"
touch "$S8/hide"
env QUEUE_CAFFEINATED=1 OPENCODE_BIN="$R8/bin/fake-opencode" FAKE_STATE="$S8" FAKE_SLEEP=60 \
  bash "$R8/tools/run_queue.sh" >"$R8/out.txt" 2>&1 &
qp=$!
for i in $(seq 1 30); do [ -d "$T8/.start.lock" ] && [ -f "$S8/pids" ] && break; sleep 1; done
ok "止める前に、起動の確かめでロックを持っている" "[ -d '$T8/.start.lock' ]"
kill -HUP "$qp" 2>/dev/null
wait "$qp"
st=$?
ok "HUP で止めた終了コードは 143" "[ $st = 143 ]"
ok "確かめの最中に止めても、ロックが残らない" "[ ! -e '$T8/.start.lock' ] && [ ! -e '$T8/.worktree.lock' ] && [ ! -e '$T8/.queue.lock' ]"
ok "確かめの最中に止めても、子が残らない" "all_dead '$S8/pids'"

# 止めている最中の2回目のシグナルでも、後始末が最後まで行く。
# 止める最後に状態のページを書く（偽の gh が、印のファイルがあるあいだ6秒かかる）。その最中に2回目の TERM を送っても、
# 親は書き終わるまで生きている。1回目の TERM は、親が前景の sleep を待っている間は処理が遅れるので、
# 「止められたので」がログに出てから2回目を送る
R9=$D/repo9
mkrepo "$R9"
T9=$R9/.tasks
mkdir -p "$R9/slowbin"
printf '#!/bin/sh\n[ -e "%s/slow" ] && sleep 6\nexit 0\n' "$R9/slowbin" >"$R9/slowbin/gh"
chmod +x "$R9/slowbin/gh"
printf '10 master @node\n' >"$T9/queue.txt"
S9=$D/state13
rm -rf "$S9"
mkdir -p "$S9"
env QUEUE_CAFFEINATED=1 OPENCODE_BIN="$R9/bin/fake-opencode" FAKE_STATE="$S9" FAKE_SLEEP=60 \
  PATH="$R9/slowbin:$PATH" QUEUE_STATUS_FILE="$D/state13.md" bash "$R9/tools/run_queue.sh" >"$R9/out.txt" 2>&1 &
qp=$!
for i in $(seq 1 60); do [ -f "$S9/pids" ] && break; sleep 1; done
touch "$R9/slowbin/slow"
kill -TERM "$qp" 2>/dev/null
for i in $(seq 1 100); do grep -q '止められたので' "$T9/queue.log" 2>/dev/null && break; sleep 0.2; done
t0=$(date +%s)
sleep 2
kill -TERM "$qp" 2>/dev/null
wait "$qp"
st=$?
t1=$(date +%s)
ok "2回目のシグナルで後始末が途中で終わらない（状態のページを書き終えるまで生きている）" "[ $((t1 - t0)) -ge 5 ]"
ok "2回目のシグナルでも子が残らない" "all_dead '$S9/pids'"
ok "2回目のシグナルでもロックが残らない" "[ ! -e '$T9/.queue.lock' ] && [ ! -e '$T9/.start.lock' ]"
ok "2回目のシグナルでも後始末を最後までやる" "grep -q 'レーンの子を止めた' '$T9/queue.log'"
ok "止めた終了コードは 143" "[ $st = 143 ]"

# キュー外のレビュー（queue_mark.sh reviewing）が最後の行なら、同じ票の @review は起動しない（二重のレビューにしない）
R10=$D/repo10
mkrepo "$R10"
printf '# result\n' >"$R10/.tasks/10-chore-one.result.md"
printf '11-21 09:00:00 票10: レビュー中\n' >"$R10/.tasks/queue.log"
printf '10 master @review\n' >"$R10/.tasks/queue.txt"
DRY=1 bash "$R10/tools/run_queue.sh" >"$out" 2>&1
ok "キューの外でレビュー中の票は @review で起動しない" "grep -q '票10: キューの外でレビュー中なので飛ばす' '$out' && ! grep -q '^票10 ' '$out'"
printf '11-21 09:00:00 票10: 回す（chore/one、土台 master、レーン review）\n' >"$R10/.tasks/queue.log"
DRY=1 bash "$R10/tools/run_queue.sh" >"$out" 2>&1
ok "レーンの行は、キューの外のレビューと見ない" "! grep -q 'キューの外でレビュー中' '$out'"

# 印なし（@browser だけ）でも、止まった票があれば、それに頼らない次の票へ進む。土台が止まった票は回さない
R13=$D/repo13
mkrepo "$R13"
printf '95 master\n10 95\n20 master\n' >"$R13/.tasks/queue.txt"
real "$R13" state15 out15.txt FAKE_SLEEP=1 QUEUE_STATUS_FILE="$D/state15.md"
code=$?
ok "印なしで土台が止まっても、頼らない次の票は回って WIP になる" "git -C '$R13' log --oneline chore/two | grep -q 'WIP（未レビュー）: 票20'"
ok "土台が止まった票は回さない" "! grep -q '^start 10-' '$D/state15/events' && grep -q '票10: 土台の票95 が回らないので回さない' '$R13/.tasks/queue.log'"
ok "止まった票があれば終了コード 1" "[ $code = 1 ]"
ok "止まった票と、土台が止まって回さなかった票は、状態のページで止まったと出る" "grep -q '^| 95 | browser | 止まった |' '$D/state15.md' && grep -q '^| 10 | browser | 止まった |' '$D/state15.md'"

# 枠切れで全レーンを止めるとき、途中の作業ツリーの変更を WIP（途中）のコミットにする。起動し直すと続きから回る
R14=$D/repo14
mkrepo "$R14"
printf '20 master @node\n10 master @node\n' >"$R14/.tasks/queue.txt"
real "$R14" state16 out16.txt FAKE_LIMIT_FOR=10 FAKE_DIRTY=1 FAKE_SLEEP=60 NODE_LANES=2
code=$?
clean() { [ -z "$(git -C "$1" status --porcelain -- . ':(exclude)node_modules' ':(exclude).tasks')" ]; }
ok "枠切れで止めた（終了コード 1）" "[ $code = 1 ] && grep -q '^start 20-' '$D/state16/events'"
ok "止めた票の途中の変更が WIP（途中）のコミットになる" "git -C '$R14' log -1 --format=%s chore/two | grep -q '^WIP（途中・枠切れで止めた）: 票20'"
ok "WIP（途中）に Changelog: なし が付く" "git -C '$R14' log -1 --format=%B chore/two | grep -q '^Changelog: なし'"
ok "枠切れになった票の途中の変更も WIP になる" "git -C '$R14' log -1 --format=%s chore/one | grep -q '^WIP（途中・枠切れで止めた）: 票10'"
ok "止めたあと、作業ツリーに未コミットの変更が残らない" "clean '$R14/.wt/t20' && clean '$R14/.wt/t10'"
real "$R14" state17 out17.txt FAKE_SLEEP=1 NODE_LANES=2
ok "起動し直しは「未コミットの変更がある」で止まらず、終了コード 0" "[ $? = 0 ] && ! grep -q '未コミットの変更がある' '$R14/.tasks/queue.log'"
ok "続きから回す（プロンプトに前の回が止まったと足す）" "grep -q 'prompt 20-.*前の回が途中で止まった' '$D/state17/prompts'"
ok "最初の回のプロンプトには足さない" "! grep -q 'prompt 20-.*前の回が途中で止まった' '$D/state16/prompts'"
ok "続きは WIP（未レビュー）のコミットになる" "git -C '$R14' log --oneline chore/two | grep -q 'WIP（未レビュー）: 票20'"

# .queue-stop があるあいだ（止める最中）は、空いたレーンに新しい票を起動しない
R15=$D/repo15
mkrepo "$R15"
printf '10 master @node\n20 master @node\n' >"$R15/.tasks/queue.txt"
real "$R15" state18 out18.txt NODE_LANES=1 FAKE_STOPFILE="$R15/.tasks/.queue-stop"
ok ".queue-stop があれば次の票を起動しない" "grep -q '^start 10-' '$D/state18/events' && ! grep -q '^start 20-' '$D/state18/events'"

[ $fail = 0 ] && echo "全部通った" || echo "失敗あり"
exit $fail
