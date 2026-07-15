# 人类视觉门禁

以下 Gate 在普通交互流程中由人类决定。只有上层向导已明确进入 yolo 或非交互 CI 时，agent 才可自动选择推荐候选并记录 `auto-approved`；记录必须包含候选、选择理由、自动 QA 和“无人类审美批准”标记，不能伪称 human-approved。

## Gate 1：视觉母版选择（必选）

时机：完整设计稿候选完成、尚未开始大规模拆层和迁移。

给人类看：

- 整页长图，或 Hero/Capabilities/Workflow/CTA 组合板。
- 2–3 个真正不同的方向，不展示大量近似变体。
- 每个方向的一句话设计意图和主要工程风险。
- 研究模式下可附加一个针对明确假设的改进候选，但必须说明它验证了什么，不能把微调数量当成探索质量。

只询问：哪个方向值得实现、哪些关系必须保留、哪些内容不符合项目气质。

不要让人类检查：schema、路径、硬编码颜色、构建结果或字段完整性。

Continuous art direction 将 Gate 1 分成同一生产门禁的两个检查点：

- Gate 1A：选择整页方向、节奏、角色频率与转场语言。
- Gate 1B：查看关键 section 母稿组合板，确认局部设计没有偏离整页方向且 section coverage 完整。

Gate 1B 之前仍不得开始大规模生产资产；Nav/Footer 等明确 HTML-first 区域不要求单独生成母稿。

## Conditional Gate：不可逆分层取舍

只有以下情况触发：

- 准备把 L3 烘焙进图片。
- 某 locale 需要单独图片版本。
- 独立 L2 的 alpha/gutter 质量存在明显缺陷。
- 移动端需要第二套生产图片。
- 视觉忠实度与可访问性/可维护性发生真实冲突。

给出明确推荐、代价和可逆性，不把开放问题丢给用户。

“母版看起来可以抠图”不能跳过此门禁。必须先用专门的 uniform-matte production result 做 alpha QA；母版截图本身不算提取质量证据。

## Gate 2：整页集成验收（必选）

时机：所有 sections 已组装，自动验证与 build 已通过。

给人类看：

- 默认 locale 的桌面整页和关键交互。
- 至少一个窄屏 viewport。
- 其他 locale 中最长文案的代表页面。
- 与 Gate 1 母版的主要差异说明。

让人类判断：视觉节奏、角色出现频率、统一性、内容主次、移动端是否仍像设计，以及具体项目网站是否可以批准交付。

## 自动化先行

进入 Gate 2 前必须自动完成：manifest/config/content/assets validation、硬编码颜色检查、Astro build、链接与键盘基础检查、viewport 溢出检查。自动问题未清零时不消耗人类视觉时间。

Gate 2 截图必须来自 production build/preview，记录 source/build hash、browser/version、viewport、route、locale、motion setting 与截图路径；先排除 dev toolbar、扩展浮层等环境 UI。L4 不能只“看起来像控件”：检查语义、键盘行为、状态变化与 reduced-motion-aware JS。移动端除 overflow 外，还要检查角色脸部/主体、主 CTA、live copy 顺序与碰撞。
