import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { runAction, agentFor, noSession } from '../session/agent';

export const clickToolDefinition: ToolDefinition = {
  name: 'click_element',
  description: 'Clicks an element. On web pages the result lists what changed (new elements with refs, or the new page). In apps it does not: take a snapshot to see the new screen. Several steps in a row: perform_actions.',
  annotations: { title: 'Click Element', destructiveHint: false },
  inputSchema: {
    selector: z.string().describe('Ref from snapshot (e12) or selector: CSS, XPath, "button=Exact text", "a*=Partial text"'),
  },
};

export const clickTool: ToolCallback = async ({ selector }: { selector: string }): Promise<CallToolResult> => {
  const agent = await agentFor();
  return agent ? runAction(agent, 'click', { target: selector }, 'Clicked.') : noSession();
};
