import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const DOCS_URL = 'https://webdriver.io/llms-full.txt';
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const CHUNK_LINE_CAP = 200;
export const EXCERPT_CHAR_CAP = 1200;

export interface TocEntry { title: string; path: string }
export interface DocChunk { page: number; title: string; trail: string[]; text: string; path: string | null }
export interface DocHit { chunkIndex: number; page: number; title: string; trail: string[]; path: string | null; score: number; excerpt: string }
export interface DocField { postings: Map<string, Map<number, number>>; lengths: number[]; avgdl: number }
export interface DocsIndex { chunks: DocChunk[]; fields: DocField[]; toc: TocEntry[] }
export interface SearchOptions { demotePathPrefix?: string; demoteFactor?: number }

export interface LoadCorpusOptions {
  url: string;
  cacheDir: string;
  fetchImpl: typeof fetch;
  ttlMs?: number;
}

const CACHE_FILE = 'llms-full.txt';
const META_FILE = 'llms-full.meta.json';
const FULL_DOCS_MARKER = '# Full Documentation Content';
const TOC_ENTRY = /^- \[([^\]]+)\]\(([^)]+\.md)\)/;
const FENCE_OPEN = /^\s*(`{3,})\s*([A-Za-z0-9_+.-]*)\s*$/;
const FENCE_CLOSE = /^\s*(`{3,})\s*\|?\s*$/;
const HEADING_LINE = /^(#{1,6})\s+(.*)$/;
const ANCHOR_SUFFIX = /\[[^\]]*\]\(#.*\)\s*$/;
const WORD = /[A-Za-z0-9]+/g;
// Field 0 = whole tokens, field 1 = camelCase sub-segments, field 2 = page title plus
// section trail. Field 0/1 are split so a morphological match (`ConnectionClosed`
// matching `connection`) is weaker evidence than a literal one — a tf discount inside
// one field cannot express that, BM25 saturation leaves the false positive standing.
// Field 2 exists so a page *named* `click` outranks prose that merely mentions it.
const FIELD_WEIGHTS = [1.0, 0.4, 1.0];
const SUB_SEGMENT_MIN_LEN = 3;
const TITLE_FIELD = 2;
// Closed-class English function words. Derived grammatically, not from corpus frequency:
// `i` has df 59 (0.1·n) and idf 2.299, so on both frequency signals it looks like a
// content word — only grammar separates it from `appium`. A df threshold cannot find it.
// Excluded because they are WDIO API surface rather than English, and dropping them
// would break a real query: `before`/`after` are hook names, `on` is onPrepare, `is` is
// isDisplayed, `until` is waitUntil, `set` is setValue. The usual closed-class members
// `is` and `on` are therefore absent from the list below.
const STOPWORDS = new Set([
  'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'it', 'its',
  'they', 'them', 'their', 'this', 'that', 'these', 'those', 'a', 'an', 'the',
  'am', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'have', 'has', 'had',
  'can', 'could', 'shall', 'should', 'will', 'would', 'may', 'might', 'must',
  'how', 'when', 'where', 'why', 'what', 'which', 'who', 'whom', 'whose',
  'about', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'off', 'out', 'over', 'than', 'then',
  'through', 'to', 'under', 'up', 'with', 'without',
  'and', 'but', 'or', 'nor', 'so', 'yet', 'as', 'if', 'not', 'no', 'only', 'just', 'very', 'too',
  'there', 'here', 'such', 'any', 'some',
]);
export const PAGE_CHAR_CAP = 40_000;
export const MCP_PATH_PREFIX = '/docs/mcp/';
export const MCP_DEMOTE_FACTOR = 0.25;

export async function loadCorpus(opts: LoadCorpusOptions): Promise<string> {
  const { url, cacheDir, fetchImpl, ttlMs = CACHE_TTL_MS } = opts;
  // ponytail: single home-dir cache path, no OS-specific cache dir, upgrade to `env-paths` if users complain about polluting `$HOME`.
  const cachePath = join(cacheDir, CACHE_FILE);
  const metaPath = join(cacheDir, META_FILE);
  let cached: string | null = null;
  if (existsSync(cachePath)) {
    try {
      cached = readFileSync(cachePath, 'utf8');
    } catch {
      cached = null;
    }
  }
  let etag: string | null = null;
  let fetchedAt = 0;
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { etag?: string | null; fetchedAt?: number };
      etag = meta.etag ?? null;
      fetchedAt = meta.fetchedAt ?? 0;
    } catch {
      etag = null;
      fetchedAt = 0;
    }
  }
  if (cached !== null && Date.now() - fetchedAt < ttlMs) { return cached; }
  const stale = (reason: unknown): string => {
    if (cached !== null) return cached;
    throw new Error(`Failed to load WebdriverIO docs from ${url}: ${reason}. No cached copy at ${cachePath}.`);
  };
  let res: Response;
  try {
    const headers: Record<string, string> = {};
    if (etag) { headers['If-None-Match'] = etag; }
    res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    return stale(e instanceof Error ? e.message : String(e));
  }
  if (res.status === 304) {
    if (cached === null) return stale('HTTP 304');
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(metaPath, JSON.stringify({ etag, fetchedAt: Date.now() }));
    return cached;
  }
  if (!res.ok) return stale(`HTTP ${res.status}`);
  let text: string;
  try {
    text = await res.text();
  } catch (e) {
    return stale(e instanceof Error ? e.message : String(e));
  }
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cachePath, text);
  writeFileSync(metaPath, JSON.stringify({ etag: res.headers.get('etag'), fetchedAt: Date.now() }));
  return text;
}

export function tocEntries(text: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const markerAt = text.indexOf(FULL_DOCS_MARKER);
  const front = markerAt >= 0 ? text.slice(0, markerAt) : text;
  for (const line of front.split('\n')) {
    const m = TOC_ENTRY.exec(line);
    if (m) { entries.push({ title: m[1], path: m[2] }); }
  }
  return entries;
}

export function slugOf(path: string): string {
  return path.replace(/^\//, '').replace(/\//g, '~');
}

export function pathOf(slug: string): string {
  return `/${slug.replace(/~/g, '/')}`;
}

// Corpus pages appear in the TOC's order, but 21 of 438 have no TOC entry, so a
// title→paths map cannot address a specific page: it hands both `waitUntil` pages
// both paths. Walking both sequences in step gives each page exactly one path.
// A desync stalls the pointer and strands every later entry, so it fails loudly.
function resolvePagePaths(chunks: DocChunk[], entries: TocEntry[]): { matched: number; leftover: number } {
  const seen = new Set<number>();
  const pagePaths = new Map<number, string>();
  let ptr = 0;
  for (const chunk of chunks) {
    if (seen.has(chunk.page)) { continue; }
    seen.add(chunk.page);
    if (ptr < entries.length && entries[ptr].title === chunk.title) {
      pagePaths.set(chunk.page, entries[ptr].path);
      ptr += 1;
    }
  }
  // Every chunk of a page carries its path, not just the first: a split page's later
  // chunks are separately searchable, and a hit without a path loses both its citation
  // and its /docs/mcp/ demotion.
  for (const chunk of chunks) {
    chunk.path = pagePaths.get(chunk.page) ?? null;
  }
  return { matched: ptr, leftover: entries.length - ptr };
}

export function chunkCorpus(text: string, entries: TocEntry[] = tocEntries(text)): DocChunk[] {
  const markerAt = text.indexOf(FULL_DOCS_MARKER);
  const lines = (markerAt >= 0 ? text.slice(markerAt + FULL_DOCS_MARKER.length) : text).split('\n');
  const chunks: DocChunk[] = [];
  let fence: number | null = null;
  let page = -1;
  let pageTitle = '';
  let sections: { level: number; title: string }[] = [];
  let buf: string[] = [];
  const flush = (): void => {
    if (page >= 0 && buf.length > 0) {
      chunks.push({ page, title: pageTitle, trail: [pageTitle, ...sections.map((s) => s.title)], text: buf.join('\n'), path: null });
    }
    buf = [];
  };
  for (const line of lines) {
    if (fence !== null) {
      const closer = FENCE_CLOSE.exec(line);
      if (closer && closer[1].length >= fence) { fence = null; }
      buf.push(line);
      continue;
    }
    const opener = FENCE_OPEN.exec(line);
    if (opener) {
      fence = opener[1].length;
      buf.push(line);
      continue;
    }
    const heading = HEADING_LINE.exec(line);
    if (!heading) {
      buf.push(line);
      continue;
    }
    const level = heading[1].length;
    const title = heading[2].replace(ANCHOR_SUFFIX, '').trim();
    if (level === 1) {
      flush();
      page += 1;
      pageTitle = title;
      sections = [];
    } else if (page >= 0) {
      if (buf.length > CHUNK_LINE_CAP) flush();
      while (sections.length > 0 && sections[sections.length - 1].level >= level) sections.pop();
      sections.push({ level, title });
    }
    buf.push(line);
  }
  flush();
  const { matched, leftover } = resolvePagePaths(chunks, entries);
  if (leftover > 0) {
    console.error(`[docs-index] ${leftover} TOC entries were not matched to a page and ${matched} were; page paths may be misaligned.`);
  }
  return chunks;
}

function termsOf(raw: string): string[] {
  const whole = raw.toLowerCase();
  const out = [whole];
  for (const part of raw.split(/(?=[A-Z])/)) {
    const segment = part.toLowerCase();
    if (segment.length >= SUB_SEGMENT_MIN_LEN && segment !== whole) out.push(segment);
  }
  return out;
}

// Field 0 indexes whole tokens only and the rest carry sub-segments, so a query term
// is never looked up in a field that never held that form of it. Emitting segments
// for every field instead would match `wait` from `waitForDisplayed` against ordinary
// prose, which is what pulled conceptual pages above the API page.
const FIELD_TERMS = [(raw: string): string[] => [raw.toLowerCase()], termsOf, termsOf];

export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const m of text.matchAll(WORD)) tokens.push(...termsOf(m[0]));
  return tokens;
}

export function queryTerms(query: string): string[] {
  const raw = [...query.matchAll(WORD)].map((m) => m[0]);
  const kept = raw.filter((t) => !STOPWORDS.has(t.toLowerCase()));
  return [...new Set(kept.length > 0 ? kept : raw)];
}

function emptyField(): DocField {
  return { postings: new Map(), lengths: [], avgdl: 0 };
}

export function buildIndex(text: string): DocsIndex {
  const toc = tocEntries(text);
  const chunks = chunkCorpus(text, toc);
  const fields = FIELD_WEIGHTS.map(() => emptyField());
  const totals = FIELD_WEIGHTS.map(() => 0);
  chunks.forEach((chunk, i) => {
    const counts = FIELD_WEIGHTS.map(() => new Map<string, number>());
    const sizes = FIELD_WEIGHTS.map(() => 0);
    const add = (field: number, term: string): void => {
      const bucket = counts[field];
      bucket.set(term, (bucket.get(term) ?? 0) + 1);
      sizes[field] += 1;
    };
    for (const m of chunk.text.matchAll(WORD)) {
      for (const term of FIELD_TERMS[0](m[0])) { add(0, term); }
      for (const term of FIELD_TERMS[1](m[0])) { add(1, term); }
    }
    for (const m of chunk.trail.join(' ').matchAll(WORD)) {
      for (const term of FIELD_TERMS[TITLE_FIELD](m[0])) { add(TITLE_FIELD, term); }
    }
    fields.forEach((field, f) => {
      field.lengths[i] = sizes[f];
      totals[f] += sizes[f];
      for (const [term, tf] of counts[f]) {
        let posting = field.postings.get(term);
        if (!posting) field.postings.set(term, (posting = new Map()));
        posting.set(i, tf);
      }
    });
  });
  fields.forEach((field, f) => { field.avgdl = chunks.length > 0 ? totals[f] / chunks.length : 0; });
  return { chunks, fields, toc };
}

export function capPageText(text: string): string {
  if (text.length <= PAGE_CHAR_CAP) { return text; }
  return `${text.slice(0, PAGE_CHAR_CAP)}\n\n[truncated at ${PAGE_CHAR_CAP} characters]`;
}

export function pageText(index: DocsIndex, page: number): string {
  return index.chunks.filter((c) => c.page === page).map((c) => c.text).join('\n');
}

export function pageBySlug(index: DocsIndex, slug: string): { title: string; path: string; text: string } | null {
  const path = pathOf(slug);
  const chunk = index.chunks.find((c) => c.path === path);
  if (!chunk) { return null; }
  return { title: chunk.title, path, text: pageText(index, chunk.page) };
}

let memo: { text: string; index: DocsIndex } | null = null;

export function getIndex(text: string): DocsIndex {
  if (memo && memo.text === text) { return memo.index; }
  const index = buildIndex(text);
  memo = { text, index };
  return index;
}

// Anchors on the densest *window* rather than the densest line: a single line can
// outscore a whole relevant section (a URL in a "View on GitHub" link repeats the
// query term), which would push the excerpt past the signature the caller wants.
function excerptChunk(chunk: DocChunk, terms: string[]): string {
  const wanted = new Set(terms);
  const lines = chunk.text.split('\n');
  const hits = lines.map((line) => {
    let count = 0;
    for (const term of tokenize(line)) { if (wanted.has(term)) { count += 1; } }
    return count;
  });
  let bestStart = 0;
  let bestScore = -1;
  let start = 0;
  let size = 0;
  let score = 0;
  for (let end = 0; end < lines.length; end += 1) {
    size += lines[end].length + 1;
    score += hits[end];
    while (size > EXCERPT_CHAR_CAP && start <= end) {
      size -= lines[start].length + 1;
      score -= hits[start];
      start += 1;
    }
    if (score > bestScore) { bestScore = score; bestStart = start; }
  }
  const out: string[] = [];
  let used = 0;
  for (let i = bestStart; i < lines.length; i += 1) {
    const add = lines[i].length + (out.length > 0 ? 1 : 0);
    if (used + add > EXCERPT_CHAR_CAP) { break; }
    out.push(lines[i]);
    used += add;
  }
  return out.join('\n');
}

export function search(index: DocsIndex, query: string, limit: number, opts: SearchOptions = {}): DocHit[] {
  const k1 = 1.2;
  const b = 0.75;
  const n = index.chunks.length;
  const scores = new Map<number, number>();
  const tokens = queryTerms(query);
  for (const token of tokens) {
    index.fields.forEach((field, f) => {
      for (const term of FIELD_TERMS[f](token)) {
        const posting = field.postings.get(term);
        if (!posting) { continue; }
        const avgdl = field.avgdl || 1;
        const idf = Math.log(1 + (n - posting.size + 0.5) / (posting.size + 0.5));
        for (const [i, tf] of posting) {
          const norm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * (field.lengths[i] || 1)) / avgdl));
          scores.set(i, (scores.get(i) ?? 0) + FIELD_WEIGHTS[f] * idf * norm);
        }
      }
    });
  }
  const { demotePathPrefix, demoteFactor } = opts;
  const demote = Boolean(demotePathPrefix && demoteFactor) && !tokens.some((t) => t.toLowerCase() === 'mcp');
  const terms = tokenize(query);
  return [...scores]
    .filter(([, score]) => score > 0)
    .map(([i, score]) => {
      const path = index.chunks[i].path;
      const adjusted = demote && path && path.startsWith(demotePathPrefix as string) ? score * (demoteFactor as number) : score;
      return [i, adjusted] as const;
    })
    .sort((a, b2) => b2[1] - a[1])
    .slice(0, limit)
    .map(([i, score]) => {
      const chunk = index.chunks[i];
      return { chunkIndex: i, page: chunk.page, title: chunk.title, trail: chunk.trail, path: chunk.path, score, excerpt: excerptChunk(chunk, terms) };
    });
}
