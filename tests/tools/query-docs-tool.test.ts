import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decode } from '@toon-format/toon';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CACHE_FILE, EXCERPT_CHAR_CAP, FULL_DOCS_MARKER } from '../../src/utils/docs-index';
import { queryDocsTool, queryDocsToolDefinition } from '../../src/tools/query-docs.tool';
import { DOCS_FIXTURE as FIXTURE, useDocsCacheDir } from '../helpers/docs-fixture';

type ToolFn = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;
const callTool = queryDocsTool as unknown as ToolFn;

const { dir } = useDocsCacheDir('wdio-docs-');

const BIG_FIXTURE = `${FIXTURE}\n${Array.from({ length: 120 }, (_, i) => `zzfiller line ${i} padding the page body`).join('\n')}\n`;

function stubFetchOk(corpus = FIXTURE) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ etag: '"test-etag"' }),
    text: async () => corpus,
  }));
}

const FALLBACK_CACHE = join(homedir(), '.wdio-mcp', CACHE_FILE);

beforeEach(() => { stubFetchOk(); });

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
      FULL_DOCS_MARKER,
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
    const decoded = decode(result.content[0].text) as { hits: unknown[] };
    expect(decoded.hits).toHaveLength(2);
  });

  it("collapses a page's sibling chunks into one fullPage record", async () => {
    const splitPage = [
      '# Docs',
      '',
      '- [waitUntil](/docs/api/browser/waitUntil.md)',
      '',
      FULL_DOCS_MARKER,
      '',
      '# waitUntil',
      '',
      ...Array.from({ length: 210 }, (_, i) => `zzsplit filler line ${i}`),
      '',
      '## Second Section',
      '',
      'zzsplit tail paragraph.',
      '',
    ].join('\n');
    stubFetchOk(splitPage);
    const excerpted = decode((await callTool({ query: 'zzsplit' })).content[0].text) as { hits: unknown[] };
    const full = decode((await callTool({ query: 'zzsplit', fullPage: true })).content[0].text) as { hits: { excerpt: string }[] };
    expect(excerpted.hits.length).toBeGreaterThan(1);
    expect(full.hits).toHaveLength(1);
    expect(full.hits[0].excerpt).toContain('zzsplit filler line 0');
    expect(full.hits[0].excerpt).toContain('zzsplit tail paragraph.');
  });

  it('does not let one split page starve the others under a fullPage limit', async () => {
    const saturatedPage = [
      '# Docs',
      '',
      '- [zzalpha](/docs/zzalpha.md)',
      '- [zzbeta](/docs/zzbeta.md)',
      '- [zzgamma](/docs/zzgamma.md)',
      '',
      FULL_DOCS_MARKER,
      '',
      '# zzalpha',
      '',
      ...Array.from({ length: 210 }, (_, i) => `zzterm zzalpha filler ${i}`),
      '',
      '## Section 2',
      '',
      ...Array.from({ length: 210 }, (_, i) => `zzterm zzalpha filler s2 ${i}`),
      '',
      '## Section 3',
      '',
      ...Array.from({ length: 210 }, (_, i) => `zzterm zzalpha filler s3 ${i}`),
      '',
      '## Section 4',
      '',
      'zzterm tail.',
      '',
      '# zzbeta',
      '',
      ...Array.from({ length: 30 }, (_, i) => `zzbeta filler ${i}`),
      '',
      'zzterm once.',
      '',
      '# zzgamma',
      '',
      ...Array.from({ length: 210 }, (_, i) => `zzterm zzgamma filler ${i}`),
      '',
      '## Later',
      '',
      ...Array.from({ length: 210 }, (_, i) => `zzterm zzgamma filler later ${i}`),
      '',
    ].join('\n');
    stubFetchOk(saturatedPage);
    const excerpted = decode((await callTool({ query: 'zzterm' })).content[0].text) as { hits: { path: string | null }[] };
    const full = decode((await callTool({ query: 'zzterm', fullPage: true, limit: 2 })).content[0].text) as { hits: { path: string | null }[] };
    expect(excerpted.hits).toHaveLength(5);
    expect(new Set(excerpted.hits.map((h) => h.path)).size).toBeGreaterThan(1);
    expect(full.hits).toHaveLength(2);
    expect(new Set(full.hits.map((h) => h.path)).size).toBe(2);
  });

  it('returns a well-formed response for a query matching nothing', async () => {
    const result = await callTool({ query: 'zzzznotfound' });
    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    expect(typeof result.content[0].text).toBe('string');
  });

  it('writes the cache file after a successful call', async () => {
    await callTool({ query: 'waitUntil' });
    expect(existsSync(join(dir(), CACHE_FILE))).toBe(true);
  });

  it.skipIf(!existsSync(FALLBACK_CACHE))('falls back to ~/.wdio-mcp when WDIO_MCP_CACHE_DIR is unset', async () => {
    delete process.env.WDIO_MCP_CACHE_DIR;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await callTool({ query: 'waitUntil' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('waitUntil');
  });

  it('returns isError with "No cached copy at" when offline with no cache', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    for (const entry of readdirSync(dir())) {
      rmSync(join(dir(), entry), { recursive: true, force: true });
    }
    const result = await callTool({ query: 'waitUntil' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No cached copy at');
  });
});
