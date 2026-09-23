import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDefinition } from '../types/tool';
import { getBrowser, isUi5Session } from '../session/state';
import { getSnapshot } from '@wdio/elements';
import { encode } from '@toon-format/toon';
import { coerceBoolean } from '../utils/zod-helpers';
import { errorResult } from '../session/agent';
import { SNAPSHOT_MAX_CHARS, truncateSnapshot } from '../utils/snapshot-text';
import { ensureUi5Injected } from '../ui5/runtime';
import { getUi5Controls } from '../scripts/get-ui5-controls';

export const getElementsToolDefinition: ToolDefinition = {
  name: 'get_elements',
  description: `Mobile, Electron and UI5 sessions; on web use snapshot with selectors:true. Accessibility tree of the current page or screen with an eN ref and a ready-to-use selector on each actionable line. UI5 sessions list the UI5 controls with ui5: selectors instead. Use the selectors when writing test code; use the snapshot tool to act (its refs). inViewportOnly: false covers the whole page up to ${SNAPSHOT_MAX_CHARS} chars; longer pages are cut at the end.`,
  annotations: { title: 'Get Elements With Selectors', readOnlyHint: true, idempotentHint: true },
  inputSchema: {
    inViewportOnly: coerceBoolean.optional().default(false).describe('Only include elements visible in the current viewport (default: false).'),
    includeContainers: coerceBoolean.optional().default(false).describe('UI5 sessions only: include non-interactable controls such as containers (default: false).'),
    includeBounds: coerceBoolean.optional().default(false).describe('UI5 sessions only: include bounding box coordinates (default: false).'),
  },
};

export const getElementsTool: ToolCallback = async ({ inViewportOnly = false, includeContainers = false, includeBounds = false }: { inViewportOnly?: boolean; includeContainers?: boolean; includeBounds?: boolean }) => {
  try {
    const browser = getBrowser();
    if (isUi5Session()) {
      await ensureUi5Injected(browser);
      const controls = await getUi5Controls(browser, { inViewportOnly, includeContainers, includeBounds });
      return { content: [{ type: 'text' as const, text: encode(controls).replace(/,""/g, ',').replace(/"",/g, ',') }] };
    }
    const { text } = await getSnapshot(browser, { inViewportOnly });
    return { content: [{ type: 'text' as const, text: truncateSnapshot(text) }] };
  } catch (e) {
    return errorResult(e, 'Error getting elements');
  }
};
