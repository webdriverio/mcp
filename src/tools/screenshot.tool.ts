import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { readScreenshot } from '../resources';

export const screenshotToolDefinition: ToolDefinition = {
  name: 'get_screenshot',
  description: 'Takes a screenshot of the current page or screen and returns a base64-encoded image, resized and compressed for model context limits.',
  annotations: { title: 'Get Screenshot', readOnlyHint: true, idempotentHint: true },
  inputSchema: {},
};

export const screenshotTool: ToolCallback = async (): Promise<CallToolResult> => {
  const result = await readScreenshot();
  if (result.mimeType === 'text/plain') {
    return { isError: true, content: [{ type: 'text', text: Buffer.from(result.blob, 'base64').toString('utf-8') }] };
  }
  return { content: [{ type: 'image', data: result.blob, mimeType: result.mimeType }] };
};
