# 项目分量评估（Project Weight Assessment）

世界架构师的第一步。**在造世界之前，先评估项目的客观分量 `projectWeight`。**

## 为什么要评

**只为识别 `light` 项目，给世界/角色的戏剧分量（conceptWeight）设天花板。**

- `medium` / `heavy` **不强制**「必须配重概念」——轻松世界观、日常角色完全合法。
- 评估不是为了把每个项目都推到高概念。

## 评估维度

读取 `analysis` 后，从以下维度评估。**不要把「不是划时代创新」等同于「轻量」——广泛使用的成熟工具/库就是中量起步。**

| 维度 | 轻分量 | 中分量 | 重分量 |
|---|---|---|---|
| 代码体量 | <100 实质代码文件，大量配置/模板 | 100-1000 实质代码文件 | >1000 实质代码文件 |
| 项目定位 | starter/模板/教程 demo/单个示例 | 实用工具/库/框架/应用（被真实使用） | 基础设施级/品类定义级/广泛影响 |
| 使用广泛度 | 个人/学习用 | 有真实用户社区 | 行业标准/生态核心 |
| 情感密度 | README 只讲用法 | 有设计理念/changelog/社区 | 有强设计哲学+丰富历史+理念阐述 |
| 历史厚度 | 新项目/少提交 | 多版本演进 | 长期演进/多作者/丰富历史 |

**判定规则（取主导维度，不是全要满足）：**

- 满足「中分量」任一行的项目，**至少是中量**——不要因为「它没重新定义品类」就压到轻量。
- 一个被广泛使用的成熟工具（如高性能缓存框架、web 服务器、命令行搜索工具），即使没有「原创哲学」，也是**中量起步**。
- 只有**真正的空壳/模板/教程**才是轻量。

**典型例子校准：**

- **light**：前端 starter 模板（空壳）、单个游戏 demo、脚手架默认输出
- **medium**：CLI 框架、Rust+WASM 打包工具、Markdown 编辑器、命令行搜索工具、web 服务器、内存数据库
- **heavy**：Linux 内核、Kubernetes、React 框架本身、有强神话级设计哲学的项目

## 输出

输出 `projectWeight`：`light` | `medium` | `heavy`。

建议写入 `sourceSignals.supportingSignals`（如 `"projectWeight: medium"`）或工作记忆，供 Guardian 复核。

## conceptWeight（戏剧分量）

设计侧用 **conceptWeight** 描述世界+角色的戏剧强度（不必单独落盘字段，体现在 world / occupation / relationship 等）：

| conceptWeight | 含义 | 示例方向 |
|---|---|---|
| **grounded** | 日常、轻盈 | 一间工位、普通居民、见习生 |
| **elevated** | 轻度象征 | 有手艺的匠人、有性格的守护者、小型世界规则 |
| **high** | 高概念 / 神话级 | 阈界守门人、神话信使、完整魔法/史诗体系 |

## 错配定义（唯一 · SSOT）

| 情况 | 是否错配 | 动作 |
|---|---|---|
| **`projectWeight=light` 且 `conceptWeight=high`** | ✅ **是** | 必须降低 conceptWeight 到 grounded 或 elevated |
| light + grounded / elevated | 否 | 默认正确方向 |
| **medium / heavy + grounded（轻松世界/日常角色）** | 否 | **允许**，不算错配 |
| medium / heavy + elevated / high | 否 | 允许 |

**一句话：只拦「小项目装神话」；中型/重型项目可以随意配轻松世界观。**

### 预算映射

| projectWeight | conceptWeight 允许 |
|---|---|
| light | grounded、elevated；**禁止 high** |
| medium | grounded、elevated、high |
| heavy | grounded、elevated、high |

### 自检（世界架构师 / Guardian）

> 若项目是 light：世界法则与角色是否已经神话化/史诗化到 high？若是 → 错配，降级。

**不要**把「medium 项目用了日常角色」或「heavy 项目用了轻盈世界」判为错配。
