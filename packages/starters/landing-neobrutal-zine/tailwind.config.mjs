/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        // 值来自 CSS 变量（SiteLayout 经 buildCssVars() 从 repochan/site.json 注入）
        zine: {
          blue: "var(--blue)",
          pink: "var(--pink)",
          purple: "var(--purple)",
          mint: "var(--mint)",
          yellow: "var(--yellow)",
          ink: "var(--ink)",
          paper: "var(--paper)",
        },
      },
    },
  },
  plugins: [],
};
