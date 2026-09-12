import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDefinition } from '../types/tool';
import { getBrowser } from '../session/state';
import { getElements } from '@wdio/elements';
import { encode } from '@toon-format/toon';
import { coerceBoolean } from '../utils/zod-helpers';

export const getElementsToolDefinition: ToolDefinition = {
  name: 'get_elements',
  description: 'Flat list of interactable elements with selectors, text, and bounding boxes. Supports viewport filtering, container inclusion, bounds, and pagination — use when you need a paginated or programmatic query rather than a page overview. For exploring a page, prefer get_snapshot (cheaper, hierarchical, returns clickable refs).',
  annotations: { title: 'Get Visible Elements', readOnlyHint: true, idempotentHint: true },
  inputSchema: {
    inViewportOnly: coerceBoolean.optional().default(false).describe('Only return elements visible in the current viewport (default: false).'),
    includeContainers: coerceBoolean.optional().default(false).describe('Include container elements like divs and sections (default: false)'),
    includeBounds: coerceBoolean.optional().default(false).describe('Include element bounding box coordinates (default: false)'),
    limit: z.number().optional().default(0).describe('Maximum number of elements to return (0 = no limit)'),
    offset: z.number().optional().default(0).describe('Number of elements to skip (for pagination)'),
  },
};

export const getElementsTool: ToolCallback = async ({
  inViewportOnly = false,
  includeContainers = false,
  includeBounds = false,
  limit = 0,
  offset = 0,
}: {
  inViewportOnly?: boolean;
  includeContainers?: boolean;
  includeBounds?: boolean;
  limit?: number;
  offset?: number;
}) => {
  try {
    const browser = getBrowser();
    const result = await getElements(browser, { inViewportOnly, includeContainers, includeBounds, limit, offset });
    const text = encode(result);
    return { content: [{ type: 'text' as const, text }] };
  } catch (e) {
    return { isError: true as const, content: [{ type: 'text' as const, text: `Error getting elements: ${e}` }] };
  }
};
