import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { getState } from '../../src/session/state';
import { mockTool, mockToolDefinition, getMockCallsTool, getMockCallsToolDefinition, manageMockTool, manageMockToolDefinition, releaseSessionMocks } from '../../src/tools/mock.tool';

type TestTool = (args: Record<string, unknown>) => ReturnType<typeof mockTool>;
const configure = mockTool as unknown as TestTool;
const inspect = getMockCallsTool as unknown as TestTool;
const manage = manageMockTool as unknown as TestTool;
const target = { mockType: 'electron', apiName: 'dialog', funcName: 'showOpenDialog' };
const browserTarget = { mockType: 'browser', url: '**/api/todos' };
const message = (result: Awaited<ReturnType<TestTool>>) => (result.content[0] as { text: string }).text;
const body = (result: Awaited<ReturnType<TestTool>>) => JSON.parse(message(result));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
function session(id = 'electron', { runtime = 'electron', isBidi = false }: { runtime?: 'electron' | 'webdriver'; isBidi?: boolean } = {}) {
  const mock = {
    mockReturnValue: vi.fn(), mockReturnValueOnce: vi.fn(), mockResolvedValue: vi.fn(),
    mockResolvedValueOnce: vi.fn(), mockRejectedValue: vi.fn(), mockRejectedValueOnce: vi.fn(),
    mockClear: vi.fn(), mockReset: vi.fn(), mockRestore: vi.fn(), update: vi.fn(), mock: { calls: [] as unknown[][] },
  };
  const create = vi.fn().mockResolvedValue(mock);
  const browserMock = {
    calls: [] as unknown[], respond: vi.fn(), respondOnce: vi.fn(), abort: vi.fn(), abortOnce: vi.fn(),
    redirect: vi.fn(), redirectOnce: vi.fn(), clear: vi.fn(), reset: vi.fn(), restore: vi.fn().mockResolvedValue(undefined),
  };
  const createBrowserMock = vi.fn().mockResolvedValue(browserMock);
  const state = getState();
  state.currentSession = id;
  state.browsers.set(id, { isBidi, electron: { mock: create }, mock: createBrowserMock } as unknown as WebdriverIO.Browser);
  state.sessionMetadata.set(id, { type: 'browser', runtime, capabilities: {}, isAttached: false });
  return { mock, create, browserMock, createBrowserMock };
}

beforeEach(() => {
  const state = getState();
  state.browsers.clear(); state.sessionMetadata.clear(); state.sessionHistory.clear(); state.currentSession = null;
});

describe('Electron mocks', () => {
  it.each([
    ['configure', configure, {}],
    ['inspect', inspect, {}],
    ['manage', manage, { action: 'restore' }],
  ] as const)('handles browser %s without touching Electron mocks in any runtime', async (name, tool, extra) => {
    const { mock, create, browserMock, createBrowserMock } = session('electron', { isBidi: true });
    const responding = { ...browserTarget, behavior: 'respond' as const, value: 'x' };
    await configure(target);
    for (const runtime of ['electron', 'webdriver'] as const) {
      getState().sessionMetadata.get('electron')!.runtime = runtime;
      await configure(responding);
      const result = await tool({ ...responding, ...extra });
      expect(result.isError).toBeUndefined();
      if (name === 'inspect') expect(result.content).toEqual([{ type: 'text', text: expect.stringContaining('"callCount":') }]);
    }
    expect(create).toHaveBeenCalledOnce();
    if (name === 'manage') {
      expect(createBrowserMock).toHaveBeenCalledTimes(2);
      expect(browserMock.restore).toHaveBeenCalledTimes(2);
    } else {
      expect(createBrowserMock).toHaveBeenCalledOnce();
    }
    if (name === 'configure') expect(browserMock.respond).toHaveBeenCalledTimes(4);
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.mockRestore).not.toHaveBeenCalled();
  });

  it('requires an explicit mockType and a complete Electron target before service calls', async () => {
    const { create } = session();
    for (const args of [
      { apiName: 'app', funcName: 'getName' },
      { ...target, mockType: 'unknown' },
      { mockType: 'electron' },
      { mockType: 'electron', apiName: 'app' },
      { mockType: 'electron', funcName: 'getName' },
    ]) {
      expect((await configure(args)).isError).toBe(true);
      expect((await inspect(args)).isError).toBe(true);
      expect((await manage({ ...args, action: 'restore' })).isError).toBe(true);
    }
    expect(create).not.toHaveBeenCalled();
  });

  describe.each([
    ['configure', configure, {}],
    ['inspect', inspect, {}],
    ['manage', manage, { action: 'restore' }],
  ] as const)('%s routing', (_name, tool, extra) => {
    it.each([
      ['webdriver', undefined, 'webSocketUrl: true'],
      [undefined, undefined, 'webSocketUrl: true'],
      ['webdriver', 'browser', 'webSocketUrl: true'],
      [undefined, 'browser', 'webSocketUrl: true'],
      ['webdriver', 'electron', 'requires an active Electron session'],
      [undefined, 'electron', 'requires an active Electron session'],
      ['electron', undefined, 'mockType is required'],
      ['electron', 'browser', 'webSocketUrl: true'],
    ] as const)('routes runtime %s and selector %s', async (runtime, mockType, text) => {
      const { create, createBrowserMock } = session();
      getState().sessionMetadata.get('electron')!.runtime = runtime;
      const result = await tool({ ...target, url: browserTarget.url, mockType, ...extra });
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{ type: 'text', text: expect.stringContaining(text) }]);
      expect(create).not.toHaveBeenCalled();
      expect(createBrowserMock).not.toHaveBeenCalled();
    });

    it.each(['ios', 'android'] as const)('rejects %s for every selector', async type => {
      const { create } = session();
      getState().sessionMetadata.get('electron')!.type = type;
      for (const mockType of [undefined, 'browser', 'electron']) {
        const result = await tool({ ...target, url: browserTarget.url, mockType, ...extra });
        expect(result.isError).toBe(true);
        expect(result.content).toEqual([{ type: 'text', text: expect.stringContaining('unsupported for iOS/Android Appium') }]);
      }
      expect(create).not.toHaveBeenCalled();
    });

    it.each(['session', 'metadata', 'browser'])('rejects missing %s for every selector', async missing => {
      const { create } = session();
      if (missing === 'session') { getState().currentSession = null; }
      if (missing === 'metadata') getState().sessionMetadata.clear();
      if (missing === 'browser') getState().browsers.clear();
      for (const mockType of [undefined, 'browser', 'electron']) {
        const result = await tool({ ...target, url: browserTarget.url, mockType, ...extra });
        expect(result.isError).toBe(true);
        expect(result.content).toEqual([{ type: 'text', text: expect.stringMatching(/session/i) }]);
      }
      expect(create).not.toHaveBeenCalled();
    });
  });

  it.each([mockToolDefinition, getMockCallsToolDefinition, manageMockToolDefinition])('exposes optional mockType for $name', definition => {
    const schema = z.object(definition.inputSchema);
    expect(schema.safeParse({ action: 'restore' }).success).toBe(true);
    expect(schema.safeParse({ mockType: 'browser', action: 'restore' }).success).toBe(true);
    expect(schema.safeParse({ url: browserTarget.url, action: 'restore' }).success).toBe(true);
    for (const mockType of ['network', 'unknown', null, 1]) {
      expect(schema.safeParse({ mockType, action: 'restore' }).success).toBe(false);
    }
    expect(Object.keys(definition.inputSchema)).not.toContain('kind');
  });

  it('creates one handle and preserves once-value order for overlapping configurations', async () => {
    const { mock, create } = session();
    const creation = deferred<typeof mock>();
    const started = deferred<void>();
    create.mockImplementationOnce(() => { started.resolve(); return creation.promise; });
    const first = configure({ ...target, behavior: 'mockReturnValueOnce', value: 'first' });
    await started.promise;
    const second = configure({ ...target, behavior: 'mockReturnValueOnce', value: 'second' });
    creation.resolve(mock);
    const results = await Promise.all([first, second]);
    expect(results.every(result => !result.isError)).toBe(true);
    expect(create).toHaveBeenCalledOnce();
    expect(mock.mockReturnValueOnce.mock.calls).toEqual([['first'], ['second']]);
  });

  it('allows a queued request to retry failed creation', async () => {
    const { create } = session();
    const creation = deferred<never>();
    const started = deferred<void>();
    create.mockImplementationOnce(() => { started.resolve(); return creation.promise; });
    const first = configure(target);
    await started.promise;
    const second = configure(target);
    creation.reject(new Error('creation failed'));
    expect((await first).isError).toBe(true);
    expect((await second).isError).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('sequences inspection and restoration after configuration, then recreates the handle', async () => {
    const { mock, create } = session();
    const configuration = deferred<void>();
    const started = deferred<void>();
    const events: string[] = [];
    mock.mockReturnValue.mockImplementationOnce(async () => {
      started.resolve();
      await configuration.promise;
      events.push('configured');
    }).mockImplementationOnce(() => { events.push('reconfigured'); });
    mock.update.mockImplementation(() => { events.push('inspected'); });
    mock.mockRestore.mockImplementation(() => { events.push('restored'); });
    const first = configure(target);
    await started.promise;
    const inspection = inspect(target);
    const restoration = manage({ ...target, action: 'restore' });
    const second = configure(target);
    configuration.resolve();
    const results = await Promise.all([first, inspection, restoration, second]);
    expect(results.every(result => !result.isError)).toBe(true);
    expect(events).toEqual(['configured', 'inspected', 'restored', 'reconfigured']);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('does not block another target or a replacement browser during pending creation', async () => {
    const { mock, create } = session();
    const creation = deferred<typeof mock>();
    const started = deferred<void>();
    create.mockImplementationOnce(() => { started.resolve(); return creation.promise; });
    const pending = configure(target);
    await started.promise;
    expect((await configure({ mockType: 'electron', apiName: 'app', funcName: 'getName' })).isError).toBeUndefined();
    const replacement = session();
    expect((await configure(target)).isError).toBeUndefined();
    creation.resolve(mock);
    expect((await pending).isError).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(2);
    expect(replacement.create).toHaveBeenCalledOnce();
    await inspect(target);
    expect(replacement.mock.update).toHaveBeenCalledOnce();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it.each(['mockReturnValue', 'mockReturnValueOnce', 'mockResolvedValue', 'mockResolvedValueOnce', 'mockRejectedValue', 'mockRejectedValueOnce'])('delegates %s', async behavior => {
    const { mock, create } = session();
    expect((await configure({ ...target, behavior, value: { canceled: true } })).isError).toBeUndefined();
    expect(create).toHaveBeenCalledWith('dialog', 'showOpenDialog');
    expect(mock[behavior as keyof typeof mock]).toHaveBeenCalledWith({ canceled: true });
  });

  it('keeps the handle when queuing subsequent values', async () => {
    const { mock, create } = session();
    await configure({ ...target, value: 'default' });
    await configure({ ...target, behavior: 'mockReturnValueOnce', value: 'first' });
    await configure({ ...target, behavior: 'mockReturnValueOnce', value: 'second' });
    expect(create).toHaveBeenCalledOnce();
    expect(mock.mockReturnValueOnce.mock.calls).toEqual([['first'], ['second']]);
  });

  it('refreshes call history before returning it', async () => {
    const { mock } = session();
    await configure(target);
    mock.update.mockImplementation(async () => { mock.mock.calls = [[{ title: 'Open' }]]; });
    const result = await inspect(target);
    expect(mock.update).toHaveBeenCalledOnce();
    expect(body(result)).toEqual({ calls: [[{ title: 'Open' }]], callCount: 1 });
  });

  it.each([['clear', 'mockClear'], ['reset', 'mockReset'], ['restore', 'mockRestore']])('delegates %s', async (action, method) => {
    const { mock } = session();
    await configure(target);
    expect((await manage({ ...target, action })).isError).toBeUndefined();
    expect(mock[method as keyof typeof mock]).toHaveBeenCalledOnce();
    expect((await inspect(target)).isError).toBe(action === 'restore' ? true : undefined);
  });

  it('creates a new handle after restoration', async () => {
    const { create } = session();
    await configure(target);
    await manage({ ...target, action: 'restore' });
    await configure(target);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('retains the handle when configuration or restoration fails', async () => {
    const { mock, create } = session();
    mock.mockReturnValue.mockRejectedValueOnce(new Error('configure failed'));
    expect((await configure(target)).isError).toBe(true);
    mock.mockRestore.mockRejectedValueOnce(new Error('restore failed'));
    expect((await manage({ ...target, action: 'restore' })).isError).toBe(true);
    expect((await configure(target)).isError).toBeUndefined();
    expect(create).toHaveBeenCalledOnce();
    expect((await manage({ ...target, action: 'restore' })).isError).toBeUndefined();
  });

  it('does not reuse mocks after session replacement, even with the same session ID', async () => {
    session();
    await configure(target);
    const { create } = session();
    expect((await inspect(target)).isError).toBe(true);
    await configure(target);
    expect(create).toHaveBeenCalledOnce();
  });

  it('rejects missing sessions, non-Electron sessions, and unavailable bridges', async () => {
    expect((await configure(target)).isError).toBe(true);
    const { create } = session();
    getState().sessionMetadata.get('electron')!.runtime = 'webdriver';
    expect((await configure(target)).isError).toBe(true);
    expect(create).not.toHaveBeenCalled();
    getState().sessionMetadata.get('electron')!.runtime = 'electron';
    getState().browsers.set('electron', {} as unknown as WebdriverIO.Browser);
    expect((await configure(target)).isError).toBe(true);
  });

  it('does not create mocks through inspection or management', async () => {
    const { create } = session();
    expect((await inspect(target)).isError).toBe(true);
    expect((await manage({ ...target, action: 'clear' })).isError).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it('reports service creation and refresh failures as tool errors', async () => {
    const { create, mock } = session();
    create.mockRejectedValueOnce(new Error('bridge failed'));
    expect((await configure(target)).isError).toBe(true);
    await configure(target);
    mock.update.mockRejectedValueOnce(new Error('refresh failed'));
    expect((await inspect(target)).isError).toBe(true);
  });

  it('rejects browser behaviors on an electron mock and names the allowed values', async () => {
    const { mock } = session();
    const result = await configure({ ...target, behavior: 'respond', value: 'x' });
    expect(result.isError).toBe(true);
    expect(message(result)).toContain('Behavior "respond" is not available for electron mocks');
    expect(message(result)).toContain('mockReturnValue, mockReturnValueOnce, mockResolvedValue, mockResolvedValueOnce, mockRejectedValue, mockRejectedValueOnce');
    expect(mock.mockReturnValue).not.toHaveBeenCalled();
  });

  it('validates the public schema before accepting malformed targets or behavior', () => {
    const schema = z.object(mockToolDefinition.inputSchema);
    expect(schema.safeParse({ ...target, value: null }).success).toBe(true);
    expect(schema.safeParse({ mockType: 'browser' }).success).toBe(true);
    expect(schema.safeParse({ ...browserTarget, behavior: 'respond' }).success).toBe(true);
    expect(schema.safeParse({ apiName: 'app', funcName: 'getName' }).success).toBe(true);
    expect(schema.safeParse({ ...target, mockType: 'unknown' }).success).toBe(false);
    expect(schema.safeParse({ ...target, behavior: 'mockImplementation' }).success).toBe(false);
    expect(schema.safeParse({ ...target, apiName: '__proto__' }).success).toBe(false);
    expect(schema.safeParse({ ...target, funcName: '' }).success).toBe(false);
    expect(schema.safeParse({ mockType: 'browser', url: '' }).success).toBe(false);
  });

  it('accepts statusCode and headers on the mock tool only', () => {
    const schema = z.object(mockToolDefinition.inputSchema);
    expect(schema.safeParse({ ...browserTarget, statusCode: 201, headers: { 'x-custom': 'yes' } }).success).toBe(true);
    expect(schema.safeParse({ ...browserTarget, statusCode: '201' }).success).toBe(false);
    expect(schema.safeParse({ ...browserTarget, headers: { 'x-custom': 1 } }).success).toBe(false);
    for (const definition of [getMockCallsToolDefinition, manageMockToolDefinition]) {
      expect(Object.keys(definition.inputSchema)).not.toContain('statusCode');
      expect(Object.keys(definition.inputSchema)).not.toContain('headers');
    }
  });
});

describe('Browser mocks', () => {
  it('requires a url before reaching the driver', async () => {
    const { createBrowserMock } = session('browser', { runtime: 'webdriver', isBidi: true });
    const result = await configure({ mockType: 'browser' });
    expect(result.isError).toBe(true);
    expect(message(result)).toContain('Browser mocks require url');
    expect(createBrowserMock).not.toHaveBeenCalled();
  });

  it.each(['webdriver', 'electron'] as const)('requires BiDi for browser mocks in a %s session', async runtime => {
    const { createBrowserMock } = session('browser', { runtime, isBidi: false });
    const result = await configure(browserTarget);
    expect(result.isError).toBe(true);
    expect(message(result)).toContain('BiDi-enabled session');
    expect(message(result)).toContain('capabilities: { webSocketUrl: true }');
    expect(createBrowserMock).not.toHaveBeenCalled();
  });

  it('creates the mock with the url and optional method filter', async () => {
    const { createBrowserMock } = session('browser', { runtime: 'webdriver', isBidi: true });
    await configure(browserTarget);
    await configure({ ...browserTarget, method: 'get' });
    expect(createBrowserMock).toHaveBeenNthCalledWith(1, '**/api/todos', undefined);
    expect(createBrowserMock).toHaveBeenNthCalledWith(2, '**/api/todos', { method: 'get' });
  });

  it('normalizes method casing so one handle serves any casing across tools', async () => {
    const { createBrowserMock } = session('browser', { runtime: 'webdriver', isBidi: true });
    await configure({ ...browserTarget, method: 'GET' });
    const result = await inspect({ ...browserTarget, method: 'get' });
    expect(result.isError).toBeUndefined();
    expect(message(result)).toContain('"callCount":');
    expect(createBrowserMock).toHaveBeenCalledOnce();
  });

  it('treats an empty method filter as omitted', async () => {
    const { createBrowserMock } = session('browser', { runtime: 'webdriver', isBidi: true });
    await configure({ ...browserTarget, method: '' });
    const result = await inspect(browserTarget);
    expect(result.isError).toBeUndefined();
    expect(message(result)).toContain('"callCount":');
    expect(createBrowserMock).toHaveBeenCalledOnce();
  });

  it('creates an observe-only mock when behavior is omitted', async () => {
    const { browserMock, createBrowserMock } = session('browser', { runtime: 'webdriver', isBidi: true });
    const result = await configure(browserTarget);
    expect(message(result)).toBe('Browser mock created: **/api/todos (observing)');
    expect(createBrowserMock).toHaveBeenCalledOnce();
    expect(browserMock.respond).not.toHaveBeenCalled();
    expect(browserMock.abort).not.toHaveBeenCalled();
    expect(message(await inspect(browserTarget))).toContain('"callCount":');
  });

  it('reports an existing mock when observing an already-configured target', async () => {
    const { browserMock, createBrowserMock } = session('browser', { runtime: 'webdriver', isBidi: true });
    await configure({ ...browserTarget, behavior: 'respond', value: 'x' });
    const result = await configure(browserTarget);
    expect(message(result)).toBe('Browser mock already exists: **/api/todos — existing behavior still active; run manage_mock with action reset for observe-only');
    expect(createBrowserMock).toHaveBeenCalledOnce();
    expect(browserMock.respond).toHaveBeenCalledOnce();
  });

  it('releaseSessionMocks restores every handle and clears the registry', async () => {
    const { browserMock } = session('browser', { runtime: 'webdriver', isBidi: true });
    await configure({ ...browserTarget, behavior: 'respond', value: 'x' });
    const browser = getState().browsers.get('browser') as WebdriverIO.Browser;
    await releaseSessionMocks(browser);
    expect(browserMock.restore).toHaveBeenCalledOnce();
    const result = await inspect(browserTarget);
    expect(result.isError).toBe(true);
    expect(message(result)).toContain('mock not found');
  });

  it.each([undefined, null])('rejects respond with %s value but retains the handle', async value => {
    const { browserMock, createBrowserMock } = session('browser', { runtime: 'webdriver', isBidi: true });
    const result = await configure({ ...browserTarget, behavior: 'respond', value });
    expect(result.isError).toBe(true);
    expect(message(result)).toContain('respond behaviors require value');
    expect(createBrowserMock).toHaveBeenCalledOnce();
    const retry = await configure({ ...browserTarget, behavior: 'respond', value: 'ok' });
    expect(retry.isError).toBeUndefined();
    expect(browserMock.respond).toHaveBeenLastCalledWith('ok', undefined);
  });

  it.each(['respond', 'respondOnce'] as const)('passes only defined respond params for %s', async behavior => {
    const { browserMock, createBrowserMock } = session('browser', { runtime: 'webdriver', isBidi: true });
    await configure({ ...browserTarget, behavior, value: [{ id: 1 }] });
    expect(browserMock[behavior]).toHaveBeenCalledWith([{ id: 1 }], undefined);
    await configure({ ...browserTarget, behavior, value: 'plain', headers: { 'x-custom': 'yes' } });
    expect(browserMock[behavior]).toHaveBeenLastCalledWith('plain', { headers: { 'x-custom': 'yes' } });
    expect(Object.keys(browserMock[behavior].mock.calls.at(-1)![1] as Record<string, unknown>)).toEqual(['headers']);
    await configure({ ...browserTarget, behavior, value: 'typed', statusCode: 201, headers: { 'x-custom': 'yes' } });
    expect(browserMock[behavior]).toHaveBeenLastCalledWith('typed', { statusCode: 201, headers: { 'x-custom': 'yes' } });
    expect(createBrowserMock).toHaveBeenCalledOnce();
  });

  it.each(['abort', 'abortOnce'] as const)('aborts without an error code for %s', async behavior => {
    const { browserMock } = session('browser', { runtime: 'webdriver', isBidi: true });
    expect((await configure({ ...browserTarget, behavior })).isError).toBeUndefined();
    expect(browserMock[behavior]).toHaveBeenCalledWith();
  });

  it.each(['redirect', 'redirectOnce'] as const)('requires a string value for %s', async behavior => {
    const { browserMock } = session('browser', { runtime: 'webdriver', isBidi: true });
    const missing = await configure({ ...browserTarget, behavior });
    expect(missing.isError).toBe(true);
    expect(message(missing)).toContain('redirect behaviors require value');
    const redirect = 'https://staging.example.com/api/*';
    expect((await configure({ ...browserTarget, behavior, value: redirect })).isError).toBeUndefined();
    expect(browserMock[behavior]).toHaveBeenCalledWith(redirect);
  });

  it('rejects electron behaviors on a browser mock and names the allowed values', async () => {
    const { browserMock, createBrowserMock } = session('browser', { runtime: 'webdriver', isBidi: true });
    const result = await configure({ ...browserTarget, behavior: 'mockReturnValue', value: 'x' });
    expect(result.isError).toBe(true);
    expect(message(result)).toContain('Behavior "mockReturnValue" is not available for browser mocks');
    expect(message(result)).toContain('respond, respondOnce, abort, abortOnce, redirect, redirectOnce');
    expect(createBrowserMock).toHaveBeenCalledOnce();
    expect(browserMock.respond).not.toHaveBeenCalled();
  });

  it('reads call history without refreshing it', async () => {
    const { browserMock, createBrowserMock } = session('browser', { runtime: 'webdriver', isBidi: true });
    await configure(browserTarget);
    browserMock.calls.push({ url: '**/api/todos' });
    expect(body(await inspect(browserTarget))).toEqual({ calls: [{ url: '**/api/todos' }], callCount: 1 });
    expect(createBrowserMock).toHaveBeenCalledOnce();
  });

  it.each([['clear', 'clear'], ['reset', 'reset'], ['restore', 'restore']] as const)('delegates %s', async (action, method) => {
    const { browserMock } = session('browser', { runtime: 'webdriver', isBidi: true });
    await configure(browserTarget);
    expect((await manage({ ...browserTarget, action })).isError).toBeUndefined();
    expect(browserMock[method]).toHaveBeenCalledOnce();
    expect((await inspect(browserTarget)).isError).toBe(action === 'restore' ? true : undefined);
  });

  it('reports the kind, target, and behavior of the configured mock', async () => {
    session('electron', { isBidi: true });
    expect(message(await configure(browserTarget))).toBe('Browser mock created: **/api/todos (observing)');
    expect(message(await configure({ ...browserTarget, method: 'get', behavior: 'abortOnce' }))).toBe('Browser mock configured: **/api/todos get (abortOnce)');
    expect(message(await configure(target))).toBe('Electron mock configured: dialog.showOpenDialog (mockReturnValue)');
    expect(message(await manage({ ...browserTarget, method: 'get', action: 'restore' }))).toBe('Browser mock restore completed: **/api/todos get');
  });

  it('keeps electron and browser mocks under distinct keys in one session', async () => {
    const { mock, create, browserMock, createBrowserMock } = session('electron', { isBidi: true });
    await configure(target);
    await configure(browserTarget);
    expect(create).toHaveBeenCalledOnce();
    expect(createBrowserMock).toHaveBeenCalledOnce();
    mock.mock.calls = [['electron']];
    browserMock.calls.push(['browser']);
    expect(body(await inspect(target))).toEqual({ calls: [['electron']], callCount: 1 });
    expect(body(await inspect(browserTarget))).toEqual({ calls: [['browser']], callCount: 1 });
    await manage({ ...browserTarget, action: 'restore' });
    expect((await inspect(browserTarget)).isError).toBe(true);
    expect((await inspect(target)).isError).toBeUndefined();
  });
});
