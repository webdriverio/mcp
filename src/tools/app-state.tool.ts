import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { readAppState } from '../resources';

export const appStateToolDefinition: ToolDefinition = {
  name: 'get_app_state',
  description: 'Returns the current state of a mobile app: not installed, not running, background, or foreground. Mobile-only.',
  annotations: { title: 'Get App State', readOnlyHint: true, idempotentHint: true },
  inputSchema: {
    bundleId: z.string().describe('App bundle ID (iOS) or package name (Android), e.g. "com.example.app"'),
  },
};

export const appStateTool: ToolCallback = async ({ bundleId }: { bundleId: string }): Promise<CallToolResult> => {
  const result = await readAppState(bundleId);
  if (result.text.startsWith('Error')) {
    return { isError: true, content: [{ type: 'text', text: result.text }] };
  }
  return { content: [{ type: 'text', text: result.text }] };
};
