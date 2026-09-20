import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { EXCERPT_CHAR_CAP } from '../../src/utils/docs-index';
import { queryDocsTool, queryDocsToolDefinition } from '../../src/tools/query-docs.tool';
import { DOCS_FIXTURE as FIXTURE } from '../helpers/docs-fixture';

type ToolFn = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;
const callTool = queryDocsTool as unknown as ToolFn;

let tempDir: string;
let prevEnv: string | undefined;

const BIG_FIXTURE = `${FIXTURE}\n${Array.from({ length: 120 }, (_, i) => `zzfiller line ${i} padding the page body`).join('\n')}\n`;

function stubFetchOk(corpus = FIXTURE) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ etag: '"test-etag"' }),
    text: async () => corpus,
  }));
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'wdio-docs-'));
  prevEnv = process.env.WDIO_MCP_CACHE_DIR;
  process.env.WDIO_MCP_CACHE_DIR = tempDir;
  stubFetchOk();
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (prevEnv === undefined) {
    delete process.env.WDIO_MCP_CACHE_DIR;
  } else {
    process.env.WDIO_MCP_CACHE_DIR = prevEnv;
  }
  rmSync(tempDir, { recursive: true, force: true });
});

describe('query_docs tool', () => {
  it('exposes a tool definition', () => {
    expect(queryDocsToolDefinition.name).toBeTruthy();
    expect(queryDocsToolDefinition.inputSchema).toBeTruthy();
  });

  it('returns matching docs on the happy path', async () => {
    const result = await callTool({ query: 'waitUntil' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('waitUntil');
  });

  it('caps the excerpt but returns the whole chunk for fullPage', async () => {
    stubFetchOk(BIG_FIXTURE);
    const excerpt = await callTool({ query: 'zzfiller' });
    const full = await callTool({ query: 'zzfiller', fullPage: true });
    expect(full.isError).toBeFalsy();
    expect(excerpt.content[0].text.length).toBeLessThan(EXCERPT_CHAR_CAP * 2);
    expect(full.content[0].text.length).toBeGreaterThan(excerpt.content[0].text.length);
  });

  it('returns a distinct full body per hit when two pages share a title', async () => {
    const duplicateTitles = [
      '# Docs',
      '',
      '- [waitUntil](/docs/api/browser/waitUntil.md)',
      '',
      '# Full Documentation Content',
      '',
      '# waitUntil',
      '',
      'Body A about waitUntil.',
      '',
      '# waitUntil',
      '',
      'Body B about waitUntil.',
      '',
    ].join('\n');
    stubFetchOk(duplicateTitles);
    const result = await callTool({ query: 'waitUntil', fullPage: true });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Body A about waitUntil.');
    expect(result.content[0].text).toContain('Body B about waitUntil.');
  });

  it('returns a well-formed response for a query matching nothing', async () => {
    const result = await callTool({ query: 'zzzznotfound' });
    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    expect(typeof result.content[0].text).toBe('string');
  });

  it('writes the cache file after a successful call', async () => {
    await callTool({ query: 'waitUntil' });
    expect(existsSync(join(tempDir, 'llms-full.txt'))).toBe(true);
  });

  it('falls back to ~/.wdio-mcp when WDIO_MCP_CACHE_DIR is unset', async () => {
    delete process.env.WDIO_MCP_CACHE_DIR;
    const cachePath = join(homedir(), '.wdio-mcp', 'llms-full.txt');
    if (!existsSync(cachePath)) {
      console.warn(`Skipping fallback-dir test: no cached copy at ${cachePath}. Run the tool once with network access to populate it.`);
      return;
    }
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await callTool({ query: 'waitUntil' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('waitUntil');
  });

  it('returns isError with "No cached copy at" when offline with no cache', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    for (const entry of readdirSync(tempDir)) {
      rmSync(join(tempDir, entry), { recursive: true, force: true });
    }
    const result = await callTool({ query: 'waitUntil' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No cached copy at');
  });
});
