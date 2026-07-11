# 示例：基于信号的问题设计

假设分析报告显示：
- `preAnalysis.project_category`: "dev_tool"
- `abstract.product_philosophy.score`: 0.85，keywords: ["pragmatic", "minimal"]
- README 语气：简洁、工程化、偶尔幽默

**好问题**（来自具体信号）：

```json
[
  {
    "question": "分析显示这个项目的产品哲学是「实用主义 + 极简」（score=0.85）。角色的性格底色应该偏向哪个方向？",
    "header": "角色基调",
    "options": [
      { "label": "冷静极简 (推荐)", "description": "像终端界面一样的克制气质，话少但精准" },
      { "label": "温暖可靠", "description": "像一个靠谱的搭档，沉稳但不冷漠" },
      { "label": "古怪天才", "description": "偶尔冒出意想不到的幽默，但本质是认真的" }
    ],
    "multiSelect": false
  },
  {
    "question": "分析中的 namingSeeds 显示仓库/产品名包含 ModelCraft，并且核心领域词包括 model、schema、blueprint。角色名字应该如何继承这个仓库身份？",
    "header": "命名来源",
    "options": [
      { "label": "拟人化仓库名 (推荐)", "description": "从 ModelCraft 变形出短名或昵称，让名字一眼能追溯到项目" },
      { "label": "领域概念取名", "description": "从 model / schema / blueprint / graph 等核心概念里提炼名字" },
      { "label": "短名+项目称号", "description": "角色有短名，同时保留 ModelCraft 作为称号或头衔" }
    ],
    "multiSelect": false
  }
]
```

**坏问题**（泛泛，不来自信号）：

```json
[
  {
    "question": "你想要什么风格的角色？",
    "header": "风格",
    "options": [
      { "label": "可爱", "description": "很可爱" },
      { "label": "酷", "description": "很酷" }
    ]
  }
]
```
