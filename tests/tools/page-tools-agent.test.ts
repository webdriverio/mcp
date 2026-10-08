import { beforeEach, describe, expect, it, vi } from 'vitest';

const run = vi.fn();
const scope = { execute: vi.fn(), $: vi.fn() };
const browser = { isMobile: false, execute: vi.fn(), setGeoLocation: vi.fn(), $: vi.fn() };
const agent = { run, scope, session: { isWeb: true }, actions: ['click', 'fill', 'select', 'check', 'uncheck', 'press'].map((name) => ({ name })) };

vi.mock('../../src/session/agent', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  agentFor: vi.fn(async () => agent),
}));
vi.mock('../../src/session/state', () => ({ getBrowser: () => browser }));

const { setGeolocationTool } = await import('../../src/tools/device.tool');
const { executeScriptTool } = await import('../../src/tools/execute-script.tool');
const { pressKeyTool, performActionsTool } = await import('../../src/tools/page-input.tool');
const { agentFor } = await import('../../src/session/agent');

type Result = { content: { type: string; text: string }[]; isError?: boolean };
const call = (tool: unknown, args: Record<string, unknown>) => (tool as (a: Record<string, unknown>) => Promise<Result>)(args);

beforeEach(() => {
  vi.clearAllMocks();
  browser.isMobile = false;
  run.mockResolvedValue({ text: '' });
});

describe('set_geolocation', () => {
  it('goes through the geolocation action on web', async () => {
    const result = await call(setGeolocationTool, { latitude: 52.52, longitude: 13.405 });
    expect(run).toHaveBeenCalledWith('geolocation', { lat: '52.52', lon: '13.405' });
    expect(browser.setGeoLocation).not.toHaveBeenCalled();
    expect(result.isError).toBeUndefined();
  });

  it('calls setGeoLocation directly on web when an altitude is given', async () => {
    const result = await call(setGeolocationTool, { latitude: 52.52, longitude: 13.405, altitude: 34 });
    expect(browser.setGeoLocation).toHaveBeenCalledWith({ latitude: 52.52, longitude: 13.405, altitude: 34 });
    expect(run).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('Altitude: 34m');
  });

  it('keeps setGeoLocation on mobile', async () => {
    browser.isMobile = true;
    await call(setGeolocationTool, { latitude: 1, longitude: 2, altitude: 3 });
    expect(browser.setGeoLocation).toHaveBeenCalledWith({ latitude: 1, longitude: 2, altitude: 3 });
    expect(run).not.toHaveBeenCalled();
  });
});

describe('execute_script', () => {
  it('runs in the frame the agent holds', async () => {
    scope.execute.mockResolvedValue('inside');
    const result = await call(executeScriptTool, { script: 'return document.title' });
    expect(scope.execute).toHaveBeenCalledWith('return document.title');
    expect(browser.execute).not.toHaveBeenCalled();
    expect(result.content[0].text).toBe('Result: inside');
  });

  describe('await wrapping', () => {
    const wrapped = (script: string) => `return (async () => {\n${script}\n})()`;
    const ranAs = async (script: string) => {
      scope.execute.mockResolvedValue(1);
      await call(executeScriptTool, { script });
      return scope.execute.mock.calls[0][0];
    };

    it('wraps a statement script that has a parenthesized await expression', async () => {
      const script = '(window.r = await Promise.resolve(1)); return window.r;';
      expect(await ranAs(script)).toBe(wrapped(script));
    });

    it('wraps statements after a function declaration', async () => {
      const script = 'function f(){}; await f(); return 1';
      expect(await ranAs(script)).toBe(wrapped(script));
    });

    it('wraps a plain top-level await', async () => {
      expect(await ranAs('return await fetch("/a")')).toBe(wrapped('return await fetch("/a")'));
    });

    it.each([
      'async () => { await fetch("/a"); return 1; }',
      'async function f() { return await x(); }',
      'async x => await x',
    ])('passes %s through unchanged', async (script) => {
      expect(await ranAs(script)).toBe(script);
    });

    it('leaves scripts without await alone', async () => {
      expect(await ranAs('return 1')).toBe('return 1');
    });
  });

  it('falls back to the browser without an agent', async () => {
    vi.mocked(agentFor).mockReturnValueOnce(undefined);
    browser.execute.mockResolvedValue(1);
    await call(executeScriptTool, { script: 'return 1' });
    expect(browser.execute).toHaveBeenCalledWith('return 1');
  });
});

describe('press repeat', () => {
  it('press_key passes times', async () => {
    await call(pressKeyTool, { keys: 'ArrowRight', times: 5 });
    expect(run).toHaveBeenCalledWith('press', { keys: 'ArrowRight', times: 5 });
  });

  it('perform_actions passes times to press steps', async () => {
    await call(performActionsTool, { actions: [{ action: 'press', value: 'Tab', times: 3 }] });
    expect(run).toHaveBeenCalledWith('press', { keys: 'Tab', times: 3 });
  });
});
