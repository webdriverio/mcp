import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  remote: vi.fn(),
  registerSession: vi.fn(),
  initUi5: vi.fn(),
  authenticateUi5: vi.fn(),
  injectUi5: vi.fn(),
  enableWorkZone: vi.fn(),
}));

vi.mock('webdriverio', () => ({ remote: mocks.remote }));

vi.mock('../../src/ui5/runtime', () => ({
  initUi5: mocks.initUi5,
  authenticateUi5: mocks.authenticateUi5,
  injectUi5: mocks.injectUi5,
  enableWorkZone: mocks.enableWorkZone,
}));

vi.mock('../../src/session/lifecycle', () => ({
  registerSession: mocks.registerSession,
  closeSession: vi.fn(),
}));

import { startSessionTool } from '../../src/tools/session.tool';

type ToolFn = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;
const callStart = startSessionTool as unknown as ToolFn;

const BASE_ARGS = { platform: 'ui5', baseUrl: 'https://x', browser: 'chrome' };

let mockBrowser: { sessionId: string; capabilities: Record<string, unknown>; setWindowSize: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  mockBrowser = { sessionId: 'ui5-session', capabilities: {}, setWindowSize: vi.fn() };
  mocks.remote.mockResolvedValue(mockBrowser);
});

describe('start_session UI5', () => {
  it('starts a UI5 session, registers browser-like metadata, and injects the bridge', async () => {
    const result = await callStart({ ...BASE_ARGS });

    expect(result.isError).toBeUndefined();

    const browser = mockBrowser;
    expect(mocks.initUi5).toHaveBeenCalledTimes(1);
    expect(mocks.initUi5).toHaveBeenCalledWith(browser, { baseUrl: 'https://x', wdi5: {} });
    expect(mocks.injectUi5).toHaveBeenCalledWith(browser, { baseUrl: 'https://x', wdi5: {} });
    expect(mocks.enableWorkZone).not.toHaveBeenCalled();
    expect(mocks.authenticateUi5).not.toHaveBeenCalled();

    expect(mocks.registerSession).toHaveBeenCalledWith(
      'ui5-session',
      browser,
      expect.objectContaining({ type: 'browser', runtime: 'ui5', provider: 'local', isAttached: false }),
      expect.objectContaining({ runtime: 'ui5' }),
    );
    expect(result.content[0].text).toContain('UI5 session started');
  });

  it('initializes wdi5 before injecting the bridge', async () => {
    await callStart({ ...BASE_ARGS });

    const initOrder = mocks.initUi5.mock.invocationCallOrder[0];
    const injectOrder = mocks.injectUi5.mock.invocationCallOrder[0];
    expect(initOrder).toBeLessThan(injectOrder);
  });

  it('authenticates with wdi5:authentication capabilities when present', async () => {
    await callStart({
      ...BASE_ARGS,
      capabilities: { 'wdi5:authentication': { provider: 'BasicAuth' } },
    });

    expect(mocks.authenticateUi5).toHaveBeenCalledTimes(1);
    expect(mocks.authenticateUi5).toHaveBeenCalledWith({ provider: 'BasicAuth' });
  });

  it('enables the BTP work zone instead of injecting when btpWorkZoneEnablement is true', async () => {
    await callStart({ ...BASE_ARGS, wdi5: { btpWorkZoneEnablement: true } });

    expect(mocks.enableWorkZone).toHaveBeenCalledTimes(1);
    expect(mocks.injectUi5).not.toHaveBeenCalled();
  });

  it('skips bridge injection when skipInjectUI5OnStart is true', async () => {
    await callStart({ ...BASE_ARGS, wdi5: { skipInjectUI5OnStart: true } });

    expect(mocks.injectUi5).not.toHaveBeenCalled();
    expect(mocks.enableWorkZone).not.toHaveBeenCalled();
    expect(mocks.initUi5).toHaveBeenCalledTimes(1);
  });

  it('rejects non-local providers', async () => {
    const result = await callStart({ ...BASE_ARGS, provider: 'browserstack' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('provider "local"');
    expect(mocks.initUi5).not.toHaveBeenCalled();
  });

  it('rejects attach mode', async () => {
    const result = await callStart({ ...BASE_ARGS, attach: true });
    expect(result.isError).toBe(true);
    expect(mocks.initUi5).not.toHaveBeenCalled();
  });

  it('rejects browsers other than chrome or edge', async () => {
    const result = await callStart({ ...BASE_ARGS, browser: 'firefox' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"chrome" or "edge"');
    expect(mocks.initUi5).not.toHaveBeenCalled();
  });

  it('rejects a missing baseUrl', async () => {
    const result = await callStart({ platform: 'ui5', browser: 'chrome' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('baseUrl is required');
    expect(mocks.initUi5).not.toHaveBeenCalled();
  });
});
