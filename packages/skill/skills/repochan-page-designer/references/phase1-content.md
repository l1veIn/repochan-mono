# Phase 1：内容设计 + 资产审计

#### 步骤 1：读取项目信息（首要）

```
repochan analysis get --json
```

从 analysis 提取：
- 项目名、定位、技术栈
- 项目数据（文件数、测试数等）
- README 内容（如果存在，读取 `<projectRoot>/README.md`）

然后读取 persona 获取配色：
```
repochan persona get --json
```

#### 步骤 2：盘点可用素材

```
repochan order list --json
```

对每个 delivered order，读取 result 了解图片：
```
repochan order get-result ord-xxx <versionId> --json
```

#### 步骤 3：设计页面结构

基于项目类型和可用素材，设计 section 结构。

**标准项目落地页（推荐）：**
1. **Navbar** — 项目名 + GitHub 链接 + CTA
2. **Hero** — 项目名 + 一句话定位 + CTA（+ 项目截图或专属插画如果有）
3. **Stats** — 文件数、测试数、技术栈统计
4. **Features** — 从 README 提取的核心功能
5. **CTA** — GitHub Star / 开始使用 / 查看文档
6. **Footer** — 版权 + 链接

**有角色衍生素材时追加：**
7. **Gallery** — chibi、表情差分、衍生插画（不是设定集本身）

#### 步骤 4：资产审计

读取或创建页面工程，并审计 `src/config/assets.ts`：

```
repochan page generate-project --starter constructivist --output-dir .repochan/web-starter
```

- 已交付图片：复制到 `.repochan/web-starter/public/repochan-assets/<orderId>/<versionId>/<file>`，并在 `assets.ts` 标为 `ready`
- 未交付图片：保留 orderId，标为 `pending`，让组件显示 fallback
- 不要把未交付图片写成虚假的 `src`

#### 步骤 5：创建缺失的订单（如果需要）

如果设计了需要图片的 section 但没有合适的素材，创建订单：

```
repochan order create <<'EOF'
{
  "orders": [{
    "orderId": "ord-page-hero-001",
    "requestType": "new_asset",
    "assetType": "hero_illustration",
    "references": [{ "orderId": "ord-foundation-001", "role": "character" }],
    "brief": {
      "intent": "项目落地页 hero 区主视觉——角色以适合网页横幅的方式呈现",
      "mustInclude": ["项目主色调氛围", "适合横幅布局的构图"],
      "avoid": ["文字水印"],
      "composition": "16:9 横幅，角色偏一侧，留白可叠加文字",
      "creativeFreedom": ["光影氛围"]
    },
    "deliverables": [{ "name": "hero-banner", "format": "png", "width": 1200, "height": 800 }],
    "acceptanceCriteria": ["构图适合网页 hero 区"]
  }]
}
EOF
```

请用户批准后，移交 Painter 出图。

**如果不想等出图**，可以直接用 hero centered（无图）或用项目截图。

#### 检查点

审计 `assets.ts`（ready vs pending）确认关键资产就绪后进入 Phase 2。
