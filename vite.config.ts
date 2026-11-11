import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'blake3-wasm/browser.js': fileURLToPath(new URL('./blake3-disabled.js', import.meta.url)),
    },
    dedupe: ['@siglum/filesystem'],
  },
  build: { target: 'esnext' },
  define: { global: 'globalThis' },
});
