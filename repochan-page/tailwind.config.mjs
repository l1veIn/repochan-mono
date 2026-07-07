/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        ink: "#0F172A",
        panel: "#172033",
        blueprint: "#3B82F6",
        cyanline: "#6EE7FF",
        violet: "#A78BFA",
        blush: "#F9A8D4",
        paper: "#F8FAFC",
        mint: "#DDFCF7"
      },
      boxShadow: {
        "soft-line": "0 24px 80px rgba(15, 23, 42, 0.16)"
      }
    }
  },
  plugins: []
};
