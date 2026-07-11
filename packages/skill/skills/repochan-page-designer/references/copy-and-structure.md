# 文案原则、结构决策与常见陷阱

## 文案撰写原则

1. **hero headline 是项目价值** — 不是角色口号，不是技术术语。如 "把仓库变成看板娘"，不是 "Rael 的相位观测站"。
2. **features 写项目功能** — 从 README 提取，每条 2-3 句，写「为什么这个功能重要」。
3. **stats 展示项目数据** — 文件数、测试数、技术栈。不是角色年龄或生日。
4. **CTA 面向项目** — "Star on GitHub"、"查看文档"、"开始使用"。不是 "见见 Rael"。
5. **跟随 README 语言** — 中文 README → 中文文案，英文 README → 英文文案。


## 页面结构决策指南

| 项目类型 | 推荐 section 组合 |
|---|---|
| 开源工具/库 | navbar → hero(centered) → features(grid-3) → stats(row) → cta(centered) → footer(minimal) |
| 有角色插画的创意项目 | navbar → hero(split-right) → features(grid-3) → stats(row) → cta(centered) → footer(standard) |
| 纯技术框架 | navbar(simple) → hero(centered) → features(grid-2) → cta(centered) → footer(minimal) |
| 有多张角色衍生素材 | navbar → hero(centered) → features(grid-3) → gallery(grid) → cta(banner) → footer(standard) |


## 常见陷阱

- ❌ 把页面做成角色展示页——这是**项目落地页**，角色只是品牌点缀
- ❌ 在 hero 里放角色设定图——设定图不是 hero illustration
- ❌ features/stats 写角色人设——这些 section 展示**项目**的功能和数据
- ❌ hero headline 用角色口头禅——用项目的价值主张
- ❌ section 太多——5-7 个 section 最佳
- ❌ 创建了订单但没等交付就把资产标为 ready——这会制造不可复现的坏页面
