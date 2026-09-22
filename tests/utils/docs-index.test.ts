import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BM25_B,
  BM25_K1,
  CACHE_FILE,
  CACHE_TTL_MS,
  CHUNK_LINE_CAP,
  DOCS_URL,
  EXCERPT_CHAR_CAP,
  FULL_DOCS_MARKER,
  MCP_DEMOTE_FACTOR,
  MCP_PATH_PREFIX,
  META_FILE,
  PAGE_CHAR_CAP,
  buildIndex,
  chunkCorpus,
  getIndex,
  loadCorpus,
  pageBySlug,
  pathOf,
  queryTerms,
  slugOf,
  search,
  tocEntries,
  tokenize,
} from '../../src/utils/docs-index';
import { docsCacheDir } from '../../src/utils/docs-client';
import { DOCS_FIXTURE as FIXTURE, useDocsCacheDir } from '../helpers/docs-fixture';

const DEMOTE = { demotePathPrefix: MCP_PATH_PREFIX, demoteFactor: MCP_DEMOTE_FACTOR };

describe('docs-index constants', () => {
  it('exposes the expected constants', () => {
    expect(DOCS_URL).toBe('https://webdriver.io/llms-full.txt');
    expect(CHUNK_LINE_CAP).toBe(200);
    expect(EXCERPT_CHAR_CAP).toBe(1200);
    expect(CACHE_TTL_MS).toBeGreaterThan(0);
    expect(PAGE_CHAR_CAP).toBeGreaterThan(EXCERPT_CHAR_CAP);
    expect(BM25_K1).toBe(1.2);
    expect(BM25_B).toBe(0.75);
  });
});

const MARKER = FULL_DOCS_MARKER;

function corpusBody(title: string): string {
  return [MARKER, '', `# ${title}`, '', `${title} body text`, ''].join('\n');
}

interface StubResponse { status: number; etag?: string | null; body?: string }
interface StubCall { url: string; headers: Record<string, string> }

// The loader touches only status/ok/headers.get/text, so a plain object stands in for Response.
function stubFetch(...responses: StubResponse[]): { fetchImpl: typeof fetch; calls: StubCall[] } {
  const calls: StubCall[] = [];
  const fetchImpl = (async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url: String(url), headers: init?.headers ?? {} });
    const res = responses.shift();
    if (!res) { throw new Error('stubFetch: unexpected extra request'); }
    return {
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      headers: { get: (name: string) => (name.toLowerCase() === 'etag' ? res.etag ?? null : null) },
      text: async () => res.body ?? '',
    };
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('loadCorpus', () => {
  const { dir } = useDocsCacheDir('docs-');
  const cache = (): string => join(dir(), CACHE_FILE);
  const meta = (): string => join(dir(), META_FILE);
  const writeMeta = (etag: string | null, fetchedAt: number): void => {
    writeFileSync(meta(), JSON.stringify({ etag, fetchedAt }));
  };
  const readMeta = (): { etag: string | null; fetchedAt: number } => JSON.parse(readFileSync(meta(), 'utf8'));
  const STALE_AT = Date.now() - 60_000;

  it('serves a cache within the TTL without fetching', async () => {
    const body = corpusBody('Cached');
    writeFileSync(cache(), body);
    writeMeta('"v1"', Date.now());
    const { fetchImpl, calls } = stubFetch();
    await expect(loadCorpus({ url: DOCS_URL, cacheDir: dir(), fetchImpl, ttlMs: CACHE_TTL_MS })).resolves.toBe(body);
    expect(calls).toHaveLength(0);
  });

  it('revalidates a stale cache and reuses the body on 304', async () => {
    const body = corpusBody('Cached');
    writeFileSync(cache(), body);
    writeMeta('"v1"', STALE_AT);
    const { fetchImpl, calls } = stubFetch({ status: 304 });
    await expect(loadCorpus({ url: DOCS_URL, cacheDir: dir(), fetchImpl, ttlMs: 1 })).resolves.toBe(body);
    expect(calls[0].url).toBe(DOCS_URL);
    expect(calls[0].headers['If-None-Match']).toBe('"v1"');
    expect(readMeta().fetchedAt).toBeGreaterThan(STALE_AT);
  });

  it('rewrites cache and meta on a fresh 200', async () => {
    writeFileSync(cache(), corpusBody('Old'));
    writeMeta('"v1"', STALE_AT);
    const fresh = corpusBody('New');
    const { fetchImpl } = stubFetch({ status: 200, etag: '"v2"', body: fresh });
    await expect(loadCorpus({ url: DOCS_URL, cacheDir: dir(), fetchImpl, ttlMs: 1 })).resolves.toBe(fresh);
    expect(readFileSync(cache(), 'utf8')).toBe(fresh);
    expect(readMeta()).toEqual({ etag: '"v2"', fetchedAt: expect.any(Number) });
    expect(readMeta().fetchedAt).toBeGreaterThan(STALE_AT);
  });

  it('refetches unconditionally when the meta file is corrupt', async () => {
    writeFileSync(cache(), corpusBody('Old'));
    writeFileSync(meta(), '{ not json');
    const fresh = corpusBody('New');
    const { fetchImpl, calls } = stubFetch({ status: 200, etag: '"v2"', body: fresh });
    await expect(loadCorpus({ url: DOCS_URL, cacheDir: dir(), fetchImpl, ttlMs: 1 })).resolves.toBe(fresh);
    expect(calls[0].headers['If-None-Match']).toBeUndefined();
    expect(readFileSync(cache(), 'utf8')).toBe(fresh);
  });

  it('refetches when the meta timestamp is in the future', async () => {
    writeFileSync(cache(), corpusBody('Cached'));
    writeMeta('"v1"', Date.now() + 86_400_000);
    const fresh = corpusBody('New');
    const { fetchImpl, calls } = stubFetch({ status: 200, etag: '"v2"', body: fresh });
    await expect(loadCorpus({ url: DOCS_URL, cacheDir: dir(), fetchImpl, ttlMs: CACHE_TTL_MS })).resolves.toBe(fresh);
    expect(calls).toHaveLength(1);
    expect(readMeta().fetchedAt).toBeLessThanOrEqual(Date.now());
  });

  it('rejects when there is no cache and the fetch fails', async () => {
    const fetchImpl = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
    await expect(loadCorpus({ url: DOCS_URL, cacheDir: dir(), fetchImpl, ttlMs: 1 })).rejects.toThrow(/Failed to load/);
  });

  it('rejects when there is no cache and the response is not ok', async () => {
    const { fetchImpl } = stubFetch({ status: 503 });
    await expect(loadCorpus({ url: DOCS_URL, cacheDir: dir(), fetchImpl, ttlMs: 1 })).rejects.toThrow(/Failed to load/);
  });

  it('treats a marker-less cache file as no cache', async () => {
    writeFileSync(cache(), '');
    writeMeta('"v1"', STALE_AT);
    const fresh = corpusBody('New');
    const { fetchImpl } = stubFetch({ status: 200, etag: '"v2"', body: fresh });
    await expect(loadCorpus({ url: DOCS_URL, cacheDir: dir(), fetchImpl, ttlMs: 1 })).resolves.toBe(fresh);
    expect(readFileSync(cache(), 'utf8')).toBe(fresh);
  });

  it('keeps the previous cache when the fetched body has no marker', async () => {
    const body = corpusBody('Cached');
    writeFileSync(cache(), body);
    writeMeta('"v1"', STALE_AT);
    const { fetchImpl } = stubFetch({ status: 200, etag: '"v2"', body: '<html>error page</html>' });
    await expect(loadCorpus({ url: DOCS_URL, cacheDir: dir(), fetchImpl, ttlMs: 1 })).resolves.toBe(body);
    expect(readFileSync(cache(), 'utf8')).toBe(body);
  });

  it('rejects a marker-less body when there is no cache to fall back on', async () => {
    const { fetchImpl } = stubFetch({ status: 200, body: '<html>error page</html>' });
    await expect(loadCorpus({ url: DOCS_URL, cacheDir: dir(), fetchImpl, ttlMs: 1 })).rejects.toThrow(/Failed to load/);
    expect(existsSync(cache())).toBe(false);
  });
});

describe('tocEntries', () => {
  it('returns the TOC in document order with paths', () => {
    expect(tocEntries(FIXTURE)).toEqual([
      { title: 'waitUntil', path: '/docs/api/browser/waitUntil.md' },
      { title: 'Usage', path: '/docs/usage.md' },
    ]);
  });

  it('scans only the front block before the full-content marker', () => {
    const withLateEntry = `${FIXTURE}\n- [Late](/docs/late.md)\n`;
    expect(tocEntries(withLateEntry).some((e) => e.title === 'Late')).toBe(false);
  });
});

describe('slug encoding', () => {
  it('round-trips a docs path through its slug', () => {
    for (const path of ['/docs/appium.md', '/docs/api/element/waitUntil.md', '/docs/mcp/faq.md']) {
      expect(pathOf(slugOf(path))).toBe(path);
    }
  });

  it('produces a single URI path segment with no slash', () => {
    expect(slugOf('/docs/api/element/waitUntil.md')).toBe('docs~api~element~waitUntil.md');
    expect(slugOf('/docs/api/element/waitUntil.md')).not.toContain('/');
  });
});

describe('chunkCorpus', () => {
  it('does not treat headings inside fences as pages', () => {
    const titles = chunkCorpus(FIXTURE).map((c) => c.title);
    expect(titles).toContain('waitUntil');
    expect(titles).toContain('Usage');
    expect(titles).not.toContain('Not a page heading');
  });

  it('ignores a pipe-padded fence closer and an inline Example fence', () => {
    const text = [
      '# Full Documentation Content',
      '',
      '# waitUntil',
      '',
      'body',
      '',
      '```',
      'raw block',
      '``` |',
      '',
      '**Example:**``` should not toggle a fence',
      '',
      '# Usage',
      '',
      'second page',
      '',
    ].join('\n');
    const titles = chunkCorpus(text).map((c) => c.title);
    expect(titles).toEqual(['waitUntil', 'Usage']);
  });

  it('gives each page its own path when two pages share a title', () => {
    const text = [
      '# Docs',
      '',
      '- [waitUntil](/docs/api/browser/waitUntil.md)',
      '- [waitUntil](/docs/api/element/waitUntil.md)',
      '',
      '# Full Documentation Content',
      '',
      '# waitUntil',
      '',
      'browser form',
      '',
      '# waitUntil',
      '',
      'element form',
      '',
    ].join('\n');
    expect(chunkCorpus(text).map((c) => c.path)).toEqual([
      '/docs/api/browser/waitUntil.md',
      '/docs/api/element/waitUntil.md',
    ]);
  });

  it('leaves a page without a TOC entry without a path', () => {
    const text = [
      '# Docs',
      '',
      '- [Usage](/docs/usage.md)',
      '',
      '# Full Documentation Content',
      '',
      '# Unlisted',
      '',
      'body',
      '',
      '# Usage',
      '',
      'body',
      '',
    ].join('\n');
    const chunks = chunkCorpus(text);
    expect(chunks.map((c) => c.path)).toEqual([null, '/docs/usage.md']);
  });

  it('assigns every page a distinct page id', () => {
    const pages = chunkCorpus(FIXTURE).map((c) => c.page);
    expect(pages).toEqual([...pages].sort((a, b) => a - b));
    expect(new Set(pages).size).toBe(2);
  });

  it('strips Docusaurus anchor suffixes from titles', () => {
    const text = [
      '# Full Documentation Content',
      '',
      '# waitUntil[​](#waituntil "Direct link to waitUntil")',
      '',
      'body',
      '',
    ].join('\n');
    const chunks = chunkCorpus(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].title).toBe('waitUntil');
  });

  it('splits an oversized page at a later heading with updated trail', () => {
    const lines = Array.from({ length: CHUNK_LINE_CAP + 10 }, (_, i) => `line ${i + 1}`);
    const text = ['# Full Documentation Content', '', '# Big', '', ...lines, '', '## Later', '', 'tail', ''].join('\n');
    const chunks = chunkCorpus(text);
    expect(chunks).toHaveLength(2);
    expect(chunks[1].trail).toEqual(['Big', 'Later']);
    expect(chunks[0].page).toBe(chunks[1].page);
  });
});

describe('queryTerms', () => {
  it('drops closed-class English function words', () => {
    expect(queryTerms('how do I set up a custom reporter')).toEqual(['set', 'custom', 'reporter']);
  });

  it('keeps words that are WDIO API surface', () => {
    for (const word of ['before', 'after', 'on', 'is', 'until', 'set']) {
      expect(queryTerms(word)).toEqual([word]);
    }
  });

  it('falls back to the raw tokens when every token is a stopword', () => {
    expect(queryTerms('how do i')).toEqual(['how', 'do', 'i']);
  });

  it('leaves single-token API queries untouched', () => {
    expect(queryTerms('waitForDisplayed')).toEqual(['waitForDisplayed']);
  });
});

describe('tokenize', () => {
  it('yields the lowercase token plus camelCase segments', () => {
    const tokens = tokenize('waitUntil');
    expect(tokens).toContain('waituntil');
    expect(tokens).toContain('wait');
    expect(tokens).toContain('until');
  });

  it('drops sub-segments shorter than three characters', () => {
    expect(tokenize('XMLHttpRequest')).not.toContain('x');
  });
});

const COMPOUNDS = [
  '# Docs',
  '',
  '# Full Documentation Content',
  '',
  '# State Codes',
  '',
  'ConnectionClosed ConnectionReset ConnectionRefused ConnectionAborted ConnectionFailed',
  'ConnectionClosed ConnectionReset ConnectionRefused ConnectionAborted ConnectionFailed',
  'ConnectionClosed ConnectionReset ConnectionRefused ConnectionAborted ConnectionFailed',
  '',
  '# Prose',
  '',
  'A connection is opened, and the connection is then closed again.',
  '',
].join('\n');

describe('camelCase sub-segments are weaker evidence than literal tokens', () => {
  it('ranks a literal match above a purely morphological one', () => {
    const hits = search(buildIndex(COMPOUNDS), 'connection', 5);
    expect(hits.map((h) => h.title)).toEqual(['Prose', 'State Codes']);
  });

  it('still finds the compound token itself', () => {
    const hits = search(buildIndex(COMPOUNDS), 'connectionclosed', 5);
    expect(hits.map((h) => h.title)).toEqual(['State Codes']);
  });

  it('does not index single-character sub-segments', () => {
    const acronyms = [
      '# Docs',
      '',
      '# Full Documentation Content',
      '',
      '# Acronyms',
      '',
      'XMLHttpRequest',
      '',
    ].join('\n');
    expect(search(buildIndex(acronyms), 'x', 5)).toEqual([]);
  });
});

describe('search', () => {
  it('ranks the waitUntil chunk first with its own path', () => {
    const hits = search(buildIndex(FIXTURE), 'waitUntil', 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].title).toBe('waitUntil');
    expect(hits[0].path).toBe('/docs/api/browser/waitUntil.md');
  });

  it('still ranks a waitUntil chunk for a camelCase segment query', () => {
    const hits = search(buildIndex(FIXTURE), 'until', 5);
    expect(hits.some((h) => h.title === 'waitUntil')).toBe(true);
  });

  it('returns [] for a nonsense query', () => {
    expect(search(buildIndex(FIXTURE), 'zzzznotfound', 5)).toEqual([]);
  });

  it('sorts by descending score and respects the limit', () => {
    const hits = search(buildIndex(FIXTURE), 'waitUntil', 1);
    expect(hits).toHaveLength(1);
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it('returns excerpts within the character cap', () => {
    const hits = search(buildIndex(FIXTURE), 'waitUntil', 5);
    for (const hit of hits) {
      expect(hit.excerpt.length).toBeLessThanOrEqual(EXCERPT_CHAR_CAP);
    }
  });

  it('getIndex returns a cached index for the same text', () => {
    expect(getIndex(FIXTURE)).toBe(getIndex(FIXTURE));
    expect(getIndex(FIXTURE).chunks.length).toBeGreaterThan(0);
  });
});

describe('pageBySlug', () => {
  it('returns the whole page reassembled across chunks', () => {
    const index = buildIndex(FIXTURE);
    const page = pageBySlug(index, 'docs~api~browser~waitUntil.md');
    expect(page?.title).toBe('waitUntil');
    expect(page?.text).toContain('Waits until a condition');
  });

  it('returns null for an unknown slug', () => {
    expect(pageBySlug(buildIndex(FIXTURE), 'docs~nope.md')).toBeNull();
  });
});

describe('search demotion', () => {
  const MIXED = [
    '# Docs',
    '',
    '- [Transport](/docs/mcp/transport.md)',
    '- [Configuration](/docs/configuration.md)',
    '',
    '# Full Documentation Content',
    '',
    '# Transport',
    '',
    'transport configuration details',
    '',
    '# Configuration',
    '',
    'transport configuration details',
    '',
  ].join('\n');

  it('demotes a prefix-matching page when the query does not mention mcp', () => {
    const hits = search(buildIndex(MIXED), 'transport configuration', 5, DEMOTE);
    expect(hits[0].path).toBe('/docs/configuration.md');
  });

  it('leaves the demoted page first when the query mentions mcp', () => {
    const hits = search(buildIndex(MIXED), 'mcp transport', 5, DEMOTE);
    expect(hits[0].path).toBe('/docs/mcp/transport.md');
  });

  it('does not demote when no prefix is configured', () => {
    const hits = search(buildIndex(MIXED), 'transport configuration', 5);
    expect(hits.some((h) => h.path === '/docs/mcp/transport.md')).toBe(true);
  });
});

interface Expectation { query: string; title?: string; path?: string; maxRank: number }

// Frozen against the real corpus. The API-name rows are the no-regression gate: each
// ranked first before the title field existed, and must keep ranking first.
const EXPECTATIONS: Expectation[] = [
  { query: 'waitForDisplayed', title: 'waitForDisplayed', maxRank: 1 },
  { query: 'isDisplayed', title: 'isDisplayed', maxRank: 1 },
  { query: 'setValue', title: 'setValue', maxRank: 1 },
  { query: 'getText', title: 'getText', maxRank: 1 },
  { query: 'click', title: 'click', maxRank: 1 },
  { query: 'waitUntil', title: 'waitUntil', maxRank: 1 },
  { query: 'execute', title: 'execute', maxRank: 1 },
  { query: 'addValue', title: 'addValue', maxRank: 1 },
  { query: 'moveTo', title: 'moveTo', maxRank: 1 },
  { query: 'scrollIntoView', title: 'scrollIntoView', maxRank: 1 },
  { query: 'getAttribute', title: 'getAttribute', maxRank: 1 },
  { query: 'keys', title: 'keys', maxRank: 1 },
  { query: 'pause', title: 'pause', maxRank: 1 },
  { query: 'saveScreenshot', title: 'saveScreenshot', maxRank: 1 },
  { query: 'switchFrame', title: 'switchFrame', maxRank: 1 },
  { query: 'newWindow', title: 'newWindow', maxRank: 1 },
  { query: 'appium setup', path: '/docs/appium.md', maxRank: 1 },
  { query: 'appium service configuration', path: '/docs/appium-service.md', maxRank: 1 },
  { query: 'appium capabilities', path: '/docs/api/appium.md', maxRank: 1 },
  { query: 'appium capabilities', path: '/docs/capabilities.md', maxRank: 3 },
  { query: 'custom reporter', path: '/docs/customreporter.md', maxRank: 1 },
  { query: 'mcp transport', path: '/docs/mcp/transport.md', maxRank: 1 },
  { query: 'how do I set up a custom reporter', path: '/docs/customreporter.md', maxRank: 1 },
  // Measured limitation, not a target: any query containing "wire" is dominated by the
  // Wire Protocol pages, because `wire` (df 19, idf 3.415) outscores every real term in
  // the sentence. `appium setup` above is the same intent expressed as keywords. This row
  // asserts only that an appium page still surfaces, so a regression is still caught.
  { query: 'how to wire up appium in this config file', path: '/docs/appium-service.md', maxRank: 10 },
];

function rankOf(hits: { title: string; path: string | null }[], want: Expectation): number {
  return hits.findIndex((h) => (want.title !== undefined && h.title === want.title) || (want.path !== undefined && h.path === want.path));
}

const corpusPath = join(docsCacheDir(), CACHE_FILE);
const available = existsSync(corpusPath);

describe('live corpus (optional)', () => {
  // Read and index once: ~30 EXPECTATIONS rows otherwise re-read a ~3 MB file each.
  // Guarded because an unguarded read throws at collect time, which skips nothing.
  const liveText = available ? readFileSync(corpusPath, 'utf8') : '';
  const liveChunks = chunkCorpus(liveText);
  const liveIndex = getIndex(liveText);

  it.skipIf(!available)('chunks cleanly and resolves one path per page', () => {
    expect(liveChunks.length).toBeGreaterThanOrEqual(550);
    expect(liveChunks.length).toBeLessThanOrEqual(650);
    const titles = new Set(liveChunks.map((c) => c.title));
    for (const phantom of ['Bad - Class that might change', 'Add Tauri to Cargo.toml', 'or', 'By default, Powershell uses TLS 1.0 the site security requires TLS 1.2']) {
      expect(titles.has(phantom)).toBe(false);
    }
    expect([...titles].some((t) => t.includes('Direct link to'))).toBe(false);
    expect(liveChunks.filter((c) => c.path !== null).length).toBeGreaterThan(liveChunks.length / 2);
  });

  it.skipIf(!available)('aligns every TOC entry to a page', () => {
    const entries = tocEntries(liveText);
    expect(entries.length).toBeGreaterThanOrEqual(380);
    expect(entries.every((e) => !e.path.includes('~'))).toBe(true);
    expect(new Set(entries.map((e) => slugOf(e.path))).size).toBe(entries.length);
    const paths = new Set(liveChunks.map((c) => c.path));
    expect(entries.every((e) => paths.has(e.path))).toBe(true);
  });

  it.skipIf(!available)('gives every chunk of a split page its page path', () => {
    const byPage = new Map<number, (string | null)[]>();
    for (const c of liveChunks) { byPage.set(c.page, [...(byPage.get(c.page) ?? []), c.path]); }
    for (const paths of byPage.values()) {
      expect(new Set(paths).size).toBe(1);
    }
    expect(new Set(liveChunks.map((c) => c.path).filter(Boolean)).size).toBe(434);
  });

  it.skipIf(!available)('gives the two waitUntil pages different paths', () => {
    const hits = search(liveIndex, 'waitUntil', 2, DEMOTE);
    expect(hits.map((h) => h.path)).toEqual(['/docs/api/browser/waitUntil.md', '/docs/api/element/waitUntil.md']);
  });

  it.skipIf(!available)('never puts an mcp page in the top 3 of a framework question', () => {
    for (const query of ['how to wire up appium in this config file', 'how do I set up a custom reporter']) {
      const top = search(liveIndex, query, 3, DEMOTE);
      expect(top.some((h) => h.path?.startsWith(MCP_PATH_PREFIX))).toBe(false);
    }
  });

  for (const want of EXPECTATIONS) {
    it.skipIf(!available)(`ranks "${want.query}" within ${want.maxRank}`, () => {
      const rank = rankOf(search(liveIndex, want.query, 10, DEMOTE), want);
      expect(rank).toBeGreaterThanOrEqual(0);
      expect(rank).toBeLessThan(want.maxRank);
    });
  }
});