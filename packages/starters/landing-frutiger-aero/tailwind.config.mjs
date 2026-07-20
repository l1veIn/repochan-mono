/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      // Colors come from repochan/site.json — expanded into CSS variables by
      // src/lib/site.ts buildCssVars() and injected inline by SiteLayout.
      // Do not add palette literals here; `repochan starter validate` rejects them.
    },
  },
  plugins: [],
};
