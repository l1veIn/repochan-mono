# Prior-Art：创意资产管线浏览器 / 本地协议 Viewer

> 调研目标：为 `repochan browse`（本地查看 `.repochan/` 人设、订单、版本、reference 关系，以及后续 starter / template / gen·edit 工作台）寻找开源可参考与可复用项。  
> 结论先行：**赛道很多，但没有可直接当 `repochan browse` 的现成产品**；可直接用的是 **UI 库与交互范式**，整机 fork 不划算。  
> 日期：2026-07-21。

---

## 0. 问题边界

RepoChan 需要的不是通用「网盘式 DAM」，而是：

| 需求 | 说明 |
|------|------|
| 本地优先 | `cd` 到项目 → `repochan browse` 打开，真相在 `.repochan/` |
| 协议语义 | persona / analysis / interview / orders / versions / reviews / derived |
| 依赖图 | order `references`、foundation 锚定 |
| 工具延伸（后置） | starter 预览、template 浏览、image gen / edit |
| 架构约束 | CLI 唯一绑定面；core 不嵌 agent；不引入第二套「云真相」 |

评价开源项目时用三档：

- **产品壳**：能否几乎原样当 browse 用  
- **IA / UX**：是否值得抄信息架构与交互  
- **依赖库**：能否 npm/直接集成进 monorepo  

---

## 1. 赛道地图

| 赛道 | 解决什么 | 与 browse 重合 | 代表 |
|------|----------|----------------|------|
| 企业 DAM | 海量素材、权限、分发、品牌合规 | 低 | ResourceSpace, Pimcore, Phraseanet |
| VFX / 动画制片跟踪 | 镜头、任务、版本、审核 | **概念高** | Kitsu, AYON |
| AI 本地出图工作室 | 生成、画廊、workflow 节点图 | **UX 高** | InvokeAI, ComfyUI |
| 自托管相册 | 漂亮浏览、搜索、备份 | **浏览 UX 高** | Immich, PhotoPrism |
| ML 数据版本 | 大数据集、可复现流水线 | 版本哲学 | DVC, MLflow |
| 图编辑库 | 节点画布、灯箱 | **可直接依赖** | React Flow, lightbox |

---

## 2. 分项结论

### 2.1 VFX 制片跟踪 — 概念最值得学

#### Kitsu（CGWire）· [github.com/cgwire/kitsu](https://github.com/cgwire/kitsu) · AGPL-3.0

- 协作与 production tracking：项目 → 实体 → 任务 → preview 版本 → 评论审核。  
- **可学**：实体 + 多版本预览 + 审核状态；缩略图网格 + 时间线；状态可视化。  
- **不可直接用**：依赖 DB 与用户体系；镜头/Episode 模型；**AGPL** 深度集成需谨慎；不是「读项目旁 `.repochan`」形态。

#### AYON（Ynput，原 OpenPype）· [ayon.app](https://ayon.app/) / [github.com/ynput](https://github.com/ynput)

- 工作室级 pipeline：publish/load、DCC 集成、远程团队。  
- **可学**：版本不可变、工具链集成、publish 语义。  
- **不可直接用**：体量是「工作室 OS」，与 RepoChan 薄 CLI、agent-agnostic 冲突。

**Adopt**：IA 词汇 — Asset / Version / Review / Reference。  
**Avoid**：fork 为 browse 壳。

---

### 2.2 AI 创意引擎 — 画廊与节点图 UX

#### InvokeAI · [github.com/invoke-ai/InvokeAI](https://github.com/invoke-ai/InvokeAI) · Apache-2.0

- 本地 Web UI、Board/Gallery、prompt 元数据回放、Unified Canvas。  
- **可学**：图库分 board、大图 + meta 侧栏、从 gallery 拖回工作区。  
- **不可直接用**：SD 推理栈；不懂 order/foundation。

#### ComfyUI · [github.com/comfyanonymous/ComfyUI](https://github.com/comfyanonymous/ComfyUI)

- 节点式 workflow；社区有 workflow 管理扩展。  
- **可学**：节点图 = 依赖可视化隐喻（对标 reference 画布）。  
- **不可直接用**：算子图 ≠ 协议 artifact 图。

社区常再写一层「本地 image browser」读元数据——侧面说明 **生成器与协议浏览器是两件产品**。

**Adopt**：Gallery + Inspector；节点图隐喻。  
**Avoid**：嵌推理引擎。

---

### 2.3 自托管相册 — 浏览体验参考

#### Immich · MIT · PhotoPrism

- 网格、时间线、灯箱、搜索、移动端体验成熟。  
- **可学**：虚拟列表、快捷键翻图、详情抽屉。  
- **不可直接用**：照片库模型；import/索引服务；无 order 状态与 reference 边；默认不是零配置读 `.repochan`。

**Adopt**：网格与键盘流。  
**Avoid**：当存储真相或主后端。

---

### 2.4 企业 DAM — 明确不采用

ResourceSpace、Pimcore DAM、Phraseanet、EnterMedia、Nuxeo 等：

- 强在权限、元数据、企业分发。  
- 弱在：PHP/重后端、多租户、与 git 项目旁协议无关。  

**Avoid**：作为 `repochan browse` 底座（运维与架构都不匹配）。

---

### 2.5 数据版本 — 哲学参考

#### DVC · Apache-2.0

- 大数据与 Git 协同、指针文件、remote cache。  
- RepoChan 已有 `current.json` + `versions/` 与 order version 目录，**不必上 DVC**。  
- 远期若跨机同步超大 binary 再评估。

---

### 2.6 仓库内已有 — 最近的交互祖先

#### `score-review/`

- 本地 Web：左图右 meta、快捷键、队列。  
- 数据源是 `test-results/` 批量归档打分，不是项目 `.repochan`。  

**Adopt**：布局与快捷键习惯。  
**Evolve**：数据层换成协议只读 API，去掉打分主路径（或降为可选）。

---

### 2.7 可直接依赖的库

| 组件 | 候选 | License | 用途 |
|------|------|---------|------|
| 节点画布 | [React Flow / @xyflow/react](https://reactflow.dev/) | MIT | references / foundation 图 |
| 自动布局 | dagre / elkjs | MIT / 各异 | 分层排版 |
| 灯箱大图 | yet-another-react-lightbox、PhotoSwipe 等 | MIT | 订单/版本大图 |
| 虚拟列表 | @tanstack/virtual 等 | MIT | 大量订单网格 |
| 本地静态服务 | Node http / Hono / sirv | — | `repochan browse` 极薄 serve |

---

## 3. 匹配度总表

| 项目 | 产品壳 | 抄 IA/UX | 直接依赖 | 与 `.repochan` |
|------|:------:|:--------:|:--------:|----------------|
| Kitsu | 否 | 强 | 否 | 概念像，模型不像 |
| AYON | 否 | 中 | 否 | 过重 |
| InvokeAI | 否 | 强（gallery） | 否 | 生成域 |
| ComfyUI | 否 | 强（节点图） | 否 | workflow ≠ order graph |
| Immich / PhotoPrism | 否 | 强（浏览） | 否 | 相册域 |
| ResourceSpace / Pimcore | 否 | 弱 | 否 | 企业 DAM |
| DVC | 否 | 中（版本） | 远期可选 | 已有自研协议 |
| React Flow 等 | — | — | **是** | 画布层 |
| score-review | 可演化 | 中 | 可拆代码 | 需换数据源 |

---

## 4. 采用 / 不采用（冻结建议）

### Adopt

1. **IA 词汇**（Kitsu 系）：Entity / Version / Review / Reference。  
2. **Gallery + Inspector**（Invoke / Immich）：主舞台大图或网格 + 侧栏 meta/prompt/status。  
3. **Dependency canvas**（Comfy 隐喻 + React Flow 实现）：节点=order（及 persona 等），边=`references`。  
4. **库**：React Flow、灯箱、虚拟列表。  
5. **内部**：从 `score-review` 抽交互骨架，不抽打分业务。

### Avoid

1. Fork Immich / Kitsu / Invoke / Pimcore 当 browse 壳。  
2. 引入第二套 DB 作为资产真相（破坏 `.repochan` 本地协议）。  
3. 在 browse 内嵌 SD 推理；gen 继续走 `image-gen` CLI / 库。  
4. 默认局域网开放与多租户账号（MVP 仅 `127.0.0.1`）。

### 为什么不「直接用」整机

| 代价 | 说明 |
|------|------|
| 双写 | 外置索引 vs `.repochan` 双真相 |
| 运维 | Docker/迁移 vs 一条 CLI |
| 架构 | 违背薄绑定面与 agent-agnostic |
| 领域 | 无 foundation / order 状态机 / starter slot |

**自研薄 viewer + 抄 UX + 用积木库** 成本低于硬套。

---

## 5. 对设计文档的输入

完整产品范围与分期见 [`browse-viewer.md`](./browse-viewer.md)。

调研对设计的硬约束：

1. Browse 是 **Protocol Viewer**，不是 DAM / SD Studio / 家庭相册。  
2. 画布数据必须来自协议 `references`，不手动画线。  
3. 第一期只读；Workbench（gen/edit）后置且复用现有 CLI/core。  
4. Chrome **不用** RepoChan 角色立绘抢用户资产；可用 icon / pattern / 克制 props。

---

## 6. 参考链接（精选）

- Kitsu: https://github.com/cgwire/kitsu  
- AYON: https://ayon.app/ · https://github.com/ynput  
- InvokeAI: https://github.com/invoke-ai/InvokeAI  
- ComfyUI: https://github.com/comfyanonymous/ComfyUI  
- Immich: https://immich.app/  
- React Flow: https://reactflow.dev/  
- DVC: https://dvc.org/  
- ResourceSpace（DAM 对照，不采用）: https://www.resourcespace.com/  
