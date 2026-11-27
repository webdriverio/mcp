import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const scope = { execute: vi.fn(), $: vi.fn() };
const browser = { execute: vi.fn(), $: vi.fn() };
const agent = { scope };

vi.mock('../../src/session/agent', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  agentFor: vi.fn(async () => agent),
}));
vi.mock('../../src/session/state', () => ({ getBrowser: () => browser }));

const { executeScriptTool, executeScriptToolDefinition } = await import('../../src/tools/execute-script.tool');
const { agentFor } = await import('../../src/session/agent');

type Result = { content: { type: string; text: string }[]; isError?: boolean };
const call = (args: { script: string; args?: unknown[] }) =>
  (executeScriptTool as unknown as (a: { script: string; args?: unknown[] }) => Promise<Result>)(args);

beforeEach(() => {
  vi.clearAllMocks();
  scope.execute.mockResolvedValue('ok');
  browser.execute.mockResolvedValue('ok');
});

describe('execute_script argument resolution', () => {
  it('keeps plain string args as strings with zero $ calls even when the page has a matching element', async () => {
    const mainElement = { elementId: 'el-main', isExisting: vi.fn(async () => true) };
    scope.$.mockResolvedValue(mainElement);

    const result = await call({
      script: 'return arguments[0]',
      args: ['main'],
    });

    expect(result.isError).toBeUndefined();
    expect(scope.$).not.toHaveBeenCalled();
    expect(scope.execute).toHaveBeenCalledWith('return arguments[0]', 'main');
  });

  it('keeps selector-like string args unchanged with zero $ calls', async () => {
    const existingEl = { elementId: 'el-any', isExisting: vi.fn(async () => true) };
    scope.$.mockResolvedValue(existingEl);

    const strings = ['a', 'button', 'div', 'h1', 'form', 'nav', 'table', '.foo', '#total', '//button'];
    const result = await call({
      script: 'return [...arguments]',
      args: strings,
    });

    expect(result.isError).toBeUndefined();
    expect(scope.$).not.toHaveBeenCalled();
    expect(scope.execute).toHaveBeenCalledWith('return [...arguments]', ...strings);
  });

  it('resolves explicit { selector } objects to elements', async () => {
    const mainElement = { elementId: 'el-main' };
    scope.$.mockResolvedValueOnce(mainElement);

    const result = await call({
      script: 'return arguments[0].tagName',
      args: [{ selector: 'main' }],
    });

    expect(result.isError).toBeUndefined();
    expect(scope.$).toHaveBeenCalledTimes(1);
    expect(scope.$).toHaveBeenCalledWith('main');
    expect(scope.execute).toHaveBeenCalledWith('return arguments[0].tagName', mainElement);
    expect(result.content[0].text).toBe('Result: ok');
  });

  it('resolves multiple { selector } objects alongside plain strings and primitives in order', async () => {
    const firstEl = { elementId: 'el-1' };
    const secondEl = { elementId: 'el-2' };
    scope.$.mockResolvedValueOnce(firstEl).mockResolvedValueOnce(secondEl);

    const plainObj = { label: 'submit' };
    const result = await call({
      script: 'return arguments.length',
      args: ['main', { selector: '#first' }, 42, true, null, { selector: '.second' }, plainObj],
    });

    expect(result.isError).toBeUndefined();
    expect(scope.$).toHaveBeenCalledTimes(2);
    expect(scope.$).toHaveBeenNthCalledWith(1, '#first');
    expect(scope.$).toHaveBeenNthCalledWith(2, '.second');
    expect(scope.execute).toHaveBeenCalledWith(
      'return arguments.length',
      'main',
      firstEl,
      42,
      true,
      null,
      secondEl,
      plainObj,
    );
  });

  it('resolves null-prototype { selector } objects', async () => {
    const btnElement = { elementId: 'el-btn' };
    scope.$.mockResolvedValueOnce(btnElement);
    const nullProtoArg = Object.assign(Object.create(null), { selector: '#btn' });

    const result = await call({
      script: 'arguments[0].click()',
      args: [nullProtoArg],
    });

    expect(result.isError).toBeUndefined();
    expect(scope.$).toHaveBeenCalledWith('#btn');
    expect(scope.execute).toHaveBeenCalledWith('arguments[0].click()', btnElement);
  });

  it('resolves { selector } via fallback browser when no agent is active', async () => {
    vi.mocked(agentFor).mockReturnValueOnce(undefined);
    const el = { elementId: 'el-fallback' };
    browser.$.mockResolvedValueOnce(el);

    const result = await call({
      script: 'return arguments[0]',
      args: [{ selector: '#target' }, 'main'],
    });

    expect(result.isError).toBeUndefined();
    expect(browser.$).toHaveBeenCalledTimes(1);
    expect(browser.$).toHaveBeenCalledWith('#target');
    expect(browser.execute).toHaveBeenCalledWith('return arguments[0]', el, 'main');
  });

  it('does not resolve objects with extra keys, non-string selector, nested objects, arrays, or non-plain objects', async () => {
    class SelectorBox {
      selector = '#btn';
    }
    const nonSelectorArgs: unknown[] = [
      { selector: '#btn', extra: true },
      { selector: '#btn', other: undefined },
      { selector: 123 },
      { selector: null },
      { selector: undefined },
      { selector: {} },
      { selector: ['#btn'] },
      {},
      { target: { selector: '#btn' } },
      [{ selector: '#btn' }],
      null,
      undefined,
      0,
      false,
      '',
      new SelectorBox(),
    ];

    const result = await call({
      script: 'return arguments.length',
      args: nonSelectorArgs,
    });

    expect(result.isError).toBeUndefined();
    expect(scope.$).not.toHaveBeenCalled();
    expect(scope.execute).toHaveBeenCalledWith('return arguments.length', ...nonSelectorArgs);
  });

  it('does not resolve { selector } objects for Appium mobile: commands', async () => {
    const mobileArgs = [{ selector: '#list' }, 'main'];

    const result = await call({
      script: 'mobile: scroll',
      args: mobileArgs,
    });

    expect(result.isError).toBeUndefined();
    expect(scope.$).not.toHaveBeenCalled();
    expect(scope.execute).toHaveBeenCalledWith('mobile: scroll', ...mobileArgs);
  });

  it.each(['', '   ', '\t\n'])('returns an error without calling $ for empty or whitespace selector %j', async (selector) => {
    const result = await call({
      script: 'return arguments[0]',
      args: [{ selector }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('non-empty string');
    expect(scope.$).not.toHaveBeenCalled();
    expect(scope.execute).not.toHaveBeenCalled();
  });

  it('fails fast with zero $ calls when an empty selector appears alongside a valid selector', async () => {
    const result = await call({
      script: 'return arguments',
      args: [{ selector: '#ok' }, { selector: '  ' }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('non-empty string');
    expect(scope.$).not.toHaveBeenCalled();
    expect(scope.execute).not.toHaveBeenCalled();
  });

  it('returns an error when an explicit { selector } matches no element (Error instance)', async () => {
    scope.$.mockResolvedValueOnce({
      error: new Error('Couldn\'t find element with selector "#missing"'),
    });

    const result = await call({
      script: 'return arguments[0].textContent',
      args: [{ selector: '#missing' }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Couldn\'t find element with selector "#missing"');
    expect(scope.execute).not.toHaveBeenCalled();
  });

  it('returns a readable error when an explicit { selector } returns a classic WebDriver error object', async () => {
    scope.$.mockResolvedValueOnce({
      error: {
        error: 'no such element',
        message: 'no such element: Unable to locate element: {"method":"css selector","selector":"#missing"}',
      },
    });

    const result = await call({
      script: 'return arguments[0].textContent',
      args: [{ selector: '#missing' }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('no such element: Unable to locate element');
    expect(result.content[0].text).not.toContain('[object Object]');
    expect(scope.execute).not.toHaveBeenCalled();
  });

  it('handles code-only and string element.error payloads without producing [object Object]', async () => {
    scope.$.mockResolvedValueOnce({ error: { error: 'no such element' } });
    const codeOnlyRes = await call({
      script: 'return arguments[0]',
      args: [{ selector: '#gone' }],
    });
    expect(codeOnlyRes.isError).toBe(true);
    expect(codeOnlyRes.content[0].text).toContain('no such element: #gone');
    expect(codeOnlyRes.content[0].text).not.toContain('[object Object]');

    scope.$.mockResolvedValueOnce({ error: 'stale element reference' });
    const stringErrRes = await call({
      script: 'return arguments[0]',
      args: [{ selector: '#stale' }],
    });
    expect(stringErrRes.isError).toBe(true);
    expect(stringErrRes.content[0].text).toContain('stale element reference');
    expect(scope.execute).not.toHaveBeenCalled();
  });

  it('returns an error when browser.$ rejects (e.g. strict mode multi-match or invalid selector)', async () => {
    scope.$.mockRejectedValueOnce(new Error('Strict mode violation: selector "a" resolved to 5 elements'));

    const result = await call({
      script: 'return arguments[0].href',
      args: [{ selector: 'a' }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Strict mode violation');
    expect(scope.execute).not.toHaveBeenCalled();
  });

  it('formats object and null/undefined return values', async () => {
    scope.execute.mockResolvedValueOnce({ count: 2 });
    const objRes = await call({ script: 'return { count: 2 }' });
    expect(objRes.content[0].text).toBe('Result: {\n  "count": 2\n}');

    scope.execute.mockResolvedValueOnce(undefined);
    const emptyRes = await call({ script: 'window.x = 1' });
    expect(emptyRes.content[0].text).toBe('Script executed successfully (no return value)');
  });
});

describe('execute_script tool definition', () => {
  it('documents { selector } objects instead of auto-resolving strings', () => {
    expect(executeScriptToolDefinition.description).toContain('{ selector:');
    expect(executeScriptToolDefinition.description).not.toContain('string args that match a selector');
  });

  it('validates mixed script args through the Zod inputSchema', () => {
    const schema = z.object(executeScriptToolDefinition.inputSchema);
    expect(() => schema.parse({ script: 'return 1' })).not.toThrow();
    expect(() =>
      schema.parse({
        script: 'return arguments',
        args: ['main', 123, true, null, { selector: '#btn' }, { a: 1 }, [1, 2]],
      }),
    ).not.toThrow();
  });
});
