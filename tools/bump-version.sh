#!/bin/sh
# Bump a game's build version after changing any js (the game's or engine/): updates every ?v= in the game's index.html,
# the build meta tag, and version.json. engine/stale.js compares the page's build with version.json on start and
# reloads a stale page. Usage: tools/bump-version.sh games/<game-id>
cd "$(dirname "$0")/.." || exit 1
G=${1:?usage: tools/bump-version.sh games/<game-id>}
[ -f "$G/index.html" ] || { echo "no $G/index.html"; exit 1; }
V=$(TZ=Asia/Tokyo date +%Y%m%d%H%M%S)
sed -i '' -E "s#(src=\"(js|\.\./\.\./engine)/[a-z/]+\.js)\?v=[0-9]+#\1?v=$V#; s#(<meta name=\"build\" content=\")[0-9]+#\1$V#" "$G/index.html"
printf '{ "build": "%s" }\n' "$V" > "$G/version.json"
echo "build $V"
