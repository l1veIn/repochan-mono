# 海报模板选择与品牌延伸任务

`poster` 有多个设计方向。把角色视作平面设计系统中的一个元素，而不是默认让角色占满画面。

## 可用海报模板

| 模板 id | 气质 / 关键词（用于匹配 artStyle） |
|---------|-------------------------------------|
| `official/poster-constructivist` | 构成主义、工业、几何秩序、功能主义、斜向构图、红黑白 |
| `official/poster-glitch-art` | 故障美学、glitch、数字失真、霓虹、赛博、波普电子、屏幕感 |
| `official/poster-risograph-pop` | 复古印刷、risograph、温暖亲和、社区、轻量创意、纸感 |
| `official/poster-memphis` | 孟菲斯、撞色、几何装饰、年轻活泼、不对称、高饱和 |
| `official/poster` | **仅**在上面四者都不沾边时的中性 fallback（少用） |

> 不要把「工具型 / 基建 / 开源软件」自动等同于构成主义。开发者工具也可以是 glitch、孟菲斯或 risograph。

## 策展算法（强制顺序）

创建 `poster` 订单时，**按下面三步选 `templateId`**（不要凭喜好或表第一行默认）。

### 1. 读 `persona.artStyle`（主信号）

从 `artStyle` 全文做关键词匹配（中英文、近义都算）：

| artStyle 含… | 优先模板 |
|--------------|----------|
| 构成 / constructivist / 工业几何 / 功能主义 | `poster-constructivist` |
| 故障 / glitch / 赛博 / 霓虹 / 数字波普 / 电子失真 | `poster-glitch-art` |
| 孟菲斯 / memphis / 撞色几何装饰 / 波普活泼 | `poster-memphis` |
| 复古印刷 / risograph / 温暖纸感 / 社区亲和 / 装饰艺术偏暖 | `poster-risograph-pop` |
| 装饰艺术 / Art Deco（无更贴的专用模板时） | 优先 `poster-risograph-pop`，其次 `poster-memphis` |

**匹配成功** → 用该模板，在 order `brief` 或 notes 写一句理由：  
`templateReason: 因 artStyle「…」关键词「…」选 …`

### 2. 无明确关键词 → 项目气质仅作弱提示（禁止默认构成）

仅当 artStyle **完全对不上**上表时，才看项目气质，且 **不得**把「CLI / 中间件 / 系统工具」一律映射到 constructivist：

| 气质 | 可考虑 |
|------|--------|
| 强数字/AI/图形/实时媒体 | glitch-art |
| 文档/编辑器/内容创作、偏亲和 | risograph-pop |
| 设计系统、活泼品牌、Material/活泼 UI | memphis |
| 真正强调工业秩序、斜向构成美学（且 artStyle 也中性） | constructivist |

### 3. 仍无清晰匹配 → 确定性「伪随机」，禁止总选同一条

在  
`poster-constructivist | poster-glitch-art | poster-risograph-pop | poster-memphis`  
四个 **专用** 模板中选一个（**不要**优先 `official/poster`）。

确定性挑法（可复现、跨项目分散）：

1. 取 `orderId` + 项目名（或 `analysis` 的 repo 名）拼成字符串  
2. 对字符 code 求和，对 **4** 取模  
3. 0→constructivist，1→glitch-art，2→risograph-pop，3→memphis  

理由写：`templateReason: artStyle 无明确海报方向，按 orderId hash 选 … 以保持多样性`。

### 禁止

- 因为「工具型仓库」就默认 `poster-constructivist`
- 无理由地连选表第一行
- 忽略 `artStyle` 里已经写明的「孟菲斯 / 故障 / 构成…」

## 品牌延伸任务（signaturePatterns / signatureScenes）

读取 persona（`repochan persona get`）后，若定义了品牌延伸字段，主动提议：

- **`signaturePatterns`**：每个 pattern 生成一个**独立的 1×1 四方连续纹理** order，`assetType: "visual_pattern"` + `templateId: "official/pattern-tile"`（页面背景/边框/社交卡纹理）。每张图独立生成、直接可用，不需要切分。**硬约束见该模板**：单张无缝、出血到边界、四方连续。
- **`signatureScenes`**：1–2 个 `poster` 或背景类任务，brief 引用场景，并按上面策展算法选海报模板。

这些任务**仍须引用 foundation**。不要在缺少设定集引用时创建下游任务，除非用户明确要求无锚点资产。
