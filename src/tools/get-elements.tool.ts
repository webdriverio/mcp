import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDefinition } from '../types/tool';
import { getBrowser } from '../session/state';
import { getSnapshot } from '@wdio/elements';
import { coerceBoolean } from '../utils/zod-helpers';
import { errorResult } from '../session/agent';
import { truncateSnapshot } from '../utils/snapshot-text';

export const getElementsToolDefinition: ToolDefinition = {
  name: 'get_elements',
  description: 'Accessibility tree of the current page or screen with an eN ref and a ready-to-use selector on each actionable line. Use the selectors when writing test code; use the snapshot tool to act (its refs). inViewportOnly: false covers the whole page.',
  annotations: { title: 'Get Elements With Selectors', readOnlyHint: true, idempotentHint: true },
  inputSchema: {
    inViewportOnly: coerceBoolean.optional().default(false).describe('Only include elements visible in the current viewport (default: false).'),
  },
};

export const getElementsTool: ToolCallback = async ({ inViewportOnly = false }: { inViewportOnly?: boolean }) => {
  try {
    const browser = getBrowser();
    const { text } = await getSnapshot(browser, { inViewportOnly });
    return { content: [{ type: 'text' as const, text: truncateSnapshot(text) }] };
  } catch (e) {
    return errorResult(e, 'Error getting elements');
  }
};
