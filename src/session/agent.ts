import { createAgentSession, SessionError, type ActionArgsOf, type AgentActionName, type AgentSession, type PageChange } from '@wdio/session/agent';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getBrowser, getState } from './state';
import { mcpHint } from './hints';
import { recordCode } from '../recording/step-recorder';

/**
 * Page and app actions run through `@wdio/session`: one page model (snapshots
 * with refs like `e12`) shared with the session CLI, and every action reports
 * what it changed, so an agent rarely needs a separate screenshot or element
 * listing to see the result.
 */
const agents = new WeakMap<WebdriverIO.Browser, Promise<AgentSession>>();

/** the agent session of the active session, undefined before one starts */
export function agentFor(): Promise<AgentSession> | undefined {
  const state = getState();
  const metadata = state.currentSession ? state.sessionMetadata.get(state.currentSession) : undefined;
  if (!metadata) return undefined;
  const browser = getBrowser();
  let agent = agents.get(browser);
  if (!agent) {
    agent = createAgentSession(browser, { name: 'mcp', hint: mcpHint, recordPage: metadata.type === 'browser' });
    agents.set(browser, agent);
  }
  return agent;
}

/** longest a single page action may take before the agent gets the turn back */
const ACTION_TIMEOUT_MS = 30_000;

export const noSession = (): CallToolResult => ({ isError: true, content: [{ type: 'text', text: 'No active session. Start one with start_session.' }] });

export function errorResult(e: unknown): CallToolResult {
  const message = e instanceof Error ? e.message : String(e);
  const hint = e instanceof SessionError ? e.hint : undefined;
  return { isError: true, content: [{ type: 'text', text: [message, hint].filter(Boolean).join('\n') }] };
}

/** Rejects with a TIMEOUT error when `work` takes longer than the action limit. */
export async function withActionTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SessionError('TIMEOUT', `"${label}" did not finish within ${ACTION_TIMEOUT_MS / 1000}s.`, {
      hint: `The page may still be busy. \`${mcpHint('snapshot', { interactive: true })}\` shows where it is.`,
    })), ACTION_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, limit]);
  } finally {
    clearTimeout(timer);
  }
}

export async function runActionWithChanges<A extends AgentActionName>(agent: AgentSession, action: A, args: ActionArgsOf<A>, done: string): Promise<{ result: CallToolResult; changes?: PageChange }> {
  try {
    const result = await withActionTimeout(agent.run(action, args), action);
    recordCode(result.code);
    return { result: { content: [{ type: 'text', text: result.text || done }] }, changes: result.changes };
  } catch (e) {
    return { result: errorResult(e) };
  }
}

export async function runAction<A extends AgentActionName>(agent: AgentSession, action: A, args: ActionArgsOf<A>, done: string): Promise<CallToolResult> {
  return (await runActionWithChanges(agent, action, args, done)).result;
}

/** most characters of a page snapshot returned after opening a page */
const MAX_PAGE_CHARS = 1500;

/**
 * The interactive elements of the page, or a one-line summary of a big page.
 */
export async function pageReport(agent: AgentSession): Promise<string> {
  try {
    const snapshot = await withActionTimeout(agent.snapshot({ interactive: true, maxChars: MAX_PAGE_CHARS }), 'snapshot');
    const url = snapshot.page?.url ?? '';
    if (snapshot.tooBig) {
      const title = snapshot.page?.title;
      return `Page: ${url}${title ? ` · ${JSON.stringify(title)}` : ''} · ${snapshot.refs} interactive elements. \`${mcpHint('find', { text: '<text>' })}\` gets the ones you need with their refs.`;
    }
    return `Page: ${url}\n${snapshot.text}`;
  } catch (e) {
    return e instanceof SessionError && e.code === 'TIMEOUT' ? [e.message, e.hint].filter(Boolean).join('\n') : '';
  }
}
