#!/usr/bin/env node
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// The specifier is a variable so TypeScript does not try to resolve it: this
// project uses node10 module resolution, which ignores the package's exports map
// (the same reason emulate-device.tool.ts reaches into webdriverio's build dir).
const showTraceSpecifier = '@wdio/devtools-backend/show-trace';
const { runShowTraceCli } = (await import(showTraceSpecifier)) as {
  runShowTraceCli: (args: string[]) => Promise<void>;
};

function findLatestZip(dir: string): string | null {
  if (!existsSync(dir)) {
    return null;
  }

  const newest = readdirSync(dir)
    .filter((entry) => entry.endsWith('.zip'))
    .map((entry) => ({ entry, mtime: statSync(join(dir, entry)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0];

  return newest ? join(dir, newest.entry) : null;
}

const argPath = process.argv[2];
const zipPath = argPath
  ? resolve(argPath)
  : (findLatestZip(join(process.cwd(), 'test-results')) ?? findLatestZip(join(process.cwd(), '.trace')));

if (!zipPath || !existsSync(zipPath)) {
  console.error(
    zipPath ? `File not found: ${zipPath}` : 'No trace found — run a session with trace enabled, or pass a zip path.',
  );
  console.error('Usage: wdio-show-trace [trace.zip]');
  process.exit(1);
}

await runShowTraceCli([zipPath]);
