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
    capabilities: {},
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

  it('generates start_browser as const browser = await remote()', () => {
    const code = generateCode(makeHistory([]));
    expect(code).toContain('const browser = await remote(');
    expect(code).toContain('"browserName": "chrome"');
  });

  it('appends browser.url() when navigationUrl is set on start_browser', () => {
    const history: SessionHistory = {
      sessionId: 'nav-123',
      type: 'browser',
      startedAt: '2026-01-01T00:00:00.000Z',
      capabilities: {},
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

  it('generates start_app_session with appium caps and server config', () => {
    const history: SessionHistory = {
      sessionId: 'app-123',
      type: 'ios',
      startedAt: '2026-01-01T00:00:00.000Z',
      capabilities: {},
      steps: [{
        index: 1,
        tool: 'start_app_session',
        params: { platform: 'iOS', deviceName: 'iPhone 14', platformVersion: '17.0', appPath: '/app/MyApp.app' },
        status: 'ok',
        durationMs: 0,
        timestamp: '2026-01-01T00:00:00.000Z',
      }],
    };
    const code = generateCode(history);
    expect(code).toContain('const browser = await remote(');
    expect(code).toContain('"platformName": "iOS"');
    expect(code).toContain('"appium:deviceName": "iPhone 14"');
    expect(code).toContain('"appium:app": "/app/MyApp.app"');
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
