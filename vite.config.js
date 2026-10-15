import { defineConfig } from 'vite';
import { relayPlugin } from './server/relay.js';

export default defineConfig({
  base: './',
  plugins: [relayPlugin()],
  server: { open: true },
  build: { chunkSizeWarningLimit: 2000 },
});
