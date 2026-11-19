#!/usr/bin/env node
/**
 * align-cortex-palette.mjs — 把记忆皮层的配色对齐到 lumen-gallery 那套设计系统
 *
 * 为什么（2026-11-20）：
 *   收到反馈说「和那几个开源项目的视觉效果差得很远」。去拆了 lumen-gallery 的
 *   Theme.kt 才发现根本不是「收得不够」—— 是色相整个用错了：
 *     我用  #5eeaff 淡青 / #4A9EFF 蓝     →  它用 #22D3EE 电光青
 *     我用  #ff8fa8 粉                    →  它用 #F472B6 霓虹粉
 *     我用  #07050e 紫黑                  →  它用 #070B14 深蓝黑
 *   一个偏灰柔，一个饱和度拉满。这不是调参能救的，得换色板。
 *
 * 这套色板连带它的三级背景 + 三级文字一起搬：
 *   Bg0 #070B14 / Bg1 #0B1120 / Bg2 #111A2E / Line #1E2A44
 *   TextHi #E8F1FF / TextMid #9DB0D0 / TextLow #5C6B8A
 *
 * 只换颜色，不动布局和几何。
 */

import { readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.resolve(HERE, '..', 'web', 'index.html');
const DRY = process.argv.includes('--dry');

// rgb 三元组映射（CSS 里的 rgba(...)）
const RGB_MAP = [
  // 主青：淡青 -> 电光青 #22D3EE
  [/94,\s*234,\s*255/g, '34,211,238'],
  // 青绿「活跃」-> Ok 绿 #34D399
  [/90,\s*255,\s*210/g, '52,211,153'],
  // 琥珀 -> #FBBF24
  [/255,\s*196,\s*107/g, '251,191,36'],
  // 紫 -> #A78BFA
  [/183,\s*140,\s*255/g, '167,139,250'],
  // 粉 -> #F472B6
  [/255,\s*143,\s*168/g, '244,114,182'],
  // 淡蓝 -> TextMid #9DB0D0
  [/160,\s*225,\s*255/g, '157,176,208'],
  // 淡青白 -> TextHi #E8F1FF
  [/190,\s*245,\s*232/g, '232,241,255'],
  // 描边青 -> Line #1E2A44
  [/110,\s*200,\s*255/g, '30,42,68'],
];

// hex 映射（含 3D 场景里的 0x 字面量）
const HEX_MAP = [
  [/#5eeaff/gi, '#22D3EE'],
  [/#b78cff/gi, '#A78BFA'],
  [/#ffc46b/gi, '#FBBF24'],
  [/#ff8fa8/gi, '#F472B6'],
  [/#8dffd9/gi, '#34D399'],
  [/#dff2ff/gi, '#E8F1FF'],
  [/#dcfff6/gi, '#E8F1FF'],
  [/#fff6e8/gi, '#E8F1FF'],
  [/#07050e/gi, '#070B14'],
  [/#03130f/gi, '#070B14'],
];

// three.js 的 0x 字面量
const OX_MAP = [
  [/0x5eeaff/gi, '0x22D3EE'],
  [/0x9fe8ff/gi, '0x67E8F9'],   // 核心晕：电光青的亮档
  [/0x7fdcff/gi, '0x22D3EE'],
  [/0x6eeaff/gi, '0x22D3EE'],
  [/0xa9e9ff/gi, '0xA5F3FC'],
  [/0xb78cff/gi, '0xA78BFA'],
  [/0xff8fa8/gi, '0xF472B6'],
  [/0xffc46b/gi, '0xFBBF24'],
];

async function main() {
  const html = await readFile(TARGET, 'utf8');
  let out = html;
  const report = [];

  for (const [re, to] of RGB_MAP) {
    const n = (out.match(re) || []).length;
    if (n) { out = out.replace(re, to); report.push(`rgba ${re.source} -> ${to}  x${n}`); }
  }
  for (const [re, to] of HEX_MAP) {
    const n = (out.match(re) || []).length;
    if (n) { out = out.replace(re, to); report.push(`hex ${re.source} -> ${to}  x${n}`); }
  }
  for (const [re, to] of OX_MAP) {
    const n = (out.match(re) || []).length;
    if (n) { out = out.replace(re, to); report.push(`0x ${re.source} -> ${to}  x${n}`); }
  }

  console.log(JSON.stringify({ dryRun: DRY, changes: report, total: report.length }, null, 2));
  if (DRY || report.length === 0) return;

  await copyFile(TARGET, TARGET + '.bak-palette-' + Date.now());
  await writeFile(TARGET, out, 'utf8');
  console.log('\n已写入。');
}

main().catch((e) => { console.error(e); process.exit(1); });
