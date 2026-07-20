/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      // No color palette here: all color tokens live in repochan/site.json and
      // reach the page as CSS variables injected by BaseLayout (see src/lib/site.ts).
      fontFamily: {
        sans: ['"Noto Sans SC"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
        disp: ["Anton", '"Noto Sans SC"', "sans-serif"],
        jp: ['"Zen Kaku Gothic New"', '"Noto Sans SC"', "sans-serif"],
      },
    },
  },
  plugins: [],
};
