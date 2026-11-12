#!/usr/bin/env python3
"""
生成本项目武将的传记文本（src/game/heroStory.json）。

数据来源：chenbenkong/sanguosha-cards 的 data/story.json（704 条，含
本项目 99 名武将中的 98 名）。只取本项目实际拥有的武将，不整包搬运。

只导出纯文本，不含任何素材二进制——传记是官方文案，此处仅作个人
学习演示用途，见 README 的素材说明。

用法：python tools/fetch-hero-story.py
"""
import io, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORY_JSON = os.path.join(ROOT, 'cardsrepo', 'data', 'story.json')
CONSTANTS = os.path.join(ROOT, 'constants.ts')
OUT = os.path.join(ROOT, 'src', 'game', 'heroStory.json')

# 图鉴库与本项目的武将名写法差异（异体字）。只登记已核实的，不做模糊匹配。
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


def main():
    if not os.path.exists(STORY_JSON):
        print('缺少 %s —— 见 tools/fetch-death-voice.py 顶部说明如何取得' % STORY_JSON)
        return 1
    story = json.load(io.open(STORY_JSON, encoding='utf-8'))

    out = {}
    missing = []
    for name in hero_names():
        text = story.get(NAME_ALIASES.get(name, name))
        if not text:
            missing.append(name)
            continue
        # 折叠换行与多余空白：JSON 里个别条目带换行，直接渲染会出现断行
        out[name] = re.sub(r'\s+', ' ', text).strip()

    io.open(OUT, 'w', encoding='utf-8').write(
        json.dumps(out, ensure_ascii=False, indent=0, sort_keys=True) + '\n')

    print('写入 %d 条传记 -> %s' % (len(out), OUT))
    if missing:
        print('无传记（%d 名）：%s' % (len(missing), '、'.join(missing)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
