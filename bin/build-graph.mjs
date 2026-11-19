#!/usr/bin/env node
/**
 * DSH 记忆 → Agent Ops 数据格式转换器
 *
 * Agent Ops 要的是：
 *   layers/l0.json        源文件行数映射（装饰用，可空）
 *   layers/l1.json        原子记忆
 *   layers/l2.json        场景块（我这边天然就是分区）
 *   layers/l3.json        人格画像
 *   cortex/graph.json     nodes / edges / memories  ← 3D 星图吃这个
 *   cortex/meta.json      graphHash / counts
 *
 * 我的 _~/.dsh/memory/layers 结构不一样，这里做一次映射，输出到 ./data。
 * 只读 DSH 记忆库，不写。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DSH = process.env.DSH_MEMORY_DIR
  || path.join(os.homedir(), '.dsh', 'memory');
const OUT = path.join(ROOT, 'data');

// layer7 → Agent Ops 的 signal class
const KIND_MAP = {
  fact: 'fact',
  soul: 'self',
  lesson: 'episode',
  topic: 'fact',
  rules: 'self',
  project: 'episode',
  user: 'preference',
};

const LAYER_NAME = {
  fact: '事实', soul: '灵魂', lesson: '复盘', topic: '话题',
  rules: '规则', project: '项目', user: '用户',
};

function readJson(p, fb) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; }
}

const l1 = readJson(path.join(DSH, 'layers', 'l1.json'), []);
const l2 = readJson(path.join(DSH, 'layers', 'l2.json'), []);
const l3 = readJson(path.join(DSH, 'layers', 'l3.json'), {});

if (!l1.length) {
  console.error('[build-graph] 读不到 l1.json —— 先跑 memory-layers.mjs build');
  process.exit(1);
}

/* ───────────── nodes：l2 的场景块就是分区 ───────────── */
const nodes = l2.map((scene, i) => ({
  id: i + 1,
  name: scene.tag || scene.key || `分区 ${i + 1}`,
  type: 'topic',
  degree: 0,
  iso: false,
  section: scene.key || '',
  layer7: scene.layer7 || 'fact',
  count: scene.count || (scene.items ? scene.items.length : 0),
}));

const nodeByLayer = new Map();
nodes.forEach((n) => {
  if (!nodeByLayer.has(n.layer7)) nodeByLayer.set(n.layer7, []);
  nodeByLayer.get(n.layer7).push(n);
});

/* ───────────── memories：l2.items 已经带归属，直接用它 ───────────── */
const byId = new Map(l1.map((m) => [m.id, m]));
const seen = new Set();
const memories = [];

function push(mem, nodeId, layer7) {
  const src = byId.get(mem.id) || mem;
  const heat = Number(src.heat) || 1;
  memories.push({
    l1: memories.length + 1,
    h: mem.id,
    nodeId,
    text: String(src.text || src.title || '').slice(0, 600),
    title: String(src.title || '').slice(0, 120),
    kind: KIND_MAP[layer7] || 'fact',
    importance: Number(Math.min(1, heat / 1.6).toFixed(4)),
    created_at: Math.floor((new Date(src.date || '2026-01-01T00:00:00Z').getTime()) / 1000) || 0,
    entities: [nodeId],
    layer7: layer7 || 'fact',
    dead: false,
    id: memories.length + 1,
  });
}

for (const scene of l2) {
  const node = nodes.find((n) => n.section === (scene.key || ''));
  const nodeId = node ? node.id : 1;
  for (const item of scene.items || []) {
    if (!item || !item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    push(item, nodeId, scene.layer7);
  }
}

// l2 没覆盖到的，挂到同 layer7 的第一个分区
for (const m of l1) {
  if (seen.has(m.id)) continue;
  seen.add(m.id);
  const list = nodeByLayer.get(m.layer7) || [];
  push(m, list.length ? list[0].id : 1, m.layer7);
}

/* ───────────── edges：同 layer7 的分区串成簇 ───────────── */
const edges = [];
for (const [, list] of nodeByLayer) {
  if (list.length < 2) continue;
  // 环形串联，朴素但够用：每个分区连前后两个
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const b = list[(i + 1) % list.length];
    if (a.id === b.id) continue;
    if (edges.some((e) => (e.src === a.id && e.dst === b.id) || (e.src === b.id && e.dst === a.id))) continue;
    edges.push({ src: a.id, dst: b.id, weight: 1 });
  }
}
// degree 回填
for (const e of edges) {
  const a = nodes.find((n) => n.id === e.src);
  const b = nodes.find((n) => n.id === e.dst);
  if (a) a.degree += 1;
  if (b) b.degree += 1;
}

const graph = { nodes, edges, memories };
const graphHash = crypto.createHash('sha1').update(JSON.stringify(graph)).digest('hex');

/* ───────────── 输出 ───────────── */
fs.mkdirSync(path.join(OUT, 'layers'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'cortex'), { recursive: true });

const l1Out = l1.map((m, i) => ({
  id: i + 1,
  h: m.id,
  section: (m.tags && m.tags[0]) || LAYER_NAME[m.layer7] || '未分组',
  group: (m.tags && m.tags[0]) || LAYER_NAME[m.layer7] || '未分组',
  sceneKey: `${m.layer7}::${(m.tags && m.tags[0]) || ''}`,
  layer7: m.layer7,
  layer7Name: LAYER_NAME[m.layer7] || m.layer7,
  layer: m.layer7,
  tier: (Number(m.heat) || 1) >= 1.2 ? 'core' : 'normal',
  title: m.title || '',
  text: m.text || '',
  date: m.date || '',
  heat: Number(m.heat) || 1,
  hits: Number(m.hits) || 0,
  conf: m.conf || 'observed',
  stage: 0,
  recalls: 0,
  dead: false,
  tags: m.tags || [],
}));

const counts = {
  nodes: nodes.length,
  edges: edges.length,
  memories: memories.length,
  L1: l1.length,
  L2: l2.length,
  L3: Array.isArray(l3) ? l3.length : 7,
  dead: 0,
};

const layerCount = {};
for (const m of memories) layerCount[m.layer7] = (layerCount[m.layer7] || 0) + 1;

fs.writeFileSync(path.join(OUT, 'layers', 'l1.json'), JSON.stringify(l1Out, null, 1));
fs.writeFileSync(path.join(OUT, 'layers', 'l2.json'), JSON.stringify(l2, null, 1));
fs.writeFileSync(path.join(OUT, 'layers', 'l3.json'), JSON.stringify(l3, null, 1));
fs.writeFileSync(path.join(OUT, 'layers', 'l0.json'), JSON.stringify({
  source: { file: 'facts.jsonl', lines: l1.length },
  mapping: { mapped: l1.length },
}, null, 1));
fs.writeFileSync(path.join(OUT, 'cortex', 'graph.json'), JSON.stringify(graph));
fs.writeFileSync(path.join(OUT, 'cortex', 'meta.json'), JSON.stringify({
  graphHash,
  builtAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
  renderRevision: 'dsh-adapter-1',
  counts,
  layerCount,
}, null, 1));

console.log(`[build-graph] nodes=${nodes.length} edges=${edges.length} memories=${memories.length}`);
console.log(`[build-graph] hash=${graphHash.slice(0, 12)}  ->  ${OUT}`);
