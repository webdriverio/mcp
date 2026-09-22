import { homedir } from 'node:os';
import { join } from 'node:path';
import { DOCS_URL, getIndex, loadCorpus } from './docs-index';
import type { DocsIndex } from './docs-index';

// Boundary layer: reads env and the home directory so docs-index stays a pure library.
export function docsCacheDir(): string {
  return process.env.WDIO_MCP_CACHE_DIR || join(homedir(), '.wdio-mcp');
}

export async function loadDocsIndex(): Promise<DocsIndex> {
  const text = await loadCorpus({ url: DOCS_URL, cacheDir: docsCacheDir(), fetchImpl: fetch });
  return getIndex(text);
}