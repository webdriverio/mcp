import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import { runAction, webAgent } from '../session/agent';

const browserOnly = (): CallToolResult => ({ isError: true, content: [{ type: 'text', text: 'Only available in browser sessions.' }] });

export const selectOptionToolDefinition: ToolDefinition = {
  name: 'select_option',
  description: 'Selects an option of a <select> by its text. The result lists what changed on the page.',
  annotations: { title: 'Select Option', destructiveHint: false },
  inputSchema: {
    selector: z.string().describe('Ref from snapshot (e12) or selector of the <select>'),
    value: z.string().describe('Option text'),
  },
};

export const selectOptionTool: ToolCallback = async ({ selector, value }: { selector: string; value: string }) => {
  const agent = await webAgent();
  return agent ? runAction(agent, 'select', { target: selector, value }, `Selected ${JSON.stringify(value)}.`) : browserOnly();
};

export const pressKeyToolDefinition: ToolDefinition = {
  name: 'press_key',
  description: 'Presses a key or combination in the focused element, e.g. Enter, Tab, Escape, Control+a. The result lists what changed on the page.',
  annotations: { title: 'Press Key', destructiveHint: false },
  inputSchema: {
    keys: z.string().describe('Key or combination'),
  },
};

export const pressKeyTool: ToolCallback = async ({ keys }: { keys: string }) => {
  const agent = await webAgent();
  return agent ? runAction(agent, 'press', { keys }, `Pressed ${keys}.`) : browserOnly();
};

type Step = (selector?: string, value?: string) => [string, Record<string, unknown>];
const STEP_ACTIONS: Record<'click' | 'fill' | 'select' | 'check' | 'uncheck' | 'press', Step> = {
  click: (selector) => ['click', { target: selector }],
  fill: (selector, value) => ['fill', { target: selector, text: value ?? '' }],
  select: (selector, value) => ['select', { target: selector, value }],
  check: (selector) => ['check', { target: selector }],
  uncheck: (selector) => ['uncheck', { target: selector }],
  press: (_selector, value) => ['press', { keys: value }],
};

type StepAction = keyof typeof STEP_ACTIONS;

export const performActionsToolDefinition: ToolDefinition = {
  name: 'perform_actions',
  description: 'Runs several actions in one call, e.g. fill a form and submit it, and returns what each one changed. Stops at the first failure. value is the text for fill, the option for select and the keys for press.',
  annotations: { title: 'Perform Actions', destructiveHint: false },
  inputSchema: {
    actions: z.array(z.object({
      action: z.enum(Object.keys(STEP_ACTIONS) as [StepAction, ...StepAction[]]),
      selector: z.string().optional().describe('Ref (e12) or selector'),
      value: z.string().optional(),
    })).min(1),
  },
};

export const performActionsTool: ToolCallback = async ({ actions }: { actions: { action: StepAction; selector?: string; value?: string }[] }) => {
  const agent = await webAgent();
  if (!agent) return browserOnly();
  const out: string[] = [];
  for (const [i, step] of actions.entries()) {
    const [action, args] = STEP_ACTIONS[step.action](step.selector, step.value);
    const result = await runAction(agent, action, args, `${step.action} ${step.selector ?? step.value ?? ''}`.trim());
    const text = result.content.map((c) => c.type === 'text' ? c.text : '').join('\n');
    if (result.isError) {
      const skipped = actions.length - i - 1;
      return { isError: true, content: [{ type: 'text', text: [...out, `✖ ${step.action} ${step.selector ?? ''}: ${text}`, skipped ? `${skipped} later action${skipped === 1 ? '' : 's'} skipped.` : ''].filter(Boolean).join('\n') }] } as CallToolResult;
    }
    out.push(text);
  }
  return { content: [{ type: 'text', text: out.join('\n') }] } as CallToolResult;
};
