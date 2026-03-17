// tests/recording/code-generator.test.ts
import { describe, expect, it } from 'vitest';
import { generateCode } from '../../src/recording/code-generator';
import type { SessionHistory, RecordedStep } from '../../src/types/recording';

const START_BROWSER_STEP: RecordedStep = {
  index: 1,
  tool: 'start_browser',
  params: { browser: 'chrome', headless: true, windowWidth: 1920, windowHeight: 1080 },
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
  it('wraps output in remote() setup and deleteSession', () => {
    const code = generateCode(makeHistory([]));
    expect(code).toContain("import { remote } from 'webdriverio';");
    expect(code).toContain('await browser.deleteSession();');
    expect(code).toContain('browserName');
  });

  it('generates start_browser using history.capabilities, not reconstructed from params', () => {
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
        tool: 'start_browser',
        params: { browser: 'chrome', headless: true },
        status: 'ok',
        durationMs: 100,
        timestamp: '2026-01-01T00:00:00.000Z',
      }],
    };
    const code = generateCode(history);
    expect(code).toContain('const browser = await remote(');
    expect(code).toContain('"browserName": "chrome"');
    expect(code).toContain('--custom-flag'); // only present in history.capabilities
  });

  it('generates attach_browser using history.capabilities', () => {
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
        tool: 'attach_browser',
        params: { port: 9222, host: 'localhost', userDataDir: '/tmp/chrome-debug' },
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

  it('appends browser.url() when navigationUrl is set on start_browser', () => {
    const history: SessionHistory = {
      sessionId: 'nav-123',
      type: 'browser',
      startedAt: '2026-01-01T00:00:00.000Z',
      capabilities: { browserName: 'chrome' },
      steps: [{
        index: 1,
        tool: 'start_browser',
        params: { browser: 'chrome', headless: false, windowWidth: 1920, windowHeight: 1080, navigationUrl: 'https://github.com/login' },
        status: 'ok',
        durationMs: 0,
        timestamp: '2026-01-01T00:00:00.000Z',
      }],
    };
    const code = generateCode(history);
    expect(code).toContain("await browser.url('https://github.com/login');");
  });

  it('generates start_app_session using history.appiumConfig for connection config', () => {
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
        tool: 'start_app_session',
        params: { platform: 'Android', deviceName: 'emulator-5554' }, // no appiumHost in params
        status: 'ok',
        durationMs: 100,
        timestamp: '2026-01-01T00:00:00.000Z',
      }],
    };
    const code = generateCode(history);
    expect(code).toContain('"hostname": "127.0.0.1"'); // from history.appiumConfig, not params fallback
    expect(code).toContain('"port": 4723');
    expect(code).toContain('"platformName": "Android"');
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
