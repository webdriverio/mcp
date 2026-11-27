import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolCallback } from '@modelcontextprotocol/server';
import { getState } from '../../src/session/state';
import { getSessionHistory, withRecording } from '../../src/recording/step-recorder';
import { openWebExtensionTool } from '../../src/tools/web-extension.tool';

const mockInstall = vi.fn();
const mockUrl = vi.fn();

type ToolFn = (args: Record<string, unknown>) => Promise<{
  content: { text: string }[];
  isError?: boolean;
}>;
type AnyToolFn = (params: Record<string, unknown>, extra: unknown) => Promise<unknown>;

const callOpen = openWebExtensionTool as unknown as ToolFn;
const extra = {} as Parameters<ToolCallback>[1];

function setupSession(options: {
  type?: 'browser' | 'ios' | 'android';
  isBidi?: boolean;
  browserName?: string;
  isFirefox?: boolean;
  omitInstall?: boolean;
} = {}) {
  const {
    type = 'browser',
    isBidi = true,
    browserName = 'chrome',
    isFirefox = false,
    omitInstall = false,
  } = options;

  const browser: Record<string, unknown> = {
    isBidi,
    isFirefox,
    capabilities: { browserName },
    url: mockUrl,
  };

  if (!omitInstall) {
    browser.webExtensionInstall = mockInstall;
  }

  const state = getState();
  state.currentSession = 'test-session';
  state.browsers.set('test-session', browser as unknown as WebdriverIO.Browser);
  state.sessionMetadata.set('test-session', {
    type,
    capabilities: { browserName },
    isAttached: false,
  });
  state.sessionHistory.set('test-session', {
    sessionId: 'test-session',
    type,
    startedAt: '2026-01-01T00:00:00.000Z',
    capabilities: { browserName },
    steps: [],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInstall.mockResolvedValue({ extension: 'ext-123' });
  mockUrl.mockResolvedValue(undefined);

  const state = getState();
  state.browsers.clear();
  state.sessionMetadata.clear();
  state.sessionHistory.clear();
  state.currentSession = null;
});

describe('open_web_extension', () => {
  it.each([
    { type: 'path', path: '/tmp/unpacked-extension' },
    { type: 'archivePath', path: '/tmp/extension.zip' },
    { type: 'base64', value: 'UEsDBAo=' },
  ])('installs %s extensionData and opens the requested extension page', async (extensionData) => {
    setupSession();
    const result = await callOpen({ extensionData, path: 'options.html' });

    expect(result.isError).toBeFalsy();
    expect(mockInstall).toHaveBeenCalledWith({ extensionData });
    expect(mockUrl).toHaveBeenCalledWith('chrome-extension://ext-123/options.html');
    expect(result.content[0].text).toContain('chrome-extension://ext-123/options.html');
  });

  it('strips leading slashes from the extension page path', async () => {
    setupSession();
    await callOpen({ extensionData: { type: 'path', path: '/tmp/ext' }, path: '/options.html' });

    expect(mockUrl).toHaveBeenCalledWith('chrome-extension://ext-123/options.html');
  });

  it('infers moz-extension URLs for Firefox', async () => {
    setupSession({ browserName: 'firefox', isFirefox: true });
    await callOpen({ extensionData: { type: 'path', path: '/tmp/ext' }, path: 'popup.html' });

    expect(mockUrl).toHaveBeenCalledWith('moz-extension://ext-123/popup.html');
  });

  it('records the inferred moz-extension scheme for Firefox', async () => {
    setupSession({ browserName: 'firefox', isFirefox: true });
    const wrapped = withRecording('open_web_extension', openWebExtensionTool) as unknown as AnyToolFn;
    await wrapped({ extensionData: { type: 'path', path: '/tmp/ext' }, path: 'popup.html' }, extra);

    const steps = getSessionHistory().get('test-session')?.steps ?? [];
    expect(steps[0]).toMatchObject({
      tool: 'open_web_extension',
      status: 'ok',
      params: {
        extensionData: { type: 'path', path: '/tmp/ext' },
        path: 'popup.html',
        scheme: 'moz-extension',
      },
    });
  });

  it('does not store extension ids on session metadata', async () => {
    setupSession();
    await callOpen({ extensionData: { type: 'path', path: '/tmp/ext' }, path: 'options.html' });

    const metadata = getState().sessionMetadata.get('test-session');
    expect(metadata).not.toHaveProperty('webExtensions');
  });

  it('returns an error when there is no active session', async () => {
    const result = await callOpen({ extensionData: { type: 'path', path: '/tmp/ext' }, path: 'options.html' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No active browser session');
    expect(mockInstall).not.toHaveBeenCalled();
    expect(mockUrl).not.toHaveBeenCalled();
  });

  it('returns an error for mobile sessions', async () => {
    setupSession({ type: 'ios' });
    const result = await callOpen({ extensionData: { type: 'path', path: '/tmp/ext' }, path: 'options.html' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('browser sessions');
    expect(mockInstall).not.toHaveBeenCalled();
    expect(mockUrl).not.toHaveBeenCalled();
  });

  it('returns an error when the session is not BiDi-enabled', async () => {
    setupSession({ isBidi: false });
    const result = await callOpen({ extensionData: { type: 'path', path: '/tmp/ext' }, path: 'options.html' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('BiDi-enabled');
    expect(mockInstall).not.toHaveBeenCalled();
    expect(mockUrl).not.toHaveBeenCalled();
  });

  it('returns an error when WebdriverIO does not expose webExtensionInstall', async () => {
    setupSession({ omitInstall: true });
    const result = await callOpen({ extensionData: { type: 'path', path: '/tmp/ext' }, path: 'options.html' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('webExtensionInstall');
    expect(mockUrl).not.toHaveBeenCalled();
  });

  it('returns an error when webExtension.install returns an unexpected result', async () => {
    setupSession();
    mockInstall.mockResolvedValueOnce({});
    const result = await callOpen({ extensionData: { type: 'path', path: '/tmp/ext' }, path: 'options.html' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('unexpected result');
    expect(mockUrl).not.toHaveBeenCalled();
  });

  it('returns an error when the driver rejects installation', async () => {
    setupSession();
    mockInstall.mockRejectedValueOnce(new Error('invalid web extension'));
    const result = await callOpen({ extensionData: { type: 'path', path: '/tmp/ext' }, path: 'options.html' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('invalid web extension');
    expect(mockUrl).not.toHaveBeenCalled();
  });

  it('returns an error when navigation fails', async () => {
    setupSession();
    mockUrl.mockRejectedValueOnce(new Error('navigation blocked'));
    const result = await callOpen({ extensionData: { type: 'path', path: '/tmp/ext' }, path: 'options.html' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('navigation blocked');
  });
});
