# Skill Progressive Disclosure 拆分计划

> 日期：2026-07-11  
> 目标：所有 RepoChan skills 统一采用 L1 metadata / L2 精炼 body / L3 references 架构。  
> 原则：**不丢信息**——细节原文进 `references/`，body 只保留触发、硬规则、可执行主流程与按需链接。  
> 权威源：`packages/skill/skills/*`；完成后同步 `~/.claude/skills/*`。

## 现状盘点

| Skill | 行数 | 判定 | 说明 |
|---|---:|---|---|
| **repochan-persona** | 234 + 8 refs | ✅ 已完成 | 本次重构基准范本 |
| **repochan-painter** | **678** | 🔴 必须拆 | 最大 smell：prompt 方法论 + 多工作流 + 长示例全塞 body |
| **repochan-page-designer** | **330** | 🟠 应拆 | 数据映射表 + 两阶段细节 + 陷阱清单可分层 |
| **repochan-interviewer** | **319** | 🟠 应拆 | 8 维问题目录 + schema/示例可分层 |
| **repochan-art-director** | 205 | 🟡 轻拆 | 主流程可留 body；海报选型 + 长示例进 refs |
| **repochan-analysis** | 127 | ⚪ 不拆 | 已足够短；仅 polish description / 可读性 |
| **repochan**（wizard） | 130 | ⚪ 不拆 | 编排索引；refs 拆完后更新团队索引链接即可 |

**阈值**：≥500 行必拆；300–500 建议拆；200–300 按“是否杂糅”决定；&lt;150 保持单体。

## 统一 body 模板（所有待拆 skill）

```markdown
---
name / description（含触发词 + 场景 + 不触发场景）
---
# 角色
## 核心原则（≤1 屏）
## 执行前检查
## 主工作流（步骤清单 + 关键 CLI）
## 关键硬规则 checklist（指向 references）
## 协议/输出要点（保存路径、必填字段）
## references 索引表
```

每个阶段显式写「读取 `references/xxx.md`」，避免 agent 凭记忆跳过细节。

---

## 1. repochan-painter（优先 · 最大）

**目标 body**：~220–280 行  
**保留在 body**：
- 角色定义、引用锚定原则、执行前检查
- 引用解析流程主步骤（1–4 摘要 + 精简 prompt 口诀）
- 强制 `repochan image gen`、安全约束摘要
- 协议保存硬规则（尤其 `generationPrompt`）
- Prompt 来源优先级（5 条）
- 边界情况决策树（短）

**`references/` 拆分**：

| 文件 | 迁入内容（原文） | 约略行 |
|---|---|---:|
| `workflows-review.md` | 自动创建 review + verdict + review 回流图生图 | ~100 |
| `workflows-candidate.md` | 候选态多方案 | ~55 |
| `prompt-assembly.md` | 模板插槽填充、无 template 兼容路径、slot 表 | ~55 |
| `prompt-methodology.md` | Avoid→positive、Identity boundary、中英混排、Pose 单手聚焦、Adjective precision | ~110 |
| `asset-type-guides.md` | poster / chibi / readme_banner / foundation_sheet 特殊引导 | ~40 |
| `output-and-save.md` | 输出规格解析 + 协议保存规则 + 解剖学自检 | ~90 |
| `examples.md` | 设定集 / 下游 / review 三套示例流程 | ~100 |
| `safety-and-mindset.md` | 约稿 mindset、禁止劫持项目、内置安全全文 | ~35 |

**硬规则仍摘要进 body checklist**（完整条文在 refs）：有 ref 不重述外形、resolve 失败必停、generationPrompt 强制、constraints 不削弱、单手聚焦防三只手。

---

## 2. repochan-page-designer

**目标 body**：~160–200 行  
**保留在 body**：
- 角色定义、「项目主页不是角色页」原则
- 内容优先级 + 绝对不要
- 两阶段工作流步骤清单（Phase1/2 步骤名 + 关键 CLI）
- 最低可生成条件
- 检查点（`page.check_assets`）

**`references/`**：

| 文件 | 内容 |
|---|---|
| `data-mapping.md` | analysis 字段表、README 提取、persona 字段用途表 |
| `asset-rules.md` | 角色素材正确/错误用途、section 图片要求、充分性判定 |
| `phase1-content.md` | Phase 1 步骤 1–5 全文 + order 创建示例 |
| `phase2-assemble.md` | Phase 2 步骤 6–10、theme style、i18n/assets 路径 |
| `copy-and-structure.md` | 文案原则、页面结构决策表、常见陷阱 |

---

## 3. repochan-interviewer

**目标 body**：~140–180 行  
**保留在 body**：
- 角色、定位、可选性
- 执行前检查 + 跳过规则
- 工作流总结 8 步
- 提问原则 1 句 + 8 维名称列表（不展开示例）
- 保存 CLI 骨架（create/append）

**`references/`**：

| 文件 | 内容 |
|---|---|
| `question-dimensions.md` | 8 个维度全文（信号来源 + 示例选项）+ 设计规则 |
| `ask-user-question.md` | Schema、调用规则、响应格式映射 |
| `report-schema.md` | 提炼规则、questions/responses 数组格式、kind 映射 |
| `examples.md` | 基于信号的好/坏问题示例 |

---

## 4. repochan-art-director（轻拆）

**目标 body**：~140–160 行  
**保留在 body**：设定集优先、执行前检查、工作流 3 步、消费/产出、哲学摘要

**`references/`**：

| 文件 | 内容 |
|---|---|
| `poster-template-selection.md` | 海报模板选择指导 |
| `order-craft.md` | 简报描述纪律、身份边界、设定集封面内容指南 |
| `edge-cases.md` | 边界情况（无设定集/换风格/修订） |
| `examples.md` | 设定集任务示例 + 下游引用任务示例 |

---

## 5. repochan-analysis / repochan（不拆结构）

| Skill | 动作 |
|---|---|
| **analysis** | 保持单文件；可选：description 补触发词；章节小标题微调 |
| **repochan** wizard | 保持单文件；拆完其他 skill 后更新「团队 skill 索引」说明各 skill 有 references |

---

## 执行顺序

1. ✅ **persona**（已完成，commit `c941c0f`）
2. 🔴 **painter**（最大收益）
3. 🟠 **page-designer**
4. 🟠 **interviewer**
5. 🟡 **art-director**
6. ⚪ **analysis + wizard** polish
7. 同步 `~/.claude/skills/*`（`cp -R` 或 `repochan setup`）
8. 统一 commit

## 验收标准（每个 skill）

- [ ] 关键短语/规则/示例锚点 100% 出现在 body∪references
- [ ] body 行数落入目标区间
- [ ] 主流程每阶段有明确 `references/` 链接
- [ ] description 含触发词
- [ ] monorepo 与 `~/.claude/skills` 一致
- [ ] 无信息删除（允许重组与索引层措辞）

## 不做

- 不改 CLI / core 协议（除非 skill 引用了错误命令——仅修 skill 文本）
- 不在本次混入 templates YAML 内容大改
- 不强制拆 &lt;150 行的 skill

---

## Follow-up（已执行）：asset templates 包归属

**决定**：独立 `@repochan/templates` 纯数据包（`packages/templates/`），不跟 skill、不塞进 CLI `dist`。

| 层 | 包 |
|---|---|
| 方法论 | `@repochan/skill`（markdown only） |
| 加载 / list / get | CLI → `@repochan/templates` + `.repochan/templates/` overlay |
| 协议 | core 只存 `templateId` 字符串 |

理由：官方 ~12 个 YAML 适合版本锁定分发；skill 不再背 runtime 数据；后续 registry 可在不动 skill 的情况下扩展。
