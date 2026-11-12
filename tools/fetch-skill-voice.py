#!/usr/bin/env python3
"""
抓取官方真人原声「技能」台词（302 条，18MB）。

与阵亡台词同一素材链路，见 public/audio/die-voice/素材说明.md：
  - 台词目录（相对路径 + 听写文本）：chenbenkong/sanguosha-cards 的 data/voice.json
  - 音频本体：三国杀官方 CDN
仓库本身不含音频。

输出：
  public/audio/skill-voice/<武将中文名>/<技能名><序号>.mp3
  src/audio/skillVoiceLines.json   { 武将: { 技能: ["台词1", "台词2"] } }

为什么要按「武将 + 技能」两级而不是只按技能：同一个技能名在不同武将手里
台词不同（实测 158 个技能条目对应 311 句，存在同名不同词），只按技能名做
全局映射会把台词配错人。文件名里的序号对应台词数组下标 + 1，运行时随机取一句。

可重复执行：已存在且大于 1KB 的文件跳过。

用法：python tools/fetch-skill-voice.py
"""
import io, json, os, re, sys, urllib.request
import concurrent.futures as cf

BASE_CDN = 'https://web.sanguosha.com/10/pc/res/assets/runtime/voice/skin/'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE_JSON = os.path.join(ROOT, 'cardsrepo', 'data', 'voice.json')
CONSTANTS = os.path.join(ROOT, 'constants.ts')
OUT_DIR = os.path.join(ROOT, 'public', 'audio', 'skill-voice')
LINES_JSON = os.path.join(ROOT, 'src', 'audio', 'skillVoiceLines.json')

NAME_ALIASES = {
    '马云禄': '马云騄',
}


def hero_names():
    src = io.open(CONSTANTS, encoding='utf-8').read()
    seen = []
    for n in re.findall(r"avatarUrl: 'images/heroes/(.+?)\.webp'", src):
        if n not in seen:
            seen.append(n)
    return seen


def looks_like_mp3(data):
    if len(data) < 1024:
        return False
    if data[:3] == b'ID3':
        return True
    return data[0] == 0xFF and (data[1] & 0xE0) == 0xE0


def main():
    if not os.path.exists(VOICE_JSON):
        print('缺少 %s' % VOICE_JSON)
        return 1
    voice = json.load(io.open(VOICE_JSON, encoding='utf-8'))

    targets = []
    for name in hero_names():
        entry = voice.get(NAME_ALIASES.get(name, name))
        if not entry:
            continue
        for group in entry:
            skill = group[0]
            if skill == '阵亡':
                continue
            lines = group[1]
            for idx, (rel, text) in enumerate(lines, start=1):
                # 技能名可能含路径分隔符，落盘前替换掉
                safe = skill.replace('/', '_').replace('\\', '_')
                targets.append((name, safe, idx, rel, text))

    os.makedirs(OUT_DIR, exist_ok=True)
    table = {}

    def fetch(item):
        name, skill, idx, rel, text = item
        d = os.path.join(OUT_DIR, name)
        dst = os.path.join(d, '%s%d.mp3' % (skill, idx))
        if os.path.exists(dst) and os.path.getsize(dst) > 1024:
            return (name, skill, idx, text, 'skip', rel)
        try:
            data = urllib.request.urlopen(BASE_CDN + rel, timeout=40).read()
        except Exception as e:
            return (name, skill, idx, text, 'ERR ' + str(e)[:50], rel)
        if not looks_like_mp3(data):
            return (name, skill, idx, text, 'BAD_DATA', rel)
        os.makedirs(d, exist_ok=True)
        io.open(dst, 'wb').write(data)
        return (name, skill, idx, text, 'ok', rel)

    with cf.ThreadPoolExecutor(8) as ex:
        results = list(ex.map(fetch, targets))

    ok = [r for r in results if r[4] in ('ok', 'skip')]
    bad = [r for r in results if r[4] not in ('ok', 'skip')]

    for name, skill, idx, text, _status, _rel in ok:
        table.setdefault(name, {}).setdefault(skill, []).append((idx, text))
    # 按序号排序，落盘成纯文本数组（下标 0 对应 <技能>1.mp3）
    out = {
        name: {skill: [t for _i, t in sorted(pairs)] for skill, pairs in skills.items()}
        for name, skills in sorted(table.items())
    }
    io.open(LINES_JSON, 'w', encoding='utf-8').write(
        json.dumps(out, ensure_ascii=False, indent=0, sort_keys=True) + '\n')

    total = sum(os.path.getsize(os.path.join(OUT_DIR, n, '%s%d.mp3' % (s, i + 1)))
                for n, ss in out.items() for s, ts in ss.items() for i in range(len(ts)))
    print('成功 %d / 失败 %d，武将 %d 名、技能 %d 个，合计 %.1f MB'
          % (len(ok), len(bad), len(out), sum(len(v) for v in out.values()), total / 1048576))
    print('台词表 -> %s' % LINES_JSON)
    for name, skill, _i, _t, err, rel in bad:
        print('  失败：%s %s (%s) %s' % (name, skill, err, rel))
    return 0


if __name__ == '__main__':
    sys.exit(main())
