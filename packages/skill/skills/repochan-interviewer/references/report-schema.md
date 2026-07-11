# 访谈报告提炼与记录格式

## 提炼访谈报告

收集所有回答后，用你自己的判断力提炼出四个字段：

1. **summary**：一段话概括用户的整体意图。不是回答的罗列，而是你理解后的综合判断。
   - 示例：「用户希望角色是一个日常普通级的沉稳图书管理员气质，面向开发者社区做品牌吉祥物，视觉走极简和风路线，避免任何萌系夸张元素。用户提到喜欢薇尔莉特那种「不懂情感但努力理解」的认真感，但这个角色应该更接地气、更日常。」

2. **keyConstraints**（硬约束）：用户明确表达的必须遵守的条件。
   - 示例：「角色外观年龄不低于 20 岁」「必须使用冷色调主色」「不能有动物耳朵等萌系元素」「角色重量感必须为日常普通级」

3. **preferences**（软约束）：用户表达的偏好，尽量满足但不是硬性要求。
   - 示例：「偏好渐变发色」「如果可能的话加入一些与版本控制相关的视觉母题」「用户喜欢薇尔莉特的认真负责特质——可吸收此性格方向但不要复制角色」「世界复杂度倾向于弱规则/纯氛围」

4. **avoidList**（禁止清单）：用户明确说不要的东西。
   - 示例：「不要赛博朋克风格」「不要任何代码/终端相关的视觉符号」「不要过于性感的服装」「不要高概念/救世主类型的角色」

### 提炼规则

- 只把用户**明确表达**的东西放进 keyConstraints 和 avoidList。不要自己推测硬约束。
- preferences 可以包含你从回答中合理推断的软偏好。
- summary 必须覆盖所有关键回答，不能遗漏用户明确说过的方向。


## 构建问题与响应记录

你需要把 ask_user_question 的问题和回答转换成 interview 报告的 `questions` 和 `responses` 数组。

### questions 数组

每个问题记录为：

```json
{
  "id": "q1-tone",
  "question": "原始问题文本？",
  "header": "角色基调",
  "category": "tone",
  "rationale": "README 语气偏工程化，abstract.product_philosophy score=0.8 显示项目重视实用主义",
  "options": [
    { "label": "沉稳专业", "description": "像图书管理员一样的冷静气质" },
    { "label": "活泼热情", "description": "..." }
  ],
  "multiSelect": false,
  "optional": true
}
```

### responses 数组

每个回答记录为：

```json
{
  "questionId": "q1-tone",
  "kind": "option",
  "answer": "沉稳专业",
  "selected": null,
  "notes": null
}
```

映射规则：
- ask_user_question `kind: "option"` → interview `kind: "option"`，`answer` = 选项 label
- ask_user_question `kind: "custom"` → interview `kind: "custom"`，`answer` = 输入文本
- ask_user_question `kind: "multi"` → interview `kind: "multi"`，`answer: null`，`selected` = 标签数组
- ask_user_question `kind: "chat"` → interview `kind: "skipped"`，`answer: null`
- ask_user_question `cancelled: true` → 所有未回答问题记为 `kind: "skipped"`


## 保存访谈报告

### 首次创建

```
repochan interview create <<'EOF'
{
  "questions": [...],
  "responses": [...],
  "summary": "用户意图概括...",
  "keyConstraints": ["硬约束1", "硬约束2"],
  "preferences": ["软偏好1", "软偏好2"],
  "avoidList": ["禁止项1", "禁止项2"]
}
EOF
```

### 续写（追加问答轮次）

如果用户选择在现有基础上补充：

```
repochan interview append <<'EOF'
{
  "questions": [新问题...],
  "responses": [新回答...],
  "summary": "更新后的综合概括",
  "keyConstraints": ["更新后的硬约束1"],
  "preferences": ["更新后的软偏好1"],
  "avoidList": ["更新后的禁止项1"]
}
EOF
```

`interview.append` 会：
- 追加新的 questions 和 responses 到现有数组
- **替换** summary、keyConstraints、preferences、avoidList（所以你必须重新提炼包含新旧所有回答的综合版本）
- 归档追加前的状态到 versions/
