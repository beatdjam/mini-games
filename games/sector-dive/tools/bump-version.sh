#!/bin/sh
# Bump the build version after changing any js: updates every ?v= in index.html, the build meta tag, and version.json.
# The page compares its own build with version.json on start and reloads itself if it is stale.
cd "$(dirname "$0")/.." || exit 1
V=$(TZ=Asia/Tokyo date +%Y%m%d%H%M%S)
sed -i '' -E "s#(src=\"js/[a-z/]+\.js)\?v=[0-9]+#\1?v=$V#; s#(<meta name=\"build\" content=\")[0-9]+#\1$V#" index.html
printf '{ "build": "%s" }\n' "$V" > version.json
echo "build $V"
