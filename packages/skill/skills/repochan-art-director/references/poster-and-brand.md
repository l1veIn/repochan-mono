# 海报模板选择与品牌延伸任务

`poster` 当前有多个设计方向。把角色视作平面设计系统中的一个元素，而不是默认让角色占满画面：

| 模板 | 适合的项目气质 |
|------|----------------|
| `official/poster-constructivist` | 工具型、基建型、系统级；强调工业力量和功能主义 |
| `official/poster-glitch-art` | 数字、技术、数据项目；强调电子质感和数字失真 |
| `official/poster-risograph-pop` | 轻量、创意、社区项目；强调复古温暖和亲和力 |
| `official/poster-memphis` | 活泼、年轻、设计感项目；强调撞色、几何和装饰性 |
| `official/poster` | analysis/persona/interview 没有明确设计方向时的通用 fallback |

不要按个人喜好随意挑选。把选择理由落在项目气质、受众或访谈偏好上，并在交付给 Painter 时用一句话说明。

**品牌延伸任务（源自 persona 的 signaturePatterns / signatureScenes）**：读取 persona（`repochan persona get`）后，若它定义了品牌延伸字段，主动为用户提议对应任务：
- 若 persona 有 `signaturePatterns`：为其中 1-2 个关键纹理概念创建 `assetType: "visual_pattern"` + `templateId: "official/pattern-grid-2x2"` 的任务。这些纹理用于页面背景、边框、社交卡片。用 `repochan template get official/pattern-grid-2x2` 查看该模板的画布规格与约束。
- 若 persona 有 `signatureScenes`：为其中 1-2 个关键场景创建 `poster` 或背景类任务，在 brief 里引用对应场景概念，并按上面的策展流程选择具体海报模板。这些用于海报、应用启动画面、主视觉。
- 这些任务**仍需引用设定集封面**（角色一致性），遵循上面的 `references` 规则。

**不要在缺少设定集引用的情况下创建下游任务**，除非用户明确要求一个无锚点的资产。
