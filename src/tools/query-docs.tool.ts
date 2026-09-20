import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import { encode } from '@toon-format/toon';
import type { ToolDefinition } from '../types/tool.js';
import { coerceBoolean } from '../utils/zod-helpers';
import { MCP_DEMOTE_FACTOR, MCP_PATH_PREFIX, capPageText, pageText, search } from '../utils/docs-index';
import { loadDocsIndex } from '../utils/docs-client';

export const queryDocsToolDefinition: ToolDefinition = {
  name: 'query_docs',
  description: [
    'Search the official WebdriverIO documentation and return the most relevant excerpts with page, section and source URL.',
    'Use before answering any question about WebdriverIO APIs, configuration, services, reporters, selectors, or debugging.',
    '',
    'Query with 2-3 distinctive keywords, never a sentence: "appium setup", "devtools trace.zip" and "allure reporter" each return the right page first, while "how do I wire up appium in my config file" does not.',
    'A word can also collide with an unrelated page — `wire` matches Wire Protocol — so if a query misses, retry with the exact page title, which beats any paraphrase.',
    'Set fullPage for the whole page. To browse instead, read wdio://docs/index for every page title and its slug, then wdio://docs/page/{slug} for one page in full.',
    '',
    'Cite the `path` of any page you rely on.',
  ].join('\n'),
  inputSchema: {
    query: z.string().describe('2-3 distinctive keywords: an API name, config key, page title or feature (e.g. "appium setup", "devtools trace.zip", "browserstack capabilities"). A sentence dilutes the ranking.'),
    limit: z.number().int().min(1).max(20).optional().default(5),
    fullPage: coerceBoolean.optional().default(false).describe('Return the full matched pages instead of excerpts'),
  },
  annotations: { title: 'Query WebdriverIO Docs', readOnlyHint: true, idempotentHint: true },
};

type QueryDocsArgs = {
  query: string;
  limit?: number;
  fullPage?: boolean;
};

export const queryDocsTool: ToolCallback = async (args: QueryDocsArgs) => {
  const { query, limit = 5, fullPage = false } = args;
  try {
    const index = await loadDocsIndex();
    const results = search(index, query, limit, {
      demotePathPrefix: MCP_PATH_PREFIX,
      demoteFactor: MCP_DEMOTE_FACTOR,
    });
    const pages = new Map<number, string>();
    if (fullPage) {
      for (const page of new Set(results.map((hit) => hit.page))) {
        pages.set(page, capPageText(pageText(index, page)));
      }
    }
    const hits = results.map((hit) => ({
      title: hit.title,
      trail: hit.trail,
      path: hit.path,
      score: Math.round(hit.score * 100) / 100,
      excerpt: pages.get(hit.page) ?? hit.excerpt,
    }));
    return { content: [{ type: 'text' as const, text: encode({ query, hits }) }] };
  } catch (e) {
    return { isError: true as const, content: [{ type: 'text' as const, text: `Error: ${e}` }] };
  }
};
