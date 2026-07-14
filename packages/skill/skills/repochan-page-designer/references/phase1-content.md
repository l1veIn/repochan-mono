# 项目分析参考

> 本文件是 SKILL.md 步骤 1（项目分析 + starter 选择）的详细参考。

## 读取项目信息

```
repochan analysis get --json
```

从 analysis 提取：
- 项目名、定位、技术栈
- 项目数据（文件数、测试数等）
- README 内容（如果存在，读取 `<projectRoot>/README.md`）

然后读取 persona 获取视觉品牌：
```
repochan persona get --json
```

persona 提供配色（mainColor、secondaryColor、accentColors）、artStyle、keyMotifs、signaturePatterns——这些驱动 theme 填充和 starter 选择。

字段映射详情 → [data-mapping.md](data-mapping.md)。

## 盘点已有素材

```
repochan order list --json
```

对每个 delivered order，读取 result 了解图片：
```
repochan order get-result ord-xxx --json
```

这一步的目的是知道**哪些资产已经有了**——用于 SKILL.md 步骤 3 的缺口分析。重点检查：
- foundation（设定集）是否存在且 delivered——迁移订单依赖它
- 已有订单的 templateId 和 assetType——用于和 starter.json 的 `assets[].order.templateId` 精确匹配
