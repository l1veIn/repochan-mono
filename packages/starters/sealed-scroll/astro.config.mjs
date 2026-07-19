import { defineConfig } from 'astro/config';

// The Sealed Scroll — hand-written minimal Astro static build.
// No `site` is set: the deployment target is decided by whoever pulls this
// starter; og:image therefore uses a root-relative path.
export default defineConfig({
  output: 'static',
  build: {
    format: 'directory',
  },
});
