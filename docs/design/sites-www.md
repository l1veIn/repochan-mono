# Plan：`sites/www` — RepoChan 官方站点

> 状态：**已实现骨架**（`sites/www`，museum 气质 + showcase）  
> 实现目录：[`sites/www/`](../../sites/www/) · 开发说明见该目录 `README.md`  
> 范围：monorepo 内官网源码位置、信息架构、案例策展、部署边界  
> 非范围：npm 发布契约、`repochan browse`  
> 日期：2026-07-22（实现同日）  

---

## 1. 目标

为已公开的产品提供一个**可分享的正式门面**（域名 + 静态站），让路人在不打开 monorepo 的情况下：

1. **10 秒内**理解 RepoChan 是什么  
2. 看到**真实流水线产出**（角色 / 设定集 / 贴纸 / 落地页预览），而非空话  
3. 找到**唯一主 CTA**：安装 CLI 并在自己的 coding agent 里跑起来  
4. 通过**仓库娘化案例**建立「任意 git 仓库 → 有生命的品牌脸」的直觉  

官网是**营销与证据面**，不是第二套协议运行时，也不是 monorepo 文档的完整镜像。

---

## 2. 在 monorepo 中的位置

### 2.1 路径

```text
repochan-mono/
  packages/           # 可发布的产品本体（core / cli / skill / …）
  docs/               # 设计与发布文档（本文件所在）
  score-review/       # 内部评分浏览工具
  sites/
    www/              # → 绑定正式域名的官方站点（本计划）
  test-repos/         # 本地案例工厂（gitignore）
  test-results/       # 评分归档（gitignore）
  web-design/         # 本地设计草稿（gitignore）
```

- 与 `score-review/` **同级层**（根目录旁支），但用 `sites/` 收纳对外站点，避免与内部工具混名。  
- 首发仅一个应用：`sites/www`。日后若有文档子站，可并列 `sites/docs`，不必现在创建。  

### 2.2 明确不放哪里

| 路径 | 原因 |
|------|------|
| `packages/*` | 属于 npm / 发布契约与 workspace 发布图；官网不是 publishable leaf |
| `packages/starters/*` | Starter 是给用户 `pull` 的**源模板**；生产站不得直接改官方 starter 源充当部署源 |
| `web-design/` | 已 gitignore，只作草稿，不能当可部署源码 |
| `test-repos/` / `test-results/` | 本地工厂与归档，体积大、含完整 clone 与中间产物，保持 ignore |

### 2.3 与 workspace / 发布的关系

- **默认不**把 `sites/www` 加入 `pnpm-workspace.yaml` 的 `packages/*` 发布图。  
- 官网**独立构建**；不进入 `pnpm -r build` 的 release 阻塞路径，也不参与 `docs/releasing.md` 的包发布顺序。  
- 源码**提交进 git**（与 `score-review` 相同，与 `test-repos` / `web-design` 相反）。  

---

## 3. 托管与域名

| 项 | 决策 |
|----|------|
| 域名 | 项目正式域名（`.com` 等已注册者） |
| DNS | Cloudflare（与域名注册商一致时最省事） |
| 部署 | **Cloudflare Pages**，连 monorepo，Root directory = `sites/www` |
| 构建 | 站点目录内安装依赖并静态导出（具体命令以站点 `package.json` 为准） |
| 产物 | 通常为 `dist/`（或站点自行约定的 outDir） |
| 证书 | Pages / Cloudflare 托管 HTTPS |
| apex / www | 二选一为主域，另一做 301；在 CF 一次配好 |

可选后续：

- `docs.<domain>` 或路径 `/docs` — **不在 v1 范围**；v1 深度说明链到 GitHub `README` / `ARCHITECTURE.md` 即可。  

---

## 4. 产品信息架构（v1）

v1 以**单页为主**，案例可有轻量子路径；不做账号、控制台、在线 agent。

### 4.1 建议区块顺序

1. **Hero** — 一句 slogan + 主视觉 + 主 CTA（Install）+ 次 CTA（GitHub）  
2. **What it is** — 三两句：agent-driven 创意管线；无嵌入 runtime；BYO agent  
3. **How it works** — 短链路：analysis → persona → art direction → painting → page（可用示意，不必交互演示）  
4. **Showcase / 仓库娘化案例** — 策展网格（见 §5）；首页展示精选，可链到 `/showcase`  
5. **更多视觉 / Starter 风格条（可选）** — 证明风格广度，点到为止  
6. **Install** — 可复制命令；前置条件一行（Node、coding agent、图像 endpoint）  
7. **Footer** — License、仓库链接、中英切换（若做双语）、案例免责声明入口  

### 4.2 文案原则

| 多写 / 多放 | 少写 |
|-------------|------|
| 结果图、角色脸、落地页截图 | monorepo 依赖方向、schema 版本号 |
| 安装两行命令 | 完整 CLI 手册 |
| 「任意仓库 → 品牌脸」 | 与每个 agent host 的兼容矩阵细节 |

架构与协议细节留给 GitHub；官网卖**结果与路径**。

### 4.3 双语

- 若实现 i18n：`en` / `zh` 均可；默认语言按传播目标选定其一，另一提供切换。  
- 案例 meta 中的短文案建议中英各一句，避免详情页只中文或只英文。  

### 4.4 SEO / 分享

- 页面级 `og:image`、title、description（与 GitHub Social preview **分开配置**，可共用导出图）。  
- Favicon / apple-touch 使用产品已有 icon 资产。  

---

## 5. 案例（Showcase）：来自 test-repos 的策展，不是工厂直出

### 5.1 为什么要做

`test-repos/` 下对知名（及自有）仓库跑过完整或接近完整的「仓库娘化」流水线，是最强的**产品证据**。  
官网案例区应成为首页主菜之一，而不是附录。

### 5.2 硬边界

| 做 | 不做 |
|----|------|
| 人工策展后的压缩 web 图 + 短文案 | 把整个 `test-repos/` 提交进 git 或挂到站点 |
| 标注 **unofficial demo / not affiliated** | 暗示上游官方采用了该角色 |
| 展示 final 视觉与轻量人设 hook | 公开 analysis 全文、访谈原文、多版本 candidate 对打分 |

页脚或案例区固定免责声明（中英任选或双语），例如：

> Unofficial mascot demos generated from public repositories for pipeline demonstration. Not affiliated with the original projects.

### 5.3 站点内资产布局

```text
sites/www/
  public/
    showcase/
      <case-id>/
        foundation.webp    # 或统一主视觉
        icon.webp          # 可选
        poster.webp        # 可选
        stickers.webp      # 可选条带/拼图
        landing.webp       # 有落地页预览时
        ...
      ...
  src/                     # 页面与组件（实现时自定）
  data/
    showcase.json          # 或 per-case meta；见下
```

每条案例建议字段（逻辑模型，格式可 JSON / TS 模块）：

| 字段 | 说明 |
|------|------|
| `id` | 稳定 slug，如 `redis` |
| `upstream.name` / `upstream.url` | 上游项目名与 GitHub（或官网）链接 |
| `character.name` | 角色名（来自 persona 定稿） |
| `character.hook` | 一句人设 / 气质（中英） |
| `tier` | `featured` \| `gallery` |
| `hasLanding` | 是否有落地页预览图 |
| `assets` | 相对 `public/showcase/<id>/` 的文件列表 |
| `disclaimer` | 默认 `unofficial-demo` |

### 5.4 分层（完成度）

| Tier | 标准（示意） | 官网用法 |
|------|----------------|----------|
| **featured** | foundation + 多交付物，且有落地页/站点预览更佳 | 首页大卡或详情页完整展 |
| **gallery** | 至少 foundation（或等价主视觉）+ 角色名 + 上游 | 图鉴网格 |
| **暂不上架** | 无可靠 `.repochan` 视觉定稿 | 补齐后再导出 |

**首发宁少毋滥**：约 **6** 条高质量案例优于全量罗列。  
具体名单在实现时从当前 `test-repos` 完成度与辨识度中挑选，本计划不锁定名单。

### 5.5 导出流程（内容流水线）

```text
test-repos/<name>/.repochan/   （本地，ignore）
        │  人工挑选 final 图
        ▼
  压缩为 webp / 统一画幅
        ▼
sites/www/public/showcase/<id>/ + data 登记
        ▼
  站点构建进 dist，随 Pages 发布
```

- 允许日后增加 `scripts/export-showcase.*` 半自动化；**v1 可全手动**。  
- 已产品化、且适合展示的 starter 预览图（若存在于 monorepo 已跟踪路径）可作为 featured 封面的**补充来源**，仍须遵守免责声明与策展标准。  
- **禁止**在构建时依赖本机 `test-repos/` 路径（CI / Pages 上不存在）。  

### 5.6 详情形态

- 首页：精选条或网格，点击进入详情或 lightbox。  
- 可选路由：`/showcase`、`/showcase/<id>`。  
- 详情固定骨架：上游 → 角色名 → 主视觉 → 辅助图 → disclaimer → 回到 Install CTA。  

---

## 6. 源码与实现约束

### 6.1 技术形态

- **静态站点**（SSG 或纯静态均可），无服务端会话、无用户数据库。  
- 实现栈在开工时选定；须满足：CF Pages 可构建、输出静态文件、便于放 `public/showcase`。  
- **不**引入与 `@repochan/core` 协议写入耦合的运行时；官网不读写访客的 `.repochan/`。  

### 6.2 从既有资产起步

- 视觉与文案可复用 monorepo 内已有、**已纳入 git** 的品牌图（如 README 变体资产、产品 icon、已跟踪的 starter 预览等）。  
- 若从某完整落地页工程拷贝骨架，必须**复制到 `sites/www`** 后独立演进，**不得**把 `packages/starters/<id>` 本身改成部署源。  
- 具体选用哪一套页面骨架 **不在本计划锁定**（实现 PR 自定）。  

### 6.3 与产品不变量对齐

- CLI 仍是 agent 的唯一绑定面；官网只负责引导安装与展示结果。  
- 不出现「在浏览器里一键跑完整 pipeline」的虚假承诺（图像与 agent 均在用户本机侧）。  

---

## 7. Cloudflare Pages 配置要点（实现检查单）

- [ ] GitHub 仓库已 public，Pages 项目指向该 monorepo  
- [ ] Root directory: `sites/www`  
- [ ] Build command / output directory 与站点 `package.json` 一致  
- [ ] 生产分支策略明确（如 `main`）  
- [ ] 自定义域绑定；`www` ↔ apex 重定向  
- [ ] 构建**不**依赖 `test-repos/`、本地密钥或未提交大文件  
- [ ] 预览部署（PR preview）可选，有则便于改文案  

---

## 8. 分期

### Phase 0 — 可访问门面（阻塞「有官网」）

- 建立 `sites/www` 目录与可构建的最小站点  
- Hero + Install + GitHub + 基础 footer  
- 域名绑到 CF Pages，HTTPS 可用  
- README 增加官网链接  

**验收：** 手机打开可读；主 CTA 可复制安装命令；分享链接有合理 title/预览图。  

### Phase 1 — 案例上墙（阻塞「像样」）

- `public/showcase/` + 案例数据  
- 首页案例区 +（建议）`/showcase`  
- 至少一批评审过的案例（约 6 条量级）+ 全局 disclaimer  
- 从 `test-repos` 导出的图均已压缩并入库  

**验收：** 不打开 GitHub 也能感到「这东西出过真图」；免责声明可见。  

### Phase 2 — 增厚（非阻塞）

- 案例筛选 / 分类、更多 featured 详情  
- 风格 / starter 广度展示加强  
- 文档子路径或子域  
- showcase 导出脚本化  
- 用户投稿展示（需单独政策）  

---

## 9. 非目标（v1 明确不做）

- 用户账号、云端项目、在线排队出图  
- 完整 CLI / 协议文档站（链到仓库即可）  
- 把 `score-review` 或本地 browse 嵌进公网  
- 实时扫描任意 GitHub URL 并生成角色  
- 为塞案例而公开 `test-repos` 全量历史与评分 JSON  

---

## 10. 文档与入口索引

| 资源 | 用途 |
|------|------|
| 本文件 `docs/design/sites-www.md` | 官网位置、范围、案例与部署计划 |
| `docs/releasing.md` | npm 包发布；**不含**站点发布顺序 |
| `ARCHITECTURE.md` / `Agents.md` | 产品架构不变量；站点不得违背 |
| `score-review/` | 内部案例质量工具；与公网 showcase 分离 |
| `test-repos/`（本地） | 案例原料工厂 |

实现落地后，可在本文件顶部将状态改为「已实现」并补上 `sites/www` 内 README 的链接。  

---

## 11. 决策摘要

1. 官网源码在 monorepo 的 **`sites/www`**，与 `score-review` 同级层、对外站点命名空间。  
2. 部署 **Cloudflare Pages**，独立构建，不绑 npm release 图。  
3. v1 = 静态门面 + Install + **策展案例**；案例来自 test-repos 的导出，不是工厂直挂。  
4. 知名仓库娘化必须 **unofficial** 声明。  
5. 页面视觉模板选型留给实现，**本计划不指定**。  
