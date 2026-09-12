import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDefinition } from '../types/tool';
import { readSnapshot } from '../resources';
import { coerceBoolean } from '../utils/zod-helpers';

export const getSnapshotToolDefinition: ToolDefinition = {
  name: 'get_snapshot',
  description:
    'Depth-indented text snapshot of the current page or app with interactive elements, their ' +
    'selectors, and `eN` references accepted by click_element, set_value, tap_element and ' +
    'drag_and_drop. Returns the whole page by default — unlike wdio://session/current/snapshot, ' +
    'which is limited to the viewport. Use this when the viewport snapshot looks empty or is ' +
    'missing content you expect to be on the page.',
  annotations: { title: 'Get Snapshot', readOnlyHint: true, idempotentHint: true },
  inputSchema: {
    inViewportOnly: coerceBoolean
      .optional()
      .default(false)
      .describe('Only include elements fully inside the current viewport (default: false — the whole page).'),
  },
};

export const getSnapshotTool: ToolCallback = async ({
  inViewportOnly = false,
}: {
  inViewportOnly?: boolean;
}) => {
  const result = await readSnapshot({ inViewportOnly });
  if (result.text.startsWith('Error')) {
    return { isError: true as const, content: [{ type: 'text' as const, text: result.text }] };
  }
  return { content: [{ type: 'text' as const, text: result.text }] };
};
