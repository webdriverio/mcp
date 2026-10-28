import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RegisteredTool, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDefinition } from '../src/types/tool';
import type { SessionHistory } from '../src/types/recording';
import type { SessionMetadata, onSessionsChanged } from '../src/session/state';

const registered = vi.fn();
vi.mock('../src/session/state', async (importOriginal) => {
  const actual = await importOriginal<{ onSessionsChanged: typeof onSessionsChanged }>();
  return { ...actual, onSessionsChanged: (listener: Parameters<typeof onSessionsChanged>[0]) => { registered(); return actual.onSessionsChanged(listener); } };
});

const { setupToolVisibility } = await import('../src/tool-visibility');
const { getState, getToolSettings, notifySessionsChanged } = await import('../src/session/state');
const { closeSession, registerSession } = await import('../src/session/lifecycle');

const noop: ToolCallback = async () => ({ content: [] });

const sessionOf = (type: SessionMetadata['type']): SessionMetadata => ({ type, capabilities: {}, isAttached: false });
const browserMock = () => ({ deleteSession: vi.fn().mockResolvedValue(undefined) }) as unknown as WebdriverIO.Browser;
const historyOf = (sessionId: string): SessionHistory => ({ sessionId, type: 'browser', startedAt: new Date().toISOString(), capabilities: {}, steps: [] });

/** what createServer() does per HTTP request */
function createServer() {
  const server = new McpServer({ name: 'test', version: '0' });
  const tools = new Map<string, RegisteredTool>();
  const registerTool = (definition: ToolDefinition, callback: ToolCallback) => {
    const tool = server.registerTool(definition.name, { description: definition.description, inputSchema: definition.inputSchema }, callback);
    tools.set(definition.name, tool);
    return tool;
  };
  for (const name of ['click_element', 'tap_element', 'select_option', 'get_cookies']) {
    registerTool({ name, description: name, inputSchema: {} }, noop);
  }
  const dispose = setupToolVisibility(tools, registerTool);
  const listed = () => [...tools].filter(([, tool]) => tool.enabled).map(([name]) => name);
  return { tools, listed, dispose };
}

beforeEach(() => {
  const settings = getToolSettings();
  settings.platform = undefined;
  settings.enabledGroups.clear();
  const state = getState();
  state.currentSession = null;
  state.browsers.clear();
  state.sessionMetadata.clear();
  state.sessionHistory.clear();
});

describe('tool visibility across servers', () => {
  it('a later server lists the tools of the platform an earlier one started', () => {
    const first = createServer();
    expect(first.listed()).toContain('select_option');
    notifySessionsChanged({ type: 'android', capabilities: {}, isAttached: false });
    expect(first.listed()).toContain('tap_element');

    const second = createServer();
    expect(second.listed()).toContain('tap_element');
    expect(second.listed()).not.toContain('select_option');
  });

  it('keeps enable_tools additions for later servers', async () => {
    const first = createServer();
    expect(first.listed()).not.toContain('get_cookies');
    await (first.tools.get('enable_tools') as unknown as { handler: (a: unknown, e: unknown) => Promise<unknown> }).handler({ groups: ['cookies'] }, {});
    expect(createServer().listed()).toContain('get_cookies');
  });

  it('seeds the platform from the active session', () => {
    const state = getState();
    state.sessionMetadata.set('s1', { type: 'browser', runtime: 'electron', capabilities: {}, isAttached: false });
    state.currentSession = 's1';
    expect(getToolSettings().platform).toBe('electron');
  });

  it('lists the tools of every live session platform', () => {
    const server = createServer();
    const state = getState();
    state.sessionMetadata.set('b1', { type: 'browser', capabilities: {}, isAttached: false });
    state.sessionMetadata.set('a1', { type: 'android', capabilities: {}, isAttached: false });
    notifySessionsChanged(state.sessionMetadata.get('a1')!);
    expect(server.listed()).toContain('select_option');
    expect(server.listed()).toContain('tap_element');
  });

  it('drops the platform of a browser session that an android session replaced', () => {
    const server = createServer();
    registerSession('b1', browserMock(), sessionOf('browser'), historyOf('b1'));
    expect(server.listed()).toContain('select_option');

    registerSession('a1', browserMock(), sessionOf('android'), historyOf('a1'));
    expect(server.listed()).not.toContain('select_option');
    expect(server.listed()).toContain('tap_element');
  });

  it('drops the platform of an android session once it is closed', async () => {
    const server = createServer();
    registerSession('b1', browserMock(), sessionOf('browser'), historyOf('b1'), { keep: true });
    registerSession('a1', browserMock(), sessionOf('android'), historyOf('a1'), { keep: true });
    expect(server.listed()).toContain('tap_element');

    await closeSession('a1', false, false);
    expect(server.listed()).not.toContain('tap_element');
    expect(server.listed()).toContain('select_option');
  });

  it('lists the fresh-server tools once the last session closes', async () => {
    const server = createServer();
    registerSession('a1', browserMock(), sessionOf('android'), historyOf('a1'));
    expect(server.listed()).toContain('tap_element');

    await closeSession('a1', false, false);
    expect(server.listed()).not.toContain('tap_element');
    expect(server.listed()).toContain('select_option');
    expect(server.listed()).toEqual(createServer().listed());
  });

  it('keeps one session listener however many servers are created', () => {
    const servers = Array.from({ length: 5 }, createServer);
    expect(registered).toHaveBeenCalledTimes(1);
    expect(servers).toHaveLength(5);
  });

  it('stops refreshing a server once it is disposed', () => {
    const server = createServer();
    server.dispose();
    notifySessionsChanged({ type: 'ios', capabilities: {}, isAttached: false });
    expect(server.listed()).not.toContain('tap_element');
  });
});
