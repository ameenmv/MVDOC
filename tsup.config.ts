import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/bin/cli.ts', 'src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: false,
  target: 'node20',
  outDir: 'dist',
  splitting: false,
  shims: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
