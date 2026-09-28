#!/bin/sh
# Open a page of this repo in headless Chrome and print its console output (SMOKE / TEST lines etc.).
# Usage: tools/headless.sh <path> [virtual-time ms] [max lines]
#   tools/headless.sh 'games/sector-dive/#smoke' 200000     the game's smoke test
#   tools/headless.sh 'engine/test/' 20000                  the engine's tests
# BASE: the site to open (default the Vite dev server http://localhost:8765/, started here if nothing is there yet).
# CHROME overrides the browser (e.g. CHROME=google-chrome on Linux).
cd "$(dirname "$0")/.." || exit 1
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
if [ -z "$BASE" ]; then
  BASE=http://localhost:8765/
  up() { python3 -c "import urllib.request; urllib.request.urlopen('$BASE', timeout=1)" 2>/dev/null; }
  if ! up; then
    npx vite --port 8765 --strictPort >/dev/null 2>&1 &
    i=0; while ! up && [ $i -lt 60 ]; do sleep 0.5; i=$((i + 1)); done
  fi
fi
"$CHROME" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --enable-logging=stderr --v=0 \
  --virtual-time-budget="${2:-30000}" --dump-dom "${BASE}${1:?usage: tools/headless.sh <path> [ms] [lines]}" 2>&1 >/dev/null \
  | grep -o 'CONSOLE.*' | grep -v 'AudioContext\|GL Driver' | sed -E 's#, source: http://localhost:[0-9]+/# @ #' | cut -c1-400 | head -"${3:-120}"
