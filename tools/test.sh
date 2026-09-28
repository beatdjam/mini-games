#!/bin/sh
# Runs the engine tests and every game's smoke test in headless Chrome; exits 1 if any of them fails.
#   tools/test.sh            against the dev server (npm test)
#   tools/test.sh --build    against a test build: `vite build --mode test` into dist-test/, served by
#                            `vite preview`, so build-only parts (version stamp, analytics tag) are checked too
# Needs Chrome (CHROME=... to point at it, see tools/headless.sh).
cd "$(dirname "$0")/.." || exit 1
fail=0
if [ "$1" = "--build" ]; then
  npx vite build --mode test --outDir dist-test --emptyOutDir >/dev/null || exit 1
  npx vite preview --outDir dist-test --port 8766 --strictPort >/dev/null 2>&1 &
  PREVIEW=$!
  trap 'kill $PREVIEW 2>/dev/null' EXIT
  export BASE=http://localhost:8766/mini-games/
  i=0; while ! python3 -c "import urllib.request; urllib.request.urlopen('$BASE', timeout=1)" 2>/dev/null && [ $i -lt 60 ]; do sleep 0.5; i=$((i + 1)); done
fi
out=$(tools/headless.sh 'engine/test/' 30000 400)
echo "$out" | grep -E 'TEST (FAIL|DONE)'
if echo "$out" | grep -q 'TEST FAIL' || ! echo "$out" | grep -q 'TEST DONE'; then echo 'FAILED: engine tests'; fail=1; fi
for dir in games/*/; do
  id=$(basename "$dir")
  [ -f "games/$id/js/dev/dev.ts" ] || continue
  out=$(tools/headless.sh "games/$id/#smoke" 200000 800)
  echo "$out" | grep -E 'SMOKE (ERR|FAIL|DONE|build)'
  if echo "$out" | grep -qE 'SMOKE (ERR|FAIL)' || ! echo "$out" | grep -q 'SMOKE DONE'; then echo "FAILED: $id smoke"; fail=1; fi
done
[ $fail = 0 ] && echo 'ALL TESTS PASSED'
exit $fail
