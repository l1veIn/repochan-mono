# Design：`repochan browse` — 本地协议浏览器 / 创意资产 Viewer

> 状态：设计草案（调研已收敛，待实现分期确认）  
> 相关：[`browse-viewer-prior-art.md`](./browse-viewer-prior-art.md) · 风格方向库 `docs/prototypes/`（工具壳气质参考 Museum / Swiss，**非** marketing landing）  
> 日期：2026-07-21  

---

## 1. 问题

RepoChan 把创意产物落在项目内 `.repochan/`（analysis、persona、interview、orders 及 versions / references / reviews / derived），但消费方式主要是 **文件系统翻找**。

现有 `score-review/` 面向 monorepo 测试归档打分，**不是**项目级协议浏览器。

用户期望：

```bash
cd /path/to/project
repochan browse    # 本地打开，方便查看人设、订单、版本与依赖关系
```

并逐步覆盖 starter 预览、template 查看，以及 image gen / edit 工作台。

---

## 2. 产品定位

**一句话**：本地、只读优先的 **Protocol Viewer**——让人（与 agent 协作者）看见并理解 `.repochan` 交付拓扑，而不是再做一个营销站或云 DAM。

| 是 | 不是 |
|----|------|
| 项目旁协议浏览器 | 企业 DAM / 网盘 |
| Order · Version · Reference 语义 | 通用相册 |
| CLI 起本地服务 | 内嵌 agent runtime |
| 用户资产为舞台中心 | 仓库酱角色展示站 |

架构对齐（`ARCHITECTURE.md` / `Agents.md`）：

- **CLI 唯一绑定面** → `repochan browse` 合理。  
- **core 守协议** → browse 通过 core 读盘，不平行发明 schema。  
- **image-gen / image-edit 是库** → UI 触发时调用现有能力，不写第二套生成栈。  
- **不写协议的旁路** 保持；browse 默认只读，写操作显式且与 CLI 门禁一致（如 `overwrite`）。

---

## 3. 范围与分期

### Phase 1 — MVP Viewer（必须先可用）

- `repochan browse [--port] [--no-open]`  
- 确认 `projectRoot` 与 `.repochan/`（缺失则提示 init）  
- **Persona 人设卡**（current + versions / candidates 入口）  
- **Orders 网格**（封面=当前 version 主图，角标 status / assetType）  
- **Order 详情**：meta、prompt、references 列表、version 时间线、大图  
- 安全文件服务：仅白名单路径（`.repochan/` 内，复用 safe path 思路）  
- 默认 bind `127.0.0.1`

### Phase 2 — Graph Canvas

- 画布节点：orders（缩略图）、persona、analysis（文档节点）  
- 边：`references`（order→order / file）、foundation 高亮  
- 点选节点 ↔ Inspector 联动  
- 布局：React Flow + dagre/elk 等自动布局  
- 可选：`fs.watch` 热更新（painter 交付后刷新）

### Phase 3 — Catalog

- Template 列表/详情（`@repochan/templates` + 项目覆盖）  
- Starter 预览（official / 本地 pull 产物的 desktop·mobile preview）  
- 注意：starters 可能在包路径，不在 `.repochan`——API 边界写清

### Phase 4 — Workbench（最大、单独成项）

- image edit：本地预览管线（零网络，相对安全）  
- image gen：凭证、队列、失败重试；写回 order 走审批门  
- 任何破坏性写：`overwrite` 或等价显式确认  
- **不**做内嵌 agent 对话窗、云同步、多租户

### 非目标（明确不做）

- 默认开放局域网 / 公网  
- 第二套数据库作为资产真相  
- 把 Immich / Kitsu / Invoke 当存储后端  
- 用 RepoChan 角色立绘作为 chrome 主视觉（见 §6）

---

## 4. 信息架构

```text
┌──────────────────────────────────────────────────────────────┐
│  Brand bar：icon · 项目名 · .repochan 健康状态    [Canvas]   │
├────────────┬─────────────────────────────┬───────────────────┤
│ Navigator  │  Main stage                 │ Inspector         │
│            │                             │                   │
│ Persona    │  网格 / 人设卡 / 大图 /     │  meta · status    │
│ Analysis   │  版本对比 / 画布            │  references       │
│ Interview  │                             │  prompt           │
│ Orders ▾   │                             │  actions（后置）  │
│  ├ …       │                             │                   │
│ Starters*  │                             │                   │
│ Templates* │                             │                   │
│ Tools*     │                             │                   │
└────────────┴─────────────────────────────┴───────────────────┘
* Phase 3–4
```

### 核心视图

1. **Persona** — 结构化人设卡，非 raw JSON 墙；侧栏切换 versions / candidates / reviews。  
2. **Orders 库** — 网格；筛选 assetType / status。  
3. **Version 时间线** — 同 order 下 `versions/*`；支持两版 A/B。  
4. **Canvas** — 依赖关系默认二级入口（Phase 2）；可升为可选默认（产品决策点）。  
5. **Catalog / Tools** — 后置。

---

## 5. API 草图（本地 HTTP）

实现可放 `packages/browse` 或 CLI 内嵌静态资源 + 薄服务；**业务读盘走 `@repochan/core`**。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | projectRoot、protocol 是否就绪 |
| GET | `/api/tree` | 顶层索引：analysis / persona / interview / order 摘要列表 |
| GET | `/api/persona` | current + version 列表元数据 |
| GET | `/api/orders` | 列表（id、status、assetType、封面 path、currentVersion） |
| GET | `/api/orders/:id` | order.json + versions[] + references 解析结果 |
| GET | `/api/graph` | 节点与边（供 Canvas；可由 tree+orders 派生） |
| GET | `/api/file?path=` | **仅**安全解析后的协议内文件（图/JSON） |
| GET | `/` · 静态 | Viewer SPA |

写操作（Phase 4）另开 `/api/actions/*`，映射现有 CLI 语义，禁止静默覆盖。

---

## 6. 视觉原则

| 元素 | 决策 |
|------|------|
| 用户角色 / 订单图 | **主舞台唯一主角** |
| RepoChan 立绘 / chibi 作 chrome | **避免** |
| Icon | 可用（favicon、空状态小标、brand bar） |
| Pattern / 纹理 | 可用（侧栏底、画布网格、loading） |
| Props / motif | 极克制空状态装饰，不抢 dig 割 |
| 气质 | 档案室 / 灯箱 / 策展 — 近 **Museum White Cube** + **Swiss** 清晰索引 |
| 色 | 中性工作台底 + 单一 accent（如品牌 sky）；让内容图发色 |

空状态示例：

- 「还没有 persona」→ 指向 CLI / skill，而非仓库酱大海报。  
- 画布无边：「建立 reference 或 foundation 后，依赖会自动出现。」

与 `docs/prototypes/` 中 marketing 方向（Frutiger / Zine / Game Page 等）**刻意区分**：browse 是工具，不是落地页。

---

## 7. Canvas 数据模型（Phase 2）

```text
Node:
  id: string                    # e.g. order:ord-foundation-001 | persona:current | analysis:current
  kind: order | persona | analysis | interview | file
  label: string
  thumb?: protocol-relative path
  status?: OrderStatus
  assetType?: string

Edge:
  from: nodeId
  to: nodeId
  kind: reference | foundation-anchor | derived-from
  # reference 映射 order.references[]（order | file）
```

- 布局数据 **派生自协议**，不持久化第二套图文件（除非将来做用户手动钉选，另议）。  
- Foundation：`findFoundation`-类逻辑高亮中心节点。

技术：**@xyflow/react（React Flow）** + 自动布局库（见 prior-art）。

---

## 8. 技术草图

| 项 | 建议 |
|----|------|
| 入口 | `repochan browse` |
| 前端 | 轻 SPA（Vite + React 或同等）；Phase 1 可无 Canvas |
| 画布 | React Flow（MIT） |
| 大图 | lightbox 库 |
| 服务 | CLI 子进程内 HTTP；打包静态资源 |
| 数据 | core list/read；可选 watch |
| 安全 | localhost；path sandbox |

可参考交互：`score-review/`（勿锁死其打分数据模型）。

---

## 9. 与 prior-art 的对齐

详见 [`browse-viewer-prior-art.md`](./browse-viewer-prior-art.md)。

| 来源 | 用法 |
|------|------|
| Kitsu | Version / Review 语义 |
| Invoke Gallery | 图 + meta |
| Immich | 网格与键盘流 |
| React Flow | 依赖画布实现 |
| score-review | 布局祖先 |
| DAM / AYON 整机 | **不采用** |

---

## 10. 开放决策（实现前拍板）

1. **Canvas 是否默认首页？** 建议 Phase 1 默认 Orders 网格，Canvas 为一级入口但不默认。  
2. **Tools 是否永远不进 MVP？** 建议是；Phase 1 零写操作。  
3. **包位置**：`packages/browse` vs `packages/cli` 内嵌 — 倾向独立 package，cli 依赖并 serve。  
4. **是否从 score-review 迁代码**：迁布局可以，迁业务不建议。

---

## 11. 验收草案

### Phase 1

- [ ] 任意含 `.repochan` 的项目下 `repochan browse` 可打开  
- [ ] 能浏览 persona 与全部 orders 封面  
- [ ] 能打开任意 version 大图与 order meta / prompt  
- [ ] 协议外 path 无法通过 `/api/file` 读取  
- [ ] 无 gen/edit 也能完整完成「看见与理解」

### Phase 2

- [ ] 画布展示 foundation → 下游 references  
- [ ] 点选节点打开同一 Inspector  
- [ ] 无 reference 时有清晰空状态  

### 设计

- [ ] 主视觉无仓库酱立绘抢戏  
- [ ] 与 marketing starter 截图并排可区分「工具 vs 落地页」  

---

## 12. 建议文档与代码落点（实现时）

| 产物 | 位置 |
|------|------|
| 本设计 | `docs/design/browse-viewer.md` |
| Prior-art | `docs/design/browse-viewer-prior-art.md` |
| 包（建议） | `packages/browse` |
| CLI | `packages/cli` → `browse` 子命令 |
| 测试 | core 读路径单测 + browse API 契约测 |

实现启动前：确认 §10 开放决策，并按 Phase 1 范围开 PR，避免与 Phase 4 绑死。
