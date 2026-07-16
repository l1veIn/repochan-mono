# analysis / persona / README 数据映射

## CLI 自动投影

`repochan starter configure` 负责机械字段映射：

| 来源 | `repochan/site.json` |
|---|---|
| analysis 项目名 | `project.name` |
| analysis summary | `project.description` |
| analysis repository URL | `project.repositoryUrl` |
| `persona.mainColor` | `theme.primary` |
| `persona.secondaryColor` | `theme.base` |
| `persona.accentColors[]` | `theme.accents[]` |
| persona palette 中与 `theme.base` 对比度最高的颜色 | `theme.ink` |
| `persona.artStyle` | `brand.artStyle` |
| `persona.keyMotifs` | `brand.motifs` |
| `persona.signaturePatterns` | `brand.patterns` |

`theme.ink` 是 CLI/Core 自动派生的可读前景色，Starter 用它承载正文、深色 section 和按钮文字；不要让 Page Designer 手工重排色板。不要手工复制这些字段，也不要修改 `src/lib/site.ts`。

## Agent 创作字段

Locale content 的 headline、body、CTA、卖点排序、标签和翻译需要内容判断：

- analysis summary 用于理解项目定位，不要直接当最终 headline。
- README 的功能、安装和使用章节是项目文案的主要事实来源。
- persona 提供视觉语气；`catchphrase` 只能做点缀，不能取代项目价值。
- `characterFlaws`、`hobbies`、`backstory` 不进入项目功能文案。

每份内容使用 `repochan.starter-content.v1` envelope，并与对应 source locale 保持完整结构一致：键、值类型和数组长度都不能漂移。通过 `starter configure --content-file ... --overwrite` 写入。
