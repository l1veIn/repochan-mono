/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        // Persona palette — values come from CSS variables injected by
        // SiteLayout via src/lib/site.ts. Change the tokens in one place
        // and every color in the site follows.
        ink: "var(--ink)",
        base: "var(--bg)",
        base2: "var(--bg2)",
        blue: "var(--blue)",
        pink: "var(--pink)",
        purple: "var(--purple)",
        green: "var(--green)",
        yellow: "var(--yellow)",
        txt: "var(--txt)",
        dim: "var(--dim)",
      },
      fontFamily: {
        sans: ['"Noto Sans SC"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
        hand: ['"Permanent Marker"', "cursive"],
      },
    },
  },
  plugins: [],
};
