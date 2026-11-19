#!/usr/bin/env node
/**
 * refine-cortex-css.mjs — 记忆皮层页面视觉收敛（只动 <style> 里的东西）
 *
 * 为什么要它（2026-11-19）：
 *   量了一遍这个页面：9 个字号档、橙色有三个近似变体（255,184,107 / 255,196,107 /
 *   255,214,160）散在 14 处、淡蓝三档、淡青三档。同一层里四套强调色互相抢，
 *   结果就是「看着乱但说不清哪乱」。改配色靠手感会越改越花，得按数量收。
 *
 * 干什么：
 *   1. 字号 9 档 -> 4 档（9 / 11 / 13 / 24）
 *   2. 三个橙色变体 -> 统一到 --warn 的 RGB(255,196,107)
 *   3. 三档淡蓝 -> 统一 160,225,255
 *   4. 三档淡青 -> 统一 190,245,232
 *
 * 边界：只碰 <style> 与 </style> 之间的文本。JS 里的 0x 字面量（three.js 颜色）不动 ——
 * 那些是 3D 场景的燃料，改错了整片星空就变色，得单独一轮对着截图调。
 *
 * 用法：
 *   node refine-cortex-css.mjs --dry      只报告会改多少处
 *   node refine-cortex-css.mjs            真改（自动留 .bak）
 */

import { readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.resolve(HERE, '..', 'web', 'index.html');
const DRY = process.argv.includes('--dry');

const FONT_MAP = {
  '8px': '9px',
  '8.5px': '9px',
  '9px': '9px',
  '9.5px': '11px',
  '10px': '11px',
  '11px': '11px',
  '12px': '13px',
  '13px': '13px',
  '23px': '24px',
};

const COLOUR_MAP = [
  // 橙色三合一 -> warn
  [/255,\s*184,\s*107/g, '255,196,107'],
  [/255,\s*214,\s*160/g, '255,196,107'],
  // 淡蓝三合一
  [/150,\s*215,\s*255/g, '160,225,255'],
  [/180,\s*215,\s*255/g, '160,225,255'],
  // 淡青三合一
  [/150,\s*230,\s*214/g, '190,245,232'],
  [/200,\s*250,\s*240/g, '190,245,232'],
  // 注意：青绿 (90,255,210 / 120,255,220) 刻意保留，不并进主青。
  // 它是「信号活跃」的语义色，和青色的结构层是两层意思，收掉就少一层信息。
];

async function main() {
  const html = await readFile(TARGET, 'utf8');
  const open = html.indexOf('<style>');
  const close = html.indexOf('</style>');
  if (open < 0 || close < 0) {
    console.error('找不到 <style> 块，放弃');
    process.exit(1);
  }
  const head = html.slice(0, open + '<style>'.length);
  const css = html.slice(open + '<style>'.length, close);
  const tail = html.slice(close);

  let next = css;
  const report = [];

  for (const [from, to] of Object.entries(FONT_MAP)) {
    if (from === to) continue;
    const re = new RegExp(`font-size:\\s*${from.replace('.', '\\.')}`, 'g');
    const before = (next.match(re) || []).length;
    if (before) {
      next = next.replace(re, `font-size:${to}`);
      report.push(`font-size ${from} -> ${to}  x${before}`);
    }
  }

  for (const [re, to] of COLOUR_MAP) {
    const before = (next.match(re) || []).length;
    if (before) {
      next = next.replace(re, to);
      report.push(`color ${re.source} -> ${to}  x${before}`);
    }
  }

  const fontsAfter = [...next.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => m[1]);
  const uniqFonts = [...new Set(fontsAfter)].sort((a, b) => Number(a) - Number(b));

  console.log(JSON.stringify({
    dryRun: DRY,
    changes: report,
    totalChanges: report.length,
    fontSizesAfter: uniqFonts,
    fontTierCount: uniqFonts.length,
  }, null, 2));

  if (DRY) return;

  await copyFile(TARGET, TARGET + '.bak-viz-' + Date.now());
  await writeFile(TARGET, head + next + tail, 'utf8');
  console.log('\n已写入。备份留在同目录 .bak-viz-*');
}

main().catch((e) => { console.error(e); process.exit(1); });
