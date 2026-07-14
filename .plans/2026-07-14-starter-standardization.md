# Starter v1 标准化与 Minimal 收敛计划

> 状态：IMPLEMENTED
> 日期：2026-07-14
> 范围：`@repochan/core` starter schema、`repochan` starter 原子命令、`@repochan/starters` 配置布局、`repochan-page-designer` 工作流，以及 `minimal` 的 Hero-only 收敛。
> 架构基准：`.plans/2026-07-09-repositioning.md`、`ARCHITECTURE.md`、根目录 `AGENTS.md`。

---

## 一、目标

把 starter 管线收敛为以下职责模型：

```text
starter  声明页面结构、配置入口、资产 slot 和默认值
core     定义 starter schema 与可复用的确定性校验规则
CLI      读取协议和各数据包，完成配置投影、订单物化、资产后处理和校验
skill    编排原子命令，保留内容提炼与审美判断
agent    只负责选择、创作、审核，不做机械字段传递
```

最终使 Page Designer 的主流程收敛为：

```text
starter select
  → starter pull
  → starter configure
  → starter create-order（仅缺失 slot）
  → Painter 交付原图
  → starter asset-apply
  → starter validate
  → pnpm build + 视觉检查
```

本计划同时完成：

1. 将 starter 的 RepoChan 专属数据从 `src/` 提升并集中到 scaffold 根目录的 `repochan/`。
2. 由 core 统一管理 starter manifest、site、assets 与 locale content schema。
3. 将 persona/analysis → site config 的确定性投影并入 CLI。
4. 将 starter 校验和硬编码颜色检查并入 CLI；删除 per-starter 检查脚本。
5. 将 partial order 拼装并入 CLI。
6. 将 `starter.json.assets[].postprocess` 的执行与资产状态同步并入 CLI。
7. 把 `minimal` 收敛为真正轻量的 Hero-only starter，删除所有未消费内容和资产声明。

---

## 二、明确决策

### 2.1 Scaffold 内统一使用根级 `repochan/`

Starter 源和 pull 后的站点实例统一采用：

```text
<site-root>/
├── repochan/
│   ├── starter.json       # 唯一 manifest；源 starter 与实例使用同一路径
│   ├── site.json          # 项目、链接、theme、brand、locale 配置
│   ├── assets.json        # slot → src/status/order/version
│   └── i18n/
│       ├── en.json
│       └── zh.json
├── src/
│   ├── components/
│   ├── layouts/
│   ├── pages/
│   ├── lib/site.ts        # 稳定读取器与 CSS token 派生；CLI/agent 不修改
│   └── styles/
├── public/
└── package.json
```

理由：

- `src/` 只保存 Astro 代码，不再混入 RepoChan 生产数据。
- `repochan/` 是可见、集中、易编辑的数据面，不与项目根协议目录 `.repochan/` 淆为同一个目录。
- CLI 从 `packages/starters/<id>/repochan/starter.json` 发现内置 starter；pull 后仍从实例的同一路径读取。
- pull 后的站点仍然是独立 Astro 项目；RepoChan CLI 只负责写 JSON，不参与站点运行和构建。
- `src/lib/site.ts` 不再通过相对路径猜测项目根，也不直接读取 `.repochan/persona/current.json`。

### 2.2 `pull` 保持原子，配置投影由 `configure` 完成

`repochan starter pull` 只负责：

1. 校验 starter 源 manifest。
2. 复制 scaffold。
3. 原样保留 `repochan/starter.json`；复制后的文件天然固定了该实例使用的 manifest 版本。
4. 拒绝无显式 `--overwrite` 的破坏性替换。

它不隐式要求 analysis/persona，也不自动创作文案。

紧随其后的 `repochan starter configure` 负责读取 analysis/persona 并完成确定性投影。Skill 在流程上连续调用两条命令，但 CLI 保持原子与可重入。

### 2.3 CLI 不创作，只投影和校验

CLI 可以自动写入：

- `persona.mainColor` → `theme.primary`
- `persona.secondaryColor` → `theme.base`
- `persona.accentColors[]` → `theme.accents[]`
- `persona.artStyle` / `keyMotifs` / `signaturePatterns` → `brand`
- analysis 中已有的项目名、仓库 URL、统计数据与默认 locale

CLI 不自动生成：

- Hero headline/body
- CTA 文案
- 项目卖点排序
- 翻译和语气
- 审美评价

这些字段由 agent 创作，随后通过 `starter configure --content-file` 交给 CLI 做 schema 校验和原子落盘。

### 2.4 Source 与实例只使用一个 manifest 路径

源 starter 的 manifest 就是 `repochan/starter.json`。`starter asset-apply`、`starter create-order` 和 `starter validate --output-dir` 读取 pull 后实例中的同一文件，不能重新读取当前安装版本的内置 starter。

不新增 root `starter.json`、instance lock schema 或第二份 manifest。普通文件复制本身已经避免 CLI/starter 包升级后旧站点的 postprocess 或 slot 定义漂移。

### 2.5 配置颜色是唯一允许的颜色字面量边界

颜色字面量只允许出现在：

- `repochan/site.json` 的 `theme` 字段
- core/CLI 测试 fixture

Astro/CSS/TS/JS 展示层只能消费 CSS variables、`currentColor`、`inherit`、`transparent` 和由 token 派生的 `rgb(var(...)/alpha)` / `color-mix()`。

硬编码颜色检查由统一的 `repochan starter validate` 完成，不再向每个 scaffold 复制 `check-no-hardcoded-colors.mjs`。

---

## 三、Core：统一 schema 与确定性规则

### 3.1 新增 schema

在 `packages/core/src/schemas/` 或现有 schema 入口中新增并导出：

#### `StarterManifestSchema`

最低结构：

```json
{
  "schemaVersion": "repochan.starter.v1",
  "id": "minimal",
  "name": "Minimal Hero",
  "style": "constructivist",
  "tags": ["landing", "hero", "minimal"],
  "config": {
    "site": "repochan/site.json",
    "assets": "repochan/assets.json",
    "i18nDir": "repochan/i18n"
  },
  "content": {
    "defaultLocale": "en",
    "supportedLocales": ["en", "zh"],
    "requiredPaths": [
      "meta.title",
      "meta.description",
      "content.hero.headline",
      "content.hero.body",
      "content.hero.primaryCta"
    ]
  },
  "assets": []
}
```

资产 slot 标准字段：

- `slot`: 唯一逻辑键。
- `required`: 是否阻塞交付。
- `reference`: starter 自带的构图/风格参考路径。
- `output`: 页面最终消费路径；不得只隐含在最后一个 postprocess `out` 中。
- `description`: 给 agent 的设计知识。
- `order`: partial order。
- `postprocess`: 由 CLI 执行的 image-edit pipeline。

#### `StarterSiteConfigSchema`

统一字段：

```json
{
  "schemaVersion": "repochan.starter-site.v1",
  "project": {
    "name": "RepoChan",
    "description": "...",
    "repositoryUrl": "..."
  },
  "theme": {
    "primary": "#...",
    "base": "#...",
    "accents": ["#...", "#..."]
  },
  "brand": {
    "artStyle": "...",
    "motifs": [],
    "patterns": []
  },
  "locales": {
    "default": "en",
    "supported": ["en", "zh"]
  }
}
```

#### `StarterAssetsConfigSchema`

```json
{
  "schemaVersion": "repochan.starter-assets.v1",
  "assets": {
    "hero-composite": {
      "src": "/assets/hero-composite.webp",
      "status": "ready",
      "orderId": "ord-hero-migrate-001",
      "versionId": "v1"
    }
  }
}
```

规则：

- `status`: `pending | ready`。
- `ready` 必须有真实输出文件。
- `orderId`、`versionId` 可选，但一旦存在必须满足 core 的 ID 规则。
- assets key 必须对应 manifest slot。

#### `StarterLocaleContentSchema`

Core 统一 envelope，starter 通过 manifest 的 `requiredPaths` 表达自身内容需求：

```json
{
  "schemaVersion": "repochan.starter-content.v1",
  "locale": "en",
  "meta": {
    "title": "...",
    "description": "..."
  },
  "content": {}
}
```

不把所有 starter 的 section 形状硬编码进 core。Core 校验 envelope；`validateStarterContentRequirements` 根据 manifest 的 required paths 校验具体 starter。

### 3.2 新增纯规则函数

Core 函数只接收 plain JSON 或 `{path, content}`，不 import CLI/starters/templates：

- `validateStarterManifest(value)`
- `validateStarterSiteConfig(value)`
- `validateStarterAssetsConfig(value)`
- `validateStarterLocaleContent(value)`
- `validateStarterContentRequirements(manifest, locales)`
- `validateStarterAssetState(manifest, assets, existingPaths)`
- `validateStarterPresentationColors(files, allowedConfigPaths)`
- `projectStarterSiteConfig({analysis, persona, defaults})`

路径规则：

- 所有 manifest/config 路径必须为站点根相对路径。
- 禁止绝对路径与 `..` 逃逸。
- slot、locale、required path 不得重复。
- postprocess op 必须属于 image-edit 支持集合。
- `output` 必须与 postprocess 最终输出一致。

### 3.3 Core 测试

覆盖：

- 完整合法 manifest/site/assets/content。
- 缺字段、错误 schemaVersion、重复 slot/locale。
- 绝对路径和 path traversal。
- ready 但文件不存在。
- output 与 postprocess 不一致。
- required content path 缺失。
- 展示层 hex、numeric rgb/hsl、SVG literal、Tailwind 固定色。
- `site.json` theme 中的合法颜色不被误报。
- persona 缺少可选色彩字段时使用 starter 默认值。

执行：

```bash
pnpm --filter @repochan/core test
```

---

## 四、CLI：Starter 原子命令

### 4.1 Loader 改造

改造 `packages/cli/src/lib/starter-loader.ts`：

- 禁止 `any` 静默接收 manifest。
- JSON 解析失败或 schema 不合法时返回明确错误，不再把目录当作“不存在”静默跳过。
- 使用 core `StarterManifestSchema` 和类型。
- list/get/pull 共用同一校验入口。
- source 与实例共用同一个 `repochan/starter.json` loader，供 list/get/pull/configure/create-order/asset-apply/validate 复用。

### 4.2 `repochan starter pull`

保留现有参数，新增行为：

- 复制前验证 source starter。
- 原样复制 `repochan/starter.json`，不生成或维护第二份 manifest。
- `.astro`、`dist`、`node_modules`、`.DS_Store` 等不得进入输出。
- overwrite 仍要求显式 `--overwrite`。

### 4.3 `repochan starter configure`

建议接口：

```bash
repochan starter configure \
  --output-dir .repochan/web-starter \
  [--content-file page-content.json] \
  [--overwrite] \
  [--json]
```

行为：

1. 读取实例的 `repochan/starter.json`。
2. 读取 projectRoot 的 analysis/persona。
3. 调 core `projectStarterSiteConfig`。
4. 写 `repochan/site.json`。
5. 有 `--content-file` 时校验并写 locale JSON。
6. 未显式 overwrite 时，不覆盖用户已修改的内容文件。
7. 输出 changed/skipped 字段，避免 agent 猜测。

### 4.4 `repochan starter create-order`

建议接口：

```bash
repochan starter create-order hero-composite \
  --output-dir .repochan/web-starter \
  --foundation ord-foundation-001 \
  --intent "为项目主页生成 Hero 合成图" \
  [--status approved] \
  [--json]
```

CLI 自动完成：

- 查找 slot 与 partial order。
- 生成或接收 orderId。
- 复制 assetType/templateId/brief/deliverables。
- 将 starter reference 物化为 file reference。
- 添加 foundation character reference。
- 从 mustInclude 确定性派生 acceptance criteria。
- 调 core `createOrders`，不绕过协议状态机。

Agent 只提供 intent、foundation 选择和是否批准等判断性输入。

### 4.5 `repochan starter asset-apply`

建议接口：

```bash
repochan starter asset-apply hero-composite \
  --order ord-hero-migrate-001 \
  [--version v1] \
  --output-dir .repochan/web-starter \
  [--overwrite] \
  [--json]
```

行为：

1. 读取实例 `repochan/starter.json` 中的 slot。
2. 通过 core/CLI order API 获取指定或 current result。
3. 确认结果已交付且文件存在。
4. 按 manifest 顺序调用 image-edit。
5. 所有中间文件写临时目录；最终文件只写 slot.output。
6. postprocess 全部成功后，原子更新 `repochan/assets.json`。
7. 记录 orderId/versionId；不把派生资产回灌 `.repochan/orders/`。
8. 失败时不把 slot 标为 ready，不留下半完成状态。

数组、camelCase flags 等转换全部由 CLI 完成，skill 不再展开 image-edit 命令。

### 4.6 `repochan starter validate`

建议接口：

```bash
repochan starter validate minimal
repochan starter validate --output-dir .repochan/web-starter
repochan starter validate --all
repochan starter validate minimal --json
```

Source starter 模式检查：

- schema、文件路径、reference、output、重复 slot。
- templateId 在 `@repochan/templates` 中存在。
- postprocess op 可用且输出闭环。
- presentation 文件无硬编码颜色。
- 默认 site/assets/i18n 合法。
- 所有 required asset 有可构建 fallback。

Instance 模式额外检查：

- starter/site/assets/i18n 完整。
- ready asset 真实存在。
- required content paths 完整。
- locale 集合一致。
- 内部链接目标存在（可做静态 HTML/Astro id 扫描的部分）。

`pnpm build` 和截图视觉检查仍由 skill 调度，不让 CLI 执行任意项目脚本。

### 4.7 CLI 测试

使用临时 projectRoot 和 fixture starter，覆盖：

- list/get 对非法 manifest 明确失败。
- pull 保留唯一 manifest、过滤生成文件、保护 overwrite。
- configure 正确投影 persona colors，且不覆盖内容。
- create-order 正确合并 partial order 和两类 references。
- asset-apply 执行 pipeline、写最终输出、更新状态。
- asset-apply 中途失败保持 pending。
- validate source/instance/all 的 human 与 JSON 输出。
- templateId 不存在、reference 丢失、颜色违规、路径逃逸均非零退出。

---

## 五、Minimal：Hero-only 减法

Minimal 明确定位为：

> 一个可独立构建、可由 Page Designer 配置、仅含 Hero 的迁移型 landing starter。

不增加 features/gallery/pipeline/workflow/footer 等 section。

### 5.1 删除冗余

- 删除 `src/config/assets.ts`。
- 删除 `src/config/site.ts` 的 `.repochan/persona` 路径读取逻辑。
- 将稳定 adapter 移到 `src/lib/site.ts`。
- 删除 `src/i18n/`，内容迁到根级 `repochan/i18n/`。
- 删除未被 Hero 消费的 nav/pipeline/protocol/features/gallery/workflow/cta/footer/stats 文案。
- 删除不存在资产的 ready 声明。
- 删除未被 Hero 使用的 texture slot、CSS texture classes 和相关文件；如果决定保留纹理，则必须由 Hero 实际消费并保持 output 路径一致，二选一，不保留悬空能力。
- 删除 `.astro/`、`.DS_Store` 和其他生成文件。
- 删除 `scripts/check-no-hardcoded-colors.mjs`，由统一 validate 替代。

### 5.2 Hero 内容契约

Minimal locale 只保留 Hero 实际消费字段：

- meta.title / meta.description
- hero.ariaLabel
- hero.headline / hero.body
- hero.primaryCta.label / href
- hero.repositoryUrl / repositoryLabel
- hero.brandName
- hero.tags
- hero.posterTypography（若该艺术方向保留）

要求：

- `headline` 与 `body` 必须实际渲染，不允许只存在于 JSON。
- CTA href 来自配置，不再写死 `#features`。
- 所有 Props 类型与 JSON schema 一致。
- 数组访问必须有数量约束或安全 fallback。
- Hero 背景 src 从 `repochan/assets.json` 读取，不在组件中写死。

### 5.3 Minimal assets

首版建议只保留：

1. `hero-composite`：required，带 migration order 与 compress pipeline。
2. `favicon`：optional；保留时必须有完整 partial order，否则先使用默认 favicon，不创建机械上不完整的 order。

`hero-pose-lineart.webp` 是 composition reference；`hero-composite.webp` 是默认 fallback/output。Manifest 中必须用 `reference` 与 `output` 明确区分。

### 5.4 Theme

- 默认 palette 只存在于 `repochan/site.json`。
- `src/lib/site.ts` 将 palette 派生为 CSS variables/RGB triples。
- 修正或约束颜色格式；不再假定任意字符串都是六位 hex。
- Hero 所有颜色由 token 派生。

---

## 六、Constructivist 退役

`constructivist` 不迁移到 Starter v1，也不为它保留长期兼容代码。

切换顺序：

1. 开发期间保留现有目录，仅用于和 minimal 对照；不投入修复或迁移工作。
2. minimal 完成 v1、通过全链验证后，将 minimal 标记为唯一 default starter。
3. 从内置 starter 的可发现/发布目录中移除 `packages/starters/constructivist/`。
4. 更新 `packages/starters/README.md`、CLI 示例和 skill，删除 constructivist 引用。
5. CLI 最终只接受 v1 manifest，不保留永久 legacy loader 分支。

已经 pull 出去的 constructivist 站点是独立 Astro 工程，不受内置 starter 退役影响。

---

## 七、Page Designer Skill 收敛

修改 `packages/skill/skills/repochan-page-designer/` 主文档和 references：

### 删除

- 手工编辑 `src/config/site.ts`。
- 手工复制 persona 色彩字段。
- 手工拼完整 order JSON。
- 手工把 postprocess args 翻译成 image-edit flags。
- 手工更新 `assets.ts`。
- `background: "#FFFFFF"` 等固定颜色示例。
- “仅 templateId 相同即可复用”的过弱判断。

### 新流程

1. 读取 analysis/persona，做 starter 选择。
2. `repochan starter pull`。
3. agent 从 README/analysis 创作页面文案，写入临时 content payload。
4. `repochan starter configure --content-file ...`。
5. `repochan starter validate --output-dir ...` 获取 slot 缺口。
6. 对缺失 slot 调 `repochan starter create-order`。
7. Painter 执行订单。
8. 对交付 slot 调 `repochan starter asset-apply`。
9. 再次 `starter validate`。
10. `pnpm install && pnpm build`，完成移动端/桌面端/链接/视觉检查。

资产复用至少匹配：

- templateId
- assetType
- foundation/character reference
- slot/composition intent
- delivered/current result

CLI 应输出候选与歧义；多个候选时由 agent 选择，不允许静默取第一个。

---

## 八、实施顺序

### Phase 1：Core 契约

1. 添加 starter v1 schemas/types。
2. 添加 config projection 与纯校验函数。
3. 完成 core 单元测试。

验收：`pnpm --filter @repochan/core test`。

### Phase 2：CLI 基础与 validate

1. 改造 loader，所有读取走 schema。
2. 统一 source/instance manifest loader 与路径。
3. 实现 `starter validate`。
4. 把硬编码颜色检查迁入统一 validator。
5. 完成 CLI fixture tests。

### Phase 3：Minimal v1 收敛

1. 新建根级 `repochan/` 配置。
2. 删除冗余 config/i18n/assets/scripts。
3. 收紧 Hero content 和 asset 契约。
4. 修复 CTA、类型、路径和未消费字段。
5. 通过 source validate 和 Astro build。

### Phase 4：configure / create-order / asset-apply

1. 实现 deterministic configure。
2. 实现 partial order materialization。
3. 实现 postprocess pipeline 与 assets 状态原子更新。
4. 补齐失败回滚和 overwrite 测试。

### Phase 5：Default 切换、旧 Starter 退役与 Skill 迁移

1. 将 minimal 标记为唯一 default starter。
2. 将 constructivist 从内置 starter 发布目录移除。
3. 更新 Page Designer skill 与 references。
4. 更新 `packages/starters/README.md` 和 CLI README/help。
5. 移除所有 legacy 分支和 constructivist 引用。

### Phase 6：全链验证

在临时目标仓库中执行真实链路：

```bash
repochan starter validate --all
repochan starter pull --starter minimal
repochan starter configure --output-dir .repochan/web-starter --content-file /tmp/content.json
repochan starter validate --output-dir .repochan/web-starter
repochan starter create-order hero-composite --output-dir .repochan/web-starter --foundation <id> --intent <text>
# 使用 fixture delivered result 或真实 Painter 结果
repochan starter asset-apply hero-composite --order <id> --output-dir .repochan/web-starter
repochan starter validate --output-dir .repochan/web-starter
pnpm --dir .repochan/web-starter build
```

另做：

- 中英文页面。
- 桌面和移动端截图。
- CTA/Repository 链接。
- 无 persona 色彩时默认 theme。
- persona 自定义 palette 后所有 Hero 颜色联动。
- asset-apply 重跑时 overwrite 保护。

---

## 九、完成定义

满足以下全部条件才算完成：

- [ ] Core 导出 starter v1 schema 和纯校验/投影能力。
- [ ] 所有仍发布的内置 starter manifest 都通过统一 schema。
- [ ] minimal 是唯一 default starter，constructivist 不再出现在 `starter list`。
- [ ] `repochan starter validate --all` 成功。
- [ ] 源 starter 与 pull 后实例都只使用 `repochan/starter.json`。
- [ ] `site.json` / `assets.json` / `i18n/` 全部位于根级 `repochan/`。
- [ ] `src/` 不再读取项目 `.repochan/` 协议文件。
- [ ] Page Designer 不再修改 `site.ts`。
- [ ] Page Designer 不再手工拼 partial order。
- [ ] Page Designer 不再手工执行 postprocess 或更新 asset 状态。
- [ ] per-starter 颜色检查脚本已删除，validate 能发现同类违规。
- [ ] minimal 只保留 Hero 实际使用的配置、文案和资产。
- [ ] minimal CTA、content types、asset paths 全部闭环。
- [ ] minimal 可独立 `pnpm build`。
- [ ] core tests、CLI tests、全仓 lint/build 通过。
- [ ] 不修改或覆盖用户现有未提交的无关变更。

---

## 十、非目标

本计划不做：

- 不新增 agent runtime 或模型调用。
- 不新增 `repochan run` 或全流程 CLI orchestration。
- 不让 core import starters/templates/image-edit。
- 不让 image-edit 写 `.repochan/` 协议。
- 不迁移或修复 constructivist；它在 minimal v1 接管 default 后直接退役。
- 不给 minimal 增加非 Hero section。
- 不在 CLI 内执行任意 scaffold 的 package scripts。
- 不把派生网站资产写回 Order Result Version。

---

## 十一、实施注意事项

- 当前工作树已有 `packages/starters/minimal/starter.json` 的未提交修改；迁移到 `packages/starters/minimal/repochan/starter.json` 时必须先审阅并完整保留，不能覆盖。
- `packages/starters` 继续保持纯 scaffold data；不得添加构建代码或运行时导出。
- CLI 是唯一聚合层：它可以同时调用 core、starters、templates、image-edit，但业务 shape 和通用规则必须来自 core。
- 所有站点文件覆盖遵守显式 `overwrite=true` 原则。
- pull 原样复制唯一 manifest；旧 scaffold 因持有自己的 `repochan/starter.json`，不受后来内置 starter 更新影响。
- asset-apply 必须先完成文件写入，再更新 JSON 状态；失败时保持 `pending`。
- 站点实例生成后仍应脱离 RepoChan 独立开发和部署。
