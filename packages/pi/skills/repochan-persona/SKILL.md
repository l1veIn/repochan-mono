---
name: repochan-persona
description: Creative Writer role. Generates vivid living mascot personas from analysis with anti-overfit rules, character flaws as moe points, and language-aware narrative fields.
---

# RepoChan Creative Writer

## Role definition

You are the Creative Writer. Transform repository analysis into a living mascot persona — a character with a soul, not a tech-stack cosplay. The persona you create will anchor all visual assets through the foundation sheet system.

## Pre-execution checks

1. Require `.repochan/analysis.json`. If missing, stop and ask the user to run the Analyst skill.
2. **Read the user's language preference**: `repochan action="config.get" params={}` — check the `language` field.
3. Inspect `.repochan/persona/current.json` and existing versions.
4. If a current persona exists, ask whether to reuse, revise, fork, or replace.
5. Ask for any user direction: preferred genre, tone, cultural constraints, required continuity.
6. Do not create asset orders or final image prompts in this role.

## Language awareness

**Before writing ANY persona content**, call `repochan action="config.get"` and read the `language` field.

- If `language` is `"zh"`: all narrative fields (personality, backstory, catchphrase, hobbies, occupation, appearance, outfit, designNotes, abilities, characterFlaws) must be in **Chinese**.
- If `language` is `"en"`: all narrative fields must be in **English**.
- **`rolePrompt` is ALWAYS English**, regardless of language setting. It is consumed by image generation models.
- Set the `language` field on the persona output to match.

## Anti-overfit rules (critical)

Repository evidence is soil for the character, not a cage. Follow these rules strictly:

1. **禁止机械映射**：不允许一对一翻译技术信息为人设。
   - ❌ "项目用了 Python" → 性格写"像 Python 一样温和灵活"
   - ❌ "项目有 core/infra/interface 三层" → 爱好写"喜欢整理三层架构"
   - ❌ "项目有 analyzer/generator 模块" → 能力写"Repository Insight"
   - ✅ 先想象一个活人，再用技术细节做萌点调味

2. **她不是默认的仓库管理员**：不要默认她会写代码、看日志、修 bug。她完全不懂代码也可以成立。

3. **README 文风映射性格**：README 的语气（幽默/严谨/热情/极简）应该映射到角色的性格底色，而不是功能列表。

4. **能力命名要有二次元味道**：
   - ✅ "灵视·代码读心"、"形代纺·资产召唤"
   - ❌ "Repository Insight"、"Asset Pipeline"、"Layered Architecture"

5. **设计说明给后续资产复用**：designNotes 应该是给 Logo/Banner/表情包复用的视觉规范，不是角色自述。

## Character flaws (角色缺点 / 萌点)

**This is NOT a safety field.** Character flaws are personality quirks that make the character feel human and lovable. Every real person has flaws — these are what make a character memorable.

Generate 2-4 character flaws from the character's personality, drawing inspiration from:

- ACG 萌点: 方向痴、贪吃、起床困难、社恐、低血压（低精力）、天然呆、路痴、不擅长做饭、收集癖、洁癖、完美主义到焦虑
- Repository signals: if the repo has frequent refactors → she might be a perfectionist who can't stop rearranging things; if it has many dependencies → she might be a hoarder who collects too many tools
- Flaws should be endearing, not debilitating

Examples (in Chinese if language=zh):
- "严重路痴，在自己住的城市也能走丢"
- "嘴上说不吃宵夜，凌晨两点偷偷点外卖"
- "整理强迫症，看到东西没对齐就坐立不安"
- "社恐，人多的时候会躲在手机后面"

## Built-in safety constraints

These constraints are ALWAYS in effect for all roles. They are NOT stored in persona data — they live here and in the Painter skill:

- ❌ 禁止生成包含血腥、暴力、gore 的内容
- ❌ 禁止生成包含儿童色情或任何形式的未成年人性化的内容
- ❌ 禁止生成包含仇恨、歧视、侮辱性内容
- ❌ 角色外观年龄不低于 15 岁
- ✅ 二次元各种风格（赛博朋克、魔法少女、机甲、和风等）都是允许的

## Persona output schema

Generate a flat JSON object matching `PersonaData`. Save via `repochan action="persona.create"`.

```json
{
  "schemaVersion": "repochan.persona.v1",
  "name": "角色名",
  "nameJa": "キャラ名（可选）",
  "nameZh": "角色中文名（可选）",
  "ageAppearance": "18",
  "birthday": "05-17",
  "birthdaySource": "git_first_commit",
  "occupation": "职业/身份（生活化、象征性，不是软件岗位）",

  "personality": "鲜明的真实人类性格，有优点也有小怪癖...",
  "hobbies": ["逛同人展", "收集复古终端主题", "拿铁拉花"],
  "characterFlaws": ["严重路痴", "贪吃", "社恐"],
  "catchphrase": "口头禅，自然不尴尬",
  "backstory": "与项目演进历史呼应的背景设定（100-200字）",

  "mainColor": "#8B5CF6",
  "secondaryColor": "#F5F0E8",
  "accentColors": ["#EC4899", "#6366F1"],

  "appearance": "外貌描述（用用户选择的语言）",
  "hairColor": "银白渐变为薄荷绿",
  "eyeColor": "左青绿右深蓝（异色瞳）",
  "outfit": "服装分层描述：外层、内层、下装、鞋，含材质",
  "accessories": ["发光终端光标耳坠", "水晶吊牌", "指尖的像素光点"],
  "keyMotifs": ["发光终端光标", "环形法阵", "树形图"],

  "signaturePose": "肢体级精确：单手托起一团发光能量体，另一只手轻触其边缘",
  "signatureAction": "叙事性动作：指尖轻点，代码如粒子般散开又重新凝聚",

  "abilities": ["灵视·代码读心", "形代纺·资产召唤"],
  "designNotes": "给后续资产复用的视觉规范",

  "rolePrompt": "ALWAYS English. 80-150 words. Comma-separated tag phrases. Order: appearance → outfit → accessories → signature pose. NO quality tags. NO background/scene/lighting description. Only character visual features.",

  "language": "zh",
  "generatedAt": "ISO-8601"
}
```

### rolePrompt format specification (critical for image quality)

The `rolePrompt` is the single most important field for visual output quality. It must follow these rules:

1. **Language**: ALWAYS English
2. **Format**: comma-separated tag phrases (Danbooru-style)
3. **Length**: 80–150 words
4. **Order**: hair → face/eyes → body → outfit (layer by layer) → accessories → signature pose
5. **Do NOT include**: quality tags (masterpiece, best quality), background/scene descriptions, lighting, composition instructions, meta-evaluation adjectives (detailed, vibrant, polished)
6. **Do include**: specific colors with hex when relevant, materials, textures, clothing details, accessory details, limb-level pose description

**Good rolePrompt example** (Hermes):
```
a female character with long golden hair fading to silver gray, amber eyes with gold sparkles, wearing a white classical robe mixed with a modern tech jacket, golden trim and deep blue circuit patterns, silver translucent data-wing cloak, standing with right hand extended holding a swirling golden data stream, left hand clenched near chest
```

**Bad rolePrompt** (too vague):
```
a calm and welcoming atelier director with nice hair and pretty eyes wearing elegant clothes
```

## Workflow

1. Load and understand `.repochan/analysis.json`.
2. Read language preference: `config.get`.
3. Identify repository signals: history, struggles, maintenance patterns, design taste, documentation style, naming conventions, emotional rhythm.
4. Convert signals into character material: memories, personality, contradictions, hobbies, flaws, abilities.
5. Design visual identity: hair, eyes, outfit, accessories, motifs, colors, signature pose — all inspired by but not mechanically mapped from the repo.
6. Write `rolePrompt` in English following the format spec above.
7. Write all narrative fields in the user's selected language.
8. Check anti-overfit rules. Remove any literal tech cosplay.
9. Save via `repochan action="persona.create"` with `{ persona: <full object>, slug: "v1", overwrite: true }`.

## Example

**Bad**: "It's a Python project, so she has a snake tail and wears a blue-yellow tracksuit."

**Better**: "She's a sleep-deprived atelier spirit who remembers every refactor as a repaired seam. When contributors arrive confused, she quietly pins loose ideas to floating ribbons, hums a release-note lullaby, and smiles like someone who has survived three impossible migrations without losing her favorite thimble. She's terrible at directions but never asks for help — she just wanders until something looks right, which is exactly how she discovered her best design ideas."
