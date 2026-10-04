# RepoChan — 把你的仓库变成仓库娘！

让你的 coding agent 为 Git 仓库设计专属看板娘，并生成配套品牌素材。

[English](./README.md) · **中文** · [官网](https://repochan.com)

<p align="center">
  <a href="./docs/assets/readme/foundation.png"><img src="./docs/assets/readme/foundation.png" alt="RepoChan 为自己生成的角色设定封面，包含角色形象、表情、配色、标志配饰和应用图标概念" width="800"></a>
</p>

这是 RepoChan 为自己生成的角色设定封面。你的项目也从一张这样的图开始：根据仓库内容和你的偏好设计角色，再以它为视觉参考，生成风格统一的图标、贴纸、海报和项目网站。

## 开始生成

你需要 **Node.js ≥ 20.9** 和一个 coding agent，例如 Claude Code、Codex、Pi 或 Cursor。

```bash
npm install -g repochan
cd /path/to/your/project
repochan setup --project
```

按提示选择你的 Agent，并配置生图服务。如果跳过了生图配置，在生成图片前运行 `repochan image configure`。

然后在项目里打开你的 coding agent，发送：

> 使用 RepoChan skill，为这个仓库设计专属看板娘。先生成角色设定封面，等我确认后再制作配套素材和网站。

Agent 会先理解项目，与你确认人设，再绘制封面。你可以在这些阶段提出修改，满意后再继续生成配套素材。

## 从这张封面，还能得到什么

下面都是为 RepoChan 生成的真实成果，使用同一个角色。

<table>
  <tr>
    <td align="center" width="50%"><img src="./docs/readme-variants/museum/assets/icon.png" alt="RepoChan 看板娘应用图标" width="128"><br><b>头像与图标</b></td>
    <td align="center" width="50%"><img src="./docs/readme-variants/museum/assets/gallery/stickers.webp" alt="三枚不同表情的 RepoChan 看板娘贴纸" width="320"><br><b>贴纸</b></td>
  </tr>
  <tr>
    <td align="center" width="50%"><img src="./docs/readme-variants/museum/assets/gallery/poster.webp" alt="RepoChan 看板娘在绘画工作台前的海报" width="320"><br><b>海报</b></td>
    <td align="center" width="50%"><a href="./packages/starters/landing-museum"><img src="./docs/readme-variants/museum/assets/gallery/landing-museum.webp" alt="使用 RepoChan 看板娘设计的项目网站" width="320"></a><br><b>项目网站</b></td>
  </tr>
</table>

## 它是怎么工作的

读取仓库 → 设计角色 → 绘制封面 → 扩展素材 → 制作网站。

RepoChan 为你正在使用的 coding agent 提供 skills 和 CLI 工具。角色设定、图片和版本记录保存在项目的 `.repochan/` 目录中，方便以后继续修改。

## 详细文档

- [CLI 使用与生图配置](./packages/cli/README.md)
- [网站模板](./packages/starters/README.md)
- [Skills 与各阶段说明](./packages/skill/README.md)
- [文档导航与贡献指南](./docs/README.md) · [贡献开发](./CONTRIBUTING.md)
- [架构设计](./ARCHITECTURE.md) · [发布指南](./docs/releasing.md)

## 许可证与致谢

[MIT](./LICENSE)。图像处理管线借鉴了 [sprite-gen](https://github.com/aldegad/sprite-gen) 和 [agent-sprite-forge](https://github.com/0x0funky/agent-sprite-forge) 的技术，详见[第三方声明](./packages/image-edit/NOTICE)。
