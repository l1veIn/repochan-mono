# Phase 2.1 — 新 CLI 重写设计（定稿）

> 分支：`repositioning/pi-removal`
> 决策汇总：现有 cli 改名 cli_pi_base（保留存档，后面删）；新 CLI 用 cac 框架，不内嵌 Pi，不用 TUI；image-gen 用 AI SDK，codex 走反代不内置 OAuth；不保留 i18n（英文输出）；action→子命令树；写命令全走 --data-file；保留 analysis run。

---

## 一、核心原则

1. **CLI = core 实体的管理层**（本会话澄清的关键认知）。cli 把 core 对 analysis/interview/persona/order/page 等实体的操作暴露成子命令。
2. **CLI 无大脑**（ADR §17.1）。不跑 LLM。两类操作清晰二分：
   - **纯计算**（CLI 自己能跑）：`analysis run`（确定性扫描）、`order create`（校验+落盘）、`image gen`（出图）...
   - **落盘 agent 内容**（agent 想好内容，CLI 落盘）：`persona create`、`analysis enrich`、`interview create`... 内容从 --data-file 来。
3. **action → 子命令树**：与 unified.ts 的 action 语义一一对应，agent/skill 从 action 语法迁到 cli 语法是机械替换。动词 kebab-case（`set-status` 非 `set_status`）。
4. **零 `@earendil-works/pi-*` 依赖**。

---

## 二、子命令全清单（38 action → cli 子命令）

按实体分组。`⚙️`=纯计算(CLI自跑)，`📝`=落盘agent内容(走--data-file)，`👁️`=读。

### analysis（分析报告）
| 子命令 | action | 类型 | 说明 |
|---|---|---|---|
| `repochan analysis run` | analysis.run | ⚙️ | 确定性扫描仓库→落盘（performAnalysis，无LLM） |
| `repochan analysis get` | analysis.get | 👁️ | 读 current.json |
| `repochan analysis update` | analysis.update | 📝 | patch 合并（--data-file patch.json） |
| `repochan analysis enrich` | analysis.enrich | 📝 | merge LLM 的 preAnalysis/abstract（--data-file） |
| `repochan analysis versions` | analysis.list_versions | 👁️ | 列版本 |

### interview（访谈）
| 子命令 | action | 类型 | 说明 |
|---|---|---|---|
| `repochan interview get` | interview.get | 👁️ | 读 |
| `repochan interview create` | interview.create | 📝 | 创建/覆盖（--data-file） |
| `repochan interview append` | interview.append | 📝 | 追加问答（--data-file） |

### persona（人设）
| 子命令 | action | 类型 | 说明 |
|---|---|---|---|
| `repochan persona get` | persona.get | 👁️ | 读 current.json |
| `repochan persona create` | persona.create | 📝 | 创建（--data-file） |
| `repochan persona update` | persona.update | 📝 | 更新（--data-file） |
| `repochan persona review` | persona.review | 📝 | 创建 review（--data-file） |
| `repochan persona candidate create` | persona.create_candidate | 📝 | 创建候选（--data-file） |
| `repochan persona candidate promote` | persona.promote_candidate | 📝 | 提升候选（--slug） |

### order（任务/约稿）
| 子命令 | action | 类型 | 说明 |
|---|---|---|---|
| `repochan order list` | order.list | 👁️ | 列任务 |
| `repochan order get` | order.get | 👁️ | 看单任务 |
| `repochan order create` | order.create | 📝 | 建任务（--data-file） |
| `repochan order update` | order.update | 📝 | 更新（--data-file） |
| `repochan order set-status` | order.set_status | ⚙️ | 改状态（--status，approve 等） |
| `repochan order add-revision` | order.add_revision | 📝 | 加修改请求（--data-file 或 --text） |
| `repochan order create-result` | order.create_result | 📝 | 登记结果版本（--data-file） |
| `repochan order list-results` | order.list_results | 👁️ | 列某任务的结果版本 |
| `repochan order get-result` | order.get_result | 👁️ | 看某结果 |
| `repochan order resolve-references` | order.resolve_references | 👁️ | 解析引用 |
| `repochan order candidate create` | order.create_candidate | 📝 | 建结果候选（--data-file） |
| `repochan order candidate promote` | order.promote_candidate | ⚙️ | 提升候选（--version） |
| `repochan order slice` | order.slice | ⚙️ | 切图坐标（调 image-edit，编排:读order→找图→算→落盘） |
| `repochan order extract-stickers` | order.extract_stickers | ⚙️ | 抠贴纸（调 image-edit，编排同上） |

### foundation（设定集）
| 子命令 | action | 类型 | 说明 |
|---|---|---|---|
| `repochan foundation find` | foundation.find | 👁️ | 找设定集封面 |

### page（落地页）
| 子命令 | action | 类型 | 说明 |
|---|---|---|---|
| `repochan page get` | page.get | 👁️ | 读 page 数据 |
| `repochan page create` | page.create | 📝 | 创建/更新（--data-file） |
| `repochan page check-assets` | page.check_assets | 👁️ | 检查资产缺失 |
| `repochan page generate-project` | page.generate_project | ⚙️ | 拷贝 Astro 模板到目录 |

### review
| 子命令 | action | 类型 | 说明 |
|---|---|---|---|
| `repochan review create` | review.create | 📝 | 创建 review（--data-file） |

### protocol
| 子命令 | action | 类型 | 说明 |
|---|---|---|---|
| `repochan protocol inspect` | protocol.inspect | 👁️ | = inspect 命令 |
| `repochan protocol read` | protocol.read | 👁️ | 读任意协议文件（--path） |
| `repochan protocol write` | protocol.write | 📝 | 写任意协议文件（--path --data-file） |

### template（模板，Phase 3）
| 子命令 | action | 类型 | 说明 |
|---|---|---|---|
| `repochan template list` | template.list | 👁️ | 列内置模板 |
| `repochan template get` | template.get | 👁️ | 看模板详情 |

### 顶层命令
| 子命令 | 说明 |
|---|---|
| `repochan init` | 初始化 .repochan/（= protocol 初始化） |
| `repochan status` | 协议概览（聚合） |
| `repochan inspect` | = protocol inspect |
| `repochan validate` | 校验 artifacts |

### 新增能力（ADR 要求，非 action 映射）
| 子命令 | 说明 | 依据 |
|---|---|---|
| `repochan setup --agent <codex\|claude\|pi>` | 装 skill + 注入引用 | §15 |
| `repochan setup --list / --remove --agent <x>` | 管理 setup | §15.5 |
| `repochan image gen ...` | 调 image-gen 出图（Phase 2.2 后接入） | §八 |
| `repochan image edit slice/bg-remove ...` | 调 image-edit | §8.6 |

---

## 三、统一约定

- **`--json`**：每个命令支持，输出机器可读 JSON（供 agent 解析）。
- **`--data-file <path|- >`**：所有 📝 写命令的 payload 来源。`-` = stdin。
  ```bash
  repochan persona create --data-file persona.json
  echo '{"name":"..."}' | repochan persona create --data-file -
  ```
- **错误退出码**：0 成功，非 0 失败（core 校验失败等），stderr 报错。
- **输出语言**：英文（不保留 i18n）。

---

## 四、目录结构（新 packages/cli）

```
packages/cli/
├── package.json     # name: repochan, bin: dist/index.js
│                     # deps: @repochan/core, @repochan/image-edit, @repochan/skill,
│                     #       cac, chalk, @inquirer/prompts, ora
│                     # 无 @earendil-works/pi-*
├── tsconfig.json
├── src/
│   ├── index.ts              # cac 入口，注册所有子命令
│   ├── commands/
│   │   ├── common.ts         # 移植（printJson/heading/bullet/UsageError/printError）
│   │   ├── analysis.ts       # run/get/update/enrich/versions
│   │   ├── interview.ts      # get/create/append
│   │   ├── persona.ts        # get/create/update/review/candidate
│   │   ├── order.ts          # list/get/create/update/set-status/.../slice/extract-stickers
│   │   ├── foundation.ts     # find
│   │   ├── page.ts           # get/create/check-assets/generate-project
│   │   ├── review.ts         # create
│   │   ├── protocol.ts       # inspect/read/write
│   │   ├── template.ts       # list/get（Phase 3 扩展 search/pull）
│   │   ├── init.ts           # 移植
│   │   ├── status.ts         # 移植
│   │   ├── validate.ts       # 移植
│   │   ├── setup.ts          # 重写（--agent 模式）
│   │   └── image.ts          # image gen/edit 路由（Phase 2.2 后实装 gen）
│   ├── lib/
│   │   ├── onboarding.ts     # 移植（step 状态机）
│   │   ├── precondition.ts   # 移植
│   │   ├── protocol.ts       # 移植（读包装）
│   │   ├── data-file.ts      # 新建：读 --data-file/-（file 或 stdin）
│   │   └── output.ts         # 移植自 common.ts 的输出工具
│   └── help.ts               # 帮助文本
└── README.md
```

**砍掉**：pages/(15)/components/(3)/ui/(3)/i18n/locales/runtime.ts/extension-ui.ts/types.ts/settings-manager.ts（i18n不要了）≈ 2500+ 行 Pi 耦合。
**移植**：commands/(common/init/status/inspect/validate/order部分) + lib/(onboarding/precondition/protocol)。
**新建**：各实体子命令文件 + setup(image) + data-file + index(cac路由)。

---

## 五、setup 重写（ADR §15 核心）

现有 setup 写 Pi 资源到 ~/.repochan/pi/settings.json。新 setup 完全不同：

```bash
repochan setup --agent claude
  # 1. 从 @repochan/skill 包读 skills/* markdown
  # 2. 复制到 .claude/skills/（或 .codex/skills/）
  # 3. 在 CLAUDE.md（或 AGENTS.md）注入引用段（幂等：检测已有则跳过）
  # 4. 打印下一步提示
```

| agent | skill 放哪 | 指令注入到 |
|---|---|---|
| codex | .codex/skills/ | AGENTS.md |
| claude | .claude/skills/ | CLAUDE.md |
| pi | skills/ + Pi settings | （Pi 原生机制，过渡保留） |

幂等（§15.5）：重复跑不重复注入、不覆盖手改。`--list`/`--remove` 管理。

---

## 六、执行步骤

1. 切 `repositioning/pi-removal` 分支（从 safe 或 main）。
2. `git mv packages/cli packages/cli_pi_base`，改其 package.json name 为 `@repochan/cli-pi-base`，标注 deprecated。确认它仍能 build（不依赖 image-edit）。
3. 新建 `packages/cli`，写 package.json（cac/chalk/@inquirer/prompts/ora，零 Pi）+ tsconfig。
4. 移植确定性文件：commands/common.ts→lib/output.ts、commands/init|status|validate.ts、lib/onboarding|precondition|protocol.ts。
5. 写 lib/data-file.ts（读 file/stdin）。
6. 逐实体写子命令（analysis→interview→persona→order→...），每个映射对应 core 函数 + --data-file/--json。
7. 写 setup.ts（--agent 模式）+ index.ts（cac 路由）。
8. image.ts 先放占位（gen 待 Phase 2.2）。
9. 验证：零 Pi import；每个子命令 --json 输出与旧 action 行为对照；pnpm -r build 绿。

---

## 七、风险/注意

1. **enrich 的版本归档逻辑**：现在泄漏在 pi 层（手动 readJson+writeJson+版本文件）。cli 重写时这层编排搬进 cli。长期看该进 core（core 加 enrichAnalysis 函数），但不在本步。
2. **cli_pi_base 能否 build**：它依赖 image-edit 解耦后的 core（core 去掉了 slicing/stickers 导出）。cli_pi_base 的 commands 不 import slicing/stickers，应该能 build。但 runtime.ts 等 Pi 耦合层若因 core 变动受影响，允许 build 失败（纯存档）。
3. **setup 的 Pi 模式**：--agent pi 时，是否仍写 ~/.repochan/pi/settings.json（兼容旧 Pi 用户）？建议保留 pi 模式的旧行为，但 claude/codex 用新机制。
