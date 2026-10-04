import { createAgentSession, type AgentSession } from '@wdio/session/agent';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getBrowser, getState } from './state';

/**
 * Browser sessions run their page actions through `@wdio/session`: one page
 * model (snapshots with refs like `e12`) shared with `wdio session`, and every
 * action reports what it changed on the page, so an agent rarely needs a
 * separate screenshot or element listing to see the result.
 */
const agents = new WeakMap<WebdriverIO.Browser, Promise<AgentSession>>();

/** the agent session of the active browser session, undefined for apps */
export function webAgent(): Promise<AgentSession> | undefined {
  const state = getState();
  const metadata = state.currentSession ? state.sessionMetadata.get(state.currentSession) : undefined;
  if (metadata?.type !== 'browser') return undefined;
  const browser = getBrowser();
  let agent = agents.get(browser);
  if (!agent) {
    agent = createAgentSession(browser, { name: 'mcp', recordPage: true });
    agents.set(browser, agent);
  }
  return agent;
}

/**
 * `@wdio/session` hints name its shell commands; here they are tools.
 */
export function forMcp(text: string): string {
  // one pass, so a replacement is never rewritten again
  return text.replace(/`(?:wdio session )?([a-z]+)([^`]*)`/g, (match, action: string, rest: string) => {
    if (action === 'find') return '`snapshot` with `find`';
    if (action === 'snapshot') return /-i\b|--interactive/.test(rest) ? '`snapshot`' : '`snapshot` with `full: true`';
    return match.startsWith('`wdio session ') ? `\`${action}\`` : match;
  });
}

/** longest a single page action may take before the agent gets the turn back */
const ACTION_TIMEOUT_MS = 90_000;

export async function runAction(agent: AgentSession, action: string, args: Record<string, unknown>, done: string): Promise<CallToolResult> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`"${action}" did not finish within ${ACTION_TIMEOUT_MS / 1000}s.`), {
      hint: 'The page may still be busy. Take a `snapshot` to see where it is.',
    })), ACTION_TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([agent.run(action, args), limit]);
    return { content: [{ type: 'text', text: result.text ? forMcp(result.text) : done }] };
  } catch (e) {
    const err = e as Error & { hint?: string };
    return { isError: true, content: [{ type: 'text', text: forMcp([err.message, err.hint].filter(Boolean).join('\n')) }] };
  } finally {
    clearTimeout(timer);
  }
}

/** most characters of a page snapshot returned after opening a page */
const MAX_PAGE_CHARS = 1500;

/**
 * The interactive elements of the page, or a one-line summary of a big page.
 */
export async function pageReport(agent: AgentSession): Promise<string> {
  try {
    const result = await agent.run('snapshot', { interactive: true, maxChars: MAX_PAGE_CHARS });
    const data = result.data as { chars?: number; refs?: number } | undefined;
    const url = await agent.browser.getUrl().catch(() => '');
    if (data?.chars !== undefined && data.chars > MAX_PAGE_CHARS) {
      const title = await agent.browser.getTitle().catch(() => '');
      return `Page: ${url}${title ? ` · ${JSON.stringify(title)}` : ''} · ${data.refs ?? 0} interactive elements. \`snapshot\` with \`find\` gets the ones you need with their refs.`;
    }
    return `Page: ${url}\n${result.text ?? ''}`;
  } catch {
    return '';
  }
}
