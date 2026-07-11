# analysis / persona / README 数据映射

## analysis 数据使用指南

analysis 是页面文案的**主要数据源**。读取以下字段：

| analysis 字段 | 页面用途 |
|---|---|
| `context.basic.project_name` | navbar brand、title、hero headline |
| `context.basic.total_files` / `total_lines` | stats items |
| `context.basic.first_commit_date` | stats 或 footer 版权年份 |
| `context.basic.readme_exists` | 如果有 README，读取它的内容提取 features |
| `context.tech_stack.languages` | stats（如 "TypeScript 107 files"）或 features |
| `context.tech_stack.frameworks` | features items |
| `context.tech_stack.package_manager` | features 或 stats |
| `context.inventory.docs` | navbar 链接（文档地址） |
| `context.inventory.tests` | stats（测试数量） |
| `preAnalysis.summary` | hero subheadline 或 description |
| `preAnalysis.project_category` | 判断页面风格（creative_tool→playful, dev_tool→modern/minimal） |
| `abstract.dimensions` | features items 的灵感来源（code_style, architecture 等） |
| `abstract.overall_impression` | hero subheadline 候选 |

### README 提取

如果 `context.basic.readme_exists` 为 true，**必须读取项目根目录的 README.md**：
- 从 README 的第一个 `##` 标题提取 features
- 从 README 的安装/使用部分提取 CTA 文案
- 从 README 的架构图/表格提取 stats 或 features


## persona 的正确使用方式

persona 为页面提供**视觉品牌**，不是页面内容：

| persona 字段 | 页面用途 |
|---|---|
| `mainColor` / `secondaryColor` / `accentColors` | theme 配色 |
| `name` | 可以作为 footer 的 brand（但 navbar brand 用项目名） |
| `catchphrase` | 可以作为 CTA 区的点缀文案（不是 hero headline） |
| `visualPatterns` | section 背景、边框纹样、暗纹素材方向 |
| `backgroundDesign` | hero / gallery / footer 背景方向 |
| `decorativeMotifs` | 小型 UI 装饰、divider、badge、icon 灵感 |
| `pageTheme` | 页面整体气质、排版、配色使用规则 |
| `assetUsageGuidelines` | 哪些 order 资产适合 hero、gallery、icon、pattern |
| `characterFlaws` / `hobbies` / `backstory` | **不用于页面文案** |
