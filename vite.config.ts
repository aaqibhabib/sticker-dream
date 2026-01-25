import { defineConfig } from 'vite';

export default defineConfig({
  // Base path for GitHub Pages deployment
  base: '/sticker-dream/',
  server: {
    port: 7767,
    host: true,
    allowedHosts: ['local.wesbos.com'],
  },
});

