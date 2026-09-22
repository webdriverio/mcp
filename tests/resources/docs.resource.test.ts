import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { docsIndexResource, docsPageResource } from '../../src/resources/docs.resource';
import type { TemplateResourceDefinition } from '../../src/types/resource';

const FIXTURE = [
  '# WebdriverIO Docs',
  '',
  '- [Appium Setup](/docs/appium.md)',
  '- [Configuration](/docs/configuration.md)',
  '',
  '---',
  '',
  '# Full Documentation Content',
  '',
  '# Appium Setup',
  '',
  'Wire Appium up with a `platformName` capability.',
  '',
  '## Local Server',
  '',
  'Start it with `appium`.',
  '',
  '# Configuration',
  '',
  'The wdio conf file.',
  '',
].join('\n');

type TextContent = { uri: string; mimeType?: string; text: string };

const callPage = docsPageResource as TemplateResourceDefinition;
const callIndex = docsIndexResource as { handler: () => Promise<{ contents: TextContent[] }> };

async function pageText(slug: string): Promise<string> {
  const result = await callPage.handler(new URL(`wdio://docs/page/${slug}`), { slug });
  return (result.contents[0] as TextContent).text;
}

let tempDir: string;
let prevEnv: string | undefined;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'wdio-docs-resource-'));
  prevEnv = process.env.WDIO_MCP_CACHE_DIR;
  process.env.WDIO_MCP_CACHE_DIR = tempDir;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ etag: '"test-etag"' }),
    text: async () => FIXTURE,
  }));
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

describe('wdio://docs/index', () => {
  it('lists every TOC entry as title, path and slug', async () => {
    const result = await callIndex.handler();
    const rows = result.contents[0].text.split('\n');
    expect(rows).toContain('Appium Setup\t/docs/appium.md\tdocs~appium.md');
    expect(rows).toHaveLength(2);
  });
});

describe('wdio://docs/page/{slug}', () => {
  it('returns the whole page for a slug', async () => {
    const text = await pageText('docs~appium.md');
    expect(text).toContain('Wire Appium up');
    expect(text).toContain('## Local Server');
    const result = await callPage.handler(new URL('wdio://docs/page/docs~appium.md'), { slug: 'docs~appium.md' });
    expect((result.contents[0] as TextContent).mimeType).toBe('text/markdown');
  });

  it('names the index when the slug is unknown', async () => {
    const text = await pageText('docs~nope.md');
    expect(text).toContain('No page for slug');
    expect(text).toContain('wdio://docs/index');
    const result = await callPage.handler(new URL('wdio://docs/page/docs~nope.md'), { slug: 'docs~nope.md' });
    expect((result.contents[0] as TextContent).mimeType).toBe('text/plain');
  });

  it('marks a corpus load failure as text/plain', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await callPage.handler(new URL('wdio://docs/page/docs~appium.md'), { slug: 'docs~appium.md' });
    const content = result.contents[0] as TextContent;
    expect(content.mimeType).toBe('text/plain');
    expect(content.text).toContain('Error:');
  });
});