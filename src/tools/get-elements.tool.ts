import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDefinition } from '../types/tool';
import { getBrowser } from '../session/state';
import { getElements } from '../scripts/get-elements';
import { encode } from '@toon-format/toon';
import { coerceBoolean } from '../utils/zod-helpers';
import { errorResult } from '../session/agent';
import {
  resolveOutputMode,
  writeSessionOutputFile,
  type OutputMode,
} from '../utils/file-output';

const outputModeEnum = z.enum(['inline', 'file']);

export const getElementsToolDefinition: ToolDefinition = {
  name: 'get_elements',
  description: 'Returns interactable elements on the current page with selectors, text, and bounding boxes. Supports filtering by viewport visibility, containers, and pagination. Use when the wdio://session/current/elements resource does not return desired elements. Pass outputMode: "file" to write large element lists to a temp file and return its path + summary.',
  annotations: { title: 'Get Visible Elements', readOnlyHint: true, idempotentHint: true },
  inputSchema: {
    inViewportOnly: coerceBoolean.optional().default(false).describe('Only return elements visible in the current viewport (default: false).'),
    includeContainers: coerceBoolean.optional().default(false).describe('Include container elements like divs and sections (default: false)'),
    includeBounds: coerceBoolean.optional().default(false).describe('Include element bounding box coordinates (default: false)'),
    limit: z.number().optional().default(0).describe('Maximum number of elements to return (0 = no limit)'),
    offset: z.number().optional().default(0).describe('Number of elements to skip (for pagination)'),
    outputMode: outputModeEnum.optional().describe('Return elements inline (default, or WDIO_MCP_OUTPUT_MODE) or write to a temp file and return its path + summary'),
    outputDir: z.string().min(1).optional().describe('Directory for outputMode: "file" (defaults to WDIO_MCP_OUTPUT_DIR or OS temp dir; creates a private 0700 wdio-mcp-outputs-* subdirectory when pointing at a shared directory)'),
  },
};

export function createGetElementsTool(defaultOutputMode?: OutputMode): ToolCallback {
  return async ({
    inViewportOnly = false,
    includeContainers = false,
    includeBounds = false,
    limit = 0,
    offset = 0,
    outputMode,
    outputDir,
  }: {
    inViewportOnly?: boolean;
    includeContainers?: boolean;
    includeBounds?: boolean;
    limit?: number;
    offset?: number;
    outputMode?: OutputMode;
    outputDir?: string;
  }) => {
    try {
      const effectiveOutputMode = resolveOutputMode(outputMode, defaultOutputMode);
      const browser = getBrowser();
      const result = await getElements(browser, { inViewportOnly, includeContainers, includeBounds, limit, offset });
      const text = encode(result).replace(/,""/g, ',').replace(/"",/g, ',');
      if (effectiveOutputMode === 'file') {
        const { filePath, bytes, lines, usedPrivateSubdir } = writeSessionOutputFile({
          kind: 'elements',
          content: text,
          ext: 'toon',
          outputDir,
        });
        const subdirNote = usedPrivateSubdir ? '; written to private 0700 subdirectory because outputDir is shared' : '';
        return {
          content: [{
            type: 'text' as const,
            text: `Elements written to ${filePath} (${result.showing} of ${result.total} elements, ${lines} lines, ${bytes} bytes${subdirNote})`,
          }],
        };
      }
      return { content: [{ type: 'text' as const, text }] };
    } catch (e) {
      return errorResult(e, 'Error getting elements');
    }
  };
}

export const getElementsTool: ToolCallback = createGetElementsTool();
