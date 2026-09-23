import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDefinition } from '../types/tool';
import { runAction, agentFor, noSession, errorResult } from '../session/agent';
import { getBrowser } from '../session/state';
import { isUi5Selector, resolveUi5Control } from '../ui5/selector';

const UI5_CONTROL_TIMEOUT_MS = 3000;

export const setValueToolDefinition: ToolDefinition = {
  name: 'set_value',
  description: 'Replaces the text of an input or textarea. On web pages the result lists what changed (new elements with refs, or the new page). In apps it does not: take a snapshot to see the new screen. To fill several fields or fill and then click, use one perform_actions call.',
  annotations: { title: 'Set Input Value', destructiveHint: false, idempotentHint: true },
  inputSchema: {
    selector: z.string().describe('Ref from snapshot (e12) or selector: CSS, XPath, "button=Exact text", "a*=Partial text"'),
    value: z.string().describe('Text to enter into the element'),
  },
};

export const setValueTool: ToolCallback = async ({ selector, value }: { selector: string; value: string }) => {
  if (isUi5Selector(selector)) {
    try {
      const browser = getBrowser();
      const control = await resolveUi5Control(browser, selector, UI5_CONTROL_TIMEOUT_MS);
      await control.enterText(value);
      return { content: [{ type: 'text', text: `Text "${value}" entered into element` }] };
    } catch (e) {
      return errorResult(e, 'Error entering text');
    }
  }
  const agent = await agentFor();
  return agent ? runAction(agent, 'fill', { target: selector, text: value }, `Filled ${selector}.`) : noSession();
};