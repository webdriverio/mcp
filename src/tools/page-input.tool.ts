import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import type { AgentActionName, AgentSession } from '@wdio/session/agent';
import { runAction, runActionWithChanges, agentFor, noSession } from '../session/agent';

const browserOnly = (): CallToolResult => ({ isError: true, content: [{ type: 'text', text: 'Only available in browser sessions.' }] });

export const selectOptionToolDefinition: ToolDefinition = {
  name: 'select_option',
  description: 'Selects an option of a <select> by its text. The result lists what changed on the page. Several steps in a row: perform_actions.',
  annotations: { title: 'Select Option', destructiveHint: false },
  inputSchema: {
    selector: z.string().describe('Ref from snapshot (e12) or selector of the <select>'),
    value: z.string().describe('Option text'),
  },
};

export const selectOptionTool: ToolCallback = async ({ selector, value }: { selector: string; value: string }) => {
  const agent = await agentFor();
  return agent ? runAction(agent, 'select', { target: selector, value }, `Selected ${JSON.stringify(value)}.`) : browserOnly();
};

export const pressKeyToolDefinition: ToolDefinition = {
  name: 'press_key',
  description: 'Presses a key or combination in the focused element, e.g. Enter, Tab, Escape, Control+a. The result lists what changed on the page. Several steps in a row: perform_actions.',
  annotations: { title: 'Press Key', destructiveHint: false },
  inputSchema: {
    keys: z.string().describe('Key or combination'),
    times: z.number().int().min(1).max(100).optional().describe('Press it this many times, e.g. to move a slider'),
  },
};

export const pressKeyTool: ToolCallback = async ({ keys, times }: { keys: string; times?: number }) => {
  const agent = await agentFor();
  return agent ? runAction(agent, 'press', { keys, times }, `Pressed ${keys}${times && times > 1 ? ` ${times} times` : ''}.`) : browserOnly();
};

type StepRunner = (agent: AgentSession, selector: string, value: string, done: string, times?: number) => ReturnType<typeof runActionWithChanges>;
const STEP_ACTIONS = {
  click: (agent, target, _value, done) => runActionWithChanges(agent, 'click', { target }, done),
  fill: (agent, target, text, done) => runActionWithChanges(agent, 'fill', { target, text }, done),
  select: (agent, target, value, done) => runActionWithChanges(agent, 'select', { target, value }, done),
  check: (agent, target, _value, done) => runActionWithChanges(agent, 'check', { target }, done),
  uncheck: (agent, target, _value, done) => runActionWithChanges(agent, 'uncheck', { target }, done),
  press: (agent, _target, keys, done, times) => runActionWithChanges(agent, 'press', { keys, times }, done),
} satisfies Partial<Record<AgentActionName, StepRunner>>;

type StepAction = keyof typeof STEP_ACTIONS;

export const performActionsToolDefinition: ToolDefinition = {
  name: 'perform_actions',
  description: 'Runs several actions in one call, e.g. fill a form and submit it, on the page or app screen (select, check and uncheck are web-only), and returns what each one changed. Stops at the first failure, when a step loads a new page, or before a key press that follows a click, select, check or uncheck that changed the page (continue with the new refs). value is the text for fill, the option for select and the keys for press.',
  annotations: { title: 'Perform Actions', destructiveHint: false },
  inputSchema: {
    actions: z.array(z.object({
      action: z.enum(Object.keys(STEP_ACTIONS) as [StepAction, ...StepAction[]]),
      selector: z.string().optional().describe('Ref (e12) or selector'),
      value: z.string().optional(),
      times: z.number().int().min(1).max(100).optional().describe('press only: repeat count'),
    })).min(1),
  },
};

export const performActionsTool: ToolCallback = async ({ actions }: { actions: { action: StepAction; selector?: string; value?: string; times?: number }[] }) => {
  const agent = await agentFor();
  if (!agent) return noSession();
  const out: string[] = [];
  for (const [i, step] of actions.entries()) {
    const { result, changes } = await STEP_ACTIONS[step.action](agent, step.selector ?? '', step.value ?? '', `${step.action} ${step.selector ?? step.value ?? ''}`.trim(), step.times);
    const text = result.content.map((c) => c.type === 'text' ? c.text : '').join('\n');
    const skipped = actions.length - i - 1;
    const skippedText = `${skipped} later action${skipped === 1 ? '' : 's'} skipped`;
    if (result.isError) {
      return { isError: true, content: [{ type: 'text', text: [...out, `✖ ${step.action} ${step.selector ?? ''}: ${text}`, skipped ? `${skippedText}.` : ''].filter(Boolean).join('\n') }] } as CallToolResult;
    }
    out.push(text);
    if (!skipped) continue;
    const stopReason = changes?.kind === 'page'
      ? `a new page loaded${changes.url ? ` (${changes.url})` : ''}. Continue with the new refs.`
      : actions[i + 1].action === 'press' && step.action !== 'fill' && step.action !== 'press' && (changes?.kind === 'changed' || changes?.kind === 'removed')
        ? 'the page changed before a key press, so focus may not be where you expected. Check it (or click the element), then continue.'
        : undefined;
    if (stopReason) {
      out.push(`${skippedText}: ${stopReason}`);
      break;
    }
  }
  return { content: [{ type: 'text', text: out.join('\n') }] } as CallToolResult;
};
