import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    server: 'src/server.ts',
    snapshot: 'src/snapshot.ts',
  },
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  platform: 'node',
  outDir: 'lib',

  external: ['zod'],
});
