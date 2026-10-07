import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../server/package.json', import.meta.url), 'utf8')).version;

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { port: 5173, host: true, proxy: { '/api': 'http://localhost:3000' } },
  // Compatible con iPhone desde iOS 15 y Android recientes.
  build: { outDir: 'dist', sourcemap: true, target: ['es2020', 'safari15', 'chrome100'] },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
