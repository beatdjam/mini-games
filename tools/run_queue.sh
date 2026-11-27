#!/usr/bin/env bash
# .tasks/queue.txt の票を、種類（レーン）ごとに回す。
#
#   tools/run_queue.sh            回す（Mac がスリープしないよう caffeinate の下で動く）
#   tools/run_queue.sh --dry-run  何をどのレーンでどの順に回すかだけ出す（DRY=1 でも同じ）
#
# - 票ごとに作業ツリー（.wt/t<番号>。そのブランチの作業ツリーが既にあればそれ）で実行役を起動する
# - queue.txt の行末の印でレーンを決める。印が無ければ @browser
#     @browser  Chromium を使う。同時に1本（今までどおり、レーンの順も今までどおり）
#     @node     unit・integration だけ・調べ物・文書。同時に NODE_LANES 本（既定 3）
#     @review   Haiku の一次レビュー。<番号> <土台> @review。同時に REVIEW_LANES 本（既定 3）
# - 次の票は、レーンに空きがあり、土台の票が済んでいるものから選ぶ。土台が回っている最中のものは待つ
# - 1つのレーンの票が止まっても、ほかのレーンは続ける。止まった票はログに残す
#   印なし（@browser だけ）でも同じ。止まった票は飛ばして、頼らない次の票へ進む。止まった票を土台にした票は回さない
# - 起動したきり止まったら（セッションが出てこなければ）起動し直す
# - 終わったら result を .tasks/ に写し、変更を「WIP（未レビュー）」のコミットにする。push・PR はしない
# - 回し終えた印は .tasks/<番号>-<名前>.result.md。あれば飛ばす。Claude が引き取った票（queue.log の最後が「Claude が回している」。tools/queue_mark.sh）も飛ばす。票が消えていれば（レビュー済み）飛ばす
# - 次の票を選ぶたびに queue.txt を先頭から読み直す（回している途中で順を入れ替えると、次から反映される）
# - queue.txt の2列目からは土台。master か、先に回す票の番号（その票の未レビューのコミットの上に積む）
# - result が出なかったときは、混雑で落ちたなら少し待って続きから回し直す。それでも出なければ止める（そのレーンだけ）
# - OpenCode の使える量（月などの枠）が尽きて落ちたときは、待っても戻らないので、理由をログに書いて全レーンを止める（キューごと止まる）
#   止めるとき、途中の作業ツリーの変更は「WIP（途中・枠切れで止めた）」のコミットにして残す（起動し直すと続きから回る）
# - merge がぶつかったときは、その票を止める（ほかのレーンは続ける）
# - queue.txt の例: 「110 master @browser」「160 110 @node」「160 110 @review」（# から後と空行は読まない）。.tasks/ はコミットしないので、手元で書く
# - 実行役は環境変数 RUNNER（既定 opencode）。RUNNER=claude なら Claude Code の CLI で回す（@review は haiku）
# - 止めるときは Ctrl-C か kill（INT・TERM・HUP）。起動しているレーンのサブシェルとその子（opencode・claude）を
#   まとめて止め、自分が持っているロック（.tasks/.worktree.lock・.start.lock・.queue.lock）を消す。止めたことはログに残る
#   kill -9 だと後始末が走らない（子が残る。CLAUDE.md の「止める」を見る）
# - キューは1つだけ。.tasks/.queue.lock を持てなければ（別のキューが動いている）止める。--dry-run は持たず、何も消さない
# - 終了コードは、止まった票があれば 1、全部回せたら 0
# - 実行役のログは作業ツリーの .tasks/ に置く。実装は oc-<番号>.log（RUNNER=claude なら claude-<番号>.log）、
#   一次レビューは oc-review-<番号>.log（claude-review-<番号>.log）
# 経過は .tasks/queue.log に書く。Claude が戻ったら、result と WIP のコミットを番号の順にレビューする。
if [ -z "${QUEUE_CAFFEINATED:-}" ] && [ "${DRY:-0}" != 1 ] && [ "${1:-}" != "--dry-run" ] && command -v caffeinate >/dev/null; then
  exec env QUEUE_CAFFEINATED=1 caffeinate -i "$0" "$@"
fi

DRY=${DRY:-0}
[ "${1:-}" = "--dry-run" ] && DRY=1
# 作業ツリーから動かしても、本体（.git がある所）の .tasks/ を見る
R=$(dirname "$(git -C "$(dirname "$0")" rev-parse --path-format=absolute --git-common-dir)")
T=$R/.tasks
# QUEUE_OPENCODE・OPENCODE_BIN・CLAUDE_BIN は、テストで偽の実行役に替えるため
OC=${QUEUE_OPENCODE:-${OPENCODE_BIN:-${OC:-$HOME/.opencode/bin/opencode}}}
CLAUDE=${CLAUDE_BIN:-${CLAUDE:-claude}}
LOG=$T/queue.log
# 混雑で落ちたときに、待つ秒数と回し直す回数
BUSY_WAIT=60
BUSY_TRIES=5
# 混雑かどうかを見るログの末尾の行数
BUSY_TAIL=10
# レーンの本数（@browser は1本ずつ）
NODE_LANES=${NODE_LANES:-3}
REVIEW_LANES=${REVIEW_LANES:-3}
case "$NODE_LANES" in '' | *[!0-9]* | 0) NODE_LANES=3 ;; esac
case "$REVIEW_LANES" in '' | *[!0-9]* | 0) REVIEW_LANES=3 ;; esac
export NODE_LANES REVIEW_LANES
# 実行役。opencode 以外は opencode に戻す
RUNNER=${RUNNER:-opencode}
case "$RUNNER" in claude) ;; *) RUNNER=opencode ;; esac
# レーンごとにプロセスグループを分ける（止めるときに、子ごと止められるように）。set -m は start_job の中だけ。
# 親の前景のコマンド（sleep・git）まで別のグループにすると、端末の Ctrl-C が親に届かなくなるため
# 状態ページを書き直す間隔（秒）。子ではなく、親だけが書く
STATUS_EVERY=10
LAST_STATUS=0
# 止まった票があったか（終了コード 1）
FAILED=0
# 枠が尽きて、キューごと止めるとき、その理由の行（レーンが .tasks/.queue-stop に書き、親が拾う）
STOP_LINE=
HAVE_QUEUE=0 # .queue.lock を取れたか（取れなかったキューは .queue-stop を消さない）
STOP_CODE=90 # レーンが「キューごと止める」で終わるときの終了コード
STOP_WIP= # 枠切れで止めるとき、途中の変更を WIP にする票（レーン:番号 の並び）
# OpenCode の session list を待つ上限（秒）。返らないまま起動のロックを持ち続けないように
SESSION_TIMEOUT=${SESSION_TIMEOUT:-15} # この4つはテストで短くするため、環境変数で替えられる
# 起動の確かめ: 1回の確かめの回数と間隔、起動し直す回数
START_POLLS=${START_POLLS:-18}
START_POLL_SEC=${START_POLL_SEC:-5}
START_TRIES=${START_TRIES:-3}
# 起動のロックを待つ秒数 = 起動のロックを持つ最長（全部の確かめが上限までかかった場合）+ 余裕
START_WAIT=$((START_TRIES * (START_POLLS * (START_POLL_SEC + SESSION_TIMEOUT) + SESSION_TIMEOUT) + 60))

# queue.txt を読んだ結果（番号・レーン・土台）
P_N=()
P_K=()
P_B=()
# run_queue.sh が今回回した（飛ばした）票。レーン:番号を空白で囲んだ並び
RUN=" "
# ログに出したメッセージ（同じことを何度も書かない）
SAID=" "
# 今走っている票
R_PID=()
R_N=()
R_K=()
CAND=
started=0

log() {
  if [ $DRY = 1 ]; then echo "$*"; return; fi
  echo "$(date '+%m-%d %H:%M:%S') $*" | tee -a "$LOG"
}
# 状態のページ（tools/queue_status.py）。親だけが、間を空けて書く（子のログと重ならないように）
# 引数 force: 間隔の制限を外す（終わり・止めたときの最後の1回）。--dry-run は書かない（本番のページを書き換えない）
write_status() {
  [ -n "${QUEUE_STATUS_FILE:-}" ] || return 0
  [ "$DRY" = 1 ] && return 0
  local now
  now=$(date +%s)
  [ "${1:-}" != force ] && [ $((now - LAST_STATUS)) -lt "$STATUS_EVERY" ] && return 0
  LAST_STATUS=$now
  python3 "$R/tools/queue_status.py" --out "$QUEUE_STATUS_FILE" >/dev/null 2>&1
  return 0
}
say_once() {
  case "$SAID" in *" $1 "*) return ;; esac
  SAID="$SAID$1 "
  log "$1"
}
# 票の最後のログが「Claude が回している」か（tools/queue_mark.sh が書く）
claude_running() { grep -E " 票$1: " "$LOG" 2>/dev/null | tail -1 | grep -q '票[0-9]*: Claude が回している'; }
# 票の最後のログが、キューの外のレビュー（Claude・手で起動した OpenCode。tools/queue_mark.sh reviewing）か。レーンの行は「レーン review」を含むので別
reviewing_outside() { grep -E " 票$1: " "$LOG" 2>/dev/null | tail -1 | grep -qE '票[0-9]+: レビュー中$'; }
ticket_of() { ls "$T"/"$1"-*.md 2>/dev/null | grep -vE '\.(result|review-[a-z]+)\.md$' | head -1; }
branch_of() { grep -o -m1 -E 'git switch [^ `]+' "$1" | awk '{print $3}'; }
worktree_of() { # そのブランチを開いている作業ツリー
  git -C "$R" worktree list --porcelain | awk -v b="refs/heads/$1" '/^worktree /{p=$2} $0=="branch " b {print p}'
}
dirty() { [ -n "$(git -C "$1" status --porcelain -- . ':(exclude)node_modules' ':(exclude).tasks')" ]; }
# ログの末尾が、サーバーの混雑で落ちたときのものか
busy_log() {
  local tail; tail=$(tail -n "$BUSY_TAIL" "$1" 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g')
  printf '%s\n' "$tail" | grep -q 'Upstream request failed' || return 1
  printf '%s\n' "$tail" | grep -qE 'overloaded|at capacity'
}
# ログの末尾が、OpenCode の使える量が尽きたときのものなら、その理由（「usage limit reached (monthly, resets in 5d 11h)」）を出す
limit_log() {
  tail -n "$BUSY_TAIL" "$1" 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' | grep -m1 -oE 'usage limit reached( \([^)]*\))?'
}
# 上限の秒数で打ち切って、コマンドを流す（macOS に timeout は無い）。コマンドの出力と終了コードを返す
# 出力はファイルに受ける（打ち切ったコマンドの孫がパイプを持ったままだと、$(…) が返らなくなるため）
timed() { # 秒 コマンド...
  local secs=$1 p k st f
  shift
  f=$(mktemp "${TMPDIR:-/tmp}/run_queue_timed.XXXXXX") || return 1
  "$@" >"$f" &
  p=$!
  ( sleep "$secs"; kill "$p" 2>/dev/null ) >/dev/null 2>&1 &
  k=$!
  wait "$p"
  st=$?
  kill "$k" 2>/dev/null
  wait "$k" 2>/dev/null
  cat "$f"
  rm -f "$f"
  return "$st"
}
# 作業ツリーのセッションの一覧（返らなければ SESSION_TIMEOUT 秒で打ち切る）
sessions_of() { timed "$SESSION_TIMEOUT" env -C "$1" PWD="$1" "$OC" session list </dev/null 2>/dev/null; }
# --title で引いたセッションの ID
session_of() { sessions_of "$1" | awk -v t="$2" 'index($0, t) {print $1; exit}'; }
# 実装・一次レビューの result が無くて、ログが使える量の尽きたものなら、理由を書いてこのレーンを終える（親がキューごと止める）
stop_if_limit() { # 番号 result のパス ログ
  local why
  [ -f "$2" ] && return 0
  why=$(limit_log "$3") || return 0
  local who=OpenCode
  [ "$RUNNER" = claude ] && who=Claude
  echo "票$1: $who の使える量が尽きた（${why}）。キューを止める" >"$T/.queue-stop"
  exit "$STOP_CODE"
}
# 実行役のログの置き場（実装と一次レビューで別のファイル）
runlog_of() { # 作業ツリー 番号 種類
  local pre=oc
  [ "$RUNNER" = claude ] && pre=claude
  if [ "$3" = review ]; then echo "$1/.tasks/$pre-review-$2.log"; else echo "$1/.tasks/$pre-$2.log"; fi
}
# @review のモデル（OpenCode は Haiku、Claude は haiku）
model_of() { if [ "$1" = review ]; then if [ "$RUNNER" = claude ]; then echo haiku; else echo opencode-go/claude-haiku-5-5; fi; else echo sonnet; fi; }

# 土台の票番号 → その票のブランチ。票が消えていれば master に入った扱い。まだ回していなければ空
base_ref() {
  [ "$1" = master ] && { echo origin/master; return; }
  local t; t=$(ticket_of "$1")
  [ -z "$t" ] && { echo origin/master; return; }
  [ -f "${t%.md}.result.md" ] || return 0
  branch_of "$t"
}

# result を写し、変更を WIP のコミットにする。result を写すのはコミットの後ろ（写ったら「WIP まで済んだ印」）
finish() {
  local n=$1 wt=$2 name=$3 title=$4
  if dirty "$wt"; then
    git -C "$wt" add -A -- . || { log "票$n: git add に失敗した（$wt）"; return 1; }
    git -C "$wt" commit -q -m "WIP（未レビュー）: 票$n $title" -m "キューが書いたまま。Claude のレビュー前。" -m "Changelog: なし" || {
      log "票$n: WIP のコミットに失敗した（pre-commit などの失敗かもしれない。$wt を見る）"
      return 1
    }
    log "票$n: WIP をコミットした（$(git -C "$wt" log --oneline -1)）"
  else
    log "票$n: コードの変更なし（調査・result だけ）"
  fi
  cp "$wt/.tasks/$name.result.md" "$T/"
}

# 枠切れで止めたとき、途中の作業ツリーに残った変更を「WIP（途中・枠切れで止めた）」のコミットにして残す。
# 起動し直したとき「未コミットの変更がある」で止まらず、続きから回せるようにする。
# result があれば何もしない（work の「仕上げだけ」が拾う）。途中のコードなので pre-commit は通さない
wip_interrupted() { # 番号
  local n=$1 t name br title wt
  t=$(ticket_of "$n")
  [ -z "$t" ] && return 0
  name=$(basename "$t" .md)
  br=$(branch_of "$t")
  [ -z "$br" ] && return 0
  wt=$(worktree_of "$br")
  [ -z "$wt" ] && return 0
  [ -f "$wt/.tasks/$name.result.md" ] && return 0
  dirty "$wt" || return 0
  title=$(head -1 "$t" | sed 's/^# タスク: //')
  git -C "$wt" add -A -- . &&
    git -C "$wt" commit -q --no-verify -m "WIP（途中・枠切れで止めた）: 票$n $title" -m "枠切れで止めたときの作業ツリーの変更。続きから回す。" -m "Changelog: なし" || {
    log "票$n: 途中の変更を WIP にできなかった（$wt に未コミットの変更が残る）"
    return 0
  }
  log "票$n: 途中の変更を WIP（途中・枠切れで止めた）にした（$(git -C "$wt" log --oneline -1)）"
}

# 作業ツリーを作る間・実行役を起動して確かめる間だけ待たせるロック。
# 中に pid（持ち主のキューの親の PID）と who（取ったレーンの票番号）を書く。
# pid が死んでいたら、残ったロックとして取り直す。消すのは、pid が自分のときだけ（別のキューや --dry-run のロックを消さない）。
# who は、レーンが（OOM・外からの kill で）取ったまま死んだとき、親がそのレーンのロックを消すために使う
lock_dir() { echo "$T/.$1.lock"; }
lock_take() { # 名前 待つ秒数 票番号
  local d i owner
  d=$(lock_dir "$1")
  for i in $(seq 1 "${2:-120}"); do
    if mkdir "$d" 2>/dev/null; then
      echo "${3:-}" >"$d/who"
      echo "$$" >"$d/pid"
      return 0
    fi
    owner=$(cat "$d/pid" 2>/dev/null)
    if [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null; then
      rm -f "$d/pid" "$d/who" 2>/dev/null
      rmdir "$d" 2>/dev/null
      continue
    fi
    sleep 1
  done
  return 1
}
lock_drop() { # 名前 [票番号: 指定したら、そのレーンが取ったものだけ消す]
  local d
  d=$(lock_dir "$1")
  [ "$(cat "$d/pid" 2>/dev/null)" = "$$" ] || return 0
  [ -n "${2:-}" ] && [ "$(cat "$d/who" 2>/dev/null)" != "$2" ] && return 0
  rm -f "$d/pid" "$d/who" 2>/dev/null
  rmdir "$d" 2>/dev/null
}
worktree_lock() { lock_take worktree 120 "$1"; }
worktree_unlock() { lock_drop worktree "${1:-}"; }
# 起動は1本ずつ。セッションが出る（起動を確かめる）まで、次のレーンは起動しない
start_lock() { lock_take start "$START_WAIT" "$1"; }
start_unlock() { lock_drop start "${1:-}"; }

# OpenCode を起動し、セッションが出てくるのを確かめてから終わるのを待つ。
# 起動の確認までは1本ずつ（start_lock）
run_oc() {
  local n=$1 wt=$2 prompt=$3 kind=$4 try title pid i mflag= logf
  logf=$(runlog_of "$wt" "$n" "$kind")
  [ "$kind" = review ] && mflag="-m $(model_of review)"
  start_lock "$n" || { log "票$n: 起動のロックが取れない。止める（レーン ${kind}。ほかのレーンは続ける）"; return 1; }
  for ((try=1;try<=START_TRIES;try++)); do
    title="$n-q$try-$(date +%H%M%S)"
    env -C "$wt" PWD="$wt" OPENCODE_DISABLE_CLAUDE_CODE=1 "$OC" run --standalone --title "$title" $mflag "$prompt" \
      </dev/null >"$logf" 2>&1 &
    pid=$!
    for ((i=1;i<=START_POLLS;i++)); do
      sleep "$START_POLL_SEC"
      sessions_of "$wt" | grep -q "$title" && break
      kill -0 "$pid" 2>/dev/null || break
    done
    if sessions_of "$wt" | grep -q "$title"; then
      OC_TITLE=$title
      log "票$n: 起動した（${title}、レーン ${kind}）"
      start_unlock "$n"
      wait "$pid"
      return 0
    fi
    log "票$n: セッションが出てこないので起動し直す（$try 回目、レーン ${kind}）"
    kill "$pid" 2>/dev/null
    wait "$pid" 2>/dev/null
  done
  start_unlock "$n"
  return 1
}

# Claude Code の CLI で回す。編集と確認は許し、commit・push・依存の追加は止める。
# プロンプトは標準入力で渡す（--allowedTools などの可変長フラグに食われないように）
run_claude() {
  local n=$1 wt=$2 prompt=$3 kind=$4 logf st
  logf=$(runlog_of "$wt" "$n" "$kind")
  log "票$n: 起動した（claude -p --model $(model_of "$kind")、レーン ${kind}）"
  printf '%s' "$prompt" | env -C "$wt" PWD="$wt" "$CLAUDE" -p --model "$(model_of "$kind")" \
    --permission-mode acceptEdits --permission-prompts none \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
    --disallowedTools "Bash(git commit:*),Bash(git push:*),Bash(git -C:*),Bash(git -c:*),Bash(npm install:*),Bash(npm ci:*),Bash(npm i:*)" \
    >"$logf" 2>&1
  st=$?
  # 終了コードが 0 でなくても（ターン上限など）、result が書けていれば続きを進める。止めるかは result の有無で決める
  [ "$st" = 0 ] || log "票$n: claude が終了コード $st で終わった（result があれば続ける、レーン ${kind}）"
  return 0
}

run_agent() { # n wt prompt kind
  if [ "$RUNNER" = claude ]; then run_claude "$@"; else run_oc "$@"; fi
}

# 混雑で途中で止まったとき、少し待って続きから回し直す
retry_busy() { # n wt target kind logf cont
  local n=$1 wt=$2 target=$3 kind=$4 logf=$5 cont=$6 tries=0 id
  local path="$wt/.tasks/$target"
  while [ ! -f "$path" ] && [ "$tries" -lt "$BUSY_TRIES" ] && busy_log "$logf"; do
    tries=$((tries + 1))
    log "票$n: 混雑で止まったので、${BUSY_WAIT}秒待って続きから回す（$tries 回目、レーン ${kind}）"
    sleep "$BUSY_WAIT"
    if [ "$RUNNER" = claude ]; then
      printf '%s' "$cont" | env -C "$wt" PWD="$wt" "$CLAUDE" -p --model "$(model_of "$kind")" \
        --permission-mode acceptEdits --permission-prompts none \
        --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
        --disallowedTools "Bash(git commit:*),Bash(git push:*),Bash(git -C:*),Bash(git -c:*),Bash(npm install:*),Bash(npm ci:*),Bash(npm i:*)" \
        >>"$logf" 2>&1
    else
      id=$(session_of "$wt" "$OC_TITLE")
      [ -z "$id" ] && { log "票$n: 続きを渡すセッションが見つからない。止める（レーン ${kind}。ほかのレーンは続ける）"; return 1; }
      env -C "$wt" PWD="$wt" OPENCODE_DISABLE_CLAUDE_CODE=1 "$OC" run --standalone --session "$id" "$cont" \
        </dev/null >>"$logf" 2>&1
    fi
  done
  [ -f "$path" ]
}

# 1本の票を、最後まで回す（レーンの中の1本。止まったら戻るだけで、ほかのレーンは止めない）
work() { # 番号 レーン 土台
  local n=$1 kind=$2 bases=$3 t name br title wt r b refs prompt cont
  t=$(ticket_of "$n")
  [ -z "$t" ] && { log "票$n: 票が無い。止める（レーン ${kind}。ほかのレーンは続ける）"; return 1; }
  name=$(basename "$t" .md)
  br=$(branch_of "$t")
  title=$(head -1 "$t" | sed 's/^# タスク: //')
  [ -z "$br" ] && { log "票$n: ブランチが読めない。止める（レーン ${kind}。ほかのレーンは続ける）"; return 1; }
  [ -z "$bases" ] && bases=master
  refs=()
  for b in $bases; do
    r=$(base_ref "$b")
    [ -z "$r" ] && { log "票$n: 土台の票$b が回っていない。止める（レーン ${kind}。ほかのレーンは続ける）"; return 1; }
    refs+=("$r")
  done
  wt=$(worktree_of "$br")

  # 前に回して result だけ残っている（写す前に止まった）なら、仕上げだけする
  if [ -n "$wt" ] && [ -f "$wt/.tasks/$name.result.md" ]; then
    finish "$n" "$wt" "$name" "$title"
    return $?
  fi
  if [ -z "$wt" ]; then
    worktree_lock "$n" || { log "票$n: 作業ツリーのロックが取れない。止める（レーン ${kind}。ほかのレーンは続ける）"; return 1; }
    git -C "$R" show-ref -q "refs/heads/$br" || git -C "$R" branch -q "$br" origin/master
    wt=$R/.wt/t$n
    git -C "$R" worktree add -q "$wt" "$br"
    r=$?
    [ $r = 0 ] && [ ! -e "$wt/node_modules" ] && ln -s "$R/node_modules" "$wt/node_modules"
    worktree_unlock "$n"
    [ $r = 0 ] || { log "票$n: 作業ツリーを作れない。止める（レーン ${kind}。ほかのレーンは続ける）"; return 1; }
  fi
  if dirty "$wt"; then
    log "票$n: $wt に未コミットの変更がある。止める（レーン ${kind}。ほかのレーンは続ける）"
    return 1
  fi
  # まだ何も積んでいないブランチは、1つ目の土台に合わせる。2つ目からは merge する
  if [ "$(git -C "$R" rev-list --count "origin/master..$br")" = 0 ]; then
    git -C "$wt" reset -q --hard "${refs[0]}" || { log "票$n: 土台 ${refs[0]} に合わせられない。止める（レーン ${kind}。ほかのレーンは続ける）"; return 1; }
  fi
  for r in "${refs[@]:1}"; do
    git -C "$wt" merge-base --is-ancestor "$r" HEAD && continue
    git -C "$wt" merge -q --no-edit "$r" || {
      git -C "$wt" merge --abort
      log "票$n: $r との merge がぶつかった。止める（レーン ${kind}。ほかのレーンは続ける）"
      return 1
    }
  done
  mkdir -p "$wt/.tasks"
  cp "$t" "$wt/.tasks/"
  # what tickets read besides themselves: the copied notes (context/), the drafts (draft/) and the results of
  # earlier tickets (.tasks/ is not committed, so a new worktree has none of them)
  for b in context draft; do [ -d "$T/$b" ] && cp -R "$T/$b" "$wt/.tasks/"; done
  for r in "$T"/*.result.md; do [ -f "$r" ] && [ ! -f "$wt/.tasks/$(basename "$r")" ] && cp "$r" "$wt/.tasks/"; done

  prompt=".tasks/$name.md の票をやって"
  if [ "${refs[*]}" != origin/master ]; then
    prompt="${prompt}。この票が前提にしている前の票は、まだ master に入っていない。このブランチの土台（WIP（未レビュー）のコミット）に入っている。「master に入っているか」は、作業ツリーのコードに入っていれば満たしたとみなしてよい"
  fi
  # 前の回が枠切れで途中で止まった（WIP（途中…）のコミットが最後）なら、続きから回すと伝える
  case "$(git -C "$wt" log -1 --format=%s)" in
    "WIP（途中"*) prompt="${prompt}。前の回が途中で止まった。作業ツリーの今の状態とコミットを見てから続ける" ;;
  esac
  log "票$n: 回す（${br}、土台 ${refs[*]}、レーン ${kind}）"
  run_agent "$n" "$wt" "$prompt" "$kind" || {
    log "票$n: 起動できない。止める（レーン ${kind}。ほかのレーンは続ける）"
    return 1
  }
  cont=".tasks/$name.md の票の続きをやって。前は混雑で途中で止まった。作業ツリーの今の状態を見てから続ける"
  retry_busy "$n" "$wt" "$name.result.md" "$kind" "$(runlog_of "$wt" "$n" "$kind")" "$cont" || {
    stop_if_limit "$n" "$wt/.tasks/$name.result.md" "$(runlog_of "$wt" "$n" "$kind")"
    log "票$n: result が無い。止める（レーン ${kind}。ほかのレーンは続ける。$(runlog_of "$wt" "$n" "$kind") を見る）"
    return 1
  }
  finish "$n" "$wt" "$name" "$title"
}

# 一次レビュー（Haiku）。その票の作業ツリーで、review-guide.md の観点でレビューさせる
work_review() { # 番号 土台
  local n=$1 bases=$2 t name br title wt prompt cont
  t=$(ticket_of "$n")
  [ -z "$t" ] && { log "票$n: 票が無い。止める（レーン review。ほかのレーンは続ける）"; return 1; }
  name=$(basename "$t" .md)
  br=$(branch_of "$t")
  title=$(head -1 "$t" | sed 's/^# タスク: //')
  [ -z "$br" ] && { log "票$n: ブランチが読めない。止める（レーン review。ほかのレーンは続ける）"; return 1; }
  [ -z "$bases" ] && bases=master
  wt=$(worktree_of "$br")
  [ -z "$wt" ] && [ -d "$R/.wt/t$n" ] && wt=$R/.wt/t$n
  [ -z "$wt" ] && { log "票$n: 一次レビューの作業ツリーが無い。止める（レーン review。ほかのレーンは続ける）"; return 1; }
  mkdir -p "$wt/.tasks"
  [ -f "$wt/.tasks/$name.md" ] || cp "$t" "$wt/.tasks/"
  prompt=".tasks/$name.md の変更を .opencode/review-guide.md の観点でレビューして。コードは変えない。テストは関係する unit／integration だけ流す。一時ファイルは消す。結果は .tasks/review-$n.md に書いて"
  log "票$n: 回す（${br}、土台 ${bases}、レーン review）"
  run_agent "$n" "$wt" "$prompt" review || {
    log "票$n: 一次レビューを起動できない。止める（レーン review。ほかのレーンは続ける）"
    return 1
  }
  cont=".tasks/$name.md の変更の一次レビューの続きをやって。前は混雑で途中で止まった。作業ツリーの今の状態を見てから続ける。コードは変えない。結果は .tasks/review-$n.md に書いて"
  retry_busy "$n" "$wt" "review-$n.md" review "$(runlog_of "$wt" "$n" review)" "$cont" || {
    stop_if_limit "$n" "$wt/.tasks/review-$n.md" "$(runlog_of "$wt" "$n" review)"
    log "票$n: 一次レビューの結果が無い。止める（レーン review。ほかのレーンは続ける。$(runlog_of "$wt" "$n" review) を見る）"
    return 1
  }
  cp "$wt/.tasks/review-$n.md" "$T/"
  log "票$n: 一次レビューを書いた（レーン review、${title}）"
}

# queue.txt を先頭から読み直す（# から後は読まない。行末の @... はレーン）
parse_queue() {
  local line toks i n k bases tok
  P_N=(); P_K=(); P_B=()
  [ -f "$T/queue.txt" ] || return 0
  while IFS= read -r line; do
    line=${line%%#*}
    toks=($line)
    [ ${#toks[@]} -ge 1 ] || continue
    n=${toks[0]}
    k=browser
    bases=
    for ((i=1;i<${#toks[@]};i++)); do
      tok=${toks[$i]}
      case "$tok" in
        @browser | @node | @review) k=${tok#@} ;;
        @*) k=browser; say_once "票$n: 印 $tok が分からないので @browser として扱う" ;;
        *) bases="$bases $tok" ;;
      esac
    done
    P_N+=("$n")
    P_K+=("$k")
    P_B+=("${bases# }")
  done <"$T/queue.txt"
}

in_queue() { local x; for x in "${P_N[@]}"; do [ "$x" = "$1" ] && return 0; done; return 1; }
in_run() { case "$RUN" in *" $1 "*) return 0 ;; esac; return 1; }
is_running() { local x; for x in "${R_N[@]}"; do [ "$x" = "$1" ] && return 0; done; return 1; }
in_queue_impl() { # 同じ番号の実装の行が queue.txt にあるか
  local i; for ((i=0;i<${#P_N[@]};i++)); do [ "${P_N[$i]}" = "$1" ] && [ "${P_K[$i]}" != review ] && return 0; done; return 1
}
in_run_impl() { case "$RUN" in *" browser:$1 "* | *" node:$1 "*) return 0 ;; esac; return 1; }
# 実装の result があるか（本体か、その票の作業ツリー）
review_ready() {
  local n=$1 t name wt
  t=$(ticket_of "$n"); [ -z "$t" ] && return 0
  name=$(basename "$t" .md)
  [ -f "$T/$name.result.md" ] && return 0
  wt=$(worktree_of "$(branch_of "$t")")
  [ -n "$wt" ] && [ -f "$wt/.tasks/$name.result.md" ] && return 0
  return 1
}
cap_of() { case "$1" in node) echo "$NODE_LANES" ;; review) echo "$REVIEW_LANES" ;; *) echo 1 ;; esac; }
running_count() { local i c=0; for ((i=0;i<${#R_K[@]};i++)); do [ "${R_K[$i]}" = "$1" ] && c=$((c + 1)); done; echo "$c"; }

# 飛ばす票か（票が無い・result がある・Claude が回している・一次レビュー済み）
skip_ticket() { # 番号 レーン
  local n=$1 kind=$2 t name
  t=$(ticket_of "$n")
  [ -z "$t" ] && { say_once "票$n: 票が無い（レビュー済み）ので飛ばす"; return 0; }
  name=$(basename "$t" .md)
  if [ "$kind" = review ]; then
    ls "$T"/review*-"$n".md >/dev/null 2>&1 && { say_once "票$n: 一次レビューの結果があるので飛ばす"; return 0; }
    reviewing_outside "$n" && { say_once "票$n: キューの外でレビュー中なので飛ばす"; return 0; }
  else
    [ -f "$T/$name.result.md" ] && { say_once "票$n: result があるので飛ばす"; return 0; }
  fi
  claude_running "$n" && { say_once "票$n: Claude が回しているので飛ばす"; return 0; }
  return 1
}

# 土台が済んでいるか。ready / wait（回っている・これから回る）/ blocked（回らない）
bases_state() {
  local bases=$1 b r
  [ -z "$bases" ] && bases=master
  for b in $bases; do
    [ "$b" = master ] && continue
    # 走っている土台は、result が写っていても待つ（result は WIP コミットの後に写る）
    if is_running "$b"; then
      echo wait
      return 0
    fi
    r=$(base_ref "$b")
    [ -n "$r" ] && continue
    if claude_running "$b"; then
      echo wait
      return 0
    fi
    if in_queue_impl "$b" && ! in_run_impl "$b"; then
      echo wait
      return 0
    fi
    echo "blocked:$b"
    return 0
  done
  echo ready
}

# そのレーンで次に回す票を探す。browser は今までどおり順番を飛ばさない
find_candidate() {
  local kind=$1 i n state
  for ((i=0;i<${#P_N[@]};i++)); do
    n=${P_N[$i]}
    [ "${P_K[$i]}" = "$kind" ] || continue
    in_run "$kind:$n" && continue
    # 同じ番号が（実装でもレビューでも）走っているあいだは、もう1本起動しない
    is_running "$n" && continue
    # 同じ番号の実装の行が別のレーンにもあって、先の行がもう回し終えていたら（止まっていても）、同じ票を回し直さない
    [ "$kind" != review ] && in_run_impl "$n" && continue
    if skip_ticket "$n" "$kind"; then
      RUN="$RUN$kind:$n "
      continue
    fi
    if [ "$kind" = review ] && ! review_ready "$n"; then
      if in_queue_impl "$n" && ! in_run_impl "$n"; then
        continue
      fi
      RUN="$RUN$kind:$n "
      say_once "票$n: 実装の result が無いので一次レビューを回さない"
      continue
    fi
    state=$(bases_state "${P_B[$i]}")
    case "$state" in
      ready)
        CAND=$i
        return 0
        ;;
      wait)
        [ "$kind" = browser ] && return 1
        continue
        ;;
      blocked:*)
        # 土台が止まった票は回さない。その土台に頼らない次の票へは進む（印なしでも、夜通し回すとき1本で全部止めないため）
        RUN="$RUN$kind:$n "
        FAILED=1
        say_once "票$n: 土台の票${state#blocked:} が回らないので回さない（レーン ${kind}）"
        continue
        ;;
    esac
  done
  return 1
}

start_job() {
  local i=$1 n=${P_N[$1]} k=${P_K[$1]} bases=${P_B[$1]}
  RUN="$RUN$k:$n "
  set -m # このレーンだけ別のプロセスグループにする
  if [ "$k" = review ]; then
    ( set +m; work_review "$n" "$bases" ) &
  else
    ( set +m; work "$n" "$k" "$bases" ) &
  fi
  set +m
  R_PID+=("$!")
  R_N+=("$n")
  R_K+=("$k")
  started=1
}

# 空いているレーンに、回せる票を入れる
fill_lanes() {
  local kind
  # 枠切れなどで止める最中（.queue-stop がある）は、新しい票を起動しない
  [ -e "$T/.queue-stop" ] && return 0
  for kind in browser node review; do
    while [ "$(running_count "$kind")" -lt "$(cap_of "$kind")" ]; do
      find_candidate "$kind" || break
      start_job "$CAND"
    done
  done
}

# 終わった票を拾う。止まった票はログに残して、次の票へ進む
reap() {
  local i p st newp=() newn=() newk=()
  for ((i=0;i<${#R_PID[@]};i++)); do
    p=${R_PID[$i]}
    if kill -0 "$p" 2>/dev/null; then
      newp+=("$p")
      newn+=("${R_N[$i]}")
      newk+=("${R_K[$i]}")
    else
      wait "$p"
      st=$?
      # レーンが死んだあとに残るもの（外から kill されたときの子・取ったままのロック）を片づける
      kill -KILL -- "-$p" 2>/dev/null
      lock_drop start "${R_N[$i]}"
      lock_drop worktree "${R_N[$i]}"
      if [ "$st" = "$STOP_CODE" ]; then
        FAILED=1
        STOP_WIP="$STOP_WIP ${R_K[$i]}:${R_N[$i]}"
        STOP_LINE=$(cat "$T/.queue-stop" 2>/dev/null)
        rm -f "$T/.queue-stop"
        [ -n "$STOP_LINE" ] || STOP_LINE="票${R_N[$i]}: キューを止める（レーン ${R_K[$i]}）"
      elif [ "$st" -ne 0 ]; then
        FAILED=1
        log "票${R_N[$i]}: 止まった（レーン ${R_K[$i]}）。ほかのレーンは続ける"
      else
        log "票${R_N[$i]}: レーン ${R_K[$i]} を終えた"
      fi
    fi
  done
  R_PID=("${newp[@]}")
  R_N=("${newn[@]}")
  R_K=("${newk[@]}")
}

# 乾いた回し方: レーンと順だけを出す（本当は回さない）
DRY_DONE=" "
DRY_STARTED=" "
DRY_RUNNING_N=()
DRY_RUNNING_K=()
DRY_OUT_B=()
DRY_OUT_N=()
DRY_OUT_R=()
DRY_LINE=
dry_running_count() { local i c=0; for ((i=0;i<${#DRY_RUNNING_K[@]};i++)); do [ "${DRY_RUNNING_K[$i]}" = "$1" ] && c=$((c + 1)); done; echo "$c"; }
is_dry_running() { local i; for ((i=0;i<${#DRY_RUNNING_N[@]};i++)); do [ "${DRY_RUNNING_N[$i]}" = "$1" ] && return 0; done; return 1; }
dry_review_ready() {
  review_ready "$1" && return 0
  case "$DRY_DONE " in *" $1 "*) return 0 ;; esac
  return 1
}
dry_bases_state() {
  local bases=$1 b r
  [ -z "$bases" ] && bases=master
  for b in $bases; do
    [ "$b" = master ] && continue
    # この巡で回している土台は、終わるまで待つ
    is_dry_running "$b" && { echo wait; return 0; }
    r=$(base_ref "$b")
    [ -n "$r" ] && continue
    case "$DRY_DONE " in *" $b "*) continue ;; esac
    # これから回す土台（queue.txt にある）も、済むまで待つ
    if in_queue_impl "$b" && ! in_run_impl "$b"; then
      echo wait
      return 0
    fi
    # Claude が回している・前の巡で飛ばした土台は、今までどおり (票N の WIP) として並べる
  done
  echo ready
}
dry_find_candidate() {
  local kind=$1 i n state
  for ((i=0;i<${#P_N[@]};i++)); do
    n=${P_N[$i]}
    [ "${P_K[$i]}" = "$kind" ] || continue
    case "$DRY_STARTED " in *" $kind:$n "*) continue ;; esac
    if skip_ticket "$n" "$kind"; then
      DRY_STARTED="$DRY_STARTED$kind:$n "
      continue
    fi
    if [ "$kind" = review ] && is_dry_running "$n"; then
      continue
    fi
    if [ "$kind" = review ] && ! dry_review_ready "$n"; then
      if in_queue_impl "$n" && ! in_run_impl "$n"; then
        continue
      fi
      DRY_STARTED="$DRY_STARTED$kind:$n "
      say_once "票$n: 実装の result が無いので一次レビューを回さない"
      continue
    fi
    state=$(dry_bases_state "${P_B[$i]}")
    case "$state" in
      ready)
        CAND=$i
        return 0
        ;;
      wait)
        [ "$kind" = browser ] && return 1
        continue
        ;;
      blocked:*)
        DRY_STARTED="$DRY_STARTED$kind:$n "
        say_once "票$n: 土台の票${state#blocked:} が回らないので回さない（レーン ${kind}）"
        [ "$kind" = browser ] && return 1
        continue
        ;;
    esac
  done
  return 1
}
dry_line() {
  local i=$1 n t name br b r bases refs wt
  n=${P_N[$i]}
  t=$(ticket_of "$n")
  name=$(basename "$t" .md)
  br=$(branch_of "$t")
  bases=${P_B[$i]}
  [ -z "$bases" ] && bases=master
  refs=()
  for b in $bases; do
    r=$(base_ref "$b")
    [ -z "$r" ] && r="(票$b の WIP)"
    refs+=("$r")
  done
  wt=$(worktree_of "$br")
  DRY_LINE="票$n  $br  土台: ${refs[*]}  作業ツリー: ${wt:-.wt/t${n}（作る）}"
}

dry_run() {
  local i n k kind started l
  # 1回なぞって、飛ばす票を今までどおりログに出す
  for ((i=0;i<${#P_N[@]};i++)); do
    n=${P_N[$i]}
    k=${P_K[$i]}
    if skip_ticket "$n" "$k"; then RUN="$RUN$k:$n "; fi
  done
  while :; do
    started=0
    for kind in browser node review; do
      while [ "$(dry_running_count "$kind")" -lt "$(cap_of "$kind")" ]; do
        dry_find_candidate "$kind" || break
        i=$CAND
        n=${P_N[$i]}
        dry_line "$i"
        DRY_STARTED="$DRY_STARTED$kind:$n "
        DRY_RUNNING_N+=("$n")
        DRY_RUNNING_K+=("$kind")
        case "$kind" in
          browser) DRY_OUT_B+=("$DRY_LINE") ;;
          node) DRY_OUT_N+=("$DRY_LINE") ;;
          review) DRY_OUT_R+=("$DRY_LINE") ;;
        esac
        started=1
      done
    done
    [ ${#DRY_RUNNING_N[@]} -eq 0 ] && break
    # この巡で回した票は済んだことにして、次の巡で土台の待ちを解く
    for ((i=0;i<${#DRY_RUNNING_N[@]};i++)); do
      DRY_DONE="$DRY_DONE${DRY_RUNNING_N[$i]} "
    done
    DRY_RUNNING_N=()
    DRY_RUNNING_K=()
  done
  # 実装の result が無くて回せなかった一次レビューを残す
  for ((i=0;i<${#P_N[@]};i++)); do
    [ "${P_K[$i]}" = review ] || continue
    n=${P_N[$i]}
    case "$DRY_STARTED " in *" review:$n "*) continue ;; esac
    say_once "票$n: 実装の result が無いので一次レビューを回さない"
  done
  log "レーン: browser 1本ずつ / node ${NODE_LANES}本まで / review ${REVIEW_LANES}本まで / 実行役: $RUNNER"
  if [ ${#DRY_OUT_B[@]} -gt 0 ]; then
    log "[browser]（1本ずつ）"
    for l in "${DRY_OUT_B[@]}"; do log "$l"; done
  fi
  if [ ${#DRY_OUT_N[@]} -gt 0 ]; then
    log "[node]（${NODE_LANES}本まで）"
    for l in "${DRY_OUT_N[@]}"; do log "$l"; done
  fi
  if [ ${#DRY_OUT_R[@]} -gt 0 ]; then
    log "[review]（${REVIEW_LANES}本まで）"
    for l in "${DRY_OUT_R[@]}"; do log "$l"; done
  fi
}

[ -f "$T/queue.txt" ] || { echo "$T/queue.txt が無い"; exit 1; }

# 止めるとき: 起動しているレーンのサブシェルを、その子（opencode・claude）ごと止める
stop_lanes() {
  local p i alive
  [ ${#R_PID[@]} -eq 0 ] && return 0
  for p in "${R_PID[@]}"; do kill -TERM -- "-$p" 2>/dev/null; done
  for i in $(seq 1 10); do
    alive=0
    for p in "${R_PID[@]}"; do kill -0 "$p" 2>/dev/null && alive=1; done
    [ "$alive" = 0 ] && break
    sleep 1
  done
  for p in "${R_PID[@]}"; do kill -KILL -- "-$p" 2>/dev/null; done
  for p in "${R_PID[@]}"; do wait "$p" 2>/dev/null; done
  R_PID=()
  R_N=()
  R_K=()
}
# 後始末。止めている最中にもう1度 Ctrl-C・TERM が来ても、最後まで行かせる（無視する）。
# --dry-run は trap を入れない（何も取っていないので、何も消さない）。ロックは、持ち主の pid が自分のものだけ消す
cleanup() {
  local code=$?
  trap '' INT TERM HUP
  trap - EXIT
  if [ ${#R_PID[@]} -gt 0 ]; then
    log "止められたので、レーン（${R_N[*]}）とその子を止める"
    stop_lanes
    log "レーンの子を止めた"
  fi
  lock_drop worktree
  lock_drop start
  # 起動を断られたキューは、動いている一つ目のキューの .queue-stop・状態のページに触らない
  if [ "$HAVE_QUEUE" = 1 ]; then
    rm -f "$T/.queue-stop"
    lock_drop queue
    write_status force
  fi
  exit "$code"
}
on_stop() { exit "$1"; }
if [ $DRY != 1 ]; then
  trap cleanup EXIT
  trap 'on_stop 130' INT
  trap 'on_stop 143' TERM HUP
fi

[ -f "$T/queue.txt" ] || { echo "$T/queue.txt が無い"; exit 1; }

if [ $DRY = 1 ]; then
  log "---- 開始 ----"
  parse_queue
  dry_run
  log "---- 終わり ----"
  exit 0
fi

# キューは1つだけ。同じ .tasks/ を2つが回すと、同じ票を2本起動する（旧版のキューには排他が無いので、並べて回さない）
lock_take queue 2 || {
  echo "別のキューが動いている（$(lock_dir queue) の持ち主 PID $(cat "$(lock_dir queue)/pid" 2>/dev/null)）。止める"
  exit 1
}
HAVE_QUEUE=1
rm -f "$T/.queue-stop"

git -C "$R" fetch -q origin
log "---- 開始 ----"
write_status force

parse_queue

while :; do
  parse_queue
  started=0
  fill_lanes
  if [ "$started" = 1 ]; then
    reap
    write_status
    [ -n "$STOP_LINE" ] && break
    continue
  fi
  if [ ${#R_PID[@]} -gt 0 ]; then
    write_status
    sleep 5
    reap
    write_status
    [ -n "$STOP_LINE" ] && break
    continue
  fi
  break
done
# OpenCode の使える量が尽きた: ほかのレーンも止めて、理由を最後の行に書き、キューごと止まる（「終わり」は書かない）
if [ -n "$STOP_LINE" ]; then
  for ((i=0;i<${#R_N[@]};i++)); do STOP_WIP="$STOP_WIP ${R_K[$i]}:${R_N[$i]}"; done
  stop_lanes
  # 止めたレーンの途中の変更を WIP にして残す（一次レビューはコードを変えない）
  for w in $STOP_WIP; do
    [ "${w%%:*}" = review ] || wip_interrupted "${w#*:}"
  done
  log "$STOP_LINE"
  exit 1
fi
# 土台待ちのまま回せなかった票を残す
for ((i=0;i<${#P_N[@]};i++)); do
  n=${P_N[$i]}
  in_run "${P_K[$i]}:$n" && continue
  say_once "票$n: レーン ${P_K[$i]} に回せなかった（土台か、ほかの票の結果待ち）"
done
log "---- 終わり ----"
write_status force
[ "$FAILED" = 1 ] && exit 1
exit 0
