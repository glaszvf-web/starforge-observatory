# 星炬观测站 · 记忆皮层 3D

把 DSH 的记忆分层（`~/.dsh/memory/layers`）渲染成一座可旋转的三维星图。

## 这是怎么来的

骨架来自天禧那边的 `agent-ops-lab`（Three.js + FogExp2 体积雾 + 实体几何），整套搬过来改的。
我原本自己写了一套「WebGL 全屏光线步进 + 屏幕空间粒子」，改到第 17 轮还是被评价成一坨答辩 ——
**教训记在 `~/.dsh/memory/MEMORY.md` 的 2026-11-06 那节：有成熟实现就整套搬，别自己发明第二套骨架。**

## 结构

```
agent-ops/
├── web/index.html          单页控制台（Three.js r160）
├── web/vendor/three/       three.module.js（MIT）
├── bin/server.mjs          只读数据服务（8900）
├── bin/build-graph.mjs     记忆分层 → graph.json 的转换器
├── bin/launch.ps1          探活 → 重建图 → 起服务 → 开浏览器
├── bin/launch.vbs          静默入口（桌面快捷方式用）
├── bin/stop.ps1            停止
└── data/                   转换产物（每次启动自动重建）
    ├── layers/l0-l3.json
    └── cortex/graph.json
```

## 数据怎么流

```
~/.dsh/memory/layers/l1.json  262 条原子事实
        l2.json               59 个场景块  ← 直接当分区
        l3.json               人格画像
              │
              │  build-graph.mjs（只读）
              ▼
        data/cortex/graph.json   nodes 59 / edges 56 / memories 262
              │
              ▼
        server.mjs  /api/snapshot  →  index.html
```

## 开

双击桌面 `爱弥斯的纸飞机\星炬观测站\星炬观测站.lnk`（冷启动约 2.4 秒）。
停：同目录 `停止星炬.lnk`。

手动：

```powershell
cd E:\21289\DSH\observatory\agent-ops
$env:DSH_MEMORY_DIR = "E:\21289\DSH\observatory\agent-ops\data"
node bin\build-graph.mjs
node bin\server.mjs --port 8900
```

## 操作

| 操作 | 效果 |
|---|---|
| 拖拽 | 旋转视角 |
| 滚轮 | 推拉纵深 |
| 双击 | 复位 |
| `1` `2` `3` | 星团 / 隧道 / 关系网 |
| `H` | 影院模式（隐藏面板） |
| `R` | 立即刷新数据 |
| 点击光点 | 看这条记忆 |

## 改数据源

`build-graph.mjs` 顶部 `KIND_MAP` 管 layer7 → 信号分类的映射。
想换成别的记忆库，设环境变量 `DSH_MEMORY_DIR` 指向那个目录（要有 `layers/l1-l3.json`）。

## 边界

- 需要 WebGL2；没有会直接黑屏。
- 必须在 http 下开（ES module + 文件读取），`file://` 不行。
- 记忆正文截断到 600 字。

## 文档

- **`docs/GUIDE.md`** —— 改造指南，写给下一个接手的人或别的 AI。包含三个形态的实现要点、11 条踩坑记录、常见改动怎么做。**动手改之前先读这份。**

## 视觉上是怎么做出来的

几个关键决定，都写在代码注释里：

- **色调映射用 `ACESFilmicToneMapping`**。原来整个渲染器没设 tone mapping，任何超过 1.0 的亮度直接截断成死白 —— 这是「中心永远糊成一团白饼」的真正原因，跟配色和 bloom 参数都无关。
- **`UnrealBloomPass(0.55, 0.50, 0.34)`**。阈值 0.22 会让整屏所有亮部都往外晕，看着雾茫茫；0.70 又只剩最亮的几个点会发光。0.34 是两者的中间。
- **中心是一团粒子，不是球**。球体有明确轮廓，一旦有边就像贴上去的；粒子没有边，只有「越靠中心越密越亮」。
- **节点用 `InstancedMesh`**，59 个球一次 draw call。贴图 sprite 退居二线只当光晕。
- **关系线用 `Line2` + 两端顶点色渐变**。`LineBasicMaterial` 的 linewidth 在多数平台被硬写成 1px，调不粗；`Line2` 才是像素单位。
- **分区按度数分三层**：前 15% 沉到核心圈、中间 40% 排中环、其余甩到外圈并压暗。均匀铺在一个球壳上永远出不来疏密。

## 一句话

骨架照搬成熟实现，性格自己长：球面分层的彩色星团、中心粒子核、两端渐变的关系线、AgX 色调映射加 UnrealBloom。
