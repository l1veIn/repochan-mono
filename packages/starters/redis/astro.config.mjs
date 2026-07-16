import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  output: "static",
  devToolbar: { enabled: false },
  integrations: [tailwind()],
});
