import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite ≥5.4.12 only sends CORS headers to localhost origins by default. The app is loaded as
// ES modules, which browsers fetch in CORS mode, so when the live preview embeds the dev server
// in a frame with another origin (the *.e2b.app preview host, or `null` for a sandboxed frame)
// every script is blocked and the page stays blank. Allow exactly those origins (dev/preview only).
const cors = {
  origin: [
    /^https?:\/\/(?:(?:[^:]+\.)?localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/,
    /^https:\/\/[a-z0-9-]+\.e2b\.app$/,
    'null',
  ],
};

export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true, cors },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true, cors },
});
