import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { readCookies } from '../resources';

export const getCookiesToolDefinition: ToolDefinition = {
  name: 'get_cookies',
  description: 'Returns all cookies for the current session, or a single cookie by name. Use to verify auth state, session tokens, or feature flags after login flows.',
  annotations: { title: 'Get Cookies', readOnlyHint: true, idempotentHint: true },
  inputSchema: {
    name: z.string().optional().describe('Cookie name to retrieve a specific cookie. If omitted, returns all cookies.'),
  },
};

export const getCookiesTool: ToolCallback = async ({ name }: { name?: string }): Promise<CallToolResult> => {
  const result = await readCookies(name);
  if (result.mimeType === 'text/plain' && result.text.startsWith('Error')) {
    return { isError: true, content: [{ type: 'text', text: result.text }] };
  }
  return { content: [{ type: 'text', text: result.text }] };
};
