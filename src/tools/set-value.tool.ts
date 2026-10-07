import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDefinition } from '../types/tool';
import { runAction, agentFor, noSession } from '../session/agent';

export const setValueToolDefinition: ToolDefinition = {
  name: 'set_value',
  description: 'Replaces the text of an input or textarea. The result lists what changed on the page or screen. To fill several fields or fill and then click, use one perform_actions call.',
  annotations: { title: 'Set Input Value', destructiveHint: false, idempotentHint: true },
  inputSchema: {
    selector: z.string().describe('Ref from snapshot (e12) or selector: CSS, XPath, "button=Exact text", "a*=Partial text"'),
    value: z.string().describe('Text to enter into the element'),
  },
};

export const setValueTool: ToolCallback = async ({ selector, value }: { selector: string; value: string }) => {
  const agent = await agentFor();
  return agent ? runAction(agent, 'fill', { target: selector, text: value }, `Filled ${selector}.`) : noSession();
};
