import { afterEach, beforeEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FULL_DOCS_MARKER } from '../../src/utils/docs-index';

// Single owner of the WDIO_MCP_CACHE_DIR lifecycle: a leaked env var would point every
// later suite at a temp dir this teardown already deleted.
export function useDocsCacheDir(prefix: string): { dir: () => string } {
  let dir = '';
  let prevEnv: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), prefix));
    prevEnv = process.env.WDIO_MCP_CACHE_DIR;
    process.env.WDIO_MCP_CACHE_DIR = dir;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (prevEnv === undefined) {
      delete process.env.WDIO_MCP_CACHE_DIR;
    } else {
      process.env.WDIO_MCP_CACHE_DIR = prevEnv;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  return { dir: () => dir };
}

// Shared corpus fixture for the docs-index and query-docs tests. It must stay in sync
// with the alignment it exercises: the two TOC entries match the two pages in order, so
// a page whose TOC entry is missing (see the unlisted-page test) is the only way to get
// a chunk without a path.
export const DOCS_FIXTURE = [
  '# WebdriverIO Docs',
  '',
  '- [waitUntil](/docs/api/browser/waitUntil.md)',
  '- [Usage](/docs/usage.md)',
  '',
  '---',
  '',
  FULL_DOCS_MARKER,
  '',
  '# waitUntil',
  '',
  'Waits until a condition returns true.',
  '',
  '```js',
  '# Not a page heading',
  "browser.waitUntil(() => $('#foo').isDisplayed(), { timeout: 5000 })",
  '```',
  '',
  '## Parameters',
  '',
  '| name | type |',
  '| --- | --- |',
  '| condition | `Function` |',
  '',
  '```',
  'raw block',
  '``` |',
  '',
  '# Usage',
  '',
  'Second page body mentions waitUntil too.',
  '',
  '## Options',
  '',
  'timeout in milliseconds',
  '',
].join('\n');