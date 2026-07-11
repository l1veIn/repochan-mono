# Persona Skill 逻辑统一大纲（v3 设计）

> 日期：2026-07-11  
> 范围：只改 skill 文案结构与规则语义，不强制改 core schema（可选 `projectWeight` 落盘另议）。  
> 触发：错配定义收敛 + 多处规则拉扯整理。

---

## 0. 产品裁决（已定）

### 0.1 分量错配（唯一硬错配）

| 情况 | 是否错配 | 动作 |
|---|---|---|
| **light 项目** + **重概念世界/高概念角色**（神话、阈界、史诗守门人、完整魔法体系等） | ✅ **是** | 必须降级世界/角色戏剧分量 |
| light 项目 + 日常/轻盈世界与角色 | 否 | 默认正确方向 |
| **medium / heavy** + 轻盈世界/日常角色 | 否 | **允许**，不算错配 |
| medium / heavy + 高概念 | 否 | 允许（仍受气质贴合、用户约束、反过拟合约束） |

**删除/改写的旧规则：**

- ❌「重项目配薄世界也是错配」
- ❌「工业级工具不要过轻」作为硬错误
- ❌ Guardian「双向升降 worldWeight」
- ❌ checklist「轻不配神话 **且** 工业级不要过轻」

**保留的评估动机：**  
`projectWeight` 仍要评 light/medium/heavy——**只为给 light 加上天花板**，不是给 medium/heavy 规定「必须够重」。

### 0.2 全局优先级（死序，全文只这一处）

从高到低；低优先级不得覆盖高优先级。

1. **安全与产品定位**（年龄/CSAM/gore/仇恨；默认仓库娘女性）  
2. **用户硬约束** `keyConstraints` + `avoidList` + 会话显式指令  
3. **分量天花板**（仅 light：禁止重概念）  
4. **仓库灵魂贴合**（气质、信号、防机械映射、防语言→审美泄漏）  
5. **用户软偏好** `preferences`  
6. **反模板 / 多样性**（避免档案走廊、安静精确、工装靴默认——**建议不是硬天花板**）

**冲突处理：**

- 2 vs 3：用户硬要 light 项目上高概念 → **停下来问用户**，不要静默压、也不要静默放。  
- 2 vs 4：用户硬约束胜；在 `userIntentSummary` 记录覆盖了哪些仓库信号。  
- 4 vs 6：贴合胜；允许「贴合但和其他项目有点像」。  
- 旧句「仓库 vs 用户意图冲突时保护仓库」→ **作废**，改为服从优先级 2。

---

## 1. 概念词典（全文统一用词）

| 术语 | 含义 | 落盘 |
|---|---|---|
| **projectWeight** | 项目客观分量：`light` \| `medium` \| `heavy` | 建议写入 `sourceSignals.supportingSignals` 或可选字段；工作记忆至少保留 |
| **conceptWeight** | 世界+角色的戏剧分量：`grounded`（日常/轻盈）\| `elevated`（轻度象征）\| `high`（高概念/神话级） | 不强制独立字段；体现在 world.coreRule / occupation / relationship |
| **错配 (mismatch)** | **仅** `projectWeight=light` ∧ `conceptWeight=high` | Guardian 必查 |
| **气质贴合** | 角色/世界是否来自仓库真实信号 | 软硬之间：违反则 flag，但是否改取决于优先级 |
| **反模板** | 避免跨项目塌缩到同一套默认 | 优先级 6 |

不再使用含糊的 `worldWeight` 作为独立术语；修正动作说「降低 conceptWeight」。

---

## 2. 逻辑分层（agent 心智模型）

```
┌─────────────────────────────────────────────────────────┐
│  Layer A · 输入                                          │
│  analysis + (optional) interview + session hints         │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Layer B · 预算                                          │
│  评定 projectWeight                                      │
│  若 light → conceptWeight 上限 = grounded | elevated     │
│  若 medium/heavy → conceptWeight 自由（含 high）         │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Layer C · 设计（在预算内）                               │
│  World Architect → Character Designer                    │
│  贴合信号 · 可选反模板 · 用户偏好                         │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Layer D · 审查                                          │
│  Guardian：硬规则 → 错配(light∩high) → 用户约束 → 过拟合  │
│  多样性只作建议项，不因「不够独特」单独打回              │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 大纲：SKILL.md（body，~200 行目标）

```
# RepoChan 创意团队
## 角色一句话
## 默认性别（产品硬规则）
## 规则优先级（§0.2 死序，全文 SSOT 指针）
## 分量与错配（§0.1 摘要 + link project-weight）
## 团队索引表 + references
## 执行前检查
## 协作流程 0–4（每步：读哪个 ref / 产出什么）
## 硬规则 checklist（瘦身，见 §5）
## Schema + rolePrompt
```

**Body checklist 建议只留这些（去重后）：**

1. 优先级死序（链到正文一小节）  
2. **错配仅 light∩high**  
3. 防机械映射 / 非默认仓库管理员  
4. 防语言→审美泄漏  
5. artStyle 必填；rolePrompt 英文；中文仓叙事中文  
6. 安全 + 女性默认  
7. Guardian ≥2 问题；高概念有信号则勿误杀（medium/heavy 或用户要求时）

删除 body 里「工业级不要过轻」「分量匹配优先于多样化」的双向表述。

---

## 4. 大纲：references/（职责单一）

### 4.1 `project-weight.md` —— 唯一的分量 SSOT

```
# 项目分量
## 为什么要评
  只为识别 light，给 conceptWeight 设天花板；
  medium/heavy 不强制「必须配重概念」。
## 评估表（light/medium/heavy 维度）
## 判定规则（中量起步、勿把成熟工具压成 light）
## 例子校准
## 输出
  projectWeight → 后续预算
## 错配定义（唯一）
  light + high concept = 错配
  其他组合均合法
## 与 conceptWeight 的映射
  light    → grounded 或 elevated；禁止 high
  medium   → grounded | elevated | high
  heavy    → grounded | elevated | high
```

### 4.2 `world-architect.md`

```
# 世界架构师
## 输入：projectWeight 预算
## 产出：世界散文 + 视觉风格建议 2–3
## 规模提示（非硬错配）
  light 倾向房间/角落；medium/heavy 可大可小（小也合法）
## 反模板（优先级 6）
  列 2–3 候选原型 + 理由
  优先选「贴合信号」的；
  若贴合候选恰是档案/索引：允许选用，但须在 sourceSignals 说明信号依据
  ❌ 删除「必须与档案模板差异最大」
## 原型菜单（保留表）
## 视觉风格建议交接
```

### 4.3 `character-designer.md`

```
# 角色设计师
## 预算内选择 conceptWeight
## 用户权重（interview）服从优先级 2，受优先级 3 天花板约束
## artStyle 必填
## 多样性引导（优先级 6 · 建议）
  性格/定位/衣着：避免无脑默认，但贴合信号时可保留「安静精确」等
## 品牌延伸 signaturePatterns/Scenes
## 缺点 / 爱好分层
```

### 4.4 `guardian-antioverfit.md`

```
# Guardian
## 审查顺序（对齐优先级死序）
  1. 安全/性别锚点
  2. keyConstraints / avoidList
  3. 错配：仅 light∩high → 要求降 conceptWeight
  4. 防过拟合规则 1–8（机械映射、语言泄漏、视觉模板…）
  5. preferences 尊重度（软）
  6. 多样性：只记录建议，不因不够独特单独 reject
## 高概念合法条件
  medium/heavy，或 light 但仅 elevated 以内，或用户 keyConstraint
  且有仓库信号或用户请求支撑（无支撑的装饰性魔法仍 flag）
## 贴合优先（改写）
  目标：灵魂贴合，不是最大化跨项目差异
  错配定义只引用 project-weight，不重复发明
## 防过拟合全文
## 安全
```

**删除：**  
「贴合优先」里「工业级必须有分量角色」作硬标准；  
「过轻世界也要升级」；  
「当仓库与用户冲突保护仓库」（改优先级 2）。

### 4.5 `interview.md`

```
# 访谈消费
## 字段优先级 keyConstraints > preferences > …
## 维度映射表
## 与 projectWeight 的合成
  用户要 high concept + projectWeight=light
  → 不静默执行；呈现冲突，请用户确认或改约束
## 权重校准（补全动作）
  - 指定日常型但做成世界中心 → 降角色中心性 / 加强「普通居民」站位
  - 指定高概念但缺张力 → 增加戏剧摩擦
  - 指定高概念且 projectWeight=light → 走冲突呈现
  - 未指定 → 按预算与信号选
## 参考角色处理
## 访谈缺失
```

### 4.6 其余 refs（基本不动结构）

- `identity-naming.md` — 命名/叙事语言优先级（已清晰）  
- `workflows.md` — review / candidate  
- `examples.md` — 注明：高概念范例默认对应 medium/heavy 或强信号项目；light 项目勿模仿 high 范例  

---

## 5. 其他拉扯的统一结论

| 拉扯点 | 旧状态 | 新裁决 |
|---|---|---|
| 错配方向 | 双向 | **仅 light∩high** |
| medium/heavy 配轻世界 | 有时被 flag | **合法** |
| 用户权重 vs 仓库 | 「保护仓库」vs「keyConstraint 硬」 | **keyConstraint 硬**；与 light 天花板冲突则 **问用户** |
| 贴合 vs 反雷同 | 两边都像硬规则 | **贴合=4，反模板=6**；档案世界可因强信号保留 |
| 「差异最大」世界选型 | 硬性 | 改为贴合优先 + 反默认建议 |
| medium 能否高概念 | 条文说轻度象征、例子全高概念 | **允许 high**（错配不管它） |
| 安静精确 / 从业者 / 工装 | 强避免 | 降为「无强信号时避免默认」 |
| projectWeight / worldWeight | 双术语 | 只用 projectWeight + conceptWeight |
| Guardian「最重要」 | 双向错配 | 仍重要，但定义收窄为 light∩high |
| 多样性 vs 至少 2 个问题 | 可能用「不够独特」凑数 | 禁止：多样性不足不单独算缺陷 |

---

## 6. 流程时序（与大纲对齐）

```
0 准备
  analysis · interview? · 旧 persona?
  → 评 projectWeight
  → 读用户硬/软约束，预检 light∩用户要 high → 先问

1 世界
  在预算内建世界（light 不写神话法则）
  2–3 原型候选，选贴合者；反模板仅作启发
  附 2–3 视觉风格建议

2 角色
  预算内定 conceptWeight
  artStyle · 视觉 · 品牌延伸 · flaws/hobbies
  防过拟合自检

3 Guardian
  按 §4.4 审查顺序
  ≥2 个具体问题；最多 1 轮

4 落盘
  persona JSON · sourceSignals 含 projectWeight 线索
  userIntentSummary 记录覆盖与冲突处理
```

---

## 7. 实施清单（落地 skill 文案时）

- [x] 重写 `project-weight.md`（SSOT + 单向错配）  
- [x] 改 `guardian-antioverfit.md`（审查顺序、删双向、改用户/仓库冲突）  
- [x] 改 `world-architect.md`（删差异最大；规模提示非硬）  
- [x] 改 `character-designer.md`（预算内选择；多样性降级）  
- [x] 改 `interview.md`（合成规则 + 补全校准动作）  
- [x] 改 `SKILL.md` checklist 与阶段 3 措辞  
- [x] `examples.md` 加 light 勿模仿 high 的注意  
- [ ] ~~同步 `~/.claude/skills/repochan-persona`~~（按用户要求不做）  
- [ ] （可选）schema 增加 optional `projectWeight` 字段  

---

## 8. 一句话

**分量只设天花板、不设地板；错配只抓「小项目装神话」；用户硬约束最高（与天花板冲突则人审）；反模板是润色不是审判。**
