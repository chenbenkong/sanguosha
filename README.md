# 三国杀：五人军争（sanguosha）

> 基于 React 19 + TypeScript + Vite 构建的网页版《三国杀》五人身份局，内置 AI 对手与「军师」战术顾问。

## 项目简介

本项目是一个可直接在浏览器中运行的《三国杀》单机对局实现，规则参考经典的**五人身份局**（主公 / 忠臣 / 反贼 / 内奸）。你操作 1 号位人类玩家，其余 4 名角色由内置 AI 托管，完整走完「回合开始 → 摸牌 → 出牌 → 弃牌 → 回合结束」的回合流程。

页面采用竖排毛笔字体（Ma Shan Zheng）、木纹底纹与水墨配色，配合背景音乐、卡牌音效和多张国风背景图轮播，尽量还原桌游的对局氛围。项目另接入了 Google Gemini，可在对局中向「诸葛亮」请求一段针对当前局势的战术建议。

## 功能特性

**对局与规则**

- 五人身份局：主公、忠臣、反贼、内奸四种身份，主公体力上限 +1，身份在阵亡时公开
- 完整回合阶段机：`回合开始 / 摸牌阶段 / 出牌阶段 / 弃牌阶段 / 回合结束`（见 `types.ts` 的 `GamePhase`）
- 4 名 AI 对手自动出牌、选目标、响应求闪与结算
- 判定流程（闪电、乐不思蜀、兵粮寸断等需要判定的效果）
- 角色状态标记：铁索连环、乐不思蜀、兵粮寸断
- 实时战报日志（`LogEntry`，区分 info / danger / success / warning / skill 等类型）

**牌堆**

- 基本牌：杀、闪、桃
- 锦囊牌：酒、决斗、无中生有、南蛮入侵、无懈可击、万箭齐发、顺手牵羊、过河拆桥、乐不思蜀、火攻、铁索连环、兵粮寸断、五谷丰登、桃园结义、借刀杀人、闪电
- 每张牌带花色（♠♥♣♦）与点数（A、2–10、J、Q、K），用于判定与技能结算

**武将**

内置 8 名武将，各带一个技能与专属立绘（`public/images/heroes/`）：

| 武将 | 势力 | 体力 | 技能 |
| --- | --- | --- | --- |
| 曹操 | 魏 | 4 | 奸雄 |
| 司马懿 | 魏 | 3 | — |
| 刘备 | 蜀 | 4 | 仁德 |
| 关羽 | 蜀 | 4 | — |
| 赵云 | 蜀 | 4 | — |
| 孙权 | 吴 | 4 | 制衡 |
| 吕布 | 群 | 4 | — |
| 貂蝉 | 群 | 3 | — |

> 具体技能描述以 `constants.ts` 中的 `HEROES` 定义为准。

**视听与界面**

- 本地背景音乐（`背景音乐.mp3`）+ 按牌名区分的技能音效
- 背景图轮播组件 `BackgroundCarousel`，`public/backgrounds/` 下提供 20 张国风背景
- 明暗主题切换（`ThemeContext` + `ThemeToggle` + `src/styles/theme.css`）
- 移动端适配：禁用缩放与滚动回弹，适合手机竖屏对局

**AI 军师（可选）**

- `services/geminiService.ts` 调用 `@google/genai`，把「我方情报 / 局势概览 / 近期战况」组装成提示词，让 Gemini 扮演诸葛亮给出战术建议
- 未配置 API Key 时会返回「天机不可泄露 (API Key 缺失)」，不影响正常对局

## 技术栈

| 类别 | 选型 |
| --- | --- |
| 框架 | React 19 |
| 语言 | TypeScript 5.8 |
| 构建 | Vite 6 + `@vitejs/plugin-react` |
| 样式 | Tailwind CSS（CDN 引入）+ 自定义 CSS 变量主题 |
| AI | `@google/genai`（Google Gemini） |
| 部署 | GitHub Actions → GitHub Pages |

## 目录结构

```
sanguosha/
├── App.tsx                  # 核心对局逻辑与主界面（约 4700 行，含回合机、AI、结算）
├── index.tsx                # React 入口
├── index.html               # HTML 模板（字体、木纹底色、Tailwind CDN）
├── constants.ts             # 武将表 HEROES、牌堆生成、音效与 BGM 配置
├── types.ts                 # Card / Hero / Player / Identity / GamePhase 等类型定义
├── components/
│   ├── Avatar.tsx           # 武将头像
│   └── CardComponent.tsx    # 卡牌渲染
├── services/
│   └── geminiService.ts     # Gemini 战术建议接口
├── src/
│   ├── components/
│   │   ├── BackgroundCarousel.tsx
│   │   └── ThemeToggle.tsx
│   ├── config/backgrounds.ts
│   ├── contexts/ThemeContext.tsx
│   └── styles/theme.css
├── public/
│   ├── backgrounds/         # 20 张国风背景图
│   └── images/heroes/       # 8 张武将立绘
├── 背景音乐.mp3              # 本地 BGM
├── test_skills.js           # 技能相关脚本
├── vite.config.ts           # 构建优化：代码分割、资源分目录、esbuild 压缩
└── .github/workflows/deploy.yml   # Pages 自动部署
```

## 本地运行

**前置要求：** Node.js 18+（CI 使用 Node 20）

```bash
# 1. 安装依赖
npm install

# 2.（可选）配置 Gemini API Key，用于「军师建议」功能
#    在项目根目录新建 .env.local
echo "GEMINI_API_KEY=你的_API_KEY" > .env.local

# 3. 启动开发服务器（默认 http://localhost:3000，已开放 0.0.0.0）
npm run dev

# 4. 生产构建
npm run build

# 5. 本地预览构建产物
npm run preview
```

> 不配置 `GEMINI_API_KEY` 也可以正常游玩，只是 AI 军师建议不可用。
> `vite.config.ts` 会把 `GEMINI_API_KEY` 注入为 `process.env.API_KEY` / `process.env.GEMINI_API_KEY`。

## 在线演示

https://chenbenkong.github.io/sanguosha/

推送到 `main` 分支后，`.github/workflows/deploy.yml` 会自动执行 `npx vite build --base=./` 并发布到 GitHub Pages。

## 说明 / 备注

- **纯前端单机项目**：没有服务端，也没有联机对战，所有对局逻辑与 AI 决策都在浏览器里完成。
- **API Key 会打进产物**：Vite 的 `define` 是编译期替换，构建后 Key 会出现在前端 JS 中。因此线上演示不带 Key，请勿把个人 Key 提交或部署到公开站点。
- **音效来自外部 CDN**：技能音效引用 Pixabay 的公开音频链接，离线环境下音效可能无法播放；背景音乐为仓库内本地文件，不受影响。
- **规则为简化实现**：装备牌（武器 / 防具 / 坐骑）目前仅在类型定义与「借刀杀人」的描述中出现，尚未作为完整系统实装；实际可用牌以上文牌堆列表为准。
- 仓库根目录的 `.trae/`、`metadata.json` 等为开发工具与元数据，与运行无关。
