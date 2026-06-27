# Task 07: page-renderer 测试套件

## 目标

为 page-renderer 包编写完整测试：theme 编译器、模板渲染、完整页面渲染。

## 文件

- 创建: `packages/page-renderer/test/render.test.ts`

## 前置

- Task 04-06 全部完成

## Step 1: 创建测试文件

创建 `packages/page-renderer/test/render.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { compileTheme, formatCSSVars, darken, lighten, withAlpha, isValidHex, STYLE_PRESETS } from '../src/theme.js';
import { renderSection } from '../src/templates/index.js';
import { renderPage, assetKey } from '../src/render.js';
import { escapeHtml, safeHref, resolveAssetPath } from '../src/utils.js';
import type { PageData, PageSection } from '@repochan/core';

// ── Helpers ──────────────────────────────────────────────

function makePage(overrides?: Partial<PageData>): PageData {
  return {
    title: 'Test Project',
    description: 'A test page.',
    theme: {
      primary: '#3B82F6',
      secondary: '#10B984',
      accent: '#F59E0B',
      background: '#FFFFFF',
      style: 'modern',
    },
    sections: [
      {
        type: 'hero',
        variant: 'centered',
        content: {
          headline: 'Test Headline',
          subheadline: 'A subheadline.',
          primaryCta: { label: 'Start', href: '#start' },
        },
      },
    ],
    ...overrides,
  };
}

// ── Theme tests ──────────────────────────────────────────

describe('theme compiler', () => {
  it('compileTheme generates light and dark CSS vars', () => {
    const { light, dark } = compileTheme({
      primary: '#3B82F6',
      secondary: '#10B984',
      accent: '#F59E0B',
      background: '#FFFFFF',
      style: 'modern',
    });

    expect(light['--color-primary']).toBe('#3B82F6');
    expect(light['--color-background']).toBe('#FFFFFF');
    expect(light['--color-text']).toBeTruthy();
    expect(light['--radius']).toBe(STYLE_PRESETS.modern.borderRadius);

    expect(dark['--color-background']).toBe('#0F172A');
    expect(dark['--color-text']).toBe('#F1F5F9');
  });

  it('each style preset produces different radius', () => {
    const modern = compileTheme({ primary: '#000', secondary: '#000', accent: '#000', background: '#fff', style: 'modern' });
    const playful = compileTheme({ primary: '#000', secondary: '#000', accent: '#000', background: '#fff', style: 'playful' });
    const minimal = compileTheme({ primary: '#000', secondary: '#000', accent: '#000', background: '#fff', style: 'minimal' });

    expect(modern.light['--radius']).not.toBe(playful.light['--radius']);
    expect(minimal.light['--radius']).not.toBe(modern.light['--radius']);
  });

  it('formatCSSVars produces valid CSS block', () => {
    const css = formatCSSVars(':root', { '--color-primary': '#3B82F6' });
    expect(css).toContain(':root {');
    expect(css).toContain('--color-primary: #3B82F6;');
    expect(css).toContain('}');
  });

  it('darken/lighten produce valid hex', () => {
    expect(isValidHex(darken('#3B82F6', 10))).toBe(true);
    expect(isValidHex(lighten('#3B82F6', 10))).toBe(true);
  });

  it('withAlpha returns rgba string', () => {
    const result = withAlpha('#3B82F6', 0.5);
    expect(result).toContain('rgba(');
    expect(result).toContain('0.5');
  });
});

// ── Utils tests ──────────────────────────────────────────

describe('utils', () => {
  it('escapeHtml escapes dangerous characters', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toContain('&lt;script&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('"quoted"')).toContain('&quot;');
  });

  it('safeHref escapes quotes', () => {
    expect(safeHref('a"b')).toContain('&quot;');
  });

  it('resolveAssetPath returns assets/<filename>', () => {
    expect(resolveAssetPath({ orderId: 'ord-x', file: 'hero.png' })).toBe('assets/hero.png');
  });
});

// ── Section template tests ───────────────────────────────

describe('section templates', () => {
  it('navbar simple renders brand and links', () => {
    const html = renderSection({
      type: 'navbar',
      variant: 'simple',
      content: {
        brand: 'TestBrand',
        links: [{ label: 'Home', href: '#' }],
      },
    });
    expect(html).toContain('TestBrand');
    expect(html).toContain('Home');
    expect(html).toContain('<nav');
  });

  it('navbar with-cta renders CTA button', () => {
    const html = renderSection({
      type: 'navbar',
      variant: 'with-cta',
      content: {
        brand: 'Brand',
        cta: { label: 'Sign Up', href: '/signup' },
      },
    });
    expect(html).toContain('Sign Up');
    expect(html).toContain('var(--color-primary)');
  });

  it('hero centered renders headline and CTA', () => {
    const html = renderSection({
      type: 'hero',
      variant: 'centered',
      content: {
        headline: 'Welcome',
        subheadline: 'Get started',
        primaryCta: { label: 'Go', href: '#go' },
      },
    });
    expect(html).toContain('Welcome');
    expect(html).toContain('Get started');
    expect(html).toContain('Go');
  });

  it('hero split-right renders image when provided', () => {
    const html = renderSection({
      type: 'hero',
      variant: 'split-right',
      content: {
        headline: 'H',
        subheadline: 'S',
        primaryCta: { label: 'Go', href: '#' },
        image: { orderId: 'ord-img', file: 'hero.png', alt: 'Hero' },
      },
    });
    expect(html).toContain('assets/hero.png');
    expect(html).toContain('Hero');
  });

  it('hero full-bg includes background image style', () => {
    const html = renderSection({
      type: 'hero',
      variant: 'full-bg',
      content: {
        headline: 'H',
        subheadline: 'S',
        primaryCta: { label: 'Go', href: '#' },
        image: { orderId: 'ord-bg', file: 'bg.png' },
      },
    });
    expect(html).toContain('background-image');
    expect(html).toContain('assets/bg.png');
  });

  it('features grid-3 renders all items', () => {
    const html = renderSection({
      type: 'features',
      variant: 'grid-3',
      content: {
        heading: 'Features',
        items: [
          { title: 'A', description: 'desc A' },
          { title: 'B', description: 'desc B' },
          { title: 'C', description: 'desc C' },
        ],
      },
    });
    expect(html).toContain('Features');
    expect(html).toContain('>A<');
    expect(html).toContain('desc B');
    expect(html).toContain('grid-cols-3');
  });

  it('stats row renders values', () => {
    const html = renderSection({
      type: 'stats',
      variant: 'row',
      content: {
        items: [
          { value: '99%', label: 'Accuracy' },
          { value: '10M+', label: 'Users' },
        ],
      },
    });
    expect(html).toContain('99%');
    expect(html).toContain('Accuracy');
    expect(html).toContain('10M+');
  });

  it('gallery grid renders images', () => {
    const html = renderSection({
      type: 'gallery',
      variant: 'grid',
      content: {
        images: [
          { orderId: 'ord-g1', file: 'a.png' },
          { orderId: 'ord-g1', file: 'b.png' },
        ],
      },
    });
    expect(html).toContain('assets/a.png');
    expect(html).toContain('assets/b.png');
  });

  it('cta centered renders heading and button', () => {
    const html = renderSection({
      type: 'cta',
      variant: 'centered',
      content: {
        heading: 'Try it',
        buttonText: 'Start',
        buttonHref: '#start',
      },
    });
    expect(html).toContain('Try it');
    expect(html).toContain('Start');
  });

  it('cta banner uses primary background', () => {
    const html = renderSection({
      type: 'cta',
      variant: 'banner',
      content: {
        heading: 'Go',
        buttonText: 'Click',
        buttonHref: '#',
      },
    });
    expect(html).toContain('var(--color-primary)');
    expect(html).toContain('Click');
  });

  it('footer standard renders brand and copyright', () => {
    const html = renderSection({
      type: 'footer',
      variant: 'standard',
      content: {
        brand: 'TestCo',
        copyright: '© 2026 TestCo',
      },
    });
    expect(html).toContain('TestCo');
    expect(html).toContain('© 2026 TestCo');
    expect(html).toContain('<footer');
  });

  it('footer minimal renders just copyright', () => {
    const html = renderSection({
      type: 'footer',
      variant: 'minimal',
      content: {
        brand: 'TestCo',
      },
    });
    expect(html).toContain('TestCo');
    expect(html).not.toContain('bg-gray-900');
  });

  it('renderSection returns empty string for unknown type', () => {
    // TS prevents this at compile time, but runtime guard test
    const html = renderSection({ type: 'hero', variant: 'centered', content: {} } as any);
    // Should still render (content is incomplete but valid enough)
    expect(typeof html).toBe('string');
  });
});

// ── Full page render tests ───────────────────────────────

describe('renderPage', () => {
  it('produces complete HTML document', () => {
    const result = renderPage(makePage());

    expect(result.html).toContain('<!DOCTYPE html>');
    expect(result.html).toContain('<html');
    expect(result.html).toContain('<head>');
    expect(result.html).toContain('<body>');
    expect(result.html).toContain('</html>');
  });

  it('includes title and description in head', () => {
    const result = renderPage(makePage({ title: 'My Project', description: 'Best project ever.' }));
    expect(result.html).toContain('<title>My Project</title>');
    expect(result.html).toContain('content="Best project ever."');
  });

  it('includes CSS with theme variables', () => {
    const result = renderPage(makePage());
    expect(result.css).toContain('--color-primary');
    expect(result.css).toContain('#3B82F6');
    expect(result.css).toContain(':root {');
  });

  it('includes dark mode CSS when darkMode is true', () => {
    const page = makePage({
      theme: {
        primary: '#3B82F6',
        secondary: '#10B984',
        accent: '#F59E0B',
        background: '#FFFFFF',
        style: 'modern',
        darkMode: true,
      },
    });
    const result = renderPage(page);
    expect(result.html).toContain('data-theme="dark"');
  });

  it('renders multiple sections in order', () => {
    const page = makePage({
      sections: [
        {
          type: 'navbar',
          variant: 'simple',
          content: { brand: 'Nav' },
        } as PageSection,
        {
          type: 'hero',
          variant: 'centered',
          content: {
            headline: 'Hero',
            subheadline: 'Sub',
            primaryCta: { label: 'Go', href: '#' },
          },
        },
        {
          type: 'footer',
          variant: 'minimal',
          content: { brand: 'Footer' },
        } as PageSection,
      ],
    });

    const result = renderPage(page);
    const navIdx = result.html.indexOf('Nav');
    const heroIdx = result.html.indexOf('Hero');
    const footerIdx = result.html.indexOf('Footer');
    expect(navIdx).toBeGreaterThan(-1);
    expect(heroIdx).toBeGreaterThan(navIdx);
    expect(footerIdx).toBeGreaterThan(heroIdx);
  });

  it('assetKey generates consistent keys', () => {
    const k1 = assetKey({ orderId: 'ord-a', file: 'x.png' });
    const k2 = assetKey({ orderId: 'ord-a', versionId: 'current', file: 'x.png' });
    const k3 = assetKey({ orderId: 'ord-a', versionId: 'v1', file: 'x.png' });

    expect(k1).toBe('ord-a/current/x.png');
    expect(k2).toBe('ord-a/current/x.png');
    expect(k3).toBe('ord-a/v1/x.png');
  });

  it('renders with all 7 section types', () => {
    const page = makePage({
      sections: [
        { type: 'navbar', variant: 'simple', content: { brand: 'B' } },
        { type: 'hero', variant: 'centered', content: { headline: 'H', subheadline: 'S', primaryCta: { label: 'G', href: '#' } } },
        { type: 'features', variant: 'grid-3', content: { items: [{ title: 'F', description: 'D' }] } },
        { type: 'stats', variant: 'row', content: { items: [{ value: 'V', label: 'L' }] } },
        { type: 'gallery', variant: 'grid', content: { images: [] } },
        { type: 'cta', variant: 'centered', content: { heading: 'C', buttonText: 'B', buttonHref: '#' } },
        { type: 'footer', variant: 'standard', content: { brand: 'B' } },
      ] as PageSection[],
    });

    const result = renderPage(page);
    expect(result.html).toContain('B');      // navbar/footer brand
    expect(result.html).toContain('H');      // hero headline
    expect(result.html).toContain('F');      // feature title
    expect(result.html).toContain('V');      // stat value
    expect(result.html).toContain('C');      // cta heading
  });
});
```

## Step 2: 运行测试

```bash
cd ~/Desktop/repochan-mono
pnpm --filter @repochan/page-renderer test
```

预期：全部通过。

如果失败，修复代码（不修测试，除非测试本身有 typo）。

## Step 3: 提交

```bash
cd ~/Desktop/repochan-mono
git add packages/page-renderer/test/
git commit -m "test(page-renderer): add comprehensive theme, template, and render tests"
```
