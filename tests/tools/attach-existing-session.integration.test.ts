import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { getContextsTool } from '../../src/tools/get-contexts.tool';
import { closeSessionTool, startSessionTool } from '../../src/tools/session.tool';
import { switchContextTool } from '../../src/tools/context.tool';
import { getState } from '../../src/session/state';

type ToolFn = (args: Record<string, unknown>) => Promise<{
  content: { text: string }[];
  isError?: boolean;
}>;

const callStart = startSessionTool as unknown as ToolFn;
const callContexts = getContextsTool as unknown as ToolFn;
const callSwitch = switchContextTool as unknown as ToolFn;
const callClose = closeSessionTool as unknown as ToolFn;

describe('existing session protocol integration', () => {
  let server: Server;
  let port: number;
  let requests: { method: string; url: string }[];

  beforeAll(async () => {
    server = createServer((req, res) => {
      requests.push({ method: req.method ?? '', url: req.url ?? '' });
      res.setHeader('Content-Type', 'application/json');

      if (req.method === 'GET' && req.url?.endsWith('/contexts')) {
        res.end(JSON.stringify({ value: ['NATIVE_APP', 'WEBVIEW_1'] }));
        return;
      }
      if (req.method === 'GET' && req.url?.endsWith('/context')) {
        res.end(JSON.stringify({ value: 'NATIVE_APP' }));
        return;
      }
      if (req.method === 'POST' && req.url?.endsWith('/context')) {
        res.end(JSON.stringify({ value: null }));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ value: { error: 'unknown command' } }));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to bind test WebDriver server');
    port = address.port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  beforeEach(() => {
    requests = [];
    const state = getState();
    state.browsers.clear();
    state.sessionMetadata.clear();
    state.sessionHistory.clear();
    state.currentSession = null;
  });

  it('drives an existing Appium session without creating or deleting it', async () => {
    const startResult = await callStart({
      sessionId: 'existing-appium-session',
      provider: 'external',
      platform: 'ios',
      webdriverConfig: {
        protocol: 'http',
        hostname: '127.0.0.1',
        port,
        path: '/',
      },
    });

    expect(startResult.isError).toBeUndefined();
    expect(requests).toEqual([]);

    const contextsResult = await callContexts({});
    expect(contextsResult.isError).toBeUndefined();
    expect(JSON.parse(contextsResult.content[0].text)).toEqual({
      contexts: ['NATIVE_APP', 'WEBVIEW_1'],
      currentContext: 'NATIVE_APP',
    });

    const switchResult = await callSwitch({ context: 'WEBVIEW_1' });
    expect(switchResult.isError).toBeUndefined();
    expect(requests).toContainEqual({
      method: 'POST',
      url: '/session/existing-appium-session/context',
    });
    expect(requests.some(request => request.method === 'POST' && request.url === '/session')).toBe(false);

    const closeResult = await callClose({});
    expect(closeResult.content[0].text).toContain('detached from');
    expect(requests.some(request => request.method === 'DELETE')).toBe(false);
  });
});
