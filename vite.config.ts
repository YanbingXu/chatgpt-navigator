import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vite';

import manifest from './manifest.json';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV === 'development',
  },
});
