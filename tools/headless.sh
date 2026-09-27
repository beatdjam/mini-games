#!/bin/sh
# Open a page of this repo in headless Chrome and print its console output (SMOKE / TEST lines etc.).
# Usage: tools/headless.sh <path> [virtual-time ms] [max lines]
#   tools/headless.sh 'games/sector-dive/#smoke' 200000     the game's smoke test
#   tools/headless.sh 'engine/test/' 20000                  the engine's tests
# Starts the Vite dev server on http://localhost:8765 (npm run dev) if nothing is there yet. CHROME overrides the browser.
cd "$(dirname "$0")/.." || exit 1
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8765/', timeout=1)" 2>/dev/null || { npx vite --port 8765 --strictPort >/dev/null 2>&1 & sleep 3; }
"$CHROME" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --enable-logging=stderr --v=0 \
  --virtual-time-budget="${2:-30000}" --dump-dom "http://localhost:8765/${1:?usage: tools/headless.sh <path> [ms] [lines]}" 2>&1 >/dev/null \
  | grep -o 'CONSOLE.*' | grep -v 'AudioContext\|GL Driver' | sed -E 's#, source: http://localhost:8765/# @ #' | cut -c1-400 | head -"${3:-120}"
