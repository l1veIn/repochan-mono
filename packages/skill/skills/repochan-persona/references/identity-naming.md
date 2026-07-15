# 身份与命名

### 语言字段不是创作身份

仓库吉祥物没有母语字段。命名、服装、道具、文化、世界时代感与视觉母题只能来自产品身份、用户明确要求或已批准的视觉锚点，不能从文档语言推导。

`rolePrompt` **始终是英文**，因为图像生成模型以这种方式消费效果最好。

### 叙事字段语言（中文优先）

叙事字段（`nameZh`、`appearance`、`hairColor`、`eyeColor`、`outfit`、`accessories`、`keyMotifs`、`signaturePose`、`signatureAction`、`signaturePatterns`、`signatureScenes`、`designNotes`、`personality`、`backstory`、`hobbies`、`characterFlaws`、`catchphrase`、`world.*` 等）的语言按以下优先级决定：

1. **用户显式请求的语言**（访谈/会话中明确要求）——最高优先级。
2. **仓库文档语言**——读取 `analysis` 里的文档/README 语言信号。**中文仓库 → 叙事字段必须用中文**（`name` 仍可英文/拼音用于 rolePrompt，但 `nameZh` 必填且用汉字）。
3. 当前对话语言——仅当前两者都无信号时使用。

**中文仓库判定**：README 主语言为中文、或 `analysis.context.identity.namingSeeds` 含显著中文术语、或用户用中文对话时，视为中文项目，叙事字段必须中文。

**例外**：`rolePrompt`、`character_book`、`mes_example` 中的英文 tag 按 image-gen 需求保留英文。`mainColor`/`secondaryColor`/`accentColors` 是 hex 值，与语言无关。

Consistency Guardian 必须检查：中文仓库的叙事字段是否真的用了中文。英文叙事字段出现在中文仓库中视为缺陷。

### 命名来源优先级

角色名字源自仓库身份，而非文档语言：

1. 用户在访谈/会话中明确的命名请求。
2. `analysis.context.identity.namingSeeds.primary` —— 仓库名、包名、产品名。
3. `analysis.context.identity.namingSeeds.secondary` —— README 标题术语和领域词汇。
4. 来自 `preAnalysis`、`abstract`、模块名或 README 标语的项目专属概念。
5. 创意团队判断。

避免文化分桶选择，如"中文名/日文名/西文名"，除非用户明确要求。优先采用仓库名和领域的变形：缩写、吉祥物昵称、头衔 + 短名、谐音梗、语音融合或概念衍生称号。

### 视觉身份来源优先级

角色的视觉风格、文化母题和审美时代感来自：

1. 用户明确的风格偏好（访谈 `preferences` / `keyConstraints`，或会话指示）
2. 项目的创作信号（仓库/产品名、技术栈、产品类别、README 基调、配色、抽象维度）
3. 创意团队基于上述的判断

**视觉母题来自项目，而非语言刻板印象。** 中文 README 不意味着毛笔；英文 README 不意味着羽毛笔；日文 README 不意味着和服或神社。

人设 schema 中没有 `language` 或 `nativeLanguage` 字段。不要写它们。
