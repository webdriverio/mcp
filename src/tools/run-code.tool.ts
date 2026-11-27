import fs from 'node:fs';
import type { ToolCallback, CallToolResult } from '@modelcontextprotocol/server';
import { SessionError } from '@wdio/session/agent';
import { z } from 'zod';
import type { ToolDefinition } from '../types/tool';
import { agentFor, errorText, noSession } from '../session/agent';
import { recordCode } from '../recording/step-recorder';
import { SNAPSHOT_MAX_CHARS } from '../utils/snapshot-text';

/** `exec`'s own default; below the 90s guard of the session queue */
export const RUN_CODE_TIMEOUT_MS = 60_000;

export const runCodeToolDefinition: ToolDefinition = {
  name: 'run_code',
  description: [
    'Runs WebdriverIO code in Node against the session and returns what it prints (console.log) and its return value.',
    'Use it for loops, conditions and waits in one call: filter table rows, retry until a toast shows, set every slider.',
    'In scope: browser, $, $$ and ref(\'e12\') for a snapshot ref (recorded as its selector; write ref(), not $(\'e12\')). Await every command; top-level variables persist between calls.',
    'expect is not available: throw an Error to fail. JavaScript for the page itself goes in browser.execute() here, or use execute_script.',
    'Prefer a single action tool when one does the job.',
  ].join(' '),
  annotations: { title: 'Run Code', destructiveHint: true, openWorldHint: true },
  inputSchema: {
    code: z.string().min(1).describe('Body of an async function, e.g. `const rows = await $$(\'tr\'); console.log(rows.length)`'),
  },
};

type RunCodeSession = { artifact: (...segments: string[]) => string; timestamp: () => string };

function saveFull(text: string, session: RunCodeSession): string | undefined {
  try {
    const file = session.artifact('run-code', `${session.timestamp()}.txt`);
    fs.writeFileSync(file, text);
    return file;
  } catch {
    return undefined;
  }
}

function capped(text: string, session: RunCodeSession): string {
  if (text.length <= SNAPSHOT_MAX_CHARS) return text;
  const file = saveFull(text, session);
  const saved = file ? ` Full output: ${file}.` : '';
  const note = `\n… output is ${text.length} chars; showing the start.${saved} Print less (filter in code) rather than reading it all.`;
  return text.slice(0, SNAPSHOT_MAX_CHARS - note.length) + note;
}

export const runCodeTool: ToolCallback = async ({ code }: { code: string }): Promise<CallToolResult> => {
  const agent = await agentFor();
  if (!agent) return noSession();
  const lastRecorded = agent.history.at(-1)?.n ?? 0;
  try {
    // `agent.run('exec')` is typed with the CLI's `e`; exec reads `code`, and `$timeout` is the only way to bound it (webdriverio/webdriverio#16493)
    const result = await agent.runAction('exec', { code, $timeout: RUN_CODE_TIMEOUT_MS });
    // read-only code records nothing, so only an entry newer than the call is this call's
    recordCode(agent.history.find((entry) => entry.n > lastRecorded && entry.kind === 'exec')?.code);
    return { content: [{ type: 'text', text: capped(result.text || 'Done (no output).', agent.session) }] };
  } catch (e) {
    const output = e instanceof SessionError ? e.details : undefined;
    const message = [errorText(e), output].filter(Boolean).join('\n');
    return { isError: true, content: [{ type: 'text', text: capped(message, agent.session) }] };
  }
};

export function registerRunCodeTool(
  registerTool: (definition: ToolDefinition, callback: ToolCallback) => unknown,
  allowCode: boolean,
  callback: ToolCallback,
): void {
  if (allowCode) registerTool(runCodeToolDefinition, callback);
}
