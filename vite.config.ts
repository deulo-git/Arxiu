import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const api = `http://127.0.0.1:${process.env.PORT || 3000}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': api,
      '/s/': api,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
