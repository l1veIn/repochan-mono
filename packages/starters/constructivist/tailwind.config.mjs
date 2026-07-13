/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        // Persona-driven tokens — values come from CSS variables injected
        // by SiteLayout at build time. Changing the persona JSON changes
        // every color in the site automatically.
        primary: "var(--c-primary)",
        base: "var(--c-base)",
        accent1: "var(--c-accent-1)",
        accent2: "var(--c-accent-2)",
      },
      fontFamily: {
        sans: ['"Space Grotesk"', "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', '"Fira Code"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
