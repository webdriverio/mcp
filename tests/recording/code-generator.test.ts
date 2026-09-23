// tests/recording/code-generator.test.ts
import { describe, expect, it } from 'vitest';
import { browserMockKey, generateCode } from '../../src/recording/code-generator';
import type { SessionHistory, RecordedStep } from '../../src/types/recording';

const START_BROWSER_STEP: RecordedStep = {
  index: 1,
  tool: 'start_session',
  params: { platform: 'browser', browser: 'chrome', headless: true, windowWidth: 1920, windowHeight: 1080 },
  status: 'ok',
  durationMs: 0,
  timestamp: '2026-01-01T00:00:00.000Z',
};

function makeHistory(steps: Partial<RecordedStep>[]): SessionHistory {
  const extraSteps = steps.map((s, i) => ({
    index: i + 2,
    tool: 'navigate',
    params: {},
    status: 'ok' as const,
    durationMs: 10,
    timestamp: '2026-01-01T00:00:00.000Z',
    ...s,
  }));
  return {
    sessionId: 'test-123',
    type: 'browser',
    startedAt: '2026-01-01T00:00:00.000Z',
    capabilities: {
      browserName: 'chrome',
      'goog:chromeOptions': { args: ['--window-size=1920,1080', '--headless=new'] },
    },
    steps: [START_BROWSER_STEP, ...extraSteps],
  };
}

describe('generateCode - header', () => {
  it('wraps output in remote() setup with try/finally and deleteSession', () => {
    const code = generateCode(makeHistory([]));
    expect(code).toContain("import { remote } from 'webdriverio';");
    expect(code).toContain('browserName');
    expect(code).toContain('try {');
    expect(code).toContain('} finally {');
    expect(code).toContain('  await browser.deleteSession();');
    expect(code).toContain('}');
  });

  it('generates start_session (browser) using history.capabilities', () => {
    const history: SessionHistory = {
      sessionId: 'caps-123',
      type: 'browser',
      startedAt: '2026-01-01T00:00:00.000Z',
      capabilities: {
        browserName: 'chrome',
        acceptInsecureCerts: true,
        'goog:chromeOptions': { args: ['--headless=new', '--custom-flag'] },
      },
      steps: [{
        index: 1,
        tool: 'start_session',
        params: { platform: 'browser', browser: 'chrome', headless: true },
        status: 'ok',
        durationMs: 100,
        timestamp: '2026-01-01T00:00:00.000Z',
      }],
    };
    const code = generateCode(history);
    expect(code).toContain('const browser = await remote(');
    expect(code).toContain('"browserName": "chrome"');
    expect(code).toContain('--custom-flag');
  });

  it('generates start_session (attach mode) using history.capabilities', () => {
    const history: SessionHistory = {
      sessionId: 'attach-123',
      type: 'browser',
      startedAt: '2026-01-01T00:00:00.000Z',
      capabilities: {
        browserName: 'chrome',
        'goog:chromeOptions': { debuggerAddress: 'localhost:9222', args: ['--user-data-dir=/tmp/chrome-debug'] },
      },
      steps: [{
        index: 1,
        tool: 'start_session',
        params: { platform: 'browser', attach: true, port: 9222, host: 'localhost', userDataDir: '/tmp/chrome-debug' },
        status: 'ok',
        durationMs: 100,
        timestamp: '2026-01-01T00:00:00.000Z',
      }],
    };
    const code = generateCode(history);
    expect(code).toContain('const browser = await remote(');
    expect(code).toContain('"debuggerAddress": "localhost:9222"');
    expect(code).toContain('--user-data-dir=/tmp/chrome-debug');
  });

  it('appends browser.url() when navigationUrl is set on start_session (browser)', () => {
    const history: SessionHistory = {
      sessionId: 'nav-123',
      type: 'browser',
      startedAt: '2026-01-01T00:00:00.000Z',
      capabilities: { browserName: 'chrome' },
      steps: [{
        index: 1,
        tool: 'start_session',
        params: { platform: 'browser', browser: 'chrome', headless: false, windowWidth: 1920, windowHeight: 1080, navigationUrl: 'https://github.com/login' },
        status: 'ok',
        durationMs: 0,
        timestamp: '2026-01-01T00:00:00.000Z',
      }],
    };
    const code = generateCode(history);
    expect(code).toContain("await browser.url('https://github.com/login');");
  });

  it('generates start_session (Digital.ai) with the cloud hub connection and no basic auth', () => {
    const history: SessionHistory = {
      sessionId: 'dai-123',
      type: 'browser',
      startedAt: '2026-01-01T00:00:00.000Z',
      capabilities: {
        browserName: 'chrome',
        'digitalai:accessKey': 'super-secret-key',
        'digitalai:osName': 'Windows 10',
      },
      steps: [{
        index: 1,
        tool: 'start_session',
        params: { platform: 'browser', browser: 'chrome', provider: 'digitalai', navigationUrl: 'https://example.com' },
        status: 'ok',
        durationMs: 100,
        timestamp: '2026-01-01T00:00:00.000Z',
      }],
    };
    const code = generateCode(history);
    // hostname must strip the scheme/path from DIGITALAI_CLOUD_URL (remote() wants a bare host).
    expect(code).toContain("hostname: (process.env.DIGITALAI_CLOUD_URL ?? '').replace(/^https?:\\/\\//, '').replace(/\\/.*/, ''),");
    expect(code).not.toContain('hostname: process.env.DIGITALAI_CLOUD_URL,');
    expect(code).toContain("path: '/wd/hub',");
    expect(code).toContain('"digitalai:osName"');
    expect(code).not.toContain('user: process.env');
    // The flat access key must be referenced via env, never baked in as a literal.
    expect(code).toContain('"digitalai:accessKey": process.env.DIGITALAI_ACCESS_KEY');
    expect(code).not.toContain('super-secret-key');
    expect(code).toContain("await browser.url('https://example.com');");
    // Pass/fail wrapper, like the other cloud providers.
    expect(code).toContain("let daiStatus = 'passed';");
    expect(code).toContain("await browser.execute('seetest:client.setReportStatus'");
    expect(code).toContain('} finally {');
  });

  it('generates start_session (mobile) using history.appiumConfig for connection config', () => {
    const history: SessionHistory = {
      sessionId: 'app-123',
      type: 'android',
      startedAt: '2026-01-01T00:00:00.000Z',
      capabilities: {
        platformName: 'Android',
        'appium:deviceName': 'emulator-5554',
        'appium:app': '/app/MyApp.apk',
      },
      appiumConfig: { hostname: '127.0.0.1', port: 4723, path: '/' },
      steps: [{
        index: 1,
        tool: 'start_session',
        params: { platform: 'android', deviceName: 'emulator-5554' },
        status: 'ok',
        durationMs: 100,
        timestamp: '2026-01-01T00:00:00.000Z',
      }],
    };
    const code = generateCode(history);
    expect(code).toContain('"hostname": "127.0.0.1"');
    expect(code).toContain('"port": 4723');
    expect(code).toContain('"platformName": "Android"');
  });

  it('generates attach_session with attach() and preserves the external session', () => {
    const history: SessionHistory = {
      sessionId: 'existing-bs-session',
      type: 'ios',
      startedAt: '2026-01-01T00:00:00.000Z',
      capabilities: {
        platformName: 'iOS',
        'appium:automationName': 'XCUITest',
      },
      steps: [{
        index: 1,
        tool: 'attach_session',
        params: { sessionId: 'existing-bs-session', provider: 'browserstack', platform: 'ios' },
        status: 'ok',
        durationMs: 100,
        timestamp: '2026-01-01T00:00:00.000Z',
      }],
    };

    const code = generateCode(history);
    expect(code).toContain("import { attach } from 'webdriverio';");
    expect(code).toContain('const browser = await attach({');
    expect(code).toContain("hostname: 'hub-cloud.browserstack.com'");
    expect(code).toContain("sessionId: 'existing-bs-session'");
    expect(code).not.toContain('remote(');
    expect(code).not.toContain('deleteSession');
  });
});

describe('generateCode - tool mappings', () => {
  it('navigate → browser.url()', () => {
    const code = generateCode(makeHistory([{ tool: 'navigate', params: { url: 'https://example.com' } }]));
    expect(code).toContain("await browser.url('https://example.com');");
  });

  it('click_element → $().click()', () => {
    const code = generateCode(makeHistory([{ tool: 'click_element', params: { selector: '#btn' } }]));
    expect(code).toContain("await browser.$('#btn').click();");
  });

  it('set_value → $().setValue()', () => {
    const code = generateCode(makeHistory([{ tool: 'set_value', params: { selector: '#input', value: 'hello' } }]));
    expect(code).toContain("await browser.$('#input').setValue('hello');");
  });

  it('scroll down → positive scrollBy', () => {
    const code = generateCode(makeHistory([{ tool: 'scroll', params: { direction: 'down', pixels: 300 } }]));
    expect(code).toContain('window.scrollBy(0, 300)');
  });

  it('scroll up → negative scrollBy', () => {
    const code = generateCode(makeHistory([{ tool: 'scroll', params: { direction: 'up', pixels: 300 } }]));
    expect(code).toContain('window.scrollBy(0, -300)');
  });

  it('tap_element (selector form) → $().click()', () => {
    const code = generateCode(makeHistory([{ tool: 'tap_element', params: { selector: '~btn' } }]));
    expect(code).toContain("await browser.$('~btn').click();");
  });

  it('tap_element (coordinate form) → browser.tap()', () => {
    const code = generateCode(makeHistory([{ tool: 'tap_element', params: { x: 100, y: 200 } }]));
    expect(code).toContain('await browser.tap({ x: 100, y: 200 });');
  });

  it('swipe → mobile: swipe execute', () => {
    const code = generateCode(makeHistory([{ tool: 'swipe', params: { direction: 'up' } }]));
    expect(code).toContain("await browser.execute('mobile: swipe', { direction: 'up' });");
  });

  it('execute_script → browser.execute with single-quoted script string', () => {
    const code = generateCode(makeHistory([{
      tool: 'execute_script',
      params: { script: 'return document.title' },
    }]));
    expect(code).toContain("await browser.execute('return document.title');");
  });

  it('execute_script escapes backslashes in script string', () => {
    const code = generateCode(makeHistory([{
      tool: 'execute_script',
      params: { script: "return document.querySelector('[data-\\\\x]')" },
    }]));
    expect(code).toContain("await browser.execute('return document.querySelector(\\'[data-\\\\\\\\x]\\')');");
  });

  it('execute_script with args → browser.execute with args array', () => {
    const code = generateCode(makeHistory([{
      tool: 'execute_script',
      params: { script: 'arguments[0].click()', args: ['#btn'] },
    }]));
    expect(code).toContain("await browser.execute('arguments[0].click()',");
    expect(code).toContain('"#btn"');
  });

  it('drag_and_drop (selector form) → $().dragAndDrop($())', () => {
    const code = generateCode(makeHistory([{
      tool: 'drag_and_drop',
      params: { sourceSelector: '#from', targetSelector: '#to' },
    }]));
    expect(code).toContain("await browser.$('#from').dragAndDrop(browser.$('#to'));");
  });

  it('drag_and_drop (coordinate form) → $().dragAndDrop({ x, y })', () => {
    const code = generateCode(makeHistory([{
      tool: 'drag_and_drop',
      params: { sourceSelector: '#from', x: 50, y: 75 },
    }]));
    expect(code).toContain("await browser.$('#from').dragAndDrop({ x: 50, y: 75 });");
  });

  it('open_web_extension → browser.webExtensionInstall() and browser.url()', () => {
    const code = generateCode(makeHistory([{
      tool: 'open_web_extension',
      params: { extensionData: { type: 'path', path: '/tmp/ext' }, path: 'options.html', scheme: 'chrome-extension' },
    }]));

    expect(code).toContain('const { extension } = await browser.webExtensionInstall({ extensionData:');
    expect(code).toContain('"type": "path"');
    expect(code).toContain('/tmp/ext');
    expect(code).toContain('await browser.url(`chrome-extension://${extension}/options.html`);');
  });

  it('open_web_extension strips leading slashes in generated navigation URL', () => {
    const code = generateCode(makeHistory([{
      tool: 'open_web_extension',
      params: { extensionData: { type: 'path', path: '/tmp/ext' }, path: '/options.html', scheme: 'chrome-extension' },
    }]));

    expect(code).toContain('await browser.url(`chrome-extension://${extension}/options.html`);');
  });

  it('open_web_extension infers moz-extension for recordings without scheme', () => {
    const history = makeHistory([{
      tool: 'open_web_extension',
      params: { extensionData: { type: 'path', path: '/tmp/firefox-ext' }, path: 'popup.html' },
    }]);
    history.capabilities = { browserName: 'firefox' };

    const code = generateCode(history);

    expect(code).toContain('await browser.url(`moz-extension://${extension}/popup.html`);');
  });
});

describe('generateCode - BrowserStack Local tunnel', () => {
  function makeBrowserstackLocalHistory(): SessionHistory {
    return {
      sessionId: 'bs-local-123',
      type: 'browser',
      startedAt: '2026-01-01T00:00:00.000Z',
      capabilities: {
        browserName: 'chrome',
        'bstack:options': {
          local: true,
          os: 'Windows',
          osVersion: '11',
        },
      },
      steps: [
        {
          index: 1,
          tool: 'start_session',
          params: { platform: 'browser', browser: 'chrome', browserstackLocal: true },
          status: 'ok',
          durationMs: 100,
          timestamp: '2026-01-01T00:00:00.000Z',
        },
        {
          index: 2,
          tool: 'navigate',
          params: { url: 'http://localhost:3000' },
          status: 'ok',
          durationMs: 50,
          timestamp: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
  }

  it('imports browserstack-local and node:util when bstack:options.local is true', () => {
    const code = generateCode(makeBrowserstackLocalHistory());
    expect(code).toContain("import { Local as BrowserstackTunnel } from 'browserstack-local';");
    expect(code).toContain("import { promisify } from 'node:util';");
  });

  it('emits tunnel setup before the try block', () => {
    const code = generateCode(makeBrowserstackLocalHistory());
    const tunnelSetupIdx = code.indexOf('await startTunnel(');
    const tryIdx = code.indexOf('try {');
    expect(tunnelSetupIdx).toBeGreaterThan(-1);
    expect(tunnelSetupIdx).toBeLessThan(tryIdx);
  });

  it('emits tunnel teardown in the finally block after deleteSession', () => {
    const code = generateCode(makeBrowserstackLocalHistory());
    const deleteSessionIdx = code.indexOf('await browser.deleteSession()');
    const stopTunnelIdx = code.indexOf('await stopTunnel()');
    expect(stopTunnelIdx).toBeGreaterThan(-1);
    expect(stopTunnelIdx).toBeGreaterThan(deleteSessionIdx);
  });

  it('does NOT emit tunnel code when bstack:options.local is absent', () => {
    const history: SessionHistory = {
      sessionId: 'bs-123',
      type: 'browser',
      startedAt: '2026-01-01T00:00:00.000Z',
      capabilities: { browserName: 'chrome', 'bstack:options': { os: 'Windows' } },
      steps: [{
        index: 1,
        tool: 'start_session',
        params: { platform: 'browser', browser: 'chrome' },
        status: 'ok',
        durationMs: 0,
        timestamp: '2026-01-01T00:00:00.000Z',
      }],
    };
    const code = generateCode(history);
    expect(code).not.toContain('BrowserstackTunnel');
    expect(code).not.toContain('stopTunnel');
  });
});

describe('generateCode - error and sentinel steps', () => {
  it('emits error step as a JS comment', () => {
    const code = generateCode(makeHistory([{
      tool: 'click_element',
      params: { selector: '#missing' },
      status: 'error',
      error: 'Element not found',
    }]));
    expect(code).toContain('// [error] click_element:');
    expect(code).toContain('Element not found');
  });

  it('emits session transition as a comment block', () => {
    const code = generateCode(makeHistory([{
      tool: '__session_transition__',
      params: { newSessionId: 'new-abc' },
    }]));
    expect(code).toContain('// --- new session: new-abc');
  });
});

describe('generateCode - Electron', () => {
  it('replays Electron startup, main-process scripts, deeplinks, and standalone cleanup', () => {
    const history: SessionHistory = {
      sessionId: 'electron-123', type: 'browser', runtime: 'electron', startedAt: '2026-01-01T00:00:00.000Z',
      capabilities: { browserName: 'electron', browserVersion: '33.2.1', 'wdio:electronServiceOptions': { appBinaryPath: '/Applications/MyApp' } },
      steps: [
        { index: 1, tool: 'start_session', params: { platform: 'electron', electronRootDir: '/project', electronDeeplinkScheme: 'MyApp' }, status: 'ok', durationMs: 0, timestamp: '2026-01-01T00:00:00.000Z' },
        { index: 2, tool: 'execute_electron_script', params: { script: 'return electron.app.getName()', args: [] }, status: 'ok', durationMs: 0, timestamp: '2026-01-01T00:00:00.000Z' },
        { index: 3, tool: 'trigger_electron_deeplink', params: { url: 'myapp://open' }, status: 'ok', durationMs: 0, timestamp: '2026-01-01T00:00:00.000Z' },
      ],
    };
    const code = generateCode(history);
    expect(code).toContain("import { startWdioSession, cleanupWdioSession } from '@wdio/electron-service';");
    expect(code).toContain('browser = await startWdioSession([');
    expect(code).toContain('rootDir: "/project"');
    expect(code).toContain('browser.electron.execute');
    expect(code).toContain('const electronDeeplinkScheme = "myapp";');
    expect(code).toContain('new URL("myapp://open").protocol !== `${electronDeeplinkScheme}:`');
    expect(code).toContain('browser.electron.triggerDeeplink("myapp://open")');
    expect(code).toContain('await cleanupWdioSession(browser);');
    expect(code).not.toContain('[unknown tool]');
  });

  it('fails replay clearly when a recorded deeplink has no configured scheme', () => {
    const history: SessionHistory = {
      sessionId: 'electron-no-scheme', type: 'browser', runtime: 'electron', startedAt: '2026-01-01T00:00:00.000Z',
      capabilities: { browserName: 'electron', 'wdio:electronServiceOptions': { appBinaryPath: '/Applications/MyApp' } },
      steps: [
        { index: 1, tool: 'start_session', params: { platform: 'electron' }, status: 'ok', durationMs: 0, timestamp: '2026-01-01T00:00:00.000Z' },
        { index: 2, tool: 'trigger_electron_deeplink', params: { url: 'myapp://open' }, status: 'ok', durationMs: 0, timestamp: '2026-01-01T00:00:00.000Z' },
      ],
    };

    const code = generateCode(history);
    expect(code).toContain('const electronDeeplinkScheme = undefined;');
    expect(code).toContain('Recorded Electron deeplink is missing electronDeeplinkScheme.');
  });

  it('guards a recorded deeplink against the configured scheme', () => {
    const history: SessionHistory = {
      sessionId: 'electron-scheme-mismatch', type: 'browser', runtime: 'electron', startedAt: '2026-01-01T00:00:00.000Z',
      capabilities: { browserName: 'electron', 'wdio:electronServiceOptions': { appBinaryPath: '/Applications/MyApp' } },
      steps: [
        { index: 1, tool: 'start_session', params: { platform: 'electron', electronDeeplinkScheme: 'myapp' }, status: 'ok', durationMs: 0, timestamp: '2026-01-01T00:00:00.000Z' },
        { index: 2, tool: 'trigger_electron_deeplink', params: { url: 'otherapp://open' }, status: 'ok', durationMs: 0, timestamp: '2026-01-01T00:00:00.000Z' },
      ],
    };

    const code = generateCode(history);
    expect(code).toContain('new URL("otherapp://open").protocol !== `${electronDeeplinkScheme}:`');
    expect(code).toContain('Recorded Electron deeplink must use "${electronDeeplinkScheme}:".');
  });
});

describe('generateCode - UI5', () => {
  it('returns a notice comment instead of replayable code for ui5 sessions', () => {
    const history: SessionHistory = {
      sessionId: 'ui5-123',
      type: 'browser',
      runtime: 'ui5',
      startedAt: '2026-01-01T00:00:00.000Z',
      capabilities: { browserName: 'chrome' },
      steps: [
        { index: 1, tool: 'start_session', params: { platform: 'ui5' }, status: 'ok', durationMs: 0, timestamp: '2026-01-01T00:00:00.000Z' },
        { index: 2, tool: 'click_element', params: { selector: 'ui5:{"controlType":"sap.m.Button"}' }, status: 'ok', durationMs: 0, timestamp: '2026-01-01T00:00:00.000Z' },
      ],
    };

    const code = generateCode(history);

    expect(code.startsWith('// Code generation is not supported for UI5')).toBe(true);
    // The notice itself mentions browser.$() — assert no runnable call was emitted.
    expect(code).not.toContain('await browser.$(');
    expect(code).not.toContain('remote(');
  });
});

describe('generateCode - Electron mocks', () => {
  it.each([
    ['mock', 'await browser.mock("**/api/todos")'],
    ['get_mock_calls', '.calls'],
    ['manage_mock', '.restore();'],
  ] as const)('routes recorded %s without an electron mockType to the browser branch', (tool, emitted) => {
    const history = makeHistory([{ tool, params: { url: '**/api/todos', action: 'restore' } }]);
    const code = generateCode(history);
    expect(code).toContain('const browserMocks = new Map();');
    expect(code).toContain(emitted);
  });

  it('normalizes recorded method casing in the browser mock key', () => {
    const history = makeHistory([
      { tool: 'mock', params: { mockType: 'browser', url: '**/api/todos', method: 'GET', behavior: 'respond', value: 'x' } },
      { tool: 'get_mock_calls', params: { mockType: 'browser', url: '**/api/todos', method: 'get' } },
    ]);
    const code = generateCode(history);
    const key = browserMockKey({ url: '**/api/todos', method: 'get' });
    expect(code).toContain(`browserMocks.has(${key})`);
    expect(code).toContain(`browserMocks.get(${key}).respond`);
    expect(code).toContain(`browserMocks.get(${key}).calls`);
  });

  it('treats a recorded empty method filter as omitted in the key', () => {
    const history = makeHistory([
      { tool: 'mock', params: { mockType: 'browser', url: '**/api/todos', method: '', value: 'x' } },
      { tool: 'get_mock_calls', params: { mockType: 'browser', url: '**/api/todos' } },
    ]);
    const code = generateCode(history);
    const key = browserMockKey({ url: '**/api/todos' });
    expect(code).toContain(`browserMocks.has(${key})`);
    expect(code).toContain(`browserMocks.get(${key}).calls`);
  });

  it('executes repeated configuration, inspection, reset, restore, and recreation in order', async () => {
    const target = { mockType: 'electron', apiName: 'app', funcName: 'getName' };
    const history = makeHistory([
      { tool: 'mock', params: { ...target, value: 'default' } },
      { tool: 'mock', params: { ...target, behavior: 'mockReturnValueOnce', value: 'once' } },
      { tool: 'get_mock_calls', params: target },
      { tool: 'manage_mock', params: { ...target, action: 'clear' } },
      { tool: 'manage_mock', params: { ...target, action: 'reset' } },
      { tool: 'manage_mock', params: { ...target, action: 'restore' } },
      { tool: 'mock', params: target },
    ]);
    history.runtime = 'electron';
    history.steps[0].params = { platform: 'electron' };
    const events: unknown[] = [];
    const mock = {
      mockReturnValue: async (value: unknown) => { events.push(['return', value]); },
      mockReturnValueOnce: async (value: unknown) => { events.push(['once', value]); },
      update: async () => { events.push('update'); },
      mockClear: async () => { events.push('clear'); },
      mockReset: async () => { events.push('reset'); },
      mockRestore: async () => { events.push('restore'); },
      mock: { calls: [['argument']] },
    };
    const browser = {
      electron: { mock: async (...args: unknown[]) => { events.push(args); return mock; } },
      deleteSession: async () => { events.push('delete'); },
    };
    const code = generateCode(history).replace(/^import .*;\n/m, '');
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    await new AsyncFunction('startWdioSession', 'cleanupWdioSession', 'console', code)(
      async () => browser,
      async () => { events.push('cleanup'); },
      { log: (value: unknown) => events.push(value) },
    );
    expect(events).toEqual([
      ['app', 'getName'], ['return', 'default'], ['once', 'once'], 'update', [['argument']],
      'clear', 'reset', 'restore', ['app', 'getName'], ['return', undefined], 'cleanup', 'delete',
    ]);
  });
});

describe('generateCode - Browser mocks', () => {
  it('creates the mock with a method filter and configures respond with statusCode/headers', () => {
    const code = generateCode(makeHistory([{
      tool: 'mock',
      params: {
        mockType: 'browser',
        url: '**/api/todos',
        method: 'GET',
        behavior: 'respond',
        value: { ok: true },
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
      },
    }]));
    const key = browserMockKey({ url: '**/api/todos', method: 'get' });
    expect(code).toContain(`if (!browserMocks.has(${key})) browserMocks.set(${key}, await browser.mock("**/api/todos", {"method":"get"}));`);
    expect(code).toContain(`await browserMocks.get(${key}).respond({"ok":true}, {"statusCode":200,"headers":{"content-type":"application/json"}});`);
  });

  it('omits the method filter and respond params when absent', () => {
    const code = generateCode(makeHistory([{
      tool: 'mock',
      params: { url: '**/api/todos', behavior: 'respond', value: 'x' },
    }]));
    const key = browserMockKey({ url: '**/api/todos' });
    expect(code).toContain(`browserMocks.set(${key}, await browser.mock("**/api/todos"));`);
    expect(code).toContain(`await browserMocks.get(${key}).respond("x");`);
    expect(code).not.toContain('{"method"');
  });

  it('emits only the creation line for a browser mock without behavior', () => {
    const code = generateCode(makeHistory([{ tool: 'mock', params: { mockType: 'browser', url: '**/api/todos' } }]));
    expect(code).toContain('await browser.mock("**/api/todos")');
    expect(code).not.toContain('.respond');
    expect(code).not.toContain('.abort');
  });

  it('emits abort and redirect behaviors', () => {
    const code = generateCode(makeHistory([
      { tool: 'mock', params: { url: '**/a', behavior: 'abort' } },
      { tool: 'mock', params: { url: '**/b', behavior: 'redirect', value: 'https://example.com' } },
    ]));
    expect(code).toContain('.abort();');
    expect(code).toContain('.redirect("https://example.com");');
  });

  it('reads the calls getter for browser get_mock_calls', () => {
    const code = generateCode(makeHistory([{
      tool: 'get_mock_calls',
      params: { url: '**/api/todos' },
    }]));
    const key = browserMockKey({ url: '**/api/todos' });
    expect(code).toContain(`console.log(browserMocks.get(${key}).calls);`);
    expect(code).not.toContain('.update()');
    expect(code).not.toContain('.calls()');
  });

  it('maps manage_mock actions and deletes the handle on restore', () => {
    const code = generateCode(makeHistory([
      { tool: 'manage_mock', params: { url: '**/a', action: 'clear' } },
      { tool: 'manage_mock', params: { url: '**/b', action: 'reset' } },
      { tool: 'manage_mock', params: { url: '**/c', action: 'restore' } },
    ]));
    const key = (url: string) => browserMockKey({ url });
    expect(code).toContain(`await browserMocks.get(${key('**/a')}).clear();`);
    expect(code).toContain(`await browserMocks.get(${key('**/b')}).reset();`);
    expect(code).toContain(`await browserMocks.get(${key('**/c')}).restore();`);
    expect(code).toContain(`browserMocks.delete(${key('**/c')});`);
    expect(code).not.toContain(`browserMocks.delete(${key('**/a')});`);
  });

  it('declares browserMocks exactly once for repeated browser mock steps', () => {
    const code = generateCode(makeHistory([
      { tool: 'mock', params: { url: '**/a', value: 1 } },
      { tool: 'mock', params: { url: '**/a', value: 2 } },
    ]));
    expect(code.match(/const browserMocks = new Map\(\);/g)).toHaveLength(1);
  });

  it('does not declare browserMocks without browser mock steps', () => {
    const code = generateCode(makeHistory([{ tool: 'navigate', params: { url: 'https://example.com' } }]));
    expect(code).not.toContain('browserMocks');
  });

  it('does not declare browserMocks when every browser mock step failed', () => {
    const code = generateCode(makeHistory([{
      tool: 'mock',
      params: { mockType: 'browser', url: '**/api/todos', behavior: 'respond' },
      status: 'error',
      error: 'respond behaviors require value',
    }]));
    expect(code).not.toContain('const browserMocks = new Map();');
  });

  it('does not declare browserMocks for an electron-only mock history', () => {
    const history = makeHistory([{
      tool: 'mock',
      params: { mockType: 'electron', apiName: 'app', funcName: 'getName', value: 'x' },
    }]);
    history.runtime = 'electron';
    history.steps[0].params = { platform: 'electron' };
    const code = generateCode(history);
    expect(code).toContain('const electronMocks = new Map();');
    expect(code).not.toContain('browserMocks');
  });

  it('declares browserMocks alongside electronMocks when both are recorded', () => {
    const history = makeHistory([
      { tool: 'mock', params: { mockType: 'electron', apiName: 'app', funcName: 'getName', value: 'x' } },
      { tool: 'mock', params: { url: '**/api/todos', value: 'y' } },
    ]);
    history.runtime = 'electron';
    history.steps[0].params = { platform: 'electron' };
    const code = generateCode(history);
    expect(code).toContain('const electronMocks = new Map();');
    expect(code.match(/const browserMocks = new Map\(\);/g)).toHaveLength(1);
  });
});
