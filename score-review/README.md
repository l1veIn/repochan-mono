# RepoChan Score Review

本地 Web 工具：加载 monorepo `test-results/` 下的 `test-*` 批量测试归档，逐张浏览 order 图片，对照提示词 / persona / 项目信息打分与写评论。

评分实时写入归档目录内的 `scores.json`，关闭后重开会自动续评。

## 启动

```bash
cd score-review
npm install
npm start
```

浏览器打开：**http://localhost:3847**

开发模式（文件变更自动重启）：

```bash
npm run dev
```

可通过环境变量改端口：`PORT=4000 npm start`。

## 使用

1. 首页选择一个 `test-*` 归档（如 `test-results/test-repos-archive-20260711-round5`）。
2. 左侧看图，右侧打分（1–10）+ 评论；切换 **提示词 / Order / Persona / 项目 / 队列** 标签查看上下文。
3. 分数与评论约 400ms 自动保存；顶栏显示「已保存」。
4. **下一张 / 上一张** 或键盘切换；**下一个未评** 跳过已评条目。
5. 中途关闭再打开 → 回到上次 `currentIndex`，已评内容可改评覆盖。

### 快捷键

| 键 | 作用 |
|----|------|
| `A` / `←` | 上一张 |
| `D` / `→` | 下一张 |
| `1`–`9` | 打 1–9 分 |
| `0` | 打 10 分 |

（在评论框输入时快捷键不生效；图片放大预览打开时由 Viewer.js 接管快捷键。）

### 图片放大（Viewer.js）

点击左侧预览图打开全屏查看器：

- **滚轮** 缩放，**拖动** 平移
- 工具栏：1:1、复位、旋转、翻转
- 多图 order 可在查看器内前后切换
- **Esc** 或点遮罩关闭

## 数据

### 扫描范围

- monorepo 下 `test-results/` 内以 `test-` 开头的文件夹
- 兼容两种布局：
  - 新：`{project}/orders|persona|analysis/`
  - 旧：`{project}/.repochan/orders|persona|analysis/`
- 仅展示**有图片**的 order（无版本图的 order 会跳过）

### `scores.json`

写在归档根目录，例如：

```
test-results/test-repos-archive-20260711-round5/scores.json
```

```json
{
  "schemaVersion": "repochan.score-review.v1",
  "archive": "test-repos-archive-20260711-round5",
  "updatedAt": "…",
  "currentIndex": 12,
  "scores": {
    "redis/ord-foundation-001": {
      "score": 8,
      "comment": "…",
      "rater": "yang",
      "ratedAt": "…"
    }
  }
}
```

- key：`{project}/{orderId}`
- 可与朋友合并：手工合并 `scores` 对象，或分目录各评一份

> `test-results/` 在 monorepo `.gitignore` 中，评分文件默认不会进 git。

## 技术

- Express 静态站点 + 本地 API（无构建步骤）
- 依赖：仅 `express`
