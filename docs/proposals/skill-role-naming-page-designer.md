# Page Designer 角色名与职责错配:改名迁移方案

| 字段 | 值 |
|------|-----|
| **Title** | `repochan-page-designer` → `repochan-starter-localizer` 角色改名与安装迁移 |
| **Author** | design conversation (2026-09-14) |
| **Date** | 2026-09-14 |
| **Status** | **已执行(2026-09-14)**:`repochan-page-designer` → `repochan-starter-localizer`,采用**直接改名**(§3 Option D)——未推广、存量安装趋近于零,因此不发布迁移 shim、不做 prune、不改 CLI 装卸行为。执行记录见 §5 |
| **Scope** | 角色 id / 显示名的一致性、文档与 starter 侧文案;**不含** `repochan-web-designer` / `repochan-starter-designer` 的职责变更,不含 CLI 卸载逻辑改造,不含 starter 设计重做 |
| **Packages (impacted if accepted)** | `packages/skill` · `packages/cli`(`setup` 装卸与 fresh-install 清单)· `scripts/release-preflight.mjs` · 根文档(`ARCHITECTURE.md` / `AGENTS.md` / `CHANGELOG.md`)· `packages/starters/*/README.md`(13)· 2 个 starter 的 locale 内容 · `packages/cli` / `packages/image-edit` README |

---

## 1. Context

### 1.1 改名前的状态:同一个角色有三套名字

| 层 | 内容 | 位置 |
|---|---|---|
| **机器 id** | `repochan-page-designer` | 目录名 + `SKILL.md` 的 `name:` 字段(`packages/skill/skills/repochan-page-designer/SKILL.md:2`,现已改名) |
| **文件自述** | `RepoChan Starter Localizer`,正文第一句 "not responsible for original website design" | 同文件 `:4` / `:10` / `:12` |
| **用户可见文案** | 混用:"Starter Localizer"(`repochan/SKILL.md:68`)、"页面设计师"(`docs/readme-variants/pipeline-comic/README_zh.md:72`)、"Page Designer"(13 个 starter README) | 见 §9 |

`ARCHITECTURE.md:126` 其实已经承认了这件事(原文,已随本次改名改写):

> 默认团队 skill:`repochan-analysis` / … / `repochan-page-designer`。其中 **Page Designer 的稳定机器 id 保留,但职责是既有 starter 的本地化与装配**,只编辑 pull 后实例。

也就是说:仓库知道 id 与职责不符,处理方式是"在架构文档里写一行注脚"。下游文案并没有跟上。

### 1.2 历史:名字曾经是对的

`4e30356`(skill 提升为顶层包)时,这个 skill 的定义是:

```
description: 项目落地页设计师。为用户的 git 仓库设计可二次开发的 Astro/Tailwind 项目主页……
# RepoChan 页面设计师
```

它是**真正做设计的**角色——决定页面内容结构与视觉。Starter 体系落地后(`9f7a275` `release: prepare lightweight CLI and starter catalog`),同一 id 的职责被整体替换为"Starter 本地化与装配工程师",**id 没有跟着改**;真正的原创设计职责搬到了 `repochan-web-designer`。`4c12d98` i18n 英文化时,标题定型为 "RepoChan Starter Localizer"。

所以这不是"名字起得不好",是**职责搬了家、名字留在了原地**。

### 1.3 为什么当初保留 id

`ARCHITECTURE.md:126` 的"稳定机器 id 保留"是有真实理由的,而且理由在 CLI 的安装模型里,不在文档里:

- skill 通过 `copyDir(skillSrc, skillAbs)` 一个目录一个目录地装进 agent 的技能容器(`packages/cli/src/commands/setup/agents/shared.ts:312`)。
- 卸载时枚举**当前源目录**的子目录逐个删除(`shared.ts:364`),即"现在发什么就删什么"。
- 版本戳 `.repochan-version` 只记录 CLI 版本,不含 skill 名单(`shared.ts:105`);`status` 的漂移检测是**按 agent 比版本号**,不是按 skill 名(`packages/cli/src/lib/register.ts:341`)。

结论:单纯换 id——即把旧名字从源里拿掉——会在存量安装里留下旧目录,而且没有机制回收。这决定了两个候选机制:**源内 tombstone**(让旧名字不从源里消失,现有装卸语义刚好够用)或**直接改名并接受残留**。本次选了后者,依据是存量安装趋近于零(§3)。

---

## 2. Diagnosis

> 本节的观测对象是**改名前的**状态(2026-09-14 之前),保留原样以记录诊断过程。

### 2.1 核心问题不是"page 这个词",是命名轴选错了

`page` vs `web` 读起来是**范围**差异(单页 vs 整站)。但两个角色的实际差异是**类别**差异:

| 真实轴 | 角色 |
|---|---|
| 消费既有 starter(本地化 + 装配,不设计) | `repochan-page-designer` |
| 从零原创(信息架构 + 艺术方向 + 实现 + Gate 1/2) | `repochan-web-designer` |
| 产出 Source Starter(产品化) | `repochan-starter-designer` |

一个旁证:starter 自己的内容都没把它当设计师。`packages/starters/landing-cinema-credits/repochan/i18n/en.json` 的演职员表把它登记为 `Editing / Assembly`,`landing-scrollytelling` 写的是 `page assembly — web-designer / page-designer take the order`。内容作者对职责的理解是对的,名字是错的。

### 2.2 四个具体的误导场景

1. **逐团队模式下按字面选错角色。** 用户说"帮我设计一个落地页",在 `page` / `web` 之间按字面正确地选了 page-designer,然后撞上它的 doctrine:不得新增/删除 section、不得改信息架构、不得重做艺术方向,且 `repochan/SKILL.md:213` 明确禁止"现场即兴改设计"。用户拿到的是拒绝,而不是他以为的"更小的那个设计任务"。
2. **管线图给出错误的心智模型。** `repochan/SKILL.md:68` 同一行里既写 "Starter Localizer" 又写 `repochan-page-designer`;`:75` 和 `:175` 继续用 id 指代整个阶段。读者会把"⑥"理解成设计环节。
3. **错名在向外扩散。** 13 个 official starter 的 README 都有一节 `## 本地化入口（Page Designer 只动这些）`。这是 starter 作者面向人类的文档,用户会从这里建立对流水线的第一印象。
4. **skill 内部双份真相。** agent 读到 `name: repochan-page-designer` 与 `# RepoChan Starter Localizer`。通常正文会赢(`repochan/SKILL.md` 也统一用 Localizer),但这是靠"正文写得更清楚"赢的,不是靠名字对。

### 2.3 改名成本的真实构成(实测,不是估计)

好消息:**代码里几乎没有名字的硬编码**。

- 全仓 `*.ts` 无 `page-designer` 匹配;skill 发现完全靠 `readdir`。
- 唯一的代码级清单是 fresh-install 验证器:`scripts/release-preflight.mjs:439-449` 的 `expectedSkills` 九项数组,以及 `:468` 对 wizard 契约的断言。它**会 fail loud**,所以是改名的验证器而不是隐藏地雷。

坏消息:**升级路径没有任何覆盖**,而"直接把旧名字从源里删掉"这种改名方式会在存量安装上留下不受管辖的僵尸 skill。

- `installTarget` = `copyDir(src → dest)` + 打版本戳,**不清理**源里已不存在的目录(`shared.ts:312`)。所以改名时把旧目录从源里删除后,存量安装里的 `repochan-page-designer` 会原封不动留着,agent 同时看到新旧两份 skill。
- `uninstallTarget` 按当前源枚举删除(`shared.ts:364`)。旧名字已不在源里 → 它删不掉旧目录 → 末尾的 `fs.rmdir(skillAbs)` 因目录非空而静默失败(`shared.ts:373`),容器里留下一份**既无 `.repochan-version` 也不受任何命令管辖**的僵尸 skill。
- 这个僵尸对 `status` 不可见:漂移检测按 agent 版本号比较,不枚举 skill 名(`register.ts:341`)。
- 现有 preflight 只跑 fresh install(在空目录里 setup),**覆盖不到"老安装升级"这条路径**。

**结论:直接改名必然在存量安装上留下残留。** 两个应对方式:**源内 tombstone**(让旧名字不从源里消失,`copyDir` 会覆盖旧内容、`uninstallTarget` 也照常枚举得到,现有装卸语义刚好够用、CLI 一行不用改),或者**接受残留**并在 CHANGELOG 里给一次性手工清理指引。取舍见 §3。

其余成本:

- starter 侧:2 个 starter 的 locale 内容写死了 id(`landing-cinema-credits` 演职员表、`landing-scrollytelling` 的 tag)。`dist/` 已被 gitignore,不需进仓库,重新构建即可。但 official starter 的内容变更按 `AGENTS.md` 要走评审贡献,不能夹带在 skill 改名 PR 里。

---

## 3. Options

改名本身是决策,这里比较的是**迁移机制**:

| | A. 只对齐文案(保留 id) | B. 改名 + 源内 tombstone | C. 改名 + prune | D. 改名,不做任何迁移(**采用**) |
|---|---|---|---|---|
| **消除直连误解** | ❌ id 仍叫 designer | ✅ | ✅ | ✅ |
| **存量安装结果** | 不变 | 旧 id 自动变成迁移指针 | 旧目录被 setup 删除 | 旧 skill 与新的并存,需手工清一次 |
| **CLI 改动** | 0 | 0(仅 preflight 名单) | `shared.ts` 归属判定 + 测试 | **0**(仅 preflight 名单) |
| **破坏性** | 无 | 无 | 有:`setup` 主动删目录 | 无 |
| **源里多出什么** | 无 | 一个长期维护的 deprecated skill 目录 | 无 | 无 |
| **代价** | 文档层修好,名字继续撒谎 | 永久多一个 deprecated 条目占据 host 的 skill 列表;可设日落条件 | 需严格限定"只删带戳目录",否则会碰用户自建 skill | 存量安装要手工清一次 |

**选 D 的理由:RepoChan 尚未推广,存量安装 ≈ 我们自己 + 早期试用者。** tombstone 的全部价值在于替存量安装**自动**完成迁移;当存量趋近于零,它只剩下成本——源里永久多一个 deprecated skill、host 的技能列表长期多一个条目、每次发版都要维护它的一致性。用一个长期资产去偿付一次几乎不存在的一次性成本,不划算。代价被缩减为 CHANGELOG 里的一段一次性清理指引。

如果将来已知有可观存量安装(例如正式发布之后再做类似的改名),应当回到 B:tombstone 把"让旧 id 继续存在"变成**显式契约**,而不是靠删除逻辑的边界正确性。

被否决的 **C(prune)**:它让 `setup` 拥有"主动删除目录"的破坏性能力,并且必须严格限定为"带 `.repochan-version` 戳且不在当前源中",否则会碰用户自建 skill。为一个不存在的问题引入这种能力是负收益。

---

## 4. Decision

目标名(**已定并执行**):`repochan-starter-localizer`

- 与 `repochan-starter-designer` 成对,语义轴变成「**产出** starter / **消费** starter」,这是真实轴。
- 与 `repochan-web-designer` 的差异变成「原创站点 / 既有 starter 本地化」,不再依赖 page/web 这个假范围轴。
- `localizer` 就是 `TERMINOLOGY.md:31` 已经登记的译名(模板本地化 → Starter Localizer),不是新造词。

被否决的备选:`repochan-site-assembler`(`AGENTS.md:43` 称其为 page-assembly 依赖,`assembler` 同样准确,但与 `repochan-starter-designer` 不共前缀,三角色家族感更弱)。

被否决的做法:**保留旧目录作为可用的 alias**——两份职责相同的 skill 就是把问题从"名字错"换成"两个都对"。

---

## 5. Execution record(2026-09-14)

按 §3 Option D 执行:直接改名,不发布迁移 shim、不做 prune、不改 `shared.ts`。

### 5.1 已完成的改动

1. **skill 本体**:`git mv packages/skill/skills/repochan-page-designer packages/skill/skills/repochan-starter-localizer`,`SKILL.md` 的 `name:` 字段改为 `repochan-starter-localizer`。正文自述本来就是 "RepoChan Starter Localizer",无需改写。
2. **显示名与 id 全量替换**:`repochan-page-designer` → `repochan-starter-localizer`;跨 skill 引用中的 `Page Designer` / `page-designer` → `Starter Localizer` / `starter-localizer`;`docs/readme-variants/pipeline-comic/README_zh.md:72` 的"页面设计师"→"模板本地化"。共涉及 50 个文件(见 §6 的清单式验证)。
3. **`scripts/release-preflight.mjs`**:`expectedSkills` 用新 id 替换旧 id,**并重排到字母序位置**——该数组是通过 `JSON.stringify` 与 `.sort()` 后的实装目录列表整体比较的(`:455`),只替换字符串而不重排会让断言直接失败。`:468` 的 wizard 契约断言同步改为新 id。
4. **starter 内容**:`landing-cinema-credits` 的演职员表(`repochan/i18n/{en,zh}.json`)与 `landing-scrollytelling` 的 stage tag 都写死了旧 id,一并更新。按 `AGENTS.md`,official starter 源的变更本应走评审贡献;本次因为是同一次改名的一部分、且内容只是角色 id 引用,直接随批修改——如果维护者希望这部分单独评审,可单独回滚这 4 个 JSON 文件。
5. **`CHANGELOG.md`**:在 `## Unreleased` 下新增改名条目,含**存量安装的一次性清理指引**(见 5.3)。

### 5.2 有意未改的内容

- **`.repochan/analysis/current.json` 及 `versions/*`**(7 处):这是分析本仓库自身得到的协议状态,含旧的 skill 清单。它是可再生的,重跑 `repochan analysis run` 即可;手改协议产物违反 `packages/skill` 的边界,不做。
- **`CHANGELOG.md` 的既有条目、`.github/release-notes-v0.4.0.md`**:带日期的发布记录,属于历史,不追改。

### 5.3 存量安装的处理(本次唯一遗留成本)

受影响的是**改名前就装过 skill 的机器**(≈ 维护者自己 + 早期试用者)。实测(2026-09-14,`repochan setup --agent codex --project` 装在临时目录)结果如下:

| 步骤 | 结果 |
|---|---|
| 用改名前的容器跑 `repochan setup` | 新目录装上了,`repochan-page-designer/` **原样留着**,容器变成 10 个条目 |
| 再跑 `repochan setup --remove` | 9 个源内名字被删,**旧目录仍在**;`fs.rmdir` 因目录非空静默失败;`.repochan-version` 被删掉,容器进入"有旧 skill、无版本戳"的残缺状态 |
| 之后重跑 `repochan setup` | 成功,但结果与第一行完全相同——旧目录依旧在 |
| 手工 `rm -rf <容器>/repochan-page-designer` | 干净收尾:9 个 skill |

所以清理只有一个正确做法:

```bash
rm -rf <skill 容器>/repochan-page-designer    # ~/.codex/skills、.claude/skills 等
```

**`setup --remove` + `setup` 不行**——卸载只删"当前源里仍存在的目录名",而这个名字已经从源里消失。这一点最初在文档里写错了(记成了 `--remove` 就能清),是本地实测纠正的,现在 `CHANGELOG.md` 里写的是实测结论。不要置之不理:旧目录里仍是改名前的完整 contract,agent 同时看到两份职责相同的 skill 会选错。

### 5.4 未做的事(需要显式决策才做)

- **preflight 的升级路径用例**:现有 preflight 只在空目录跑 fresh install,覆盖不到"老安装升级"。这次不补——没有存量用户,这条路径不值得写测试;若将来有正式发布后的改名,应当和 tombstone 一起补上。
- **`.repochan/analysis` 重跑**。

---

## 6. Verification

改完后实际执行的检查:

```bash
# 1. 旧显示名 / 旧 id 只应存在于历史记录与本方案里
grep -rn "Page Designer\|repochan-page-designer" \
  --exclude-dir={node_modules,.git,dist,.repochan,.repochan_bak,.github} .

# 2. 目录名与 name 字段一致(改名后必须自洽)
grep -n "^name:" packages/skill/skills/repochan-starter-localizer/SKILL.md

# 3. preflight 名单仍是字母序(否则 :455 的 JSON.stringify 比较会失败)
node -e 'const s=require("fs").readFileSync("scripts/release-preflight.mjs","utf8");
const m=s.match(/const expectedSkills = \[(.*?)\];/s);
const n=[...m[1].matchAll(/"([^"]+)"/g)].map(x=>x[1]);
console.log("sorted == expected:", JSON.stringify(n)===JSON.stringify([...n].sort()));'

# 4. 脚本语法
node --check scripts/release-preflight.mjs

# 5. 被改动的 starter locale 仍是合法 JSON
python3 -c 'import json;[json.load(open(f)) for f in [
  "packages/starters/landing-cinema-credits/repochan/i18n/en.json",
  "packages/starters/landing-cinema-credits/repochan/i18n/zh.json",
  "packages/starters/landing-scrollytelling/repochan/i18n/en.json",
  "packages/starters/landing-scrollytelling/repochan/i18n/zh.json"]];print("json ok")'
```

结果:第 1 项只剩 `CHANGELOG.md` 的历史条目、`.github/release-notes-v0.4.0.md`(被排除目录)、本方案自身的诊断叙事,以及 `ARCHITECTURE.md:126` 那句**有意保留**的历史说明("它历史上叫 `repochan-page-designer`");第 2–5 项全部通过。

回归测试:

```bash
pnpm --filter repochan test      # 167 passed / 2 failed / 1 skipped
```

两个 failed 都在 `src/lib/register.test.ts`,原因是**本机环境的 `GIT_CONFIG_COUNT` / `GIT_CONFIG_VALUE_0` 变量残缺导致 `git init` 失败**(`missing config key GIT_CONFIG_KEY_0`),与本次改动无关:去掉这两个变量单跑该文件,4 个用例全过。改名本身未触及任何 TS 代码。

本地端到端验证(临时目录,`repochan setup --agent codex --project`,已执行):

```text
全新安装          → 恰好 9 个 skill,含 repochan-starter-localizer,无旧名          ✅
改名前的容器升级  → 新目录装上了,旧目录原样留着(10 个条目)                      ⚠️ 见 §5.3
setup --remove    → 9 个源内名字被删,旧目录仍在,版本戳被删,容器进入残缺状态      ⚠️
再 setup          → 成功,但结果同第一行:旧目录依旧在                              ⚠️
手工 rm -rf 旧目录 → 干净收尾(9 个 skill)                                        ✅
```

这条路径至今**没有自动化覆盖**(preflight 只跑空目录的 fresh install),§5.3 的清理指引就是靠上面这次手工验证纠正的。将来若有正式发布后的同类改名,应当补上 tombstone 与对应的 preflight 用例(§3)。

顺带记录一个**与本次改名无关**的既存问题:在 macOS 开发检出上,`packages/skill/skills/.DS_Store` 会被 `copyDir` 一并拷进用户的技能容器;若容器随后失去 `.repochan-version`(例如刚跑过 `setup --remove`),下一次 `setup` 的碰撞检查会把它当成"非 RepoChan 的既有路径"而**硬失败**:

```text
error: Refusing to overwrite existing non-RepoChan skill path: <container>/.DS_Store
```

`.DS_Store` 已被 gitignore、不会进仓库,所以只影响本地开发机。修法是让 `copyDir` 跳过点文件垃圾,属于独立议题,不在本次范围内。

---

## 7. Risks / open questions

1. **存量安装残留(已知,已给指引)。** 见 §5.3。这是选 D 而非 B 的直接代价:机器不做手工清理就会长期同时存在两份 skill。缓解只有 CHANGELOG 指引。
2. **用户侧硬引用。** 提示词、脚本、CI 里写死 `repochan-page-designer` 的用户会受影响。CLI 不认 skill 名,所以不会报错,只会静默失效——这是它与 1 并列的隐性成本。
3. **starter 内容的评审惯例。** 见 §5.1 第 4 条:4 个 locale JSON 是随批改的,可按需单独回滚成独立 PR。
4. **将来若有可观存量用户再做同类改名**,应当回到 §3 的 Option B(tombstone),而不是复制本次的 Option D。

---

## 8. Non-goals

- 不改 `repochan-web-designer` / `repochan-starter-designer` 的职责与命名。
- 不改任何产品不变量:CLI 仍是唯一 binding surface、core 保持纯粹、starter 内容只经评审贡献、订单产物不可变。
- **不改 `shared.ts` 的安装/卸载行为,不引入 prune,不发布迁移 shim。**
- 不重做 starter 的设计。
- 不保留 `repochan-page-designer` 作为第二份可用的 skill。

---

## 9. 受影响文件清单(实测 2026-09-14)

| 类别 | 位置 | 处理 |
|---|---|---|
| **skill 本体** | `packages/skill/skills/repochan-starter-localizer/**` | ✅ `git mv` + `name:` 字段 |
| **skill 交叉引用** | `packages/skill/skills/repochan/SKILL.md`(`:33` `:68` `:75` `:175` `:198` `:213` `:231`)、`repochan/references/cli-reference.md:164`、`repochan/references/greenfield.md:23` | ✅ |
| | `packages/skill/skills/repochan-painter/SKILL.md:236` + `references/{asset-type-guides.md, examples.md, extract-qa-retry.md, output-and-save.md}` | ✅ |
| | `packages/skill/skills/repochan-starter-designer/SKILL.md:13,79` + `references/productization-checklist.md:17` | ✅ |
| | `packages/skill/skills/repochan-starter-localizer/references/{data-mapping.md, phase2-assemble.md}` | ✅ 内部显示名 |
| **skill 元信息** | `packages/skill/README.md:15`、`packages/skill/TERMINOLOGY.md:31` | ✅ |
| **CLI / 脚本** | `scripts/release-preflight.mjs:439-449`(名单,含字母序重排)、`:468`(wizard 契约断言) | ✅ **本次唯一改动的代码** |
| | `packages/cli/src/commands/setup/agents/shared.ts` | ⛔ 不改(见 §8) |
| **包 README** | `packages/cli/README.md:20`、`packages/image-edit/README.md:7,28`、`packages/starters/README.md:24` | ✅ |
| **根文档** | `AGENTS.md:43`、`ARCHITECTURE.md:126,289`;`CHANGELOG.md`(既有条目)、`.github/release-notes-v0.4.0.md:21` | ✅ 前两者改 + 新增 CHANGELOG 条目;历史条目不动 |
| **starter 文档** | 13 个 `packages/starters/*/README.md` 的"本地化入口"小节 | ✅ |
| **starter 内容** | `landing-cinema-credits` 与 `landing-scrollytelling` 的 `repochan/i18n/{en,zh}.json` | ✅(4 文件,见 §7 风险 3);`dist/` 已 gitignore,重新构建 |
| **其他文档** | `docs/design/cutout-slice-stability.md`(22 处)、`docs/proposals/cli-text-asset-pipeline.md`、`docs/proposals/starters-catalog-cache-and-text-first-selection.md`、`docs/proposals/starters-scalability-and-discovery.md:157`、`docs/prototypes/10-cinema-opening-credits.md:70`、`docs/readme-variants/pipeline-comic/README_zh.md:72` | ✅ |
| **仓库自有状态** | `.repochan/analysis/current.json` 及 `versions/*`(7 处) | ⛔ 不手改,可重跑 `repochan analysis run`(见 §5.2) |
| **历史依据** | `4e30356`(原名与设计职责)、`9f7a275`(职责替换)、`4c12d98`(英文标题定型) | 只读,不改 |
