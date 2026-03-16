// tests/recording/code-generator.test.ts
import { describe, expect, it } from 'vitest';
import { generateCode } from '../../src/recording/code-generator';
import type { SessionHistory, RecordedStep } from '../../src/types/recording';

function makeHistory(steps: Partial<RecordedStep>[]): SessionHistory {
  return {
    sessionId: 'test-123',
    type: 'browser',
    startedAt: '2026-01-01T00:00:00.000Z',
    capabilities: { browserName: 'chrome' },
    steps: steps.map((s, i) => ({
      index: i + 1,
      tool: 'navigate',
      params: {},
      status: 'ok',
      durationMs: 10,
      timestamp: '2026-01-01T00:00:00.000Z',
      ...s,
    })),
  };
}

describe('generateCode - header', () => {
  it('wraps output in remote() setup and deleteSession', () => {
    const code = generateCode(makeHistory([]));
    expect(code).toContain("import { remote } from 'webdriverio';");
    expect(code).toContain('await browser.deleteSession();');
    expect(code).toContain('browserName');
  });
});

describe('generateCode - tool mappings', () => {
  it('navigate → browser.url()', () => {
    const code = generateCode(makeHistory([{ tool: 'navigate', params: { url: 'https://example.com' } }]));
    expect(code).toContain("await browser.url('https://example.com');");
  });

  it('click_element → $().click()', () => {
    const code = generateCode(makeHistory([{ tool: 'click_element', params: { selector: '#btn' } }]));
    expect(code).toContain("await $('#btn').click();");
  });

  it('set_value → $().setValue()', () => {
    const code = generateCode(makeHistory([{ tool: 'set_value', params: { selector: '#input', value: 'hello' } }]));
    expect(code).toContain("await $('#input').setValue('hello');");
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
    expect(code).toContain("await $('~btn').click();");
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
    expect(code).toContain("await $('#from').dragAndDrop($('#to'));");
  });

  it('drag_and_drop (coordinate form) → $().dragAndDrop({ x, y })', () => {
    const code = generateCode(makeHistory([{
      tool: 'drag_and_drop',
      params: { sourceSelector: '#from', x: 50, y: 75 },
    }]));
    expect(code).toContain("await $('#from').dragAndDrop({ x: 50, y: 75 });");
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
