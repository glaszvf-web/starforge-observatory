#!/usr/bin/env node
/**
 * 星炬观测站 · 本地可视化服务
 *
 * 只做三件事：
 *   1. 托管 web/ 下的单页控制台
 *   2. 把 Memory 里的真实分层/图谱/系统状态整理成 /api/snapshot
 *   3. 提供 /api/health 和 /api/shutdown，方便桌面启动器管进程
 *
 * 不写记忆、不改索引，纯只读。
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const WEB = path.join(ROOT, 'web');
// 数据目录：DSH_MEMORY_DIR 是正式名字（README 一直这么写的）；
// TIANXI_MEMORY_DIR 是搬过来之前的旧名，留着兼容，但不要再写进文档。
// 都没设时回落到本工程自己的 data/，别再指去别人的目录。
const MEMORY = process.env.DSH_MEMORY_DIR
  || process.env.TIANXI_MEMORY_DIR
  || path.join(ROOT, 'data');
const DEMO = path.join(ROOT, 'demo');
const USING_DEMO = process.env.TIANXI_DEMO === '1' || !fs.existsSync(MEMORY);
const SOURCE = USING_DEMO ? DEMO : MEMORY;

const APP = 'starforge-observatory';
const VERSION = '1.0.0';
const REVISION = '2026-11-06-dsh-1';

const argv = process.argv.slice(2);
function argValue(flag, fallback) {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
const PORT = Number(argValue('--port', process.env.PORT || 8902));
const NO_OPEN = argv.includes('--no-open');
const startedAt = Date.now();

/* ───────────────────────── 数据读取（按 mtime 缓存） ───────────────────────── */

const cache = new Map();
function readJson(rel) {
  const file = path.join(SOURCE, rel);
  try {
    const stat = fs.statSync(file);
    const hit = cache.get(file);
    if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.data;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, data });
    return data;
  } catch {
    return null;
  }
}

/* ───────────────────────── 系统采样 ───────────────────────── */

let lastCpu = os.cpus();
const history = [];

function sampleSystem() {
  const now = os.cpus();
  let idle = 0;
  let total = 0;
  for (let i = 0; i < Math.min(now.length, lastCpu.length); i += 1) {
    const a = now[i].times;
    const b = lastCpu[i].times;
    const dIdle = a.idle - b.idle;
    const dTotal = (a.user - b.user) + (a.nice - b.nice) + (a.sys - b.sys) + (a.irq - b.irq) + dIdle;
    idle += dIdle;
    total += dTotal;
  }
  lastCpu = now;
  const cpu = total > 0 ? Math.min(1, Math.max(0, 1 - idle / total)) : 0;
  const mem = 1 - os.freemem() / os.totalmem();
  history.push({ t: Date.now(), cpu, mem });
  while (history.length > 150) history.shift();
  return { cpu, mem };
}

sampleSystem();
setInterval(sampleSystem, 1000);

/* ───────────────────────── 事件流 ───────────────────────── */

const events = [];
function pushEvent(text, level = 'info') {
  events.unshift({ t: Date.now(), level, text });
  if (events.length > 140) events.pop();
}

/* ───────────────────────── 快照 ───────────────────────── */

let snapshotSeq = 0;
let prevSignature = '';
let lastScanEvent = 0;

function buildSnapshot() {
  const l1 = readJson('layers/l1.json') || [];
  const l2 = readJson('layers/l2.json') || [];
  const l3 = readJson('layers/l3.json') || {};
  const l0 = readJson('layers/l0.json') || {};
  const graph = readJson('cortex/graph.json') || { nodes: [], edges: [], memories: [] };
  const meta = readJson('cortex/meta.json') || {};
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const memories = graph.memories || [];

  const kindCount = {};
  for (const item of memories) kindCount[item.kind || 'unknown'] = (kindCount[item.kind || 'unknown'] || 0) + 1;

  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const matrix = nodes.map(() => nodes.map(() => 0));
  let maxCell = 0;
  for (const edge of edges) {
    const a = index.get(edge.src);
    const b = index.get(edge.dst);
    if (a === undefined || b === undefined) continue;
    const w = edge.weight || 1;
    matrix[a][b] += w;
    matrix[b][a] += w;
    if (matrix[a][b] > maxCell) maxCell = matrix[a][b];
  }
  const normalized = matrix.map((row) => row.map((v) => (maxCell ? Number((v / maxCell).toFixed(4)) : 0)));

  const cpuInfo = os.cpus()[0] || {};
  const sample = history[history.length - 1] || { cpu: 0, mem: 0 };
  const sig = `${memories.length}|${nodes.length}|${edges.length}|${meta.graphHash || ''}`;
  if (sig !== prevSignature) {
    if (prevSignature) pushEvent(`图谱重载 · ${memories.length} 原子 / ${nodes.length} 分区`, 'ok');
    prevSignature = sig;
  }
  snapshotSeq += 1;
  if (Date.now() - lastScanEvent > 45000) {
    lastScanEvent = Date.now();
    pushEvent(`总线扫描 #${snapshotSeq} · ${memories.length} 原子 · ${edges.length} 连接`, 'dim');
  }

  return {
    app: APP,
    version: VERSION,
    revision: REVISION,
    dataSource: USING_DEMO ? 'demo' : 'memory',
    generatedAt: new Date().toISOString(),
    graphHash: meta.graphHash || '',
    cortexBuiltAt: meta.builtAt || '',
    renderRevision: meta.renderRevision || '',
    counts: {
      memories: memories.length,
      atoms: l1.length,
      scenes: l2.length,
      personas: meta.counts?.L3 ?? (l3.counts?.L3 || 7),
      nodes: nodes.length,
      edges: edges.length,
      dead: memories.filter((item) => item.dead).length,
      l0Lines: l0?.source?.lines || 0,
      l0Mapped: l0?.mapping?.mapped || 0,
    },
    layerCount: meta.layerCount || {},
    kindCount,
    nodes: nodes.map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      degree: node.degree || 0,
      layer7: node.layer7 || '',
    })),
    edges: edges.map((edge) => ({ src: edge.src, dst: edge.dst, weight: edge.weight || 0, kind: edge.kind || '' })),
    memories: memories.map((item) => ({
      id: item.id,
      nodeId: item.nodeId,
      kind: item.kind,
      importance: item.importance || 0,
      dead: !!item.dead,
      text: String(item.text || '').slice(0, 96),
    })),
    scenes: l2.map((scene) => ({
      id: scene.id,
      title: scene.title,
      count: scene.count || 0,
      avgHeat: scene.avgHeat || 0,
      layer7: scene.layer7 || '',
    })),
    matrix: normalized,
    waveform: history.map((item) => ({ cpu: Number(item.cpu.toFixed(3)), mem: Number(item.mem.toFixed(3)) })),
    system: {
      hostname: 'local',
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpuModel: cpuInfo.model || 'unknown',
      cores: os.cpus().length,
      totalMem: os.totalmem(),
      freeMem: os.freemem(),
      usedMem: os.totalmem() - os.freemem(),
      cpuPct: sample.cpu,
      memPct: sample.mem,
      load1: os.loadavg()[0] || 0,
      nodeVersion: process.version,
      processMem: process.memoryUsage().rss,
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      systemUptimeSec: Math.floor(os.uptime()),
    },
    server: {
      port: PORT,
      pid: process.pid,
      snapshotSeq,
      startedAt: new Date(startedAt).toISOString(),
    },
    events: events.slice(0, 60),
  };
}

/* ───────────────────────── 静态资源 ───────────────────────── */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveStatic(pathname, res) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(WEB, rel);
  if (!file.startsWith(WEB)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(file, (error, buffer) => {
    if (error) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(buffer);
  });
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

/* ───────────────────────── 服务 ───────────────────────── */

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const pathname = url.pathname;

  if (pathname === '/api/health') {
    json(res, 200, {
      app: APP,
      version: VERSION,
      revision: REVISION,
      pid: process.pid,
      port: PORT,
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    });
    return;
  }

  if (pathname === '/api/snapshot') {
    try {
      json(res, 200, buildSnapshot());
    } catch (error) {
      json(res, 500, { error: error.message });
    }
    return;
  }

  if (pathname === '/api/shutdown') {
    json(res, 200, { ok: true, pid: process.pid, message: '正在停止星炬观测站服务' });
    setTimeout(() => process.exit(0), 160);
    return;
  }

  serveStatic(pathname, res);
});

function probe(port) {
  return new Promise((resolve) => {
    const request = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 700 }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try { resolve({ ok: true, data: JSON.parse(body) }); } catch { resolve({ ok: false }); }
      });
    });
    request.on('error', () => resolve({ ok: false }));
    request.on('timeout', () => { request.destroy(); resolve({ ok: false }); });
  });
}

function openBrowser(url) {
  if (NO_OPEN || process.platform !== 'win32') return;
  exec(`start "" "${url}"`, { windowsHide: true });
}

async function main() {
  const existing = await probe(PORT);
  if (existing.ok && existing.data.app === APP) {
    console.log(`[agent-ops] 已有服务在跑：http://127.0.0.1:${PORT}/`);
    openBrowser(`http://127.0.0.1:${PORT}/`);
    return;
  }

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`[agent-ops] 端口 ${PORT} 已被其他程序占用`);
      process.exit(2);
    }
    console.error(`[agent-ops] 服务错误：${error.message}`);
    process.exit(1);
  });

  server.listen(PORT, '127.0.0.1', () => {
    pushEvent('星炬观测站 · 核心上线', 'ok');
    pushEvent(USING_DEMO ? '演示数据集 · 内置样本' : `记忆源已接入 · ${path.basename(MEMORY)}`, 'dim');
    pushEvent(`NODE ${process.version} · 本地运行时就绪`, 'dim');
    console.log(`[starforge] 控制台：http://127.0.0.1:${PORT}/`);
    console.log(`[starforge] 停止：/api/shutdown 或双击「停止星炬」`);
    openBrowser(`http://127.0.0.1:${PORT}/`);
  });
}

main();
