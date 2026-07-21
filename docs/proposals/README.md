# 方案目录(Proposals)

本目录存放架构、规模、产品方向类问题的设计方案。每个方案是一个独立的
markdown 文件,讨论范围大于单个 PR。

方案**不是**已承诺的计划。它的作用是在决策尚未关闭时记录推理过程,让后续
贡献者(人或 agent)能看到某条路径**为什么**被采纳或被否决。方案被接受后,
可执行项会毕业为 issue 或 tracked work;文件本身作为决策记录保留。

## 写作约定

- 一个话题一个文件。命名 `<area>-<short-slug>.md`,例如
  `starters-scalability-and-discovery.md`。
- 开头放 Status / Scope / Context 元信息块(沿用 `docs/design/` 的表格格式)。
- 把**诊断**(基于测量的事实)、**选项**(可做的事)、**建议**(将做的事 +
  重新评估的触发条件)三部分分开。
- 涉及代码库的论断要引用真实文件路径和 commit SHA,不空谈。

## 当前方案

本目录目前有三份关于 starters 扩展与发现的方案,来自不同视角,互相补充而非
互斥。读者建议按下列顺序阅读:

### 主方案

- [`starters-catalog-cache-and-text-first-selection.md`](./starters-catalog-cache-and-text-first-selection.md) ——
  最全面的一份。涵盖 catalog schema、内容寻址(digest)tarball cache、
  **text-first agent 选型契约**(关键论点:很多 agent host 看不了图,不能把
  "看 preview"当作默认要求)、可选的 author/official `demo` URL。分阶段
  Phase 0–5,并给出明确的验收标准。**新手先读这份。**

### 补充视角

- [`starters-scalability-and-discovery.md`](./starters-scalability-and-discovery.md) ——
  侧重体量与发现的工程视角。把"呈现问题"(用户怎么看到 starter)和
  "匹配问题"(用户怎么知道哪个合适)刻意分开,并明确**否决实时导航站**这一
  选项。Phase 划分和主方案对齐,可作为体量侧的细化。
- [`reference-shadcn-registry.md`](./reference-shadcn-registry.md) ——
  shadcn/registry 模式的参考拆解。记录哪些设计值得借鉴(顶层 manifest、
  path/content 分离、`registryDependencies` 共享底座),哪些不该抄
  (五种 address 全上、`components.json` 用户侧配置、内联 content 发布)。

## 方案之间的关系

三份方案观察的是同一个压力面(`packages/starters` 扩展 + starter 发现),
但切入点不同:

- 主方案从**协议和数据契约**切入(catalog / digest / fit / text-first)。
- 补充方案从**工程执行和触发条件**切入(体量阈值、loader 性能、导航站否决)。
- shadcn 参考提供**外部类比和借鉴边界**。

它们之间没有矛盾 —— 主方案的 Phase 0–5 和补充方案的 Phase 1–3 在时间线上
对应,措辞差异反映的是讨论发生时的不同阶段。接受任一份时,把两者合并成单一
tracked work 列表即可。
