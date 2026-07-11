# 使用 ask_user_question 工具

`ask_user_question` 工具来自 `@juicesharp/rpiv-ask-user-question` 扩展。

### Schema

```json
{
  "questions": [
    {
      "question": "完整的问题文本，以「？」结尾",
      "header": "短标签（≤16字符）",
      "options": [
        { "label": "选项A（1-5词，≤60字符）", "description": "这个选项意味着什么" },
        { "label": "选项B", "description": "..." }
      ],
      "multiSelect": false
    }
  ]
}
```

### 调用规则

- **每次调用最多 4 个问题**。如果你设计了 8 个问题，分两批调用。
- 每个问题 **2-4 个选项**。用户总是可以自由输入（「Type something.」行自动追加）。
- 如果推荐某个选项，把它放在第一位并在 label 后加「(推荐)」。
- **不要连续发起多次 ask_user_question**。把一批问题问完，等回答，再问下一批。
- `multiSelect: true` 用于多选场景（如「你希望角色包含哪些视觉元素？」）。多选时自由文本行会被抑制。

### 响应格式

工具返回的 `details.answers` 是一个数组，每个元素：

```json
{
  "questionIndex": 0,
  "question": "原始问题文本",
  "kind": "option",          // "option" | "custom" | "chat" | "multi"
  "answer": "选项的label",    // 选项选中时是label，自定义时是输入文本，multi时为null
  "selected": ["标签1", "标签2"],  // 仅multi类型
  "notes": "用户备注"          // 可选
}
```

- `kind: "option"` → 用户选了预设选项
- `kind: "custom"` → 用户自由输入了文本
- `kind: "multi"` → 用户多选了若干选项
- `kind: "chat"` → 用户想放弃问卷转而自由聊天，视为跳过
- `cancelled: true` → 用户取消了整个问卷，视为全部跳过
