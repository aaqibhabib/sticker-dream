import { defineConfig } from 'vite';

// Use BUILD_TIME env var from GitHub Actions, or generate current time
const buildTime = process.env.BUILD_TIME || new Date().toLocaleString('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

export default defineConfig(({ mode }) => ({
  // Use base path only for production (GitHub Pages), root path for dev
  base: mode === 'production' ? '/sticker-dream/' : '/',
  server: {
    port: 7767,
    host: '0.0.0.0', // Listen on all network interfaces
    strictPort: true,
  },
  worker: {
    format: 'es',
  },
  define: {
    '__BUILD_TIME__': JSON.stringify(buildTime),
  },
}));

