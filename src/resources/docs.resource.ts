import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ResourceDefinition } from '../types/resource';
import { PAGE_CHAR_CAP, capPageText, pageBySlug, slugOf } from '../utils/docs-index';
import { loadDocsIndex } from '../utils/docs-client';

export const docsIndexResource: ResourceDefinition = {
  name: 'docs-index',
  uri: 'wdio://docs/index',
  description: 'Every page of the official WebdriverIO documentation as tab-separated title, source path and slug. Use it to find the exact title of a page before searching with query_docs — an exact title beats any paraphrase — then read wdio://docs/page/{slug}. Pages with no docs-site path are omitted; they are sub-sections of third-party package pages and cannot be fetched by slug.',
  handler: async () => {
    try {
      const index = await loadDocsIndex();
      const rows = index.toc.map((entry) => `${entry.title}\t${entry.path}\t${slugOf(entry.path)}`);
      return { contents: [{ uri: 'wdio://docs/index', mimeType: 'text/plain', text: rows.join('\n') }] };
    } catch (e) {
      return { contents: [{ uri: 'wdio://docs/index', mimeType: 'text/plain', text: `Error: ${e}` }] };
    }
  },
};

export const docsPageResource: ResourceDefinition = {
  name: 'docs-page',
  template: new ResourceTemplate('wdio://docs/page/{slug}', { list: undefined }),
  description: `Full markdown of one WebdriverIO documentation page, truncated at ${PAGE_CHAR_CAP} characters. Read this when an excerpt from query_docs is not enough. Slugs come from wdio://docs/index and encode the docs-site path with "~" in place of "/" — e.g. docs~appium.md is /docs/appium.md.`,
  handler: async (uri, variables) => {
    const respond = (text: string, mimeType: 'text/markdown' | 'text/plain'): { contents: { uri: string; mimeType: string; text: string }[] } => ({
      contents: [{ uri: uri.href, mimeType, text }],
    });
    try {
      const index = await loadDocsIndex();
      const page = pageBySlug(index, variables.slug);
      if (!page) {
        return respond(`No page for slug "${variables.slug}". Slugs are listed in wdio://docs/index.`, 'text/plain');
      }
      return respond(capPageText(page.text), 'text/markdown');
    } catch (e) {
      return respond(`Error: ${e}`, 'text/plain');
    }
  },
};