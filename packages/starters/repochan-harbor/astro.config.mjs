import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  trailingSlash: "always",
  vite: {
    build: {
      cssMinify: true,
    },
  },
});
