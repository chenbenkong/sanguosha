#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量接入武将：从图鉴库取元数据与技能原文，落地 4 档立绘 + constants.ts 条目，
并重建 heroStory.json / skillVoiceLines.json。

这套流程原先是一次性手工做的（第六批 30 名女将），每加一批都要重新推导
「哪个字段取自哪里、图多大、缩进几格」，靠记忆复现必然出错。本脚本把它固化。

## 数据源与权威边界（各字段只有一个来源，不互相顶替）

  cardsrepo/manifest.csv   kingdom(势力) / maxHp(体力上限=hpLimit 列) / description(称号)
  cardsrepo/data/lore.json skillName / skillDesc（技能原文，含「☆ 」前缀逐字保留）
  图鉴库 cards/<名>.webp    卡面原图（1082x1560），四档图片均由它缩放而来

manifest 的 skills 列**只用于交叉校验**，不进产物：它的技能名与 lore 的 s 字段
可能不一致（实测 马伶俐：manifest 有「骊马」而 lore 无），技能文本一律以 lore 为准。

maxHp 取 **hpLimit** 而非 hp：前者是体力上限，后者是起始体力，730 条里有 20 条不等
（实测胡金定 hp=3 / hpLimit=6，HEROES 里是 6）。取 hp 会让高上限武将少血。

## 图片规格（与既有 129 张逐字节一致，实测五名武将 x 四档全部命中）

  public/images/heroes/<名>.webp       宽 600  q78
  public/images/heroes/2x/<名>.webp    宽 1200 q82   （源图 1082 宽，不放大）
  public/images/fullcards/<名>.webp    宽 420  q76
  public/images/fullcards/2x/<名>.webp 宽 760  q80

缩放走 sharp（devDependency，与 scripts/fetch-cards.mjs 同一条路径），
不用 PIL：两者量化不同，混用会在同一目录里留下两种观感。

## 幂等

  已存在的图片跳过（四档缺一档才重做）
  已在 constants.ts HEROES 里的武将跳过
  重复执行不产生重复条目；--dry-run 只报告不落盘

## 失败即中止，不留半成品

  元数据校验（缺 manifest / 缺 lore / 重名 / id 冲突）先全部跑完再动手；
  任何一项不过就退出，不写 constants.ts。
  图片先落到系统临时目录，四档全部成功后才搬进仓库；
  中途失败不留残图，也不产生「有条目没图」的条目。
  缺卡面（404 或非 RIFF/WEBP）按失败处理，不是跳过。

用法：
  python tools/add-hero-batch.py 王荣 黄舞蝶 马伶俐
  python tools/add-hero-batch.py --file=names.txt --dry-run
  python tools/add-hero-batch.py --file=names.txt --gender=female --id-map ids.json

  --root DIR        覆盖仓库根（默认由本文件位置推导；测试副本用）
  --card-base BASE  卡面来源：URL 前缀，或本地目录（离线自测用）
  --manifest PATH   覆盖 manifest.csv 路径
  --gender G        female|male，默认 female（manifest 无性别列，必须显式确认）
  --id-map PATH     JSON {武将名: id}，补 pypinyin 缺失或需要人工定 id 的情况
  --allow-id-suffix 撞 id 时自动加数字后缀（默认报错，避免悄悄换个身份）
  --no-fullcard-names  不更新 src/game/fullCardNames.json
  --skip-story / --skip-voice  跳过对应重建步骤
  --typecheck       落地后跑 npx tsc --noEmit
  --dry-run         只报告将要做什么

依赖：python3 + pypinyin（取拼音 id）、node + sharp（缩放）。
缺依赖只影响对应步骤，用 --id-map 可绕开 pypinyin。
"""

import argparse
import csv
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

RAW_BASE = 'https://raw.githubusercontent.com/chenbenkong/sanguosha-cards/main/'
CARD_BASE = RAW_BASE + 'cards/'
MANIFEST_URL = RAW_BASE + 'manifest.csv'

# 四档图的落点与参数 —— 改这里之前先对照 public/images/heroes/素材说明.md
IMAGE_PLAN = [
    ('images/heroes', 600, 78),
    ('images/heroes/2x', 1200, 82),
    ('images/fullcards', 420, 76),
    ('images/fullcards/2x', 760, 80),
]

HEROES_HEADER = 'export const HEROES: Hero[] = ['
NEWLINE_FALLBACK = '\n'


class Abort(Exception):
    """校验不通过，整体中止。"""


# ---------------------------------------------------------------- 元数据

def load_manifest(path):
    if not os.path.exists(path):
        return None
    rows = {}
    with io.open(path, encoding='utf-8') as fh:
        for row in csv.DictReader(fh):
            rows[row['name']] = row
    return rows


def load_lore(root):
    path = os.path.join(root, 'cardsrepo', 'data', 'lore.json')
    if not os.path.exists(path):
        raise Abort('缺少 %s —— 技能原文的唯一来源，无法继续。' % path)
    return json.load(io.open(path, encoding='utf-8'))


def compose_skills(entry):
    """lore 的 s 字段 -> (skillName, skillDesc)。

    逐字拼接，不做任何名字归一化：「☆ 沙舞」这类带前缀的技能必须原样入库，
    否则引擎按名注册钩子时永远匹配不上（历史踩坑点）。
    """
    skills = entry['s']
    name = ' / '.join(s[0] for s in skills)
    desc = ' '.join('%s：%s' % (s[0], s[1]) for s in skills)
    return name, desc


def pinyin_id(name):
    try:
        from pypinyin import lazy_pinyin
    except ImportError:
        return None
    return ''.join(lazy_pinyin(name)).lower()


# ---------------------------------------------------------------- constants.ts

def read_constants(path):
    raw = io.open(path, 'rb').read()
    bom = raw[:3] == b'\xef\xbb\xbf'
    text = raw.decode('utf-8-sig')
    newline = '\r\n' if '\r\n' in text else NEWLINE_FALLBACK
    return raw, text, bom, newline


def heroes_span(text):
    """返回 HEROES 数组在文本中的 [start, end)：start 是 '[' 之后，end 是 '];' 行首。"""
    start = text.find(HEROES_HEADER)
    if start < 0:
        raise Abort('constants.ts 里找不到 %r' % HEROES_HEADER)
    start += len(HEROES_HEADER)
    end = text.find('\n];', start)
    if end < 0:
        raise Abort('constants.ts 的 HEROES 数组没有找到结束行 "];"')
    # CRLF 文件里 end 落在 '\r\n' 的 '\n' 上，退回一位，避免插出 '\r\r\n'
    if end > 0 and text[end - 1] == '\r':
        end -= 1
    return start, end


def existing_heroes(text):
    """HEROES 块内已有的 (id, name) 列表。只扫这个块，避免误读 CARD_META 等。"""
    start, end = heroes_span(text)
    block = text[start:end]
    return re.findall(r"id: '([^']*)',\s*name: '([^']*)'", block)


def ts_string(value):
    if "'" in value or '\\' in value or '\n' in value or '\r' in value:
        raise Abort('字符串含单引号/反斜杠/换行，需人工处理：%r' % value)
    return "'%s'" % value


def render_entry(hero, newline):
    fields = [
        ('id', hero['id']),
        ('name', hero['name']),
        ('kingdom', hero['kingdom']),
        ('maxHp', str(hero['maxHp'])),
        ('avatarUrl', hero['avatarUrl']),
        ('description', hero['description']),
        ('skillName', hero['skillName']),
        ('skillDesc', hero['skillDesc']),
        ('gender', hero['gender']),
    ]
    lines = ['  {']
    for key, value in fields:
        rendered = value if key == 'maxHp' else ts_string(value)
        lines.append('    %s: %s,' % (key, rendered))
    lines.append('    pending: true,')
    lines.append('  },')
    return newline.join(lines) + newline


# ---------------------------------------------------------------- 图片

def fetch_card(name, card_base):
    """取卡面原始字节。失败返回 (None, 原因)，绝不返回半张图。"""
    if card_base.startswith('http://') or card_base.startswith('https://'):
        url = card_base + urllib.parse.quote(name) + '.webp'
        try:
            with urllib.request.urlopen(url, timeout=60) as res:
                data = res.read()
        except Exception as exc:  # 404 / 超时 / 断流
            return None, '%s: %s' % (type(exc).__name__, exc)
    else:
        path = os.path.join(card_base, name + '.webp')
        if not os.path.exists(path):
            return None, '本地卡面不存在：%s' % path
        data = io.open(path, 'rb').read()
    # 409 "Not Found" 之类的假图：WebP 必须 RIFF....WEBP
    if len(data) < 1024 or data[:4] != b'RIFF' or data[8:12] != b'WEBP':
        return None, '不是有效 WebP（%d 字节）' % len(data)
    return data, None


RESIZE_JS = r"""
const { createRequire } = require('node:module');
const fs = require('node:fs');
const req = createRequire(process.argv[3]);
let sharp;
try { sharp = req('sharp'); } catch (e) {
  console.error('缺少 sharp，请先 npm i -D sharp');
  process.exit(2);
}
const plan = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
(async () => {
  const out = [];
  for (const item of plan) {
    for (const t of item.outputs) {
      await sharp(item.src)
        .resize({ width: t.width, withoutEnlargement: true })
        .webp({ quality: t.quality, effort: 6 })
        .toFile(t.path);
      const m = await sharp(t.path).metadata();
      out.push({ path: t.path, width: m.width, height: m.height, bytes: fs.statSync(t.path).size });
    }
  }
  process.stdout.write(JSON.stringify(out));
})().catch((e) => { console.error((e && e.message) || String(e)); process.exit(1); });
"""


def run_sharp(plan, root):
    node = shutil.which('node')
    if not node:
        raise Abort('找不到 node —— 图片缩放依赖 sharp，而 sharp 是 node 包。')
    pkg = os.path.join(root, 'package.json')
    if not os.path.exists(pkg):
        raise Abort('找不到 %s —— 无法定位 sharp。' % pkg)
    workdir = tempfile.mkdtemp(prefix='hero-batch-')
    try:
        plan_path = os.path.join(workdir, 'plan.json')
        js_path = os.path.join(workdir, 'resize.cjs')
        io.open(plan_path, 'w', encoding='utf-8').write(json.dumps(plan, ensure_ascii=False))
        io.open(js_path, 'w', encoding='utf-8').write(RESIZE_JS)
        proc = subprocess.run([node, js_path, plan_path, pkg],
                              capture_output=True, text=True, encoding='utf-8')
        if proc.returncode != 0:
            raise Abort('sharp 缩放失败（exit %d）：%s' % (proc.returncode, (proc.stderr or '').strip()[-500:]))
        return json.loads(proc.stdout)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


# ---------------------------------------------------------------- 落盘

def update_fullcard_names(root, added):
    if not added:
        return
    path = os.path.join(root, 'src', 'game', 'fullCardNames.json')
    if not os.path.exists(path):
        return
    raw = io.open(path, 'rb').read()
    names = set(json.loads(raw.decode('utf-8')))
    before = len(names)
    names.update(added)
    if len(names) == before:
        return
    newline = '\r\n' if b'\r\n' in raw else '\n'
    # 与 scripts/fetch-cards.mjs 的 JSON.stringify(x, null, 0) 同形：单行、无空格
    io.open(path, 'wb').write(
        (json.dumps(sorted(names), ensure_ascii=False, separators=(',', ':')) + newline).encode('utf-8'))
    print('  fullCardNames.json: %d -> %d 条（新将才有完整卡面）' % (before, len(names)))


def run_tool(root, rel):
    path = os.path.join(root, rel)
    if not os.path.exists(path):
        print('  ! 跳过 %s（不存在）' % rel)
        return True
    # 子进程默认按系统编码写 stdout（Windows 上是 GBK），强制 UTF-8 才能正确解码
    env = dict(os.environ, PYTHONIOENCODING='utf-8')
    proc = subprocess.run([sys.executable, path], cwd=root, env=env,
                          capture_output=True, text=True, encoding='utf-8', errors='replace')
    tail = '\n'.join((proc.stdout or '').strip().splitlines()[-3:])
    print('  %s -> exit %d' % (rel, proc.returncode))
    if tail:
        print('     %s' % tail.replace('\n', '\n     '))
    if proc.returncode != 0 and proc.stderr:
        print('     stderr: %s' % proc.stderr.strip()[-300:])
    return proc.returncode == 0


# ---------------------------------------------------------------- 主流程

def parse_args(argv):
    ap = argparse.ArgumentParser(description='批量接入武将（幂等）')
    ap.add_argument('names', nargs='*', help='武将中文名')
    ap.add_argument('--file', help='名单文件（每行一个，# 开头为注释）')
    ap.add_argument('--root', default=ROOT)
    ap.add_argument('--card-base', default=CARD_BASE)
    ap.add_argument('--manifest', default=None)
    ap.add_argument('--gender', default='female', choices=['female', 'male'])
    ap.add_argument('--id-map')
    ap.add_argument('--allow-id-suffix', action='store_true')
    ap.add_argument('--no-fullcard-names', action='store_true')
    ap.add_argument('--skip-story', action='store_true')
    ap.add_argument('--skip-voice', action='store_true')
    ap.add_argument('--typecheck', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    return ap.parse_args(argv)


def collect_names(args):
    names = []
    for raw in args.names:
        names.extend(p for p in re.split(r'[,，\s]+', raw) if p)
    if args.file:
        if not os.path.exists(args.file):
            raise Abort('名单文件不存在：%s' % args.file)
        for line in io.open(args.file, encoding='utf-8'):
            line = line.split('#', 1)[0].strip()
            if line:
                names.append(line)
    seen, out = set(), []
    for n in names:
        if n in seen:
            raise Abort('名单里重复出现：%s' % n)
        seen.add(n)
        out.append(n)
    if not out:
        raise Abort('没有给出任何武将名。')
    return out


def main(argv):
    # Windows 控制台默认 GBK，武将名会直接抛 UnicodeEncodeError
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')
        except (AttributeError, ValueError):
            pass
    args = parse_args(argv)
    root = os.path.abspath(args.root)
    constants_path = os.path.join(root, 'constants.ts')
    if not os.path.exists(constants_path):
        raise Abort('找不到 %s' % constants_path)

    names = collect_names(args)
    manifest_path = args.manifest or os.path.join(root, 'cardsrepo', 'manifest.csv')
    manifest = load_manifest(manifest_path)
    if manifest is None:
        raise Abort('缺少 %s。\n'
                    '  它是势力/体力/称号的唯一权威来源，脚本不会替你编造。\n'
                    '  取法：curl -o cardsrepo/manifest.csv %s' % (manifest_path, MANIFEST_URL))
    lore = load_lore(root)

    raw, text, bom, newline = read_constants(constants_path)
    start, end = heroes_span(text)
    have = existing_heroes(text)
    have_names = {n for _i, n in have}
    have_ids = {i for i, _n in have}

    id_map = {}
    if args.id_map:
        id_map = json.load(io.open(args.id_map, encoding='utf-8'))

    # ---- 第一阶段：只读校验，全部通过才动手 ----
    errors, warnings, todo, skipped = [], [], [], []
    for name in names:
        if name in have_names:
            skipped.append(name)
            continue
        row = manifest.get(name)
        if not row:
            errors.append('%s：manifest.csv 里没有此武将（势力/体力/称号无权威来源）。'
                          '先补一行到 %s，不要手填进 constants.ts。' % (name, manifest_path))
            continue
        entry = lore.get(name)
        if not entry or not entry.get('s'):
            errors.append('%s：lore.json 里没有技能原文，缺技能不能生成半成品条目。' % name)
            continue
        skill_name, skill_desc = compose_skills(entry)
        manifest_skills = [s for s in (row.get('skills') or '').split('/') if s]
        lore_skills = [s[0] for s in entry['s']]
        if manifest_skills and manifest_skills != lore_skills:
            warnings.append('%s：manifest 技能列 %s 与 lore %s 不一致，以 lore 为准。'
                            % (name, '/'.join(manifest_skills), '/'.join(lore_skills)))
        hid = id_map.get(name) or pinyin_id(name)
        if not hid:
            errors.append('%s：无法生成拼音 id（未安装 pypinyin）。用 --id-map 指定。' % name)
            continue
        if not re.match(r'^[a-z][a-z0-9]*$', hid):
            errors.append('%s：id %r 不符合 [a-z][a-z0-9]* （现有 id 一律是纯拼音），'
                          '用 --id-map 改成合规的写法。' % (name, hid))
            continue
        if hid in have_ids:
            if not args.allow_id_suffix:
                errors.append('%s：id %r 已被其他武将占用（同音字）。用 --id-map 指定，'
                              '或加 --allow-id-suffix 自动加后缀。' % (name, hid))
                continue
            n = 2
            while ('%s%d' % (hid, n)) in have_ids:
                n += 1
            warnings.append('%s：id %r 冲突，改用 %s%d' % (name, hid, hid, n))
            hid = '%s%d' % (hid, n)
        have_ids.add(hid)

        # manifest 的 hp 是起始体力、hpLimit 是体力上限；项目里的 maxHp 取的是**上限**
        # （实测胡金定 hp=3/hpLimit=6，HEROES 是 6）。730 条里有 20 条两者不等，
        # 取错会让高上限武将少血。
        hp_limit, hp = row.get('hpLimit'), row.get('hp')
        max_hp = int(hp_limit or hp)
        if hp and hp_limit and hp != hp_limit:
            warnings.append('%s：hp=%s 不等于 hpLimit=%s，maxHp 取上限 %d。'
                            % (name, hp, hp_limit, max_hp))
        todo.append({
            'id': hid,
            'name': name,
            'kingdom': row['faction'],
            'maxHp': max_hp,
            'avatarUrl': 'images/heroes/%s.webp' % name,
            'description': row['title'],
            'skillName': skill_name,
            'skillDesc': skill_desc,
            'gender': args.gender,
        })

    for w in warnings:
        print('  ! %s' % w)
    if errors:
        print('\n校验未通过，未写入任何文件：')
        for e in errors:
            print('  x %s' % e)
        return 1
    if skipped:
        print('  已在 HEROES 中，跳过：%s' % '、'.join(skipped))
    print('  待接入 %d 名：%s' % (len(todo), '、'.join(h['name'] for h in todo)))

    # ---- 第二阶段：图片（先落临时目录，全成再搬）----
    image_results, img_failed = [], []
    if todo:
        staging = tempfile.mkdtemp(prefix='hero-img-')
        try:
            plan, pending_paths = [], []
            for hero in todo:
                present = [os.path.exists(os.path.join(root, 'public', d, hero['name'] + '.webp'))
                           for d, _w, _q in IMAGE_PLAN]
                if all(present):
                    print('  %s：四档图片齐全，跳过' % hero['name'])
                    image_results.append({'name': hero['name'], 'status': 'skip'})
                    continue
                data, why = fetch_card(hero['name'], args.card_base)
                if data is None:
                    img_failed.append('%s：%s' % (hero['name'], why))
                    continue
                src = os.path.join(staging, hero['name'] + '.src.webp')
                io.open(src, 'wb').write(data)
                outputs = []
                for i, (_d, width, quality) in enumerate(IMAGE_PLAN):
                    dst = os.path.join(staging, hero['name'], '%d.webp' % i)
                    os.makedirs(os.path.dirname(dst), exist_ok=True)
                    outputs.append({'path': dst, 'width': width, 'quality': quality})
                plan.append({'src': src, 'outputs': outputs})
                pending_paths.append((hero, outputs))

            if plan:
                print('  缩放 %d 名武将 x %d 档 …' % (len(plan), len(IMAGE_PLAN)))
                produced = {item['path']: item for item in run_sharp(plan, root)}
            for hero, outputs in pending_paths:
                placed = []
                for (d, _w, _q), out in zip(IMAGE_PLAN, outputs):
                    got = produced.get(out['path'])
                    if not got:
                        raise Abort('%s 的 %s 档没有产出，已中止（未写入 constants.ts）。'
                                    % (hero['name'], d))
                    rel = d + '/' + hero['name'] + '.webp'
                    if not args.dry_run:      # --dry-run 只报告，不落盘
                        dest = os.path.join(root, 'public', d, hero['name'] + '.webp')
                        os.makedirs(os.path.dirname(dest), exist_ok=True)
                        shutil.move(out['path'], dest)
                    placed.append((rel, got['width'], got['height'], got['bytes']))
                image_results.append({'name': hero['name'], 'status': 'ok', 'files': placed})
        finally:
            shutil.rmtree(staging, ignore_errors=True)

        if img_failed:
            print('\n缺卡面，未写入 constants.ts、未重建索引：')
            for f in img_failed:
                print('  x %s' % f)
            done = [r['name'] for r in image_results if r['status'] == 'ok']
            if done:
                print('  已落地的图片保留：%s（幂等，下次直接跳过）' % '、'.join(done))
            return 1

    for r in image_results:
        if r['status'] == 'skip':
            print('  %s：skip' % r['name'])
        else:
            for rel, w, h, size in r['files']:
                print('  %s：%dx%d %d B' % (rel, w, h, size))

    if not todo:
        print('\n没有需要新增的武将。')
        return 0

    snippet = ''.join(render_entry(h, newline) for h in todo)
    if args.dry_run:
        print('\n--dry-run：将插入 constants.ts 的 HEROES 末尾：')
        sys.stdout.write(snippet.replace(newline, '\n'))
        return 0

    # ---- 第三阶段：写 constants.ts（保留 BOM 与行尾）----
    updated = text[:end] + newline + snippet.rstrip('\r\n') + text[end:]
    out_bytes = (b'\xef\xbb\xbf' if bom else b'') + updated.encode('utf-8')
    io.open(constants_path, 'wb').write(out_bytes)
    print('  constants.ts：HEROES %d -> %d 条' % (len(have), len(have) + len(todo)))
    sys.stdout.write(snippet.replace(newline, '\n'))

    if not args.no_fullcard_names:
        update_fullcard_names(root, [h['name'] for h in todo])

    ok = True
    if not args.skip_story:
        ok = run_tool(root, os.path.join('tools', 'fetch-hero-story.py')) and ok
    if not args.skip_voice:
        ok = run_tool(root, os.path.join('tools', 'fetch-skill-voice.py')) and ok

    if args.typecheck:
        tsc = subprocess.run('npx tsc --noEmit', cwd=root, shell=True,
                             capture_output=True, text=True, encoding='utf-8', errors='replace')
        print('  npx tsc --noEmit -> %d' % tsc.returncode)
        if tsc.returncode != 0:
            print((tsc.stdout or '')[-800:])
            ok = False

    print('\n待办（脚本不代劳，因为要写成断言而不是抄表）：')
    for h in todo:
        for skill in h['skillName'].split(' / '):
            print("  skillCoverage.test.ts LEGACY_INLINE += '%s::%s'" % (h['name'], skill))
    print('  技能实现后把对应条目从 LEGACY_INLINE 删除（清单只允许缩小）。')
    return 0 if ok else 1


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv[1:]))
    except Abort as exc:
        print('中止：%s' % exc)
        sys.exit(1)
