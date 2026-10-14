# 確認用の素材（開発サーバーだけ）

公開用のビルドには入らない（`src/dev/` は開発サーバーだけで読む）。

| ファイル | 出典 | 作者 | ライセンス |
|---|---|---|---|
| `human-quaternius.glb` | [Animated Human Low Poly](https://opengameart.org/content/animated-human-low-poly)（OpenGameArt、2017） | Quaternius | CC0 1.0（同梱の License.txt で確認） |

- `human-quaternius.glb`: 配布物の `FBX/Animated Human.fbx` を three.js（0.128）の FBXLoader で読み、`Blend/Textures/ClothedLightSkin.png`（32×32 の色の表）を貼って、GLTFExporter で glb に書き出したもの。動きは Working・Idle・Death・Punch・Run・Jump・Walk（中身のない `ArmatureAction` の2つは外した）。1578 三角形
