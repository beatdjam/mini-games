# トレイラーの作り方

テキストの台本から、ゲームのトレイラー動画（mp4）を作る。Claude に頼まなくても、台本を書き換えてコマンドを1つ打てば撮り直せる。

```sh
npm run trailer -- games/sector-dive-ex/trailers/2026-10-05.txt
# → out/trailer/2026-10-05/trailer.mp4
```

`games/sector-dive-ex/trailers/2026-10-05.txt` は、2026-10-05 に作った35秒のトレイラーを台本にしたもの（ボスを倒しきるまで1秒延ばして36.2秒）。新しく作るときは、これを写して書き換えるのが早い。

## 用意するもの

- Node 22 以上
- ffmpeg（libx264 入りのもの）。Mac なら `brew install ffmpeg`
- Chrome。Mac は `/Applications/Google Chrome.app` を自動で使う。ほかの場所にあるときは `CHROME=/path/to/chrome`
- 開発サーバーは、動いていなければコマンドが自分で立ち上げて、終わったら止める（8765番）

## コマンド

| コマンド | できるもの | かかる時間（Mac の GPU） |
|---|---|---|
| `npm run trailer -- <台本>` | `out/trailer/<台本の名前>/trailer.mp4`（音つき） | 1分ちょっと |
| `npm run trailer -- <台本> --preview` | `sheet.jpg`: 15コマおきの絵を1枚に並べたもの（音なし） | 10秒ほど |
| `npm run trailer -- <台本> --scene 3` | `scene-3.mp4`: 3番目の場面だけ（音なし。タイトルカードも1つと数える） | 場面の長さしだい |

- `--every 5`: `--preview` で、5コマおきにする
- `--out <フォルダ>`: できたものの置き場所を変える（既定は `out/trailer/<台本の名前>/`。`out/` は git に入らない）
- 台本を直すときは、まず `--preview` で並びと構図を見て、気になる場面だけ `--scene` で動きを見て、最後に全体を撮る

環境変数:

| 変数 | 意味 |
|---|---|
| `CHROME` | 使う Chrome |
| `GL` | 描き方。Mac の既定は `metal`（GPU）。Mac 以外の既定は `swiftshader`（ソフトウェア描画。どこでも同じ絵になるが、全体で30〜40分かかる） |
| `MUSIC` / `SFX` | 書き出すときの BGM と効果音の音量（既定は 1）。例: `MUSIC=0.8 SFX=1.2 npm run trailer -- …` |
| `FFMPEG` | ffmpeg が PATH に無いとき、その場所 |
| `BASE` | 開発サーバーの場所（既定は `http://localhost:8765/`） |

## 台本の書き方

台本は、設定を何行か書いたあと、場面（`scene`）を上から順に並べ、最後にタイトルカード（`end`）を置く。場面の中身は、行頭を字下げして書く。`#` から行末まではコメント。

```
size     1280x576 @1.5
music    KWLN boss
building KWLN boss=watcher

scene 2.3  これまでの Sector Dive
  at      KWLN start seed=7
  looks   old
  enemies crawler drone turret trooper
  do      look-around

scene 2.9  見た目を一新
  in      flash
  at      same
  looks   new
  do      look-around

end 3.2
  in      flash
  title   SECTOR/DIVE EX
  line    最下階のボスを倒しに降りる
  url     beatdjam.github.io/mini-games
```

### 設定（台本の最初）

| 設定 | 書き方 | 意味 |
|---|---|---|
| `size` | `1280x576 @1.5` | 画面の大きさと倍率。書き出す動画は 幅×倍率 × 高さ×倍率（この例は 1920×864、スマホ横向きの 20:9） |
| `lang` | `ja` / `en` | ゲームの表示の言語（既定は ja） |
| `input` | `touch` / `mouse` | スマホの画面（タッチのボタンが出る）か PC の画面か（既定は touch） |
| `music` | `KWLN boss` | BGM。セクターの曲。`boss` を付けるとボス戦のアレンジ |
| `build` | `strong` / `plain` | `strong`: 慣れたプレイヤー相当のチップ（火力・連射・弾倉）。`plain`: 何も無し |
| `guns` | `shotgun:rate rail:pierce` | 持つ銃。`銃:付加効果` で付加効果を1つ付けられる |
| `building` | `KWLN boss=watcher` | 下の「建物の場所」に使う建物のセクターとボス。`seed=123` で建物を決め打ちできる（無ければ、台本の場所がそろう建物を自動で探す） |
| `game` | `sector-dive-ex` | 撮るゲーム。台本が `games/<ゲーム>/` の中にあれば書かなくてよい |

セクターは `KWLN`（九龍城）・`FORGE`（製鉄所）・`DATA`（サーバールーム）・`CITY`（旧市街ビル群）など。台本に無いセクターを書くと、使えるものの一覧がエラーに出る。

### 場面（scene）

```
scene <秒数>  <字幕>
```

- 秒数は小数も使える（`2.3`）
- 字幕は場面の上の方に出る。書かなければ字幕なし
- 字幕を `^` にすると、前の場面の字幕がそのまま続く（消えて出直さない）。階段 → エレベーターのように、1つの字幕で2場面見せるとき

場面の中に書けるもの:

| 行 | 意味 |
|---|---|
| `in <切り替わり>` | この場面への切り替わり方（下の表）。書かなければ `cut` |
| `at <場所>` | どこから始めるか（下の表）。最初の場面には必須。書かなければ前の場面の続き |
| `looks old` / `looks new` | `old`: Sector Dive の見た目（専用の見た目なし）。`new`: 今の見た目 |
| `enemies <敵…>` | 正面に敵を並べる（眠っていて動かない）。`enemies 3` と数で書くと、そのセクターの敵を3種類 |
| `do <動き>` | プレイヤーの動き（下の表）。書かなければ立っているだけ |

切り替わり方（`in`）:

| 書き方 | 見え方 |
|---|---|
| `cut` | そのまま切り替わる |
| `flash` | 白く光って切り替わる（光が引くのに 0.7 秒） |
| `fade` | 暗くなって、暗いところから出てくる（0.35 秒ずつ） |

`in flash 1.2` のように秒数を足すと、その長さになる。

### 場所（at）

| 書き方 | 場所 |
|---|---|
| `<セクター> start` | そのセクターの建物の、最初の部屋。`seed=7` で建物を決め打ちできる（決めた種はその後の場面にも続く）。この場所の場面では、敵は起きず、こちらも撃たない（見せるだけの場面） |
| `window <セクター>` | そのセクターの建物の、外が見える窓の2〜3マス手前（窓のほうを向く）。窓のあるセクター（`CITY`・`RUIN`）だけ。`<セクター> start` と同じく、敵は起きず、こちらも撃たない |
| `same` | 前の場面と同じ場所・同じ向き。`looks` を変えて見比べるとき |
| `stairs` | 建物の階段室の上の踊り場から、階段を見下ろす |
| `lift` | エレベーターの横。`skip=2` で、階を2つ飛ばすエレベーター |
| `court` | 空に開いた中庭の、間の階のベランダ（中庭のほうを向く）。中庭のある建物を選ぶ（`building` は `KWLN`・`RUIN`・`CITY`） |
| `map3d` | 建物全体の立体マップを開く |
| `lockdown` | ロックダウンの部屋の扉の前（廊下側） |
| `boss` | 鍵のかかったボス部屋の扉の前 |
| `terminal` | ボス部屋に強化ターミナルを置き、その 4.5m 手前に立つ（前の場面でボス部屋にいれば、その部屋のまま）。`walk` で輪に入ると、レベルアップの画面が開く |

`stairs` から下は、設定の `building` の建物の中。台本に出てくる場所が全部ある建物を自動で選ぶ。

### 動き（do）

| 書き方 | 動き | 使える場所 |
|---|---|---|
| `stand` | 立っているだけ | どこでも |
| `look-around` | 立ったまま、ゆっくり左右を見回す（場面をまたいでも首の動きが続く） | どこでも |
| `walk` | ゆっくり前へ歩く | どこでも |
| `run` | 少し間を置いてダッシュし、走り続ける。下を見ていた視線が水平に戻る | どこでも（`stairs` で駆け下りる） |
| `ride` | エレベーターに乗り、通り過ぎる階を開口から眺める | `at lift` の場面 |
| `turn-map` | 立体マップを回す | `at map3d` の場面 |
| `fight` | 近い敵を狙って撃ち、横に動きながら戦う。`at lockdown` の場面では、まず部屋の中まで入る | どこでも |
| `boss` | ボス部屋の扉が開き、中へ入ってボスと戦う。ときどきダッシュする。倒したら立ち止まる（ボスが出るまで約3秒、倒すまで約2秒）。`boss hp=12` で、ボスの体力をその倍数にする（`build strong` では、12倍で撃ち合いが約6秒） | `at boss` の場面 |

撮影中、プレイヤーは死なない（体力はずっと満タン）。

### タイトルカード（end）

```
end <秒数>
  in    flash
  title SECTOR/DIVE EX
  line  一行の説明
  sub   小さい字の説明
  url   beatdjam.github.io/mini-games
```

- 台本の最後に1つだけ。`title` の文字は寄ってきて詰まり、`line`・`sub`・`url` は順に出てくる
- タイトルの `/` は水色、末尾の `EX` は琥珀色になる
- BGM は最後の 2.4 秒で消えていく

## うまくいかないとき

- **台本の書き間違い**: 撮る前に `script: line 12: no action "jump" (stand, look-around, …)` のように、行番号と、使える書き方の一覧が出る
- **「nothing from the page for 2 minutes」**: ページが撮影を始めていない。8765番で別のリポジトリの開発サーバーが動いていないか、`game` が合っているかを見る
- **絵がカクつく・遅い**: 撮影は1コマずつ時計を止めて撮るので、出来上がりはカクつかない。遅いのは `GL=swiftshader` のとき（Mac では `GL=metal` が既定）
- **ゲームを直したら動きがずれた**: 部屋の形や敵の動きが変わると、同じ台本でも展開が変わる。`--preview` で見て、秒数や場所を直す

## 仕組み（開発する人向け）

- `tools/trailer/trailer.mjs`（`npm run trailer`）: 開発サーバーの用意、撮影、ffmpeg でのまとめ
- `tools/trailer/capture.mjs`: ヘッドレス Chrome を DevTools プロトコルで動かし、ページに台本と「仮想時計」を差し込む。`performance.now`・タイマー・`requestAnimationFrame` を置き換え、1/30 秒ずつ進めて1コマずつ撮る。乱数も固定するので、毎回同じ展開になる。音は `OfflineAudioContext` に流し、各コマの時刻で止めて進める
- `tools/trailer/encode.sh`: コマと音を mp4 にまとめる（音量は配信で普通の大きさ、約 -14 LUFS に合わせる）
- `engine/src/trailer/script.ts`: 台本を読む（どのゲームでも共通の形）
- `engine/src/trailer/film.ts`: コマ送り、字幕、切り替わり、タイトルカード、音の書き出し。ゲームからは `TrailerGame`（言葉のチェック、場面の始まり、毎コマの手の動き、BGM）を受け取る
- `games/sector-dive-ex/src/dev/trailer.ts`: Sector Dive Extended の言葉（場所・動き・設定）。開発時に `#trailer` で開いたときだけ読み込むので、公開版には入らない
- 新しい場所や動きを足すときは、`trailer.ts` の `place`・`HANDS` と `check` に足し、この README の表にも書く。別のゲームで使うときは、そのゲームに同じような `src/dev/trailer.ts` と `#trailer` の入口を作る
