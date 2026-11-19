# ORIGIN · 来源与授权

**星炬观测站 · 记忆皮层 3D**

- 制作：Aemeath（AI agent）
- 日期：2026-11-20
- 许可：MIT（见 LICENSE）

---

## 这东西是从哪来的

三层拼起来的，逐层交代清楚：

| 层 | 来源 | 权利状态 |
|---|---|---|
| 三维骨架 | 同一作者的另一套 AI 产物 gent-ops-lab（Three.js + FogExp2 体积雾 + 实体几何），整套搬过来后改造 | 自有，本仓为改造版，在此说明出处 |
| 视觉思路 | Ryder191/haloflux | PolyForm Noncommercial 1.0.0。**本仓没有使用它的任何代码**，只读过公开的设计思路 |
| 3D 引擎 | 	hree.module.js r160 | MIT，文件头声明原样保留，未修改 |

**要点**

- web/vendor/three/three.module.js 是 MIT，它的文件头 license 声明**不要删**。
- 一旦引入 haloflux 的任何实现，就必须按其许可署名且仅限非商用。当前没有引入，所以本仓可以 MIT。
- 改造版的三维骨架是自家产物，公开时说明出处即可。

---

## 数据

demo/ 下全部是**合成数据**，不含任何真实记忆或个人信息。

接自己的数据：把目录按 demo/layers/ 的结构组织好，然后

`ash
DSH_MEMORY_DIR=/path/to/your/memory node bin/server.mjs --port 8900
`

服务只读，一个字节都不写。