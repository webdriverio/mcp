import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    server: 'src/server.ts',
    snapshot: 'src/snapshot.ts',
    trace: 'src/trace.ts',
    'show-trace': 'src/show-trace.ts',
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
