import { z } from 'zod';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../types/tool';
import type { AgentActionName, AgentSession, PageChange } from '@wdio/session/agent';
import { runAction, runActionWithChanges, agentFor } from '../session/agent';

const noSession = (): CallToolResult => ({ isError: true, content: [{ type: 'text', text: 'No active session. Start one with start_session.' }] });
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
  },
};

export const pressKeyTool: ToolCallback = async ({ keys }: { keys: string }) => {
  const agent = await agentFor();
  return agent ? runAction(agent, 'press', { keys }, `Pressed ${keys}.`) : browserOnly();
};

type StepRunner = (agent: AgentSession, selector: string, value: string, done: string) => ReturnType<typeof runActionWithChanges>;
const STEP_ACTIONS = {
  click: (agent, target, _value, done) => runActionWithChanges(agent, 'click', { target }, done),
  fill: (agent, target, text, done) => runActionWithChanges(agent, 'fill', { target, text }, done),
  select: (agent, target, value, done) => runActionWithChanges(agent, 'select', { target, value }, done),
  check: (agent, target, _value, done) => runActionWithChanges(agent, 'check', { target }, done),
  uncheck: (agent, target, _value, done) => runActionWithChanges(agent, 'uncheck', { target }, done),
  press: (agent, _target, keys, done) => runActionWithChanges(agent, 'press', { keys }, done),
} satisfies Partial<Record<AgentActionName, StepRunner>>;

type StepAction = keyof typeof STEP_ACTIONS;

// summarize() reports a new dialog as `Opened dialog "…"`, other lines as `- <role> …`
const POPUP_LINE = /^[\s\-+]*(?:Opened\s+)?(dialog|alertdialog|listbox|menu|option)\b/;

/** a dialog, listbox, menu or option list that a step opened, which makes the refs of later steps unreliable */
function openedPopup(changes?: PageChange): string | undefined {
  if (changes?.kind !== 'changed') return undefined;
  return changes.added.find((line) => POPUP_LINE.test(line))?.replace(/^[\s\-+]*/, '');
}

export const performActionsToolDefinition: ToolDefinition = {
  name: 'perform_actions',
  description: 'Runs several actions in one call, e.g. fill a form and submit it, on the page or app screen (select, check and uncheck are web-only), and returns what each one changed. Stops at the first failure, or when a step opens a dialog, listbox or menu (continue with the new refs). value is the text for fill, the option for select and the keys for press.',
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
  const agent = await agentFor();
  if (!agent) return noSession();
  const out: string[] = [];
  for (const [i, step] of actions.entries()) {
    const { result, changes } = await STEP_ACTIONS[step.action](agent, step.selector ?? '', step.value ?? '', `${step.action} ${step.selector ?? step.value ?? ''}`.trim());
    const text = result.content.map((c) => c.type === 'text' ? c.text : '').join('\n');
    if (result.isError) {
      const skipped = actions.length - i - 1;
      return { isError: true, content: [{ type: 'text', text: [...out, `✖ ${step.action} ${step.selector ?? ''}: ${text}`, skipped ? `${skipped} later action${skipped === 1 ? '' : 's'} skipped.` : ''].filter(Boolean).join('\n') }] } as CallToolResult;
    }
    out.push(text);
    const popup = i < actions.length - 1 ? openedPopup(changes) : undefined;
    if (popup) {
      const skipped = actions.length - i - 1;
      out.push(`${skipped} later action${skipped === 1 ? '' : 's'} skipped: the page changed (${popup}). Continue with the new refs.`);
      break;
    }
  }
  return { content: [{ type: 'text', text: out.join('\n') }] } as CallToolResult;
};
