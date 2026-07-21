# Starters:Catalog + Cache,以及 Text-First 选型

| 字段 | 值 |
|------|-----|
| **Title** | Starters Catalog / Content-Addressed Cache & Text-First Selection |
| **Author** | design conversation (2026-07-20) |
| **Date** | 2026-07-20 |
| **Status** | Draft proposal（开放决策中;非已承诺的计划） |
| **Scope** | `@repochan/starters` 规模化、官方发现面、选型对 text-only agent 友好;**不含** web-designer 原创分支、不含把 starter 改成 npm 多包依赖图 |
| **Packages (impacted if accepted)** | `packages/starters` · `packages/cli`（`starter-loader` / `starter pull`）· `@repochan/core`（manifest/catalog schema）· `packages/skill`（`repochan-page-designer` 选型段）· 可选独立 registry 仓 / Gallery 静态站 |

---

## 1. Context

### 1.1 现状

- 官方 Source Starter 以完整 Astro/Tailwind 站点树的形式躺在 `packages/starters/<id>/` 下,通过扫描子目录的 `repochan/starter.json` 被发现(`packages/cli/src/lib/starter-loader.ts`)。
- `repochan starter pull` 复制本地树(`fs.cp`);`--from <dir>` 已支持 creator-owned 的本地源(`packages/cli/src/commands/starter.ts`)。
- `@repochan/starters` 作为单个 npm 包发布;`files` 包含每个 starter 的 `public/**`、`repochan/**`、`src/**` 等(`packages/starters/package.json`)。
- 实测(workspace,2026-07-20):
  - `packages/starters/` 下约 10 个 starter id
  - `npm pack --dry-run` ≈ **29.0 MB** 包体 / **29.7 MB** 解压后 / **420** 个文件
  - 大致拆分:**~28 MB 图片**,**~1.3 MB** 代码+JSON(不含 `node_modules` / `dist`)
- 贡献速度很高(近期历史里有多个 `feat(starters): …` PR);把每个完整站点当作 monorepo + 单一 npm payload 对待,无法扩展。
- Page Designer skill 指示 agent 在选 starter 前检查 desktop/mobile previews(`packages/skill/skills/repochan-page-designer/SKILL.md`)。**很多 agent host 是 text-only 的,看不到图片**;那条指令是已知的错误默认值。
- Manifest 已经带了轻量文本(`description`、`style`、`tags`)和必需的 `previews` 路径(`packages/core/src/starter.ts` / `repochan.starter.v1`)。没有结构化的 fit 契约,没有 `demo` URL 字段,也没有 registry/catalog 抽象。

### 1.2 产品约束(必须保持)

来自 `Agents.md` / `ARCHITECTURE.md`:

1. **CLI 是唯一的 binding surface** —— 发现和拉取都留在 `repochan starter …`;不开第二个真相源。
2. **core 保持纯粹** —— 无网络、无凭据;只有 schema/规则。
3. **本地优先** —— 首次拉取后,从磁盘/缓存继续工作;`--from` 对离线/私有 starter 仍然是一等公民。
4. **Source Starter 是完整成品站点** —— Transfer Kit 在站点内部(`repochan/`),不是第二个包。Previews 和运行中的源码是人类侧的设计权威;打包的树是 pull 的权威。
5. **官方纳入是经过评审的** —— 不是普通项目运行的默认流水线输出。
6. **`image-edit` 只做页面装配** —— 本方案 out of scope。

### 1.3 Non-goals

- 用薄薄的 wireframe 或"只有组件"替换 starter(像 shadcn 的文件列表那样)。
- 以每 starter 一个 npm 包作为主分发模型。
- 要求多模态视觉或实时浏览器自动化来做默认的 agent 选型。
- 人工维护的营销站内容作为 catalog 真相源。
- 改动 order-result 的不可变性或 foundation-first 的出图规则。

---

## 2. Diagnosis

三个问题共享同一个根:**starters 已经超出了"小型数据叶子包"的规模。**

| 压力 | 症状 | 为什么痛 |
|----------|---------|--------------|
| **分发体量** | ~29 MB npm tarball,几乎全是二进制 | 每次 CLI 安装都要为用户永远不会 pull 的 starter 付费 |
| **Monorepo / PR 负担** | 完整站点 + 资产进主仓库 | 产品代码评审混进了创作内容;git 历史里留下大 blob |
| **agent 的发现** | skill 说"看 previews" | text-only 模型做不到;光靠 tags/description 对 fit 决策太单薄 |
| **人类的发现** | 没有稳定的"pull 前先看"界面 | previews 在磁盘上存在,但不是一等公民的、版本化的浏览体验 |

`@repochan/templates`(~100 KB YAML)可以永远完全内嵌。starters 不能用同样的打包假设。

---

## 3. 考虑过的选项

### Option A —— 全部继续内嵌在 `@repochan/starters`

- **优点:** loader 简单;默认离线;无新基建。
- **缺点:** npm 体量和 monorepo 噪音线性增长;不解决 text-only 选型。
- **结论:** 只对极小的固定集合(例如只内嵌 `minimal` 作为 bootstrap)可接受。

### Option B —— 每 starter 一个 npm 包

- **优点:** 通过依赖关系按子集安装。
- **缺点:** 版本图噪音;通常仍然有 monorepo 膨胀;和"复制 scaffold 而不是运行时 import"的模型不匹配;catalog + demos 的故事弱。
- **结论:** 作为主模型被否决。

### Option C —— 用 git submodules / sparse checkout 管理多个 starter 仓库

- **优点:** 物理隔离。
- **缺点:** 贡献者和 agent 的 UX 差;对 `starter list` 和 release smoke 很别扭。
- **结论:** 被否决。

### Option D —— Catalog index + 内容寻址的 tarball cache(+ 可选 registry 仓库)

- **优点:** 匹配"复制而非安装"(shadcn 式)但不走到组件粒度;CLI 仍是 binding surface;本地 cache 恢复离线能力;monorepo 可以瘦身到 catalog + embed。
- **缺点:** 需要在 CLI 里写 fetch/cache/integrity 工作;可选的 tarball 和 demo 托管。
- **结论:** **推荐的分发模型。**

### Option E —— 把每个 starter 都做成完整交互式 gallery,作为唯一的发现路径

- **优点:** 对动效重的页面,人类的"感觉"最好。
- **缺点:** 高贡献率下成本和漂移都大;agent 不用;如果人工维护就变成第二内容层。
- **结论:** v1 不需要;live demo 是可选增强。

### Option F —— 作者托管的静态 demo URL,作为"看不到 preview"的主要补救

- **优点:** PR 上便宜的人类评审链接。
- **缺点:** 相对打包 digest 会漂移;link rot;信任问题;很多 agent 仍然不会去浏览 URL。
- **结论:** **有用的可选字段;单独不足以解决问题。** text-first 的 `fit` 才是 agent 的默认。

---

## 4. Recommendation

### 4.1 一句话

> **把 `@repochan/starters`(或等价物)作为官方 catalog + 最小内嵌来发布;把完整 Source Starter 作为 digest 校验、按需拉取的 payload,投递到本地 cache;让 starter 选型对所有 agent 都是 text-first 的(`fit` + tags);把 previews 和 demo URL 当作面向人类/多模态的增强。**

### 4.2 架构

```text
agent / human
    │
    ▼
repochan starter list | get | pull
    │
    ├─► catalog (index: metadata + fit + version + digest + source)
    │     • 随 CLI 包发布和/或 pin 到远端
    │     • 对 text-only shortlist 永远足够
    │
    ├─► resolve source
    │     • embed   → 包内本地 bootstrap(例如 minimal)
    │     • tarball → download → verify digest → cache
    │     • local   → 现有 --from <dir>
    │
    └─► fs.cp → .repochan/web-starter/   (当前的 transfer 契约不变)
              cache: ~/.repochan/starters-cache/<id>@<version>@<digest>/
```

**包边界规则:**

| 层 | 负责 |
|-------|------|
| `@repochan/core` | Catalog/manifest/`fit`/`demo` 的 schema + validate;不做 I/O 网络 |
| `packages/cli` | Catalog 加载、tarball fetch、cache、digest 校验、pull 复制、list/get UX |
| `@repochan/starters`(演化后) | 官方 catalog 产物 + **embed(s)**;长期不是完整的库主体 |
| 外部 **registry** 仓库(Phase 3 推荐) | 完整 starter 树、CI validate/pack/release、catalog digest 更新 |
| 可选 **Gallery** 站 | catalog + previews 的自动渲染;永远不是第二个设计源 |

依赖方向保持无环:`cli → core | starters | …`。fetch 逻辑不得进入 `core`。

### 4.3 Catalog entry(示意)

足以在不下载站点的情况下做 `list`/`get`:

```json
{
  "schemaVersion": "repochan.starter-catalog.v1",
  "starters": [
    {
      "id": "minimal",
      "name": "Minimal Hero",
      "version": "1.2.0",
      "default": true,
      "style": "editorial-tech",
      "tags": ["landing", "hero", "minimal"],
      "description": "A single-screen Astro landing page with one project-focused hero.",
      "supportedLocales": ["en", "zh"],
      "assetSlots": ["hero-composite"],
      "sizeBytes": 180000,
      "digest": "sha256:…",
      "source": {
        "kind": "embed",
        "path": "embeds/minimal"
      },
      "fit": {
        "bestFor": ["Single-screen project landing with one hero composition"],
        "notFor": ["Multi-section marketing narrative", "Docs multi-route sites"],
        "sections": ["Hero"],
        "interaction": "Mostly static; minimal motion",
        "contentShape": "Short hero copy + one composite slot",
        "density": "low",
        "motion": "low"
      },
      "demo": {
        "kind": "official",
        "url": "https://starters.example/s/minimal/1.2.0/"
      },
      "previews": {
        "desktop": "…relative or catalog CDN…",
        "mobile": "…"
      }
    }
  ]
}
```

`source.kind`:

| kind | 角色 |
|------|------|
| `embed` | 离线 bootstrap + release smoke(至少 `minimal`) |
| `tarball` | 非默认官方 starter 的主路径 |
| `local` | `--from`;creator workspace;气隙环境 |

**完整性:** pull 必须在 digest 不匹配时拒绝。catalog 为可复现性 pin `id@version@digest`;pull 的 provenance 应该可被记录(instance meta 或等价物 —— 具体的磁盘字段留给实现 PR 定)。

### 4.4 Text-first 选型契约

#### 问题

假设"打开 desktop/mobile previews"的 skill 文本在 text-only host 上会失败。视觉和实时浏览是**能力门控的增强**,不是默认值。

#### Manifest / catalog:结构化的 `fit`(推荐对新的官方 starter 要求必填)

建议的形状(名字可在 schema PR 里再 bikeshed):

```json
"fit": {
  "bestFor": ["…"],
  "notFor": ["…"],
  "sections": ["…"],
  "interaction": "…",
  "contentShape": "…",
  "density": "low|medium|high",
  "motion": "none|low|medium|high"
}
```

已有的 `description` / `style` / `tags` 保留;`fit` 是 page-designer 用来对照 analysis + persona 做 shortlist 的依据。

#### 可选 `demo`(author vs official)

| kind | 何时用 | 信任度 |
|------|------|--------|
| `author` | PR 时或 creator 托管的静态 URL | 仅作参考;可能漂移;HTTPS;可选的 link-check CI |
| `official` | 从**同一个树**作为 tarball digest 做 CI deploy | 人类侧首选;"所见即所 pull" |

**鼓励作者自托管 URL 作为可选的 PR 便利,但不作为唯一的发现系统。** 不得要求 agent 去 fetch 或渲染它。

#### Skill 行为(page-designer)

**所有**模型的默认路径:

1. `analysis` + `persona` + `starter list` / `get`
2. 按 **tags + fit + description + slots/locales** 排序
3. 仍不确定时:在 candidate pull 之后检查**文本**结构(i18n keys、组件名)—— 仍然不需要视觉

增强路径**仅当 host 明确支持时**:

- 读 preview 图片,和/或打开 `demo.url`

人类 checkpoint(在 guided mode 下推荐):

- 呈现 2–4 个候选 + fit 理由 + demo/preview 链接,让人类来选

把那句错误的、普适的"先看 desktop/mobile 预览"重写成上面的分层。

### 4.5 发现面(人类 vs agent)

```text
L1 Catalog text     — 必需;CLI + agents;离线友好
L2 Static previews  — 保留在 starter 内;Gallery 卡片;人类 + 多模态
L3 Demo URL         — 可选 author;首选从同一 digest 出的 official
L4 Local run        — pull + pnpm dev;无需常驻托管的 ground truth
```

**Gallery 站(如果建):** 从 catalog + previews(以及可选 demo 链接)自动生成。没有手工编辑的卡片数据库。不是第二个设计源。

**每个 starter 的完整交互式托管:** 不是本方案接受的必要条件。优先顺序:

1. v1:text catalog + 必需的 previews 文件 + 可选 author `demo`
2. 之后:从 CI 按 `id@version` 做 official 静态 deploy
3. 可选:为动效重的 starter 做 screencapture/scroll video,而不上全套多站点运维

### 4.6 贡献流程(目标)

1. Starter Designer 在 **creator-owned** 目录里工作(不变)。
2. 官方提交 → 向 **registry**(Phase 3)或 monorepo(过渡期)发 PR,带:
   - 完整 Source Starter
   - 填好的 `fit`(gate)
   - 在场的 `previews`(gate;面向人类/Gallery,不是 agent 视觉要求)
   - 可选 `demo.kind: author` URL,方便评审者
3. CI:`repochan starter validate`、结构检查、体量预算、打包 tarball、算 digest、更新 catalog。
4. 可选 CI:从同一产物部署 official demo。
5. Monorepo 产品 release 发的是 **catalog + embed**;smoke test 只 pull `minimal`(见 `docs/releasing.md` 模式)。

### 4.7 体量 / 质量 gate(推荐)

- previews 和 public 资产优先用 WebP(或预算内的格式);当 WebP 已存在时,不要保留巨大的 PNG preview。
- 每个 starter 的解压后体量预算,以及每张图的预算(具体数字在实现 issue 里定)。
- 每次远程 pull 都做 digest 校验。

---

## 5. 分阶段上线

| 阶段 | 交付物 | 结果 |
|-------|-------------|---------|
| **0 —— 止血** | 资产预算;preview 格式卫生;starter 的 validate-on-PR | 在不改 API 的情况下减缓 blob 增长 |
| **1 —— Catalog 抽象** | 从当前树生成 catalog;loader 解析 `embed` + `local`;行为对齐 | 解锁后续动作;对用户无破坏性 |
| **2 —— Text-first 选型** | schema 里的 `fit`(+ 可选 `demo`);skill 重写;list/get 暴露 fit | text-only agent 能诚实地 shortlist |
| **3 —— Tarball + cache** | 远程 `source.kind: tarball`;`~/.repochan/starters-cache`;npm 包不再装全部 body | 安装体量和 monorepo 压力下降 |
| **4 —— Registry 仓库** | 外部 starter 库 + CI pack/release;monorepo 保留 catalog + `minimal` embed | 高 PR 量流出产品 monorepo |
| **5 —— 可选 Gallery / official demo** | 静态 gallery;带匹配 digest 的 CI demo URL | 人类浏览无需人工维护 |

Phase 1–2 即使远程 registry 推迟也能推进。Phase 0 是独立的。

---

## 6. CLI 语义(稳定的 UX)

保留命令名;扩展解析:

```bash
repochan starter list [--tag …] [--json]
repochan starter get <id> [--json]          # catalog + fit;可能不需要完整树
repochan starter pull --starter <id>       # 解析 catalog → cache/embed → 复制
repochan starter pull --from <dir>         # 不变的本地权威
```

建议的后续工具(非阻塞):`starter cache gc`、catalog pin/refresh 策略、只有出现社区 catalog 时才加显式 `--registry`(默认仍是官方 pin)。

要保留产品基调的失败模式:

- 无网络 + cache miss → 清晰报错;指向 embed / `--from`
- digest 不匹配 → 硬失败
- catalog schema 比 CLI 新 → 升级 CLI

---

## 7. 风险与开放问题

| 风险 / 问题 | 备注 |
|-----------------|-------|
| embed-only 默认后的离线用户 | 发 `minimal` embed;文档说明 cache 预热;`--from` 给气隙组织 |
| catalog 新鲜度 vs CLI release 节奏 | 在 release 里 pin catalog digest;可选的、带明确信任规则的 refresh |
| `fit` 的质量 / 语言 | gate 最小字段;之后可能需要 EN/ZH 策略 |
| 作者 demo 滥用 | `kind: author` 要标注;官方 catalog 优先用 CI demo |
| catalog 里 vs 包里的 preview 路径 | catalog 可以镜像小缩略图或绝对 CDN URL;包相对路径留在 tarball 内 |
| 精确的 cache 路径和 provenance 文件 | 实现细节 |
| `fit` 是要求在 `repochan.starter.v1` 里,还是只在 catalog 里 | 倾向单一 schema,这样本地 `--from` 的 starter 也能被良好选型 |

---

## 8. 验收草案(何时从 proposal 转正)

本方案**在精神上被接受**的标志:

1. 非默认 starter 不再被要求撑大发布的 npm tarball。
2. 远程条目的 `starter pull` 校验 digest 并使用本地 cache。
3. page-designer skill 不再普适地要求看 preview 图片。
4. 官方 starter 暴露机器可读的 `fit`(或等价物)供 list/get 使用。
5. `demo` 的 author URL 保持可选;任何"official demo"都从和被 pull 的树同一份产物构建。

---

## 9. 参考资料(代码库)

- `packages/cli/src/lib/starter-loader.ts` —— `getBuiltinStartersDir`、`listStarters`、`getStarter`
- `packages/cli/src/commands/starter.ts` —— `runStarterList`、`runStarterGet`、`runStarterPull`(`--from`、`fs.cp` filter)
- `packages/core/src/starter.ts` —— `StarterManifest`、`validateStarterManifest`、previews 安全
- `packages/starters/package.json` —— 发布的 `files` glob
- `packages/skill/skills/repochan-page-designer/SKILL.md` —— 选型工作流(preview 假设)
- `docs/releasing.md` —— smoke:`starter list` / `pull --starter minimal` / `validate`
- `ARCHITECTURE.md` / `Agents.md` —— 包规则与产品不变式

---

## 10. 决策汇总表

| 主题 | 决策 |
|-------|----------|
| 包形态 | Catalog + 最小 embed;完整 body 按需 |
| 主远程产物 | digest 校验的 tarball + 本地 cache |
| Monorepo 长期形态 | 产品代码 + catalog + bootstrap starter(s);库在 registry |
| Agent 选型默认 | 文本:tags + `fit` + description/slots |
| Previews | 保留;面向人类 / 多模态 / Gallery —— 不要求 agent 视觉 |
| 作者静态 demo URL | 可选 `demo.kind: author` |
| 官方 live demo | 之后可选;和 tarball 同 digest |
| 人工维护导航站 | 否;只在需要时做自动 Gallery |
| shadcn 类比 | Registry + 复制;**不是**按组件装文件 |
| 每 starter 一个 npm 包 | 否 |

接受时,先把 Phase 0–2 转为 tracked work;registry/Gallery 作为后续。
