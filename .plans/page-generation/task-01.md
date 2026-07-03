# Task 01: Page 类型定义 + TypeBox Schema

## 目标

在 core 包中定义 PageData 类型和 TypeBox Schema，为后续 entity 函数和 renderer 提供契约。

## 文件

- 修改: `packages/core/src/types.ts` — 新增 Page 相关类型
- 修改: `packages/core/src/schemas/index.ts` — 新增 Page Schema
- 修改: `packages/core/src/schemas/index.ts` 的 `WriteOpSchemas` 注册

## 上下文

现有 core 代码的模式：
- `types.ts` 定义 TypeScript type（如 `PersonaData`、`AssetOrder`）
- `schemas/index.ts` 定义 TypeBox schema（如 `PersonaArtifactSchema`、`PersonaCreateParamsSchema`）
- `WriteOpSchemas` 注册表列出所有写操作 schema
- schema 用 `typebox` 库（import 名 `Type`）
- import 路径用 `.js` 后缀（ESM + NodeNext）

## Step 1: 在 types.ts 末尾添加 Page 类型

在 `packages/core/src/types.ts` 文件**末尾**（在 `InterviewReport` type 之后）追加以下内容：

```typescript
// ---------------------------------------------------------------------------
// Static page generation
// ---------------------------------------------------------------------------

/** Reference to an image asset stored in .repochan/orders/. */
export type AssetRef = {
  /** orderId, e.g. "ord-foundation-001". */
  orderId: string;
  /** Specific version. If omitted, uses the order's currentVersion. */
  versionId?: string;
  /** Filename within the version directory, e.g. "mascot-hero.png". */
  file: string;
  /** Alt text for accessibility. */
  alt?: string;
};

/** A link with label and href. */
export type PageLink = {
  label: string;
  href: string;
};

/** Theme configuration controlling visual appearance. */
export type PageTheme = {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  style: "modern" | "playful" | "minimal" | "techy" | "elegant";
  darkMode?: boolean;
  fontFamily?: string;
};

/** Content shapes for each section type. */

export type NavbarContent = {
  brand: string;
  links?: PageLink[];
  cta?: PageLink;
};

export type HeroContent = {
  headline: string;
  subheadline: string;
  primaryCta: PageLink;
  secondaryCta?: PageLink;
  image?: AssetRef;
};

export type FeaturesContent = {
  heading?: string;
  subheading?: string;
  items: Array<{
    icon?: string;
    title: string;
    description: string;
    image?: AssetRef;
  }>;
};

export type StatsContent = {
  items: Array<{ value: string; label: string }>;
};

export type GalleryContent = {
  heading?: string;
  images: AssetRef[];
};

export type CtaContent = {
  heading: string;
  subheading?: string;
  buttonText: string;
  buttonHref: string;
};

export type FooterContent = {
  brand: string;
  copyright?: string;
  links?: PageLink[];
  socials?: Array<{ platform: string; href: string }>;
  logo?: AssetRef;
};

/** Discriminated union of all section types. */
export type PageSection =
  | { type: "navbar"; variant: "simple" | "with-cta"; content: NavbarContent }
  | { type: "hero"; variant: "centered" | "split-right" | "split-left" | "full-bg"; content: HeroContent }
  | { type: "features"; variant: "grid-2" | "grid-3" | "grid-4"; content: FeaturesContent }
  | { type: "stats"; variant: "row" | "grid"; content: StatsContent }
  | { type: "gallery"; variant: "grid" | "masonry"; content: GalleryContent }
  | { type: "cta"; variant: "centered" | "banner"; content: CtaContent }
  | { type: "footer"; variant: "standard" | "minimal"; content: FooterContent };

/** The complete page artifact stored as .repochan/pages/current.json. */
export type PageData = JsonObject & {
  schemaVersion?: "repochan.page.v1";
  title: string;
  description: string;
  theme: PageTheme;
  sections: PageSection[];
  generatedAt?: string;
  provenance?: JsonObject;
};
```

## Step 2: 在 schemas/index.ts 中添加 Page Schema

在 `packages/core/src/schemas/index.ts` 文件中，在 `// Schema registry` 注释行**之前**（即 `WriteOpSchemas` 定义之前）插入以下 schema 定义：

```typescript
// ── Page ──

export const AssetRefSchema = Type.Object({
  orderId: OrderIdSchema,
  file: Type.String({ description: "Filename within the version directory." }),
  versionId: Type.Optional(VersionIdSchema),
  alt: Type.Optional(Type.String()),
});

export const PageLinkSchema = Type.Object({
  label: Type.String(),
  href: Type.String(),
});

export const PageThemeSchema = Type.Object({
  primary: Type.String({ description: "Hex color, e.g. #3B82F6." }),
  secondary: Type.String(),
  accent: Type.String(),
  background: Type.String(),
  style: Type.Union([
    Type.Literal("modern"),
    Type.Literal("playful"),
    Type.Literal("minimal"),
    Type.Literal("techy"),
    Type.Literal("elegant"),
  ]),
  darkMode: Type.Optional(Type.Boolean()),
  fontFamily: Type.Optional(Type.String()),
});

export const NavbarContentSchema = Type.Object({
  brand: Type.String(),
  links: Type.Optional(Type.Array(PageLinkSchema)),
  cta: Type.Optional(PageLinkSchema),
});

export const HeroContentSchema = Type.Object({
  headline: Type.String(),
  subheadline: Type.String(),
  primaryCta: PageLinkSchema,
  secondaryCta: Type.Optional(PageLinkSchema),
  image: Type.Optional(AssetRefSchema),
});

export const FeaturesContentSchema = Type.Object({
  heading: Type.Optional(Type.String()),
  subheading: Type.Optional(Type.String()),
  items: Type.Array(Type.Object({
    icon: Type.Optional(Type.String()),
    title: Type.String(),
    description: Type.String(),
    image: Type.Optional(AssetRefSchema),
  })),
});

export const StatsContentSchema = Type.Object({
  items: Type.Array(Type.Object({
    value: Type.String(),
    label: Type.String(),
  })),
});

export const GalleryContentSchema = Type.Object({
  heading: Type.Optional(Type.String()),
  images: Type.Array(AssetRefSchema),
});

export const CtaContentSchema = Type.Object({
  heading: Type.String(),
  subheading: Type.Optional(Type.String()),
  buttonText: Type.String(),
  buttonHref: Type.String(),
});

export const FooterContentSchema = Type.Object({
  brand: Type.String(),
  copyright: Type.Optional(Type.String()),
  links: Type.Optional(Type.Array(PageLinkSchema)),
  socials: Type.Optional(Type.Array(Type.Object({
    platform: Type.String(),
    href: Type.String(),
  }))),
  logo: Type.Optional(AssetRefSchema),
});

export const PageSectionSchema = Type.Union([
  Type.Object({
    type: Type.Literal("navbar"),
    variant: Type.Union([Type.Literal("simple"), Type.Literal("with-cta")]),
    content: NavbarContentSchema,
  }),
  Type.Object({
    type: Type.Literal("hero"),
    variant: Type.Union([Type.Literal("centered"), Type.Literal("split-right"), Type.Literal("split-left"), Type.Literal("full-bg")]),
    content: HeroContentSchema,
  }),
  Type.Object({
    type: Type.Literal("features"),
    variant: Type.Union([Type.Literal("grid-2"), Type.Literal("grid-3"), Type.Literal("grid-4")]),
    content: FeaturesContentSchema,
  }),
  Type.Object({
    type: Type.Literal("stats"),
    variant: Type.Union([Type.Literal("row"), Type.Literal("grid")]),
    content: StatsContentSchema,
  }),
  Type.Object({
    type: Type.Literal("gallery"),
    variant: Type.Union([Type.Literal("grid"), Type.Literal("masonry")]),
    content: GalleryContentSchema,
  }),
  Type.Object({
    type: Type.Literal("cta"),
    variant: Type.Union([Type.Literal("centered"), Type.Literal("banner")]),
    content: CtaContentSchema,
  }),
  Type.Object({
    type: Type.Literal("footer"),
    variant: Type.Union([Type.Literal("standard"), Type.Literal("minimal")]),
    content: FooterContentSchema,
  }),
]);

export const PageArtifactSchema = Type.Object({
  title: Type.String(),
  description: Type.String(),
  theme: PageThemeSchema,
  sections: Type.Array(PageSectionSchema),
  schemaVersion: Type.Optional(Type.String()),
  generatedAt: Type.Optional(Type.String()),
  provenance: Type.Optional(ProvenanceSchema),
}, { description: "RepoChan static page artifact." });

export const PageCreateParamsSchema = Type.Object({
  page: PageArtifactSchema,
  overwrite: Type.Optional(Type.Boolean()),
  versionPrevious: Type.Optional(Type.Boolean()),
  slug: Type.Optional(Type.String({ pattern: "^[a-z0-9-]+$" })),
  provenance: Type.Optional(ProvenanceSchema),
});
```

## Step 3: 注册到 WriteOpSchemas

在 `packages/core/src/schemas/index.ts` 的 `WriteOpSchemas` 对象中，在 `"analysis.update"` 条目之后添加：

```typescript
  "page.create": PageCreateParamsSchema,
```

## Step 4: 验证编译

```bash
cd ~/Desktop/repochan-mono
pnpm --filter @repochan/core build
```

预期：编译通过，无类型错误。

## Step 5: 验证现有测试不受影响

```bash
pnpm --filter @repochan/core test
```

预期：60/60 tests passed（跟改动前一致）。

## Step 6: 提交

```bash
cd ~/Desktop/repochan-mono
git add packages/core/src/types.ts packages/core/src/schemas/index.ts
git commit -m "feat(page): add PageData types and TypeBox schemas to core"
```
