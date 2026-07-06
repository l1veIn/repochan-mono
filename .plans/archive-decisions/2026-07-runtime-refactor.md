# 归档决策：runtime refactor attempt（2026-07）

> 状态：ARCHIVED — 不复活，不参考，除非满足下方"重新捡起的前提"

## 背景

2026-07-05 ~ 07-06 做了一次 4 层架构重构尝试，在 `refactor/runtime-package` 分支上 7 个提交：

1. 新建 `@repochan/runtime` 包，从 core 硬切下沉实体 CRUD + validation
2. stale 传播（反向依赖图 + markStale，级联到 review/revision/promote）
3. config 模块（全局 + 项目 YAML 合并）
4. task 系统 + ImageProvider 接口 + image-gen-pi adapter
5. 4 层文档更新（AGENTS.md / ARCHITECTURE.md / 各 README）
6. runtime 升级设计文档（计划进一步升级为"真运行时"）
7. 标记升级为 WON'T DO

代码全部测试通过（121/121 绿），但**决定整体归档**。

## 归档理由

### 1. 6 包 monorepo 对零用户库是过度结构

RepoChan 此时尚未发布、零外部用户、单人维护。core 和 runtime 一起发版、依赖链相同、无独立 contributor。包拆分的正当理由（独立团队、独立发版、不同依赖图）三条都不沾。**目录边界（`core/entities/`、`core/task/`）能表达同样的模块性，零包管理负担。**

### 2. `runtime` 名字承诺了它不提供的能力

业内"runtime 包"的标准：Executor/Scheduler、Context、Lifecycle（start/stop）、State Recovery、隔离性、IPC。当前实现是纯库（同步函数集合 + 磁盘持久化），不满足任何一条。开源发布时用户会带错误期待来理解这个名字。

### 3. task 系统无用户场景

RepoChan 是单人本地创意工具，工作单元是"一张图 ~5 分钟"。task 系统（异步调度、状态机、provider 注入）解决的"批量并发任务"场景在当前定位下大概率永不出现。这是 solution looking for a problem。

### 4. 升级为"真运行时"也被否决

考虑过补全后台 worker、文件锁、生命周期 API、崩溃恢复（设计文档在归档分支的 `.plans/runtime-upgrade/DESIGN.md`）。否决理由同上——解决的是不会发生的并发场景（同项目多 painter 并行、长任务断点续传）。

## 归档方式

- 分支 `refactor/runtime-package` 保留在本地（不删除）
- tag `archive/runtime-refactor-attempt` 标记归档点
- 未来需要参考代码时：`git checkout archive/runtime-refactor-attempt` 或 `git log archive/runtime-refactor-attempt`

## 重新捡起的前提

任何一条满足才考虑复活部分代码：

1. **stale 传播真被需要**：用户报告"改了 foundation 后下游 order 的旧图还在用，造成不一致"。此时把 stale 逻辑（~250 行）重写进 `packages/core/src/stale/`。
2. **config 模块真被需要**：用户需要项目级配置覆盖（如某个项目想锁死语言为中文）。此时把 config 逻辑（~140 行）重写进 `packages/core/src/config/`。
3. **task 系统真被需要**：用户要 CI 批量生成、daemon 化、多客户端共享 `.repochan/`。此时参考归档代码（~600 行）重新实现。

**注意**：即使复活 stale/config，也**不复活 runtime 包结构**——直接写进 core，维持 5 包结构。

## 不复活的部分（永久）

- `@repochan/runtime` 包结构（包拆分本身）
- 4 层架构文档（AGENTS.md / ARCHITECTURE.md 的 4 层版本）
- runtime 升级设计（worker / 文件锁 / 生命周期）

## 给下个会话的指示

**不要再讨论 runtime 架构。** 当前 main 的 5 包结构是稳定的基线。下一步工作是产品完整性（page 渲染、资产切片、发布），不是架构演进。如果用户提起"runtime"或"task 系统"，指给他看本文件。
