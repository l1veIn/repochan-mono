# Prompt 组装：模板插槽

## 来源优先级

当来源冲突时，按此优先级处理：

1. **用户请求 / 明确执行指令**——最高优先级，只要不违反安全约束。
2. **模板**——创作方法与输出规格的权威：`prompt_template` 提供画法骨架，`size`/grid/constraints 提供物理输出要求。
3. **任务**——约稿意图、主体、必含元素、避免列表、创作自由度、验收标准。

如果任务与所选模板冲突，遵循模板。示例：
- 如果 `prompt_template` 要求标题，但 `order.brief.avoid` 说“不要文字”，保留模板要求的标题，仅避免额外文字。
- 如果模板的 `size` 是 `1024x1024`，但任务或之前的笔记暗示竖版，仍生成方形。
- 如果模板定义了 grid 或技术 constraints，即使任务简报更宽松或矛盾，也必须保留。

在结果 notes 或 `meta` 中记录实质性冲突，让用户可以审计模板为什么胜出。


## 模板插槽填充（默认路径）

1. 执行 `repochan template get <order.templateId>`，读取完整的 `prompt_template`。
2. 识别其中所有 `{{slot}}`。逐个填充，完成后再次扫描，**最终 prompt 不得残留任何 `{{...}}`**。
3. 结合 persona、analysis、interview 和 order brief 智能创作 slot 值。slot 名是语义提示，不是固定 schema 映射；persona 中没有现成字段时，根据模板 description 和项目上下文创作合适内容，不能把 slot 留空。
4. 将模板 `constraints` 作为原样技术约束附在完整 prompt 末尾。这些约束只服务于切片、抠图等后处理，不要擅自改写或弱化。
5. 应用下文的通用 prompt 方法论：参考图精简、avoid 转正向、动作写法、中英混排、安全和身份边界。将 order 的 `mustInclude`、正向转换后的 brief 和用户明确指令融入最相关的 slot，或作为简短补充块加入。
6. 把填完的精确完整 prompt 传给 `repochan image gen --prompt`，并原样保存为结果的 `generationPrompt`。

常见 slot 的填充来源（是指导，不是机械规则）：

| slot | 常见来源与处理 |
|------|----------------|
| `{{character_visual}}` | `persona.rolePrompt` + hairColor + outfit；有角色参考图时精简为一句身份提示 |
| `{{color_palette}}` | persona 主色、辅色、点缀色及 hex 值 |
| `{{key_motifs}}` | persona.keyMotifs，筛成与当前资产相关的 2-4 个符号 |
| `{{character_name}}` | persona.name；anime/manga 可连同 nameJa |
| `{{repo_name}}` | analysis 报告中的仓库名或正式展示名 |
| `{{signature_scene}}` | persona.signatureScenes；没有现成值时结合项目气质和模板风格创作 |
| `{{pattern_concepts}}` | persona.signaturePatterns，结合网页/品牌使用场景精炼 |
| 其他自定义 slot | 根据模板 description、analysis、interview 和 order brief 判断 |

插槽填充不是字符串字段搬运。每个值要在模板句子里语法通顺、视觉上具体，并与相邻内容共同形成完整设计描述。
