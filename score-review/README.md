# RepoChan Score Review

本地 Web 工具：加载 monorepo `test-results/` 下的 `test-*` 批量测试归档，逐张浏览 order 图片，对照提示词 / persona / 项目信息打分与写评论。

评分保存到归档目录内的 `scores.json`。服务器确认保存后才显示「已保存」，重开可续评。

## 启动

```bash
cd score-review
npm install
npm start
```

浏览器打开：**http://127.0.0.1:3847**。服务只监听本机 IPv4 回环地址。

开发模式（文件变更自动重启）：

```bash
npm run dev
```

可通过环境变量改端口：`PORT=4000 npm start`。

## 使用

1. 首页选择一个 `test-*` 归档（如 `test-results/test-repos-archive-20260711-round5`）。
2. 左侧看图，右侧打分（1–10）+ 评论；切换 **提示词 / Order / Persona / 项目 / 队列** 标签查看上下文。
3. 分数与评论停止修改约 400ms 后自动保存；以顶栏「已保存」为准。保存失败会保留当前输入并阻止切换图片或返回首页，可再次切换来重试。
4. **下一张 / 上一张** 或键盘切换；**下一个未评** 跳过已评条目。
5. 保存后关闭再打开 → 回到上次 `currentIndex`，已评内容可改评覆盖。仍有未保存修改时，关闭页面会提示确认。

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
- 项目采用 `{project}/.repochan/orders|persona|analysis/` 布局
- 仅展示 `order.json.currentVersion` 指向的版本，且 `meta.json` 声明的图片必须存在；不完整的 order 会跳过
- 归档根目录及其内部路径不支持符号链接；图片接口只提供 PNG/JPEG/WebP/GIF/SVG，SVG 直接打开时受沙箱限制

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
- 分数为 1–10 的整数或 `null`，评论和评分人必须为文本。损坏或格式不合法的 `scores.json` 会报告错误，需要先修复，不会静默覆盖成空评分。
- 保存先写同目录临时文件，再替换 `scores.json`；写入失败保留旧文件。单页面的保存按顺序执行；多个页面或评分人同时修改同一条评分仍以最后一次成功保存为准。

> `test-results/` 在 monorepo `.gitignore` 中，评分文件默认不会进 git。

## 技术

- Express 静态站点 + 本地 API（无构建步骤）
- 依赖：`express`、`viewerjs`
- API 检查本机 Host；浏览器写请求的 Origin 必须与本机服务地址一致。工具用于本机人工评分，不提供远程共享服务。

```bash
npm test
```

测试使用系统临时目录内自建的归档，覆盖真实 HTTP 读写、路径检查、写入失败和前端保存竞态，不修改已有评分数据。
