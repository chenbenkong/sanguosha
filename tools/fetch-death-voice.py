#!/usr/bin/env python3
"""
抓取官方真人原声「阵亡」台词。

素材链路：chenbenkong/sanguosha-cards 的 data/voice.json 给出每句台词的
相对路径与听写文本，音频本体托管在三国杀官方 CDN（web.sanguosha.com）。
仓库本身不含音频，所以脚本分两步：先读台词表，再按路径取 mp3。

输出：
  public/audio/die-voice/<武将中文名>.mp3   按中文名命名，与 images/heroes 同源
  src/audio/dieVoiceLines.json              武将名 → 台词文本（UI 用）

可重复执行：已存在且大于 1KB 的文件跳过；单条失败不中断，最后汇总。

用法：python tools/fetch-death-voice.py
"""
import io, json, os, sys, urllib.request
import concurrent.futures as cf

BASE_CDN = 'https://web.sanguosha.com/10/pc/res/assets/runtime/voice/skin/'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE_JSON = os.path.join(ROOT, 'cardsrepo', 'data', 'voice.json')
CONSTANTS = os.path.join(ROOT, 'constants.ts')
OUT_DIR = os.path.join(ROOT, 'public', 'audio', 'die-voice')
LINES_JSON = os.path.join(ROOT, 'src', 'audio', 'dieVoiceLines.json')


# 图鉴库与本项目的武将名写法差异（异体字）。键=本项目写法，值=图鉴库写法。
# 只登记已核实的差异，不做模糊匹配——模糊匹配会把不同武将的台词配错。
NAME_ALIASES = {
    '马云禄': '马云騄',   # 项目用「禄」，图鉴库用「騄」
}


def hero_names():
    """从 constants.ts 取武将中文名——唯一数据源，不另维护清单。"""
    import re
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
    voice = json.load(io.open(VOICE_JSON, encoding='utf-8'))
    names = hero_names()
    os.makedirs(OUT_DIR, exist_ok=True)

    targets = []
    for name in names:
        key = NAME_ALIASES.get(name, name)
        if key not in voice:
            continue
        for group in voice[key]:
            if group[0] != '阵亡':
                continue
            for rel, text in group[1]:
                targets.append((name, rel, text))

    def fetch(item):
        name, rel, text = item
        dst = os.path.join(OUT_DIR, name + '.mp3')
        if os.path.exists(dst) and os.path.getsize(dst) > 1024:
            return (name, text, 'skip')
        try:
            data = urllib.request.urlopen(BASE_CDN + rel, timeout=40).read()
        except Exception as e:
            return (name, text, 'ERR ' + str(e)[:60])
        if not looks_like_mp3(data):
            return (name, text, 'BAD_DATA')
        io.open(dst, 'wb').write(data)
        return (name, text, 'ok')

    with cf.ThreadPoolExecutor(8) as ex:
        results = list(ex.map(fetch, targets))

    ok = [r for r in results if r[2] in ('ok', 'skip')]
    bad = [r for r in results if r[2] not in ('ok', 'skip')]

    lines = {name: text for name, text, status in ok}
    io.open(LINES_JSON, 'w', encoding='utf-8').write(
        json.dumps(lines, ensure_ascii=False, indent=0, sort_keys=True) + '\n')

    total = sum(os.path.getsize(os.path.join(OUT_DIR, n + '.mp3')) for n in lines)
    print('成功 %d / 失败 %d，合计 %.1f MB' % (len(ok), len(bad), total / 1048576))
    print('台词表 -> %s（%d 条）' % (LINES_JSON, len(lines)))
    for name, _, err in bad:
        print('  失败：%s (%s)' % (name, err))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
