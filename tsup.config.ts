import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/cli/index.ts'], // Entry points
  format: ['esm'], // Build for commonJS and ESmodules
  dts: true, // Generate declaration file (.d.ts)
  splitting: false,
  sourcemap: true,
  clean: true,
  platform: 'node',
  outDir: 'lib',

  external: ['zod'],
});
