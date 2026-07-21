# Starters 包的可扩展性与 Starter 发现机制

| 字段 | 值 |
|------|-----|
| **Title** | Starters Package Scalability and Starter Discovery |
| **Author** | Jack Yang |
| **Date** | 2026-07-20 |
| **Status** | Draft —— 诊断已确认;分阶段方案待启动 |
| **Scope** | `packages/starters` · `packages/cli`(`starter` 子命令)· 可选的 `packages/starters-gallery`(新增,纯静态) |
| **Out of scope** | `@repochan/templates` · `@repochan/image-gen` · agent skills · 任何运行中的 web 服务 |
| **Related** | [`README.md`](../../packages/starters/README.md)(Transfer Kit 契约)· AGENTS.md 产品不变式 |

---

## 1. 这份方案为什么存在

随着 starter 集合扩张,两个压力在同步增长:

1. **仓库体量。** 每新增一个 landing 类 starter 就增加 2–7 MB 的二进制资产。
   2026-07-20 合并完 4 个 PR 后,`packages/starters` 已达 28 MB(git 跟踪
   420 个文件),其中 98% 是二进制。这条曲线随 starter 数量线性增长,
   看不到天花板。
2. **选择成本。** 用户一旦 pull 错 starter,要付完本地化 + 资产生成 + 装配的
   全部代价才能意识到风格不匹配。"先看清楚再 pull"是刚需,不是锦上添花。

这两件事互相关联:starter 越重,人工维护的画廊就越贵;而发现层缺失,会逼着
用户靠猜。本文把这两件事分开处理,给出一套分阶段方案,全程保持架构契约不变
(单一 CLI、单一协议、无内嵌运行时)。

---

## 2. 诊断(实测,不是估算)

下列数字取自 `main` 在 commit `341d02f`(4 个 PR 合并后)的状态。

### 2.1 仓库体量

| 指标 | 数值 |
|---|---|
| `packages/starters/` git 跟踪体量 | **28.3 MB**,420 个文件 |
| 二进制占比(webp/png/jpg/ico) | **27.6 MB**(97.5%) |
| 文本占比(astro/ts/json/md) | 0.7 MB(2.5%) |
| previews 小计(`*/repochan/previews/`) | 4.1 MB |
| 最大 starter(`character-game-page`) | 7.7 MB |
| 合并前基线(6 个 starter,2026-07-20 之前) | 9.3 MB |

**解读。** 这个包不是"代码膨胀了",而是"一个媒体档案库恰好和代码放在一起"。
精简 `.astro`/`.ts` 文件挪不动指针;只有改变二进制策略才有用。

### 2.2 loader 每次调用都是 O(N)

`packages/cli/src/lib/starter-loader.ts:47`(`listStarters`)做的是:

```ts
const entries = await fs.readdir(root, { withFileTypes: true });
for (const entry of entries.filter((item) => item.isDirectory())...) {
  const manifest = await readStarterManifest(path.join(root, entry.name));
  // → fs.readFile + JSON.parse + validateStarterManifest
}
```

每一次 `repochan starter list` / `get` / `recommend` 都触发 N 次文件系统读取
和 N 次 schema 校验。今天 N=10 感觉不到;到 N=30 时,在交互式流程里
(尤其是 agent skill 驱动的循环里多次调 `list`)就会明显卡顿。

### 2.3 今天的发现层

CLI 已经暴露了结构化元数据:

```
$ repochan starter list
Starters (10):
  caddy  — Caddy Gatehouse [landing, multi-section, ...] • preview: repochan/previews/desktop.webp
  ...
```

`starter get <id> --json` 返回 `id` / `title` / `description` / `tags` /
`default`。每个 starter 自带 `previews/desktop.webp` + `previews/mobile.webp`。

**已有的:** 画廊所需的原料全部在仓库里、全部 manifest 驱动。
**缺的:** 除了终端里一行描述之外的任何渲染层 —— 没有可视化对比、没有推荐
逻辑。

---

## 3. 把两个问题刻意分开

把它们搅在一起会得到糟糕的设计。它们有不同的答案。

### Q-A."用户在 pull 之前怎么看到 starter 长什么样?"

这是**呈现**问题。数据已经在,只差渲染。

### Q-B."用户怎么知道哪个 starter 匹配自己的项目?"

这是**匹配**问题。画廊再精致也解决不了它 —— 用户盯着 30 张缩略图,照样在猜。
真正的杠杆是把项目语义(来自 `repochan analysis` + `repochan interview`)
映射到 starter tags 上。

一个人工维护的营销站试图同时解决两件事,结果两件都做不好。下面的分阶段方案
把它们独立对待。

---

## 4. 考虑过的选项

### 4.1 体量方向(Q-weight)

| 选项 | 机制 | 工作量 | 天花板 |
|---|---|---|---|
| **S1. 瘦身 + index** | 压缩 previews、装饰图换 SVG、加顶层 `index.json`、loader 走 fast-path | ~1 天 | ~50 MB / ~30 个 starter |
| **S2. 拆分发布** | `@repochan/starters` 只发 index + 缩略图;每个 starter 按需拉 tarball | ~1 周 | 无上限(按需付费) |
| **S3. Registry 化** | 把 starters 移出 monorepo,独立成 registry 仓库 | ~2 周 | 无上限,发版节奏解耦 |

### 4.2 发现方向(Q-discovery)

| 选项 | 机制 | 工作量 | 维护成本 |
|---|---|---|---|
| **D1. 静态画廊生成器** | `pnpm gallery:build` 从 manifest + previews 生成单个 HTML,部署到 GitHub Pages | ~1 天 | 零(随变更重新生成) |
| **D2. 终端内联画廊** | `repochan starter browse` 通过 Kitty/iTerm2/sixel 协议渲染预览 webp | ~2 天 | 零 |
| **D3. CLI recommend** | 把 `analysis`/`interview` 的 tags 对 starter tags 匹配,输出 top-3 + 理由 | ~2 天 | 零(纯逻辑) |
| **D4. 实时导航站** | 把每个 starter 部署成可运行的预览站 | ~1 周 + 持续托管 | 高(CI 部署 + 在线保障) |

### 4.3 参考:shadcn/registry 模式

shadcn 解决的是类似问题(分发大量带交叉引用的代码单元),但用的是另一套
架构。值得借鉴,也值得知道**哪些不要抄**。完整拆解单独记录在
[`reference-shadcn-registry.md`](./reference-shadcn-registry.md)。

**该借鉴的:** 顶层 manifest + 构建期扁平化;path 与 content 分离;
`registryDependencies` 让公共底座 starter 被复用。
**不该借鉴的:** 五种 address 寻址方案;`components.json` 那种用户侧别名配置;
把文件内容内联进 JSON 发布。

---

## 5. 建议(分阶段)

每个阶段都独立产生价值。下一阶段的触发条件不出现,就在当前阶段停下。

### Phase 1 —— 瘦身与发现(目标:接受后 1 周内启动)

这是杠杆最大的阶段。以最低成本同时回应两个问题,且不关闭后续任何选项。

**体量(S1):**

- 加 `packages/starters/.gitignore`(`.astro/`、`dist/`、`node_modules/`、
  `.DS_Store`)。今天这只靠根目录的 `.gitignore` 覆盖;在 starters 子树里
  再加一道护栏,防止嵌套 Astro 项目意外提交。
- 加顶层 `packages/starters/index.json`,由 `scripts/build-starter-index.mjs`
  生成。schema:`{ id, title, description, tags, default, previewDesktop,
  previewMobile }` 的数组。**不内联任何文件内容。**
- 改写 `listStarters()`,在 `index.json` 存在时走 fast-path:`list` /
  `recommend` 只读 index;`get` / `pull` / `validate` 仍打开完整 manifest。
  index 缺失时回退到今天的 readdir 行为。
- 把每个 `previews/*.webp` 压到 ≤ 150 KB,走 `cwebp -q 72 -resize 1280x0`。
  previews 是给 Page Designer 看的缩略图,不是印刷级资产。预期降幅:
  ~4.1 MB → ~1.5 MB。

**发现(D1 + D3):**

- `packages/starters-gallery/`(新增,纯静态、无运行时):一个
  `gallery build` 脚本扫描 `packages/starters/*/`,生成单个自包含的
  `index.html`,内含卡片(桌面 + 移动端缩略图、title、tags、描述、对应的
  `repochan starter pull <id>` 命令原文)。
- 部署目标:本仓库的 GitHub Pages。零数据库、零托管费、零持续人工同步 ——
  starter PR 合并即触发 CI 重建。
- `repochan starter recommend`(D3):读项目的 `.repochan/analysis/` 和
  `.repochan/interview/` 产物,把抽取出的 tags 对 starter tags 匹配,输出
  top-3 + 一行理由。这才是真正解决选择成本的事;单纯一个画廊做不到。

**Phase 1 的净效果:**
- 仓库体量:~28 MB → ~22 MB(previews + 装饰图瘦身)。
- loader:`list` 常用路径从 O(N) 降到 O(1)。
- 发现层:既有静态画廊(D1),又有语义推荐器(D3),两者都不需要运行中的
  服务。
- 架构契约完整:无新运行时、无新真相源、无人工维护的内容。

### Phase 2 —— 拆分发布(触发条件:仓库体量 > 50 MB 或 starter 数量 > 15)

Phase 1 触顶时,拆分这个包:

- `@repochan/starters` 只保留 `index.json` + manifest schema + 压缩缩略图。
  发布体量目标:< 200 KB。
- 每个 starter 的完整源码以 tarball 形式发布在 GitHub Releases 上,以
  `<starter-id>@<version>` 为 key。
- `repochan starter pull --starter <id>` 增加一个 fetcher(约 150 行),
  解析 `id` → tarball URL → 下载到 `~/.repochan/starters-cache/<id>-<version>/`
  → 校验 manifest → 返回本地路径。思路和现有的
  `~/.repochan/codex-token-cache.json` 一致:把大文件 / 外部产物挡在仓库之外。
- 本地 `--from <path>` 这条逃生口保留,用于离线和创作者自有的 starter。

**为什么不在一开始就做这个:** 它给 CLI 增加了一个必须维护的 fetcher,以及
一个离线失败模式。Phase 1 能把这一刻往后推迟 3–4×,而且 Phase 1 本来就是它的
前置条件(fetcher 要解析的就是那个 index)。

### Phase 3 —— Registry 模型(触发条件:starter 数量 > 40 或出现社区贡献)

把 `packages/starters/` 移出 monorepo,独立成 `repochan-starters` 仓库。
monorepo 里只留一个 thin SDK。借鉴 shadcn 的 `registryDependencies` 思路,
让 `minimal` 成为 `landing-*` 系列的公共底座(每个 landing starter 只交付
它的差异部分,而不是完整复制一份底座)。

这是唯一改变贡献模型的阶段。在 Phase 2 的 fetcher 经受实战检验之前,不要动手。

---

## 6. 明确否决:实时导航站

在这里记录下来,免得每个季度都把这个问题重新讨论一遍。

一个把每个 starter 部署成可运行预览的、人工维护的站点(D4),**在当前规模
被否决**,理由:

1. 它在 `starter.json` + previews 之外开了第二个真相源,除非接进 CI,否则
   必然漂移 —— 而一旦接进 CI,它就是 Phase 1 的静态画廊配了一张更贵的托管
   账单。
2. "真实交互"对 starter 选择的实际价值,比看起来要低。选择 starter 靠的是
   项目气质匹配(基调、受众、世界设定),用户从描述 + tags 里就能读出来 ——
   不是靠看完整个 7 幕滚动动画。推荐器(D3)才是对症下药。
3. AGENTS.md 的契约是*单一 CLI、单一协议、无内嵌运行时*。实时站不是被禁止
   的,但它应该是最后手段而不是第一选择,且只在静态渲染被证明系统性误导用户
   时才上。

**重新评估的时机:** starter 数量 > 20,*同时*用户反馈证明静态预览在系统性
误导(不是单纯的"动起来更好看")。两个条件都成立之前,静态画廊 + 推荐器
已能覆盖需求。

---

## 7. 待决问题

- **Q1.** `repochan starter recommend` 应该在 CLI 里,还是作为 skill 的一步?
  倾向:CLI 子命令返回 JSON,供 skill 消费 —— 和现有 `analysis`/`interview`
  的模式对齐。
- **Q2.** 画廊托管:本仓库的 GitHub Pages,还是独立的 `repochan/dev` 仓库?
  倾向:本仓库,走 `/docs` 或 `/gallery` 路径,直到站点规模超出单 HTML 才迁。
- **Q3.** `index.json` 放在 `packages/starters/`(提交进仓库),还是放在
  `packages/cli/`(构建期生成)?倾向:提交进 starters,这样 npm 发布的包是
  自描述的,不依赖 CLI。

这三个问题在 Phase 1 启动时定,不是现在。
