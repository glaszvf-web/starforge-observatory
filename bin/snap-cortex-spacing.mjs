#!/usr/bin/env node
/**
 * snap-cortex-spacing.mjs — 把记忆皮层页面的间距对齐到 4 的倍数
 *
 * 为什么要它（2026-11-19）：
 *   taste.mjs 给它打「间距节奏 37 分」，唯一原因就是 CSS 里散着一堆
 *   7px / 9px / 11px / 22px 这种没有共同基准的零碎值。每个单独看都合理，
 *   合起来就"看着别扭但说不清哪别扭"。基准统一到 4 之后，节奏就回来了。
 *
 * 只动三个属性：margin / padding / gap。
 * 高度宽度、定位 left/top 一概不碰 —— 那些一改布局就散，得对着截图逐个调，
 * 不是脚本该干的事。
 *
 * 用法：
 *   node snap-cortex-spacing.mjs --dry
 *   node snap-cortex-spacing.mjs
 */

import { readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.resolve(HERE, '..', 'web', 'index.html');
const DRY = process.argv.includes('--dry');
const BASE = 4;

/** 就近贴到 BASE 的倍数；0 保持 0，1~2 归 4 会显脏，所以小值单独处理 */
function snap(n) {
  if (n === 0) return 0;
  const rounded = Math.round(n / BASE) * BASE;
  // 1~3 这种极小的内缩直接归 0 或 4，按「不要比 2 更碎」判
  return rounded === 0 ? (n <= 2 ? 0 : BASE) : rounded;
}

const PROP_RE = /(margin|padding|gap)(-(?:top|right|bottom|left))?\s*:\s*([^;}]+)/g;
const PX_RE = /(-?\d*\.?\d+)px/g;

async function main() {
  const html = await readFile(TARGET, 'utf8');
  const open = html.indexOf('<style>');
  const close = html.indexOf('</style>');
  if (open < 0 || close < 0) { console.error('找不到 <style>'); process.exit(1); }

  const head = html.slice(0, open + '<style>'.length);
  const css = html.slice(open + '<style>'.length, close);
  const tail = html.slice(close);

  const changes = [];
  const next = css.replace(PROP_RE, (whole, prop, side, value) => {
    const newValue = value.replace(PX_RE, (m, num) => {
      const n = parseFloat(num);
      if (!Number.isFinite(n)) return m;
      // gap:1px 是拿容器背景色当 1px 分割线用的（.dock 就是这么画的），
      // 它不是节奏值，对齐到 0 会把面板贴死。跳过。
      if (prop === 'gap' && n <= 1) return m;
      const s = snap(n);
      if (s !== n) changes.push(`${prop}${side || ''}: ${num}px -> ${s}px`);
      return `${s}px`;
    });
    return `${prop}${side || ''}:${newValue}`;
  });

  console.log(JSON.stringify({
    dryRun: DRY,
    changeCount: changes.length,
    sample: changes.slice(0, 40),
  }, null, 2));

  if (DRY || changes.length === 0) return;
  await copyFile(TARGET, TARGET + '.bak-spacing-' + Date.now());
  await writeFile(TARGET, head + next + tail, 'utf8');
  console.log('\n已写入。');
}

main().catch((e) => { console.error(e); process.exit(1); });
