import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { readContexts, readCurrentContext } from '../resources';

export const getContextsToolDefinition: ToolDefinition = {
  name: 'get_contexts',
  description: 'Returns available automation contexts and the currently active one. Use before switch_context to discover NATIVE_APP and WEBVIEW_* targets. Mobile-only.',
  annotations: { title: 'Get Automation Contexts', readOnlyHint: true, idempotentHint: true },
  inputSchema: {},
};

export const getContextsTool: ToolCallback = async (): Promise<CallToolResult> => {
  const [contexts, current] = await Promise.all([readContexts(), readCurrentContext()]);
  if (contexts.mimeType === 'text/plain' && contexts.text.startsWith('Error')) {
    return { isError: true, content: [{ type: 'text', text: contexts.text }] };
  }
  if (current.mimeType === 'text/plain' && current.text.startsWith('Error')) {
    return { isError: true, content: [{ type: 'text', text: current.text }] };
  }
  const combined = {
    contexts: JSON.parse(contexts.text),
    currentContext: JSON.parse(current.text),
  };
  return { content: [{ type: 'text', text: JSON.stringify(combined) }] };
};
