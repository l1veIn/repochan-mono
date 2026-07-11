# Phase 2：组装 Astro 页面工程

#### 步骤 6：生成或打开页面工程

```
repochan page generate-project --output-dir repochan-page
```

如果 `repochan-page/` 已存在，不要覆盖；直接读取它的 README、`src/i18n/*.json`、`src/config/*.ts` 和组件结构。

#### 步骤 7：确定 theme

从 persona 提取配色，结合项目类型选 style：

```json
{
  "theme": {
    "primary": "<persona.mainColor>",
    "secondary": "<persona.secondaryColor>",
    "accent": "<persona.accentColors[0]>",
    "background": "#FFFFFF",
    "style": "<根据项目类型选择>",
    "darkMode": false
  }
}
```

style 选择：
- `modern` — 技术项目默认
- `minimal` — 工具类、CLI 项目
- `playful` — 创意类、社区项目
- `techy` — 硬核技术项目
- `elegant` — 品牌展示

将这些信息写入模板的 theme/config 文件，而不是只写 Page JSON。

#### 步骤 8：填充文案

**从 analysis 填充（主要来源）：**
- `title`：`context.basic.project_name` + 简短定位
- `description`：`preAnalysis.summary`
- `hero headline`：项目名 + 核心价值
- `hero subheadline`：`preAnalysis.summary` 或 `abstract.overall_impression`
- `features items`：从 README `##` 标题 + `tech_stack.frameworks` 提炼
- `stats items`：`total_files`、`total_lines`、测试数量、技术栈统计

**从 persona 填充（仅限视觉）：**
- theme 配色
- `footer brand`：persona.name（navbar brand 用项目名）

把文案写入 `src/i18n/zh.json` 和 `src/i18n/en.json`。跟随 README 主语言时，仍保留另一个 locale 的可编辑初稿。

#### 步骤 9：填充资产 manifest

把已交付图片复制到：

```
repochan-page/public/repochan-assets/<orderId>/<versionId>/<file>
```

然后更新 `src/config/assets.ts`。未交付的视觉原型保留为 `status: "pending"`，不要伪造图片结果。

#### 步骤 10：验证

在 `repochan-page/` 内运行：

```
pnpm install
pnpm build
```

检查中英页面、移动端布局、图片 fallback、以及真实图片路径。
