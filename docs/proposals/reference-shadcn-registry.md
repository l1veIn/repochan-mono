# 参考:shadcn/registry 模式

| 字段 | 值 |
|------|-----|
| **Title** | shadcn/registry 架构 —— 参考笔记 |
| **Author** | Jack Yang |
| **Date** | 2026-07-20 |
| **Status** | Reference(作为 `starters-scalability-and-discovery.md` 的附件) |
| **Purpose** | 记录哪些值得借鉴、哪些不要抄,免得每次都要重新推导一遍。 |

---

## 1. 核心心智模型:从"包"到"清单"

这是整套模式里最关键的一个想法。

**传统 npm 包(`@repochan/starters` 现在的形态):**
发布物*本身*就是源文件。每个消费者都要下载每一字节,不管用不用得上。

**shadcn registry:** 发布物是一份很小的 JSON 清单,描述源文件在哪里。
消费者点名要某个 item 时,CLI 才按需拉取源文件。存储和发布解耦了。

正是这一跳,让 shadcn 能扩展到数百个社区 item,而核心包不会变重。

---

## 2. 四层架构

```
Layer 1  源文件               真实的 .tsx/.ts/.json,躺在某个 git 仓库里,位置任意
Layer 2  源 registry.json     创作期 manifest,path 指向源文件
Layer 3  构建后的 registry     扁平化发布:/r/index.json + /r/{item}.json
Layer 4  CLI resolver         读 components.json,解析依赖图,
                              按 type 把文件写到 target,支持别名替换
```

**repochan 的现状:** Layer 1 和 Layer 3 是合一的(npm 包既是源也是发布物)。
Layer 2 隐式存在(每个 starter 的 `repochan/starter.json`),但没有顶层
index。Layer 4 是一个朴素的 `readdir`,没有依赖解析。

---

## 3. 数据结构

### 3.1 顶层 `registry.json`

```json
{
  "$schema": "https://ui.shadcn.com/schema/registry.json",
  "name": "acme",
  "items": [ /* registry-item 定义 */ ],
  "include": ["components/ui/registry.json", "hooks/registry.json"]
}
```

- 小 registry 全塞进 `items`,大的用 `include` 把不同领域的 item 下放到
  子 registry 文件。`include` 路径必须显式指向一个 `registry.json` 文件 ——
  不支持目录简写。
- 构建后一切扁平化。item name 在整个 registry 内唯一。

**repochan 的对应:** 每个
`packages/starters/<id>/repochan/starter.json` 本质上就是一个"子 registry"。
缺的是顶层的 `index.json`(Phase 1)和可选的构建期扁平化步骤(Phase 3)。

### 3.2 单个 item 的 `registry-item.json`

值得注意的字段及其设计意图:

| 字段 | 用途 |
|---|---|
| `type` | 决定文件落到消费者项目的哪个目录(`registry:ui`、`registry:page`...) |
| `files.path` | 源侧路径(在 registry 仓库里的位置) |
| `files.target` | 消费者侧路径;支持 `~`、`@ui/`、`@lib/` 占位符 |
| `dependencies` | npm 包,装进消费者的 package.json |
| `registryDependencies` | 跨 registry 的 item 引用,支持 5 种 address 形态 |
| `cssVars` / `tailwind` / `css` | 主题副作用,安装时注入 |
| `envVars` | 环境变量副作用,只追加不覆盖 |
| `meta` | 自由扩展位,任意 key/value |

**repochan 的对应:** `starter.json` 已经覆盖了 `files`(通过 slots)、
`cssVars`(通过 `site.json` 的 tokens)、`meta`。缺的能力是
`registryDependencies` —— repochan 的 starter 之间不能互相引用。这正是让
`minimal` 成为 `landing-*` 公共底座的杠杆(Phase 3)。

---

## 4. 寻址与依赖图

这是让 shadcn 真正能 scale 的部分。

### 4.1 五种 item address 形态

```
button                       # 内置官方 item
@acme/input-form             # namespace(在 directory 注册过)
acme/ui/foo#v1.2.0           # GitHub owner/repo/item + ref
https://example.com/r/foo.json   # 任意 URL
./editor.json                # 本地文件
```

任何一个 GitHub 仓库,零基础设施就能变成 registry。跨 registry 引用靠
address 语法解决,不依赖 npm。

### 4.2 版本化规则

- `#ref` 支持 branch / tag / 短 SHA / 完整 40 位 SHA。
- **Refs 不跨依赖继承。** 如果 A 依赖 B、B 依赖 C,给 B pin `#v1.0.0` 不会
  pin 住 C。每个引用方都得显式声明自己信任的版本。
- 完整 SHA 直接用,不走 git;短 ref(branch/tag)走 git 解析成 SHA。

"refs 不继承"听起来反直觉,其实是**对的**:隐式版本继承会制造失控的升级链。

### 4.3 解析流程

```
1. 解析 item address → 找到它所在的 registry
2. fetch 那个 registry 的 item JSON
3. 读 registryDependencies → 对每个 dep 递归执行 1–3
4. 拓扑排序,从叶子开始装
5. 每个 item:装 npm deps、按 type + components.json 决定 files 落点、
   注入 cssVars/envVars/tailwind 副作用
```

---

## 5. 分发通道

| 通道 | address | 适用场景 |
|---|---|---|
| 官方 | bare name | shadcn 自己的 item |
| GitHub | `owner/repo/item[#ref]` | 开源社区,零成本 |
| Namespace | `@acme/item` | 第三方,在 directory 注册 |
| 自托管 URL | `https://...` | 私有 / 企业 / 需鉴权 |

GitHub registry 模式特别值得关注:不需要 registry 服务器,也不需要发布 JSON
—— 仓库本身就是 registry,CLI 通过 GitHub raw/API 读 `registry.json` 和源
文件。起步基础设施成本最低。

### 构建管线(monorepo 场景)

1. 在 workspace 各子包里正常写组件源码。
2. 加一个 `build:registry` 脚本,扫描源码,生成 registry JSON(可以内联
   content,也可以 path 指向源文件)。
3. 把生成的 JSON 部署到 CDN,或在 GitHub registry 模式下直接留在仓库里。

官方的 `shadcn build` 负责:解析 include、扁平化、把 path 转成消费者可用的
形态。

---

## 6. 验证作为一等公民

- `shadcn validate` 检查根 registry、include 文件、item schema、重名、文件
  存在性。
- 可以指定 branch/tag/SHA 校验,供 PR 前自检。
- 协议演进有专门的 changelog 跟踪。

**repochan 的对应:** `repochan starter validate [--localized] [--all]` 已经
存在,而且走在 shadcn 对齐要求的前面。差距在 registry 级(跨 starter)校验
和协议演进追踪,都是 Phase 3 的事。

---

## 7. 借鉴 / 不借鉴矩阵

### ✅ 该借鉴

1. **顶层 manifest + 构建期扁平化。** 今天的 readdir loader 是 O(N) 的,而且
   表达不了"哪个 starter 是默认 / 推荐 / 归类"。一个提交进仓库的 `index.json`
   同时解决 list 性能和体量两件事(Phase 1)。
2. **`include` 分治。** 每个 starter 自己的 `starter.json` 本来就是子 registry
   的雏形。把它正式化:per-starter manifest 是源,顶层 index 是构建产物。作者
   改 starter 不碰顶层文件。
3. **path 与 content 分离 + 扁平化发布。** 最有效的瘦身手段:
   `@repochan/starters` 只发 index + schema + 缩略图;完整源码放在 release
   tarball 里(Phase 2)。
4. **`registryDependencies`(长期)。** 让 `minimal` 成为共享底座;`landing-*`
   只描述差异。从根本上打破"每加一个 landing 就 +5MB"的曲线(Phase 3)。

### ⚠️ 不该借鉴

1. **五种 address 形态全套上。** repochan 是单一产品,不需要"任何 GitHub 仓库
   都能当 registry"的开放性。三种就够:bare id(内置)、`--from <path>`
   (本地,已存在)、URL(远程 tarball)。跳过 namespace 和 GitHub 原生解析。
2. **`components.json` 那种用户侧配置。** shadcn 需要它是因为文件落点灵活
   (`@/`、`#`、workspace)。repochan 的 starter 是整站单位,落点固定
   (`.repochan/web-starter/`),不需要这层抽象。
3. **`type` → target 的映射动物园。** shadcn 有约 10 种 `registry:*` 类型,因为
   组件 / hook / page / block / lib 落点各不相同。repochan 的单位是整站 ——
   一个 type 就够。
4. **内联 content 发布。** shadcn 允许把文件内容内联进 JSON。repochan **不能**
   这么做:二进制资产太大,内联会产生无法流式下载的巨型 JSON。始终坚持
   "path 指向外部文件 / tarball"。

---

## 8. 来源

- [Registry Introduction](https://ui.shadcn.com/docs/registry)
- [`registry.json` schema](https://ui.shadcn.com/docs/registry/registry-json)
- [`registry-item.json` spec](https://ui.shadcn.com/docs/registry/registry-item-json)
- [Registry Directory / Index](https://ui.shadcn.com/docs/registry/registry-index)
- [GitHub Registries](https://ui.shadcn.com/docs/registry/github)
- [Registry Include and Validate changelog (2026-05)](https://ui.shadcn.com/docs/changelog/2026-05-registry-include)
- [How does the shadcn-ui CLI work? — thinkthroo](https://thinkthroo.com/blog/shadcn-ui-codebase-3-1)
- [How We Built Our shadcn Component Registry — OpenStatus](https://www.openstatus.dev/blog/shadcn-component-registry)
- [shadcn CLI v4: registry:base and registry:font](https://shadcnstudio.com/blog/shadcn-cli-v4-registry-base-and-registry-font/)
