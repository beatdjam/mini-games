#!/bin/sh
# Puts the trailer together: <dir>/f*.jpg (30 fps) + <dir>/music.wav + <dir>/sfx.wav -> <dir>/trailer.mp4 (H.264 + AAC).
#   tools/trailer/encode.sh <dir>          (FFMPEG=/path/to/ffmpeg if it isn't on the PATH; needs libx264)
# MUSIC / SFX: volume of each track before the mix (default 1). The music fades out over the title card and the
# whole mix is brought to a loudness usual for online video (about -14 LUFS).
D=${1:?usage: tools/trailer/encode.sh <dir>}
FF=${FFMPEG:-ffmpeg}
N=$(ls "$D"/f*.jpg | wc -l)
LEN=$(awk "BEGIN{print $N/30}")
FADE=$(awk "BEGIN{print $LEN-2.4}")
"$FF" -hide_banner -loglevel error -y -framerate 30 -i "$D/f%05d.jpg" -i "$D/music.wav" -i "$D/sfx.wav" \
  -filter_complex "[1:a]volume=${MUSIC:-1},afade=t=out:st=$FADE:d=2.4[m];[2:a]volume=${SFX:-1}[s];[m][s]amix=inputs=2:normalize=0,atrim=0:$LEN,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]" \
  -map 0:v -map "[a]" -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -t "$LEN" -movflags +faststart "$D/trailer.mp4" &&
echo "$D/trailer.mp4 ($N frames, $LEN s)"
