#!/usr/bin/env bash
# Claude が票を引き取った・回し終えた・仕上げたことを、キューと票の状態に伝える（トークンを使わず1コマンドで）。
#
#   tools/queue_mark.sh <番号> claude          Claude が引き取った。queue.log に「Claude が回している」を書く
#   tools/queue_mark.sh <番号> review          Claude が回し終えた。作業ツリーの result を .tasks/ に写し、「Claude が回した（レビュー待ち）」を書く
#   tools/queue_mark.sh <番号> done [PR 番号]  仕上がった。票・result・review*-<番号>.md を .tasks/done/ に移し、queue.txt から行を消す
#
# - 作業ツリーから呼んでも、本体（.git がある所）の .tasks/ を見る
# - run_queue.sh は「Claude が回している」の票と、result がある票を飛ばす。queue_status.py は状態をそれぞれ出す
# - 環境変数 QUEUE_STATUS_FILE があれば、最後に票の状態のページを書き直す
# - 票が無い・印が違うときは、何もせずに使い方を出して終了コード 1
HERE=$(dirname "$0")
R=$(dirname "$(git -C "$HERE" rev-parse --path-format=absolute --git-common-dir)")
T=$R/.tasks

usage() {
  echo "使い方: tools/queue_mark.sh <番号> claude|review|done [PR 番号]" >&2
  exit 1
}

n=${1:-}
mark=${2:-}
pr=${3:-}
case "$n" in '' | *[!0-9]*) usage ;; esac
case "$mark" in claude | review | done) ;; *) usage ;; esac

t=$(ls "$T"/"$n"-*.md 2>/dev/null | grep -vE '\.(result|review-[a-z]+)\.md$' | head -1)
if [ -z "$t" ]; then
  echo "票$n が $T に無い" >&2
  usage
fi
name=$(basename "$t" .md)

log() {
  echo "$(date '+%m-%d %H:%M:%S') $*" | tee -a "$T/queue.log"
}

case "$mark" in
  claude)
    log "票$n: Claude が回している"
    ;;
  review)
    src=
    if [ -f "$R/.wt/t$n/.tasks/$name.result.md" ]; then
      src=$R/.wt/t$n/.tasks/$name.result.md
    else
      src=$(ls "$R"/.wt/*/.tasks/"$name".result.md 2>/dev/null | head -1)
    fi
    if [ -n "$src" ]; then
      cp "$src" "$T/$name.result.md"
    elif [ ! -f "$T/$name.result.md" ]; then
      # a Claude subagent may have written the result straight into the main .tasks/; only both missing is an error
      echo "票$n の result が .tasks/ にも作業ツリー（.wt/*/.tasks/$name.result.md）にも無い" >&2
      usage
    fi
    log "票$n: Claude が回した（レビュー待ち）"
    ;;
  done)
    mkdir -p "$T/done"
    for f in "$T/$name.md" "$T/$name.result.md" "$T"/review*-"$n".md; do
      [ -f "$f" ] && mv "$f" "$T/done/"
    done
    if [ -f "$T/queue.txt" ]; then
      # 番号の行だけ消す（# の行・空行・ほかの行はそのまま）。新しいファイルに書いて mv する
      awk -v n="$n" '{ s = $0; sub(/#.*/, "", s); split(s, a, " "); if (a[1] == n) next; print }' "$T/queue.txt" >"$T/queue.txt.new" &&
        mv "$T/queue.txt.new" "$T/queue.txt"
    fi
    if [ -n "$pr" ]; then log "票$n: 済み（PR #${pr#\#}）"; else log "票$n: 済み"; fi
    ;;
esac

[ -n "${QUEUE_STATUS_FILE:-}" ] && python3 "$HERE/queue_status.py" --out "$QUEUE_STATUS_FILE" >/dev/null 2>&1
exit 0
