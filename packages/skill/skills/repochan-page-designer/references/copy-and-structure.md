# 文案原则、结构决策与常见陷阱

## 文案撰写原则

1. **hero headline 是项目价值** — 不是角色口号，不是技术术语。如 "把仓库变成看板娘"，不是 "Rael 的相位观测站"。
2. **只写 starter 实际消费的内容** — 不为不存在的 sections 生成备用文案。
3. **CTA 面向项目** — "Star on GitHub"、"查看文档"、"开始使用"。不是 "见见 Rael"。
4. **跟随 README 语言** — 中文 README → 中文文案，英文 README → 英文文案，同时为 manifest 声明的其他 locale 提供可编辑译稿。


## 页面结构决策

Starter 的结构是已选定的设计约束。填充时只做内容适配和 starter 明确暴露的响应式参数调整，不擅自添加未声明 sections。若用户需要不同信息架构，应改选 starter 或转交 `repochan-web-designer`，而不是把 minimal 膨胀成综合模板。


## 常见陷阱

- ❌ 把页面做成角色展示页——这是**项目落地页**，角色只是品牌点缀
- ❌ 在 hero 里放角色设定图——设定图不是 hero illustration
- ❌ features/stats 写角色人设——这些 section 展示**项目**的功能和数据
- ❌ hero headline 用角色口头禅——用项目的价值主张
- ❌ 为了显得完整而给 hero-only starter 添加空泛 sections
- ❌ 把 Starter 的 `source` 角色资产直接当成当前项目定制，或手工伪造 `customized`——这会制造身份错配且不可复现
