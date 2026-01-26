import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  // Use base path only for production (GitHub Pages), root path for dev
  base: mode === 'production' ? '/sticker-dream/' : '/',
  server: {
    port: 7767,
    host: '0.0.0.0', // Listen on all network interfaces
    strictPort: true,
  },
}));

