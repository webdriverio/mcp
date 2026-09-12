#!/usr/bin/env node
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// The specifier is a variable so TypeScript does not try to resolve it: this
// project uses node10 module resolution, which ignores the package's exports map
// (the same reason emulate-device.tool.ts reaches into webdriverio's build dir).
const showTraceSpecifier = '@wdio/devtools-backend/show-trace';

function newestZip(dir: string): string | null {
  if (!existsSync(dir)) {
    return null;
  }

  let newest: { path: string; mtime: number } | null = null;
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.zip')) {
      continue;
    }
    const path = join(dir, entry);
    const mtime = statSync(path).mtimeMs;
    if (!newest || mtime > newest.mtime) {
      newest = { path, mtime };
    }
  }

  return newest?.path ?? null;
}

const argPath = process.argv[2];
const zipPath = argPath
  ? resolve(argPath)
  : (newestZip(join(process.cwd(), 'test-results')) ?? newestZip(join(process.cwd(), '.trace')));

if (!zipPath || !existsSync(zipPath)) {
  console.error(
    zipPath ? `File not found: ${zipPath}` : 'No trace found — run a session with trace enabled, or pass a zip path.',
  );
  console.error('Usage: wdio-show-trace [trace.zip]');
  process.exit(1);
}

const { runShowTraceCli } = (await import(showTraceSpecifier)) as {
  runShowTraceCli: (args: string[]) => Promise<void>;
};
await runShowTraceCli([zipPath]);
