import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    server: 'src/server.ts',
    'show-trace': 'src/show-trace.ts',
  },
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  platform: 'node',
  outDir: 'lib',

  external: ['zod', '@wdio/electron-service', '@wdio/elements'],
});
