#!/usr/bin/env node
/**
 * 下载官方完整卡面并生成两档尺寸。
 *
 * 素材来源：chenbenkong/sanguosha-cards（官方卡面图鉴仓库）。
 * 卡面含势力、勾玉、技能文本，用于选将页「卡面」模式与大图查看。
 *
 * 尺寸策略（97 张实测平均）：
 *   1x  420w q76  ≈ 49 KB  选将网格（最大 171 CSS px，2x 屏 342 px）
 *   2x  760w q80  ≈ 110 KB 大图查看（86vh 上限）
 *
 * 可重复执行：已存在的文件跳过，单张失败不中断。
 * 用法：node scripts/fetch-cards.mjs [--force] [--only=名字]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = 'https://raw.githubusercontent.com/chenbenkong/sanguosha-cards/main/cards/';
const FORCE = process.argv.includes('--force');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);

const SIZES = [
  { dir: 'images/fullcards', width: 420, quality: 76 },
  { dir: 'images/fullcards/2x', width: 760, quality: 80 },
];

/** 从 constants.ts 取武将名（唯一数据源，避免手工维护第二份清单） */
const readHeroNames = () => {
  const src = fs.readFileSync(path.join(ROOT, 'constants.ts'), 'utf8');
  const names = [...src.matchAll(/avatarUrl: 'images\/heroes\/(.+?)\.webp'/g)].map((m) => m[1]);
  return [...new Set(names)];
};

const fetchCard = async (name) => {
  const res = await fetch(RAW + encodeURIComponent(name) + '.webp', {
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  // 409 “Not Found” 之类的假图：WebP 必须以 RIFF 开头
  if (buf.length < 1024 || buf.subarray(0, 4).toString() !== 'RIFF') return null;
  return buf;
};

const main = async () => {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.error('缺少 sharp，请先 npm i -D sharp');
    process.exit(1);
  }

  const names = readHeroNames().filter((n) => !ONLY || n === ONLY);
  const done = [];
  const missing = [];

  for (const [i, name] of names.entries()) {
    const targets = SIZES.map((s) => path.join(ROOT, 'public', s.dir, name + '.webp'));
    if (!FORCE && targets.every((t) => fs.existsSync(t))) {
      done.push(name);
      continue;
    }
    let buf;
    try {
      buf = await fetchCard(name);
    } catch (e) {
      console.warn('  ! 网络错误', name, e.message);
      missing.push(name);
      continue;
    }
    if (!buf) {
      console.warn('  ! 无卡面', name);
      missing.push(name);
      continue;
    }
    for (const [k, s] of SIZES.entries()) {
      fs.mkdirSync(path.dirname(targets[k]), { recursive: true });
      await sharp(buf)
        .resize({ width: s.width, withoutEnlargement: true })
        .webp({ quality: s.quality, effort: 6 })
        .toFile(targets[k]);
    }
    done.push(name);
    if ((i + 1) % 10 === 0) console.log('  ...', i + 1, '/', names.length);
  }

  console.log('\n完成:', done.length, '张；缺卡面:', missing.length);
  if (missing.length) console.log('缺:', missing.join('、'));
  fs.writeFileSync(
    path.join(ROOT, 'src/game/fullCardNames.json'),
    JSON.stringify(done.sort(), null, 0) + '\n',
  );
  console.log('已写出 src/game/fullCardNames.json');
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
