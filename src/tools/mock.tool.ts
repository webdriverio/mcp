import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDefinition } from '../types/tool';
import { z } from 'zod';
import { getBrowser, getState } from '../session/state';
import { normalizeBrowserMethod, respondParams } from '../utils/browser-mock';

const electronTargetSchema = {
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/).describe('Electron API module, such as dialog, app, or clipboard.'),
  funcName: z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/).describe('API function, such as showOpenDialog or getName.'),
};
const mockTypeSchema = z.enum(['electron', 'browser']);
const targetSchema = {
  mockType: mockTypeSchema.optional().describe('Mock type: electron or browser. Defaults to browser in WebDriver sessions; required in Electron sessions. Browser mocks intercept network requests by url glob and require a BiDi-enabled session (start_session with capabilities: { webSocketUrl: true }); in Electron sessions they additionally require the session to have negotiated BiDi. Electron mocks require apiName and funcName. Appium sessions are unsupported.'),
  apiName: electronTargetSchema.apiName.optional().describe('Required for mockType electron: API module, such as dialog, app, or clipboard.'),
  funcName: electronTargetSchema.funcName.optional().describe('Required for mockType electron: API function, such as showOpenDialog or getName.'),
  url: z.string().min(1).optional().describe('Required for mockType browser: URL glob to intercept, such as **/api/todos.'),
  method: z.string().optional().describe('Optional for mockType browser: request method filter, such as get.'),
};
const electronBehaviorSchema = z.enum(['mockReturnValue', 'mockReturnValueOnce', 'mockResolvedValue', 'mockResolvedValueOnce', 'mockRejectedValue', 'mockRejectedValueOnce']);
const browserBehaviorSchema = z.enum(['respond', 'respondOnce', 'abort', 'abortOnce', 'redirect', 'redirectOnce']);
const behaviorSchema = z.enum([...electronBehaviorSchema.options, ...browserBehaviorSchema.options]);
const actionSchema = z.enum(['clear', 'reset', 'restore']);
type Behavior = z.infer<typeof behaviorSchema>;
type Target = { mockType?: z.infer<typeof mockTypeSchema>; apiName?: string; funcName?: string; url?: string; method?: string };
type MockArgs = Target & { behavior?: Behavior; value?: unknown; statusCode?: number; headers?: Record<string, string> };
type ManageArgs = Target & { action: z.infer<typeof actionSchema> };
type ElectronMockHandle = Record<z.infer<typeof electronBehaviorSchema>, (value: unknown) => Promise<unknown>> & {
  update(): Promise<unknown>;
  mock: { calls: unknown[][] };
  mockClear(): Promise<unknown>;
  mockReset(): Promise<unknown>;
  mockRestore(): Promise<unknown>;
};
type ElectronBridge = { mock(apiName: string, funcName: string): Promise<ElectronMockHandle> };
type MockAdapter = {
  defaultBehavior?: Behavior;
  create(browser: WebdriverIO.Browser, target: Target): Promise<unknown>;
  configure(handle: unknown, args: MockArgs): Promise<void>;
  inspect(handle: unknown): Promise<{ calls: unknown[]; callCount: number }>;
  clear(handle: unknown): Promise<void>;
  reset(handle: unknown): Promise<void>;
  restore(handle: unknown): Promise<void>;
  describe(target: Target): string;
};
const kindLabels = { electron: 'Electron', browser: 'Browser' } as const;
type MockEntry = { adapter: MockAdapter; handle: unknown };
// Browser ownership keeps handles isolated and lets teardown release them without another cleanup hook.
const sessionMocks = new WeakMap<WebdriverIO.Browser, Map<string, MockEntry>>();
const sessionOperations = new WeakMap<WebdriverIO.Browser, Map<string, Promise<void>>>();

function electronBridge(browser: WebdriverIO.Browser): ElectronBridge {
  const electron = (browser as WebdriverIO.Browser & { electron?: ElectronBridge }).electron;
  if (!electron?.mock) throw new Error('Electron mocking support is unavailable for this session.');
  return electron;
}
function assertBehavior(behavior: string, allowed: readonly string[], kind: string) {
  if (!allowed.includes(behavior)) {
    throw new Error(`Behavior "${behavior}" is not available for ${kind} mocks; allowed: ${allowed.join(', ')}.`);
  }
}
const electronAdapter: MockAdapter = {
  defaultBehavior: 'mockReturnValue',
  create: (browser, target) => electronBridge(browser).mock(target.apiName!, target.funcName!),
  configure: async (handle, args) => {
    const behavior = args.behavior as z.infer<typeof electronBehaviorSchema>;
    assertBehavior(behavior, electronBehaviorSchema.options, 'electron');
    await (handle as ElectronMockHandle)[behavior](args.value);
  },
  inspect: async handle => {
    const mock = handle as ElectronMockHandle;
    await mock.update();
    return { calls: mock.mock.calls, callCount: mock.mock.calls.length };
  },
  clear: async handle => { await (handle as ElectronMockHandle).mockClear(); },
  reset: async handle => { await (handle as ElectronMockHandle).mockReset(); },
  restore: async handle => { await (handle as ElectronMockHandle).mockRestore(); },
  describe: target => `${target.apiName}.${target.funcName}`,
};

const browserAdapter: MockAdapter = {
  // No default: an omitted behavior creates an observe-only mock that records matching requests without altering them.
  create: (browser, target) => browser.mock(target.url!, target.method !== undefined ? { method: target.method } : undefined),
  configure: async (handle, args) => {
    const mock = handle as WebdriverIO.Mock;
    const behavior = args.behavior as z.infer<typeof browserBehaviorSchema>;
    assertBehavior(behavior, browserBehaviorSchema.options, 'browser');
    if (behavior === 'respond' || behavior === 'respondOnce') {
      // respond(undefined/null) makes wdio send an invalid network.provideResponse body; the rejected BiDi command throws inside the interception event handler and kills the process.
      if (args.value === undefined || args.value === null) throw new Error('respond behaviors require value: the response body, such as "" for an empty body.');
      (mock[behavior] as (value: unknown, params?: unknown) => unknown)(args.value, respondParams(args));
      return;
    }
    if (behavior === 'abort' || behavior === 'abortOnce') { mock[behavior](); return; }
    if (typeof args.value !== 'string' || !args.value) throw new Error('redirect behaviors require value: the target URL string.');
    mock[behavior](args.value);
  },
  inspect: async handle => {
    const calls = (handle as WebdriverIO.Mock).calls;
    return { calls, callCount: calls.length };
  },
  clear: async handle => { (handle as WebdriverIO.Mock).clear(); },
  reset: async handle => { (handle as WebdriverIO.Mock).reset(); },
  restore: async handle => { await (handle as WebdriverIO.Mock).restore(); },
  describe: target => `${target.url}${target.method !== undefined ? ` ${target.method}` : ''}`,
};

function context(target: Target) {
  const selector = mockTypeSchema.optional().parse(target.mockType);
  const state = getState();
  if (!state.currentSession) throw new Error('No active session.');
  const metadata = state.sessionMetadata.get(state.currentSession);
  if (!metadata) throw new Error('Active session metadata is unavailable.');
  const browser = getBrowser();
  if (metadata.type !== 'browser') throw new Error('Mocking is unsupported for iOS/Android Appium sessions.');
  if (metadata.runtime === 'electron' && selector === undefined) {
    throw new Error('mockType is required in Electron sessions; choose "electron" or "browser".');
  }
  const kind = selector ?? 'browser';
  let key: string;
  let kindTarget: Target;
  if (kind === 'electron') {
    if (metadata.runtime !== 'electron') throw new Error('Electron mocking requires an active Electron session.');
    const electronTarget = z.object(electronTargetSchema).parse(target);
    electronBridge(browser);
    kindTarget = electronTarget;
    key = JSON.stringify(['electron', electronTarget.apiName, electronTarget.funcName]);
  } else {
    if (!target.url) throw new Error('Browser mocks require url; pass a URL glob such as **/api/todos.');
    if (!browser.isBidi) throw new Error('Browser mocking requires a BiDi-enabled session. Start a browser session with capabilities: { webSocketUrl: true }.');
    kindTarget = { ...target, method: normalizeBrowserMethod(target.method) };
    key = JSON.stringify(['browser', kindTarget.url, kindTarget.method]);
  }
  let mocks = sessionMocks.get(browser);
  if (!mocks) { mocks = new Map(); sessionMocks.set(browser, mocks); }
  return { browser, mocks, key, kind, adapter: kind === 'electron' ? electronAdapter : browserAdapter, target: kindTarget };
}

function withTarget<T>(target: Target, operation: (ctx: ReturnType<typeof context>) => Promise<T>): Promise<T> {
  const ctx = context(target);
  let operations = sessionOperations.get(ctx.browser);
  if (!operations) { operations = new Map(); sessionOperations.set(ctx.browser, operations); }
  // Capture the browser now and serialize the entire operation, including restore and inspection.
  const result = (operations.get(ctx.key) ?? Promise.resolve()).then(() => operation(ctx));
  const cleanup = () => {
    if (operations.get(ctx.key) === tail) operations.delete(ctx.key);
  };
  // A failed operation must not prevent later retries from running.
  const tail = result.then(cleanup, cleanup);
  operations.set(ctx.key, tail);
  return result;
}

function errorResult(error: unknown) {
  return { isError: true, content: [{ type: 'text' as const, text: `Error with mock: ${error instanceof Error ? error.message : String(error)}` }] };
}

// Detached sessions outlive this registry: restore every handle so interception cannot outlive MCP's handle on the browser.
export async function releaseSessionMocks(browser: WebdriverIO.Browser): Promise<void> {
  const mocks = sessionMocks.get(browser);
  const operations = sessionOperations.get(browser);
  if (!mocks) return;
  if (operations) await Promise.allSettled(operations.values());
  await Promise.allSettled([...mocks.values()].map(entry => entry.adapter.restore(entry.handle)));
  sessionMocks.delete(browser);
  sessionOperations.delete(browser);
}

export const mockToolDefinition: ToolDefinition = {
  name: 'mock',
  description: 'Configure a session-scoped mock. mockType defaults to browser in WebDriver sessions and is required in Electron sessions. Browser mocks intercept network requests matched by a url glob and require a BiDi-enabled session (start_session with capabilities: { webSocketUrl: true }); in Electron sessions they additionally require the session to have negotiated BiDi. Electron mocks require apiName and funcName. Appium sessions are unsupported. Repeated calls preserve history and queued once values.',
  annotations: { title: 'Configure Mock', destructiveHint: true },
  inputSchema: {
    ...targetSchema,
    behavior: behaviorSchema.optional().describe('Default: mockReturnValue for electron mocks; omit for browser mocks to passively record matching requests without altering them. Once behaviors apply to the next request only.'),
    value: z.json().optional().describe('JSON value to return, resolve, or reject with. Browser respond behaviors use it as the required response body, redirect behaviors as the target URL string; omit it for abort or observing.'),
    statusCode: z.number().int().optional().describe('Browser respond behaviors: response status code override.'),
    headers: z.record(z.string(), z.string()).optional().describe('Browser respond behaviors: response header overrides.'),
  },
};
export const mockTool: ToolCallback = async (args: MockArgs) => {
  try {
    return await withTarget(args, async ({ browser, mocks, key, kind, adapter, target }) => {
      const behavior = args.behavior ? behaviorSchema.parse(args.behavior) : adapter.defaultBehavior;
      let entry = mocks.get(key);
      const existed = entry !== undefined;
      if (!entry) {
        entry = { adapter, handle: await adapter.create(browser, target) };
        // Retain immediately so a failed configuration can still be restored or retried.
        mocks.set(key, entry);
      }
      if (behavior === undefined) {
        // The text is the agent's only state channel: an existing mock keeps its overwrites, so "observing" here would be a lie.
        const text = existed
          ? `${kindLabels[kind]} mock already exists: ${adapter.describe(target)} — existing behavior still active; run manage_mock with action reset for observe-only`
          : `${kindLabels[kind]} mock created: ${adapter.describe(target)} (observing)`;
        return { content: [{ type: 'text' as const, text }] };
      }
      await adapter.configure(entry.handle, { ...args, behavior });
      return { content: [{ type: 'text' as const, text: `${kindLabels[kind]} mock configured: ${adapter.describe(target)} (${behavior})` }] };
    });
  } catch (error) { return errorResult(error); }
};

export const getMockCallsToolDefinition: ToolDefinition = {
  name: 'get_mock_calls',
  description: 'Read current call arguments for a mock in the active session. Use the same target as mock. mockType defaults to browser in WebDriver sessions and is required in Electron sessions. Electron mocks require apiName and funcName; browser mocks require url and accept method. Appium sessions are unsupported.',
  annotations: { title: 'Get Mock Calls', readOnlyHint: true },
  inputSchema: targetSchema,
};
export const getMockCallsTool: ToolCallback = async (args: Target) => {
  try {
    return await withTarget(args, async ({ mocks, key, adapter }) => {
      const entry = mocks.get(key);
      if (!entry) throw new Error('mock not found; call mock first.');
      const { calls, callCount } = await adapter.inspect(entry.handle);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ calls, callCount }) }] };
    });
  } catch (error) { return errorResult(error); }
};

export const manageMockToolDefinition: ToolDefinition = {
  name: 'manage_mock',
  description: 'Manage a mock in the active session. mockType defaults to browser in WebDriver sessions and is required in Electron sessions. Electron mocks require apiName and funcName; browser mocks require url and accept method. Appium sessions are unsupported. clear removes call history, reset also removes configured behavior and queued values, restore reinstates the original and releases the mock.',
  annotations: { title: 'Manage Mock', destructiveHint: true },
  inputSchema: { ...targetSchema, action: actionSchema },
};
export const manageMockTool: ToolCallback = async (args: ManageArgs) => {
  try {
    const action = actionSchema.parse(args.action);
    return await withTarget(args, async ({ mocks, key, kind, adapter, target }) => {
      const entry = mocks.get(key);
      if (!entry) throw new Error('mock not found; call mock first.');
      await adapter[action](entry.handle);
      if (action === 'restore') mocks.delete(key);
      return { content: [{ type: 'text' as const, text: `${kindLabels[kind]} mock ${action} completed: ${adapter.describe(target)}` }] };
    });
  } catch (error) { return errorResult(error); }
};
