# 贡献指南

> 目标：让一次改动**只碰一个模块**，且提交前能被自动检查拦住。

## 代码组织约定

### 1. 新技能一律走注册表

**不要再往 `App.tsx` / `src/game/combat.ts` 里加 `hero.name === 'X'` 分支。**

注册表之前，加一个技能要在两个巨型文件里各 grep 一次找时机、手改 `CombatDeps` 接口、
解构区、App 组装三处；散落的内联分支让并行开发必然冲突。现在：

- 技能实现 → `src/game/skills/<名字>.ts`，末尾调 `registerSkill(...)`
- 注册入口 → `src/game/skills/index.ts` 加一行 `import`
- 引擎侧**零改动**：`dispatch.ts` 已覆盖全部 9 个时机

完整步骤（含钩子表、`SkillContext` 能力、测试模板）见 [README 的「如何添加一个新武将技能」](README.md#如何添加一个新武将技能)。

存量内联分支正在逐个搬迁，已迁移的清单在 `skillCoverage.test.ts` 的 `LEGACY_INLINE`。
**该清单只允许缩小：迁一个删一条**，残留旧条目会被守卫测试判失败。

### 2. 纯规则逻辑与 React 分离

「输入确定 → 输出确定」的判定写成纯函数（`src/game/rules.ts`、`src/game/skills-batch6.ts` 这类），
不读 React state、不写日志、不碰计时器。这样每条规则都能被测试直接覆盖，不必起组件。

### 3. 技能里要询问玩家时用 `ctx.requestChoice`

不要自己造弹窗。`requestChoice` 复用引擎既有的 `SkillChoiceModal`（含读秒与超时兜底），
**AI 与托管场景返回 `null`**，技能必须据此走自动决策分支，否则 AI 回合会卡住。

## 提交前必须跑的检查

按这个顺序跑，全绿再提交：

```bash
npm run typecheck    # ① tsc --noEmit，部署第一道闸门
npm run test:unit    # ② Vitest：558 条（规则 / 技能行为 / AI 策略 / 结构体检）
npm test             # ③ node:test：14 条核心规则用例
npm run build        # ④ 生产构建
npm run test:e2e     # ⑤ 真实 Chrome 跑一局，6 条（需先 build）
```

- ⑤ 需要系统 Chrome，可用 `E2E_CHROME="/path/to/chrome"` 指定；e2e 依赖 `dist/`，所以必须在 ④ 之后跑。
- ② 与 ③ 跑的是不同集合，**不能互相替代**。
- 只改文档时，⑤ 可省；①②③④ 仍应通过。

## 三个「防 bug 守卫」，为什么必须保留

这三个测试不测规则，测的是**声明与实现有没有脱节**。它们都对应真实发生过的线上事故：

| 守卫 | 文件 | 拦住的缺陷 |
| --- | --- | --- |
| 技能覆盖守卫 | `src/game/skills/skillCoverage.test.ts` | 技能在 `HEROES` 里声明、图鉴也展示，但引擎里没实现 —— 玩家点了没反应，只有玩到才发现 |
| 引擎接线守卫 | `src/game/skills/wiring.test.ts` | `dispatch.ts` 的分发函数写了却从未被引擎调用；行为测试抓不到（它们直接调 dispatcher，绕过了引擎） |
| 钩子分发守卫 | `src/game/skills/hookCoverage.test.ts` | `SkillHooks` 声明了钩子、也有技能实现它，但 `dispatch.ts` 里没有对应分发器 —— 技能写了却永不触发 |

**为什么不能「先注释掉让它绿」**：这些缺陷的共同特征是**静默**。
类型系统看不到（`skillHook('xxx')` 只是个字符串），
行为测试也看不到（用例直接调分发器，绕过了「引擎到底有没有调用」这一环）。
删掉守卫等于删掉唯一的事后报警器，缺陷会以「某个武将技能没反应」的形式流到玩家手里。

让它们变绿的正确方式只有两种：**补上缺失的实现**，或**补上缺失的接线**。

## 文档约定

- 改动用户可见行为 → 在 `CHANGELOG.md` **最上方**追加一条，并在 `README.md` 的「最近更新」保留最近 3 条。
- 版本号常量在 `src/game/constants.ts` 的 `APP_VERSION`，与 README / CHANGELOG 的版本号同步。
- README 只讲「是什么 / 怎么跑 / 怎么改」，逐版细节一律进 `CHANGELOG.md`，避免它再长回 36KB。
