#!/usr/bin/env bash
# Claude が使えないあいだ、.tasks/queue.txt の票を上から1本ずつ OpenCode に回す。
#
#   tools/run_queue.sh            回す（Mac がスリープしないよう caffeinate の下で動く）
#   tools/run_queue.sh --dry-run  何をどの順で回すかだけ出す
#
# - 票ごとに作業ツリー（.wt/t<番号>。そのブランチの作業ツリーが既にあればそれ）で OpenCode を起動する
# - 起動したきり止まったら（セッションが出てこなければ）起動し直す
# - 終わったら result を .tasks/ に写し、変更を「WIP（未レビュー）」のコミットにする。push・PR はしない
# - 回し終えた印は .tasks/<番号>-<名前>.result.md。あれば飛ばす。票が消えていれば（レビュー済み）飛ばす
# - queue.txt の2列目からは土台。master か、先に回す票の番号（その票の未レビューのコミットの上に積む）
# - result が出なかった・merge がぶつかったときは、そこで止める
# - queue.txt の例: 「110 master」「160 110」（# から後と空行は読まない）。.tasks/ はコミットしないので、手元で書く
# 経過は .tasks/queue.log に書く。Claude が戻ったら、result と WIP のコミットを番号の順にレビューする。
if [ -z "${QUEUE_CAFFEINATED:-}" ] && [ "${1:-}" != "--dry-run" ] && command -v caffeinate >/dev/null; then
  exec env QUEUE_CAFFEINATED=1 caffeinate -i "$0" "$@"
fi

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1
# 作業ツリーから動かしても、本体（.git がある所）の .tasks/ を見る
R=$(dirname "$(git -C "$(dirname "$0")" rev-parse --path-format=absolute --git-common-dir)")
T=$R/.tasks
OC=$HOME/.opencode/bin/opencode
LOG=$T/queue.log

log() { if [ $DRY = 1 ]; then echo "$*"; else echo "$(date '+%m-%d %H:%M:%S') $*" | tee -a "$LOG"; fi; }
ticket_of() { ls "$T"/"$1"-*.md 2>/dev/null | grep -v '\.result\.md$' | head -1; }
branch_of() { grep -o -m1 -E 'git switch [^ `]+' "$1" | awk '{print $3}'; }
worktree_of() { # そのブランチを開いている作業ツリー
  git -C "$R" worktree list --porcelain | awk -v b="refs/heads/$1" '/^worktree /{p=$2} $0=="branch " b {print p}'
}
dirty() { [ -n "$(git -C "$1" status --porcelain -- . ':(exclude)node_modules' ':(exclude).tasks')" ]; }

# 土台の票番号 → その票のブランチ。票が消えていれば master に入った扱い。まだ回していなければ空
base_ref() {
  [ "$1" = master ] && { echo origin/master; return; }
  local t; t=$(ticket_of "$1")
  [ -z "$t" ] && { echo origin/master; return; }
  [ -f "${t%.md}.result.md" ] || return 0
  branch_of "$t"
}

# result を写し、変更を WIP のコミットにする
finish() {
  local n=$1 wt=$2 name=$3 title=$4
  cp "$wt/.tasks/$name.result.md" "$T/"
  if dirty "$wt"; then
    git -C "$wt" add -A -- . ':(exclude)node_modules'
    git -C "$wt" commit -q -m "WIP（未レビュー）: 票$n $title" -m "OpenCode が書いたまま。Claude のレビュー前。" -m "Changelog: なし"
    log "票$n: WIP をコミットした（$(git -C "$wt" log --oneline -1)）"
  else
    log "票$n: コードの変更なし（調査・result だけ）"
  fi
}

# OpenCode を起動し、セッションが出てくるのを確かめてから終わるのを待つ
run_oc() {
  local n=$1 wt=$2 prompt=$3 try title pid i
  for try in 1 2 3; do
    title="$n-q$try-$(date +%H%M%S)"
    env -C "$wt" PWD="$wt" OPENCODE_DISABLE_CLAUDE_CODE=1 "$OC" run --standalone --title "$title" "$prompt" \
      </dev/null >"$wt/.tasks/oc-$n.log" 2>&1 &
    pid=$!
    for i in $(seq 1 18); do
      sleep 5
      env -C "$wt" PWD="$wt" "$OC" session list 2>/dev/null | grep -q "$title" && break
      kill -0 "$pid" 2>/dev/null || break
    done
    if env -C "$wt" PWD="$wt" "$OC" session list 2>/dev/null | grep -q "$title"; then
      log "票$n: 起動した（${title}）"
      wait "$pid"
      return 0
    fi
    log "票$n: セッションが出てこないので起動し直す（$try 回目）"
    kill "$pid" 2>/dev/null
    wait "$pid" 2>/dev/null
  done
  return 1
}

[ -f "$T/queue.txt" ] || { echo "$T/queue.txt が無い"; exit 1; }
[ $DRY = 1 ] || git -C "$R" fetch -q origin
log "---- 開始 ----"
while read -r -u 3 n bases; do
  case "$n" in '' | '#'*) continue ;; esac
  t=$(ticket_of "$n")
  [ -z "$t" ] && { log "票$n: 票が無い（レビュー済み）ので飛ばす"; continue; }
  name=$(basename "$t" .md)
  [ -f "$T/$name.result.md" ] && { log "票$n: result があるので飛ばす"; continue; }
  br=$(branch_of "$t")
  title=$(head -1 "$t" | sed 's/^# タスク: //')
  [ -z "$bases" ] && bases=master
  refs=()
  for b in $bases; do
    r=$(base_ref "$b")
    [ -z "$r" ] && [ $DRY = 1 ] && r="(票$b の WIP)"
    [ -z "$r" ] && { log "票$n: 土台の票$b がまだ回っていない。止める"; exit 1; }
    refs+=("$r")
  done
  wt=$(worktree_of "$br")
  if [ $DRY = 1 ]; then
    echo "票$n  $br  土台: ${refs[*]}  作業ツリー: ${wt:-.wt/t${n}（作る）}"
    continue
  fi

  # 前に回して result だけ残っている（写す前に止まった）なら、仕上げだけする
  if [ -n "$wt" ] && [ -f "$wt/.tasks/$name.result.md" ]; then
    finish "$n" "$wt" "$name" "$title"
    continue
  fi
  if [ -z "$wt" ]; then
    git -C "$R" show-ref -q "refs/heads/$br" || git -C "$R" branch -q "$br" origin/master
    wt=$R/.wt/t$n
    git -C "$R" worktree add -q "$wt" "$br" || { log "票$n: 作業ツリーを作れない。止める"; exit 1; }
    ln -s "$R/node_modules" "$wt/node_modules"
  fi
  if dirty "$wt"; then
    log "票$n: $wt に未コミットの変更がある。止める"
    exit 1
  fi
  # まだ何も積んでいないブランチは、1つ目の土台に合わせる。2つ目からは merge する
  if [ "$(git -C "$R" rev-list --count "origin/master..$br")" = 0 ]; then
    git -C "$wt" reset -q --hard "${refs[0]}"
  fi
  for r in "${refs[@]:1}"; do
    git -C "$wt" merge-base --is-ancestor "$r" HEAD && continue
    git -C "$wt" merge -q --no-edit "$r" || {
      git -C "$wt" merge --abort
      log "票$n: $r との merge がぶつかった。止める"
      exit 1
    }
  done
  mkdir -p "$wt/.tasks"
  cp "$t" "$wt/.tasks/"

  prompt=".tasks/$name.md の票をやって"
  if [ "${refs[*]}" != origin/master ]; then
    prompt="${prompt}。この票が前提にしている前の票は、まだ master に入っていない。このブランチの土台（WIP（未レビュー）のコミット）に入っている。「master に入っているか」は、作業ツリーのコードに入っていれば満たしたとみなしてよい"
  fi
  log "票$n: 回す（${br}、土台 ${refs[*]}）"
  run_oc "$n" "$wt" "$prompt" || { log "票$n: 3回起動しても止まったまま。止める"; exit 1; }
  if [ ! -f "$wt/.tasks/$name.result.md" ]; then
    log "票$n: result が無い。止める（$wt/.tasks/oc-$n.log を見る）"
    exit 1
  fi
  finish "$n" "$wt" "$name" "$title"
done 3<"$T/queue.txt"
log "---- 終わり ----"
