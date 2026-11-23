#!/usr/bin/env bash
# tools/queue_status.py のテスト: bash tools/queue_status_test.sh
# 一時のフォルダに git リポジトリ（origin/master と .wt/ の作業ツリーつき）と .tasks/ を作り、偽の gh を PATH の先頭に置いて流す。
# 本物の .tasks/ には触らない。票の状態を、印（queue.log）だけでなく PR と作業ツリーから推すことを確かめる（票2042）。
set -u
SRC=$(cd "$(dirname "$0")" && pwd)
D=$(mktemp -d "${TMPDIR:-/tmp}/queue_status_test.XXXXXX") || exit 1
trap 'rm -rf "$D"' EXIT
fail=0
ok() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; fail=1; fi; }
PY=/usr/bin/python3
[ -x "$PY" ] || PY=python3

G() { git -C "$D" -c user.email=t@t -c user.name=t "$@"; }
G init -q -b master
G commit -q --allow-empty -m init
G update-ref refs/remotes/origin/master HEAD
mkdir -p "$D/tools" "$D/.tasks" "$D/.wt" "$D/bin" "$D/gh"
cp "$SRC/queue_status.py" "$D/tools/"
T=$D/.tasks

ticket() { printf '# タスク: %s\n\ngit switch %s\n' "$2" "$3" >"$T/$1"; }
ticket 100-feat-alpha.md あるふぁ feat/alpha
ticket 200-feat-beta.md べーた feat/beta
ticket 300-feat-gamma.md がんま feat/gamma
ticket 400-feat-delta.md でるた feat/delta
ticket 500-feat-eps.md いぷしろん feat/eps
ticket 600-feat-zeta.md ぜーた feat/zeta

# 偽の gh: --state open / merged に、$D/gh/<state>.json を返す。$D/gh/fail があれば失敗する
cat >"$D/bin/gh" <<'EOS'
#!/bin/sh
[ -e "$FAKE_GH_DIR/fail" ] && exit 1
state=open
while [ $# -gt 0 ]; do [ "$1" = "--state" ] && state=$2; shift; done
cat "$FAKE_GH_DIR/$state.json"
EOS
chmod +x "$D/bin/gh"
export FAKE_GH_DIR=$D/gh

pr() { # state number title body branch updatedAt
  printf '{"number":%s,"title":"%s","body":"%s","headRefName":"%s","isDraft":false,"url":"https://example.com/%s","updatedAt":"%s"}' "$2" "$3" "$4" "$5" "$2" "$6"
}
echo "[]" >"$D/gh/open.json"
echo "[]" >"$D/gh/merged.json"

page() { PATH="$D/bin:$PATH" "$PY" "$D/tools/queue_status.py"; }
row() { page | grep "^| $1 "; }

# 作業ツリー（票200 は commit あり、票600 は commit なし）
G worktree add -q "$D/.wt/t200" -b feat/beta
git -C "$D/.wt/t200" -c user.email=t@t -c user.name=t commit -q --allow-empty -m work
G worktree add -q "$D/.wt/t600" -b feat/zeta

# 1. 票と違うブランチ名の PR が、タイトルの「票<番号>」で結びつく（開いている PR）
printf '[%s]' "$(pr open 11 'ほかの名前の PR（票100）' '' 'feat/other-name' '2026-11-23T10:00:00Z')" >"$D/gh/open.json"
ok "ブランチ名が違っても、タイトルの票<番号>で PR に結びつく" "row 100 | grep -q 'PR #11'"
ok "別の番号の票には結びつかない" "! row 300 | grep -q 'PR #11'"

# 本文の SB-<番号> でも結びつく。票1000 は票100 の PR に結びつかない
printf '[%s]' "$(pr open 12 'タイトルに番号なし' 'SB-300 の続き' 'feat/x' '2026-11-23T10:00:00Z')" >"$D/gh/open.json"
ok "本文の SB-<番号> で結びつく" "row 300 | grep -q 'PR #12'"
printf '[%s]' "$(pr open 13 '票1000 の PR' '' 'feat/y' '2026-11-23T10:00:00Z')" >"$D/gh/open.json"
ok "番号の前方一致では結びつかない（票1000 は票100 ではない）" "! row 100 | grep -q 'PR #13'"

# 2. マージ済みの PR が「済み」になる。開いている PR と両方あれば、マージ済みを優先する
echo "[]" >"$D/gh/open.json"
printf '[%s]' "$(pr merged 20 '票400 を入れる' '' 'feat/delta' '2026-11-23T11:00:00Z')" >"$D/gh/merged.json"
ok "マージ済みの PR は「済み（#n マージ）」" "row 400 | grep -q '済み（#20 マージ）'"
printf '[%s]' "$(pr open 21 '票400 の続き' '' 'feat/delta-2' '2026-11-23T12:00:00Z')" >"$D/gh/open.json"
ok "マージ済みと開いている PR があれば、マージ済みを優先する" "row 400 | grep -q '済み（#20 マージ）'"
echo "[]" >"$D/gh/open.json"
printf '[%s,%s]' "$(pr merged 22 '票400 その2' '' 'x' '2026-11-23T13:00:00Z')" "$(pr merged 20 '票400 を入れる' '' 'feat/delta' '2026-11-23T11:00:00Z')" >"$D/gh/merged.json"
ok "マージ済みが複数なら、一番新しいもの" "row 400 | grep -q '済み（#22 マージ）'"
echo "[]" >"$D/gh/merged.json"

# 3. 作業ツリーだけがある票が「作業中」になる（commit が無い作業ツリーはならない）
ok "作業ツリーに commit があり PR が無ければ「作業中（ブランチ）」" "row 200 | grep -q '作業中（feat/beta）'"
ok "commit が無い作業ツリーは作業中にしない" "! row 600 | grep -q '作業中'"
printf '[%s]' "$(pr open 30 'べーた' '' 'feat/beta' '2026-11-23T10:00:00Z')" >"$D/gh/open.json"
ok "PR があれば、作業ツリーより PR" "row 200 | grep -q 'PR #30' && ! row 200 | grep -q '作業中'"
echo "[]" >"$D/gh/open.json"

# 4. queue.log の新しい行が PR より優先される。古い行は PR に負ける
printf '[%s]' "$(pr open 40 'いぷしろん（票500）' '' 'feat/eps' '2026-11-23T10:00:00Z')" >"$D/gh/open.json"
printf '11-23 18:00:00 票500: Claude が回している\n' >"$T/queue.log" # JST 18:00 = UTC 09:00（PR より前）
ok "PR より古い queue.log の行は、PR に負ける" "row 500 | grep -q 'PR #40'"
printf '11-23 20:00:00 票500: Claude が回している\n' >"$T/queue.log" # JST 20:00 = UTC 11:00（PR より後）
ok "PR より新しい queue.log の行（Claude が回している）を出す" "row 500 | grep -q 'Claude が回している'"
printf '11-23 20:00:00 票500: レビュー中\n' >"$T/queue.log"
ok "PR より新しい queue.log の行（レビュー中）を出す" "row 500 | grep -q 'レビュー中'"
# PR が無くても、queue.log の「Claude が回している」は作業中の推定より強い
printf '11-23 20:00:00 票200: Claude が回している\n' >"$T/queue.log"
ok "queue.log の「Claude が回している」は作業中の推定より強い" "row 200 | grep -q 'Claude が回している'"
rm -f "$T/queue.log"

# 5. gh が無くても、gh が失敗しても落ちない（PR の部分を抜かして動く）
touch "$D/gh/fail"
ok "gh が失敗しても落ちない" "page >/dev/null && row 200 | grep -q '作業中'"
rm -f "$D/gh/fail"
mkdir -p "$D/nogh"
ln -sf "$(command -v git)" "$D/nogh/git"
ok "gh が PATH に無くても落ちない" "PATH='$D/nogh' '$PY' '$D/tools/queue_status.py' >/dev/null && PATH='$D/nogh' '$PY' '$D/tools/queue_status.py' | grep -q '作業中（feat/beta）'"

# ページの先頭の説明
ok "先頭に、状態の出し方の説明がある" "page | head -8 | grep -q '実物から推す'"

[ "$fail" = 0 ] && echo "all ok"
exit "$fail"
