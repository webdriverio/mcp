import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getState } from '../../src/session/state';

const run = vi.fn();
const snapshot = vi.fn();
const createAgentSession = vi.fn(async (browser: unknown) => ({ browser, run, snapshot }));
vi.mock('@wdio/session/agent', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createAgentSession: (...args: unknown[]) => createAgentSession(...(args as [unknown])),
}));

const { SessionError } = await import('@wdio/session/agent');
const { agentFor, pageReport, runAction } = await import('../../src/session/agent');
const { mcpHint } = await import('../../src/session/hints');
const { performActionsTool } = await import('../../src/tools/page-input.tool');
const { clickTool } = await import('../../src/tools/click.tool');
const { snapshotTool } = await import('../../src/tools/snapshot.tool');
const { tapElementTool } = await import('../../src/tools/gestures.tool');

type Result = { content: { type: string; text: string }[]; isError?: boolean };
const call = (tool: unknown, args: Record<string, unknown>) => (tool as (a: Record<string, unknown>) => Promise<Result>)(args);

function startSession(type: 'browser' | 'android') {
  const state = getState();
  state.browsers.set('s1', { getUrl: vi.fn() } as unknown as WebdriverIO.Browser);
  state.currentSession = 's1';
  state.sessionMetadata.set('s1', { type, capabilities: {}, isAttached: false });
}

beforeEach(() => {
  const state = getState();
  state.browsers.clear();
  state.sessionMetadata.clear();
  state.currentSession = null;
  run.mockReset();
  snapshot.mockReset();
  createAgentSession.mockClear();
});

describe('agentFor', () => {
  it('creates one agent session per browser with the MCP hints, recording the page', async () => {
    startSession('browser');
    const first = await agentFor();
    const second = await agentFor();
    expect(first).toBe(second);
    expect(createAgentSession).toHaveBeenCalledTimes(1);
    expect(createAgentSession).toHaveBeenCalledWith(expect.anything(), { name: 'mcp', hint: mcpHint, recordPage: true });
  });

  it('creates an agent session for app sessions without recording the page', async () => {
    startSession('android');
    expect(await agentFor()).toBeDefined();
    expect(createAgentSession).toHaveBeenCalledWith(expect.anything(), { name: 'mcp', hint: mcpHint, recordPage: false });
  });

  it('has none before a session starts', () => {
    expect(agentFor()).toBeUndefined();
  });
});

describe('pageReport', () => {
  it('returns the url and the snapshot text', async () => {
    snapshot.mockResolvedValue({ text: 'button "Go" [ref=e1]', refs: 1, tooBig: false, page: { url: 'https://a.test', title: 'A' } });
    expect(await pageReport({ snapshot } as never)).toBe('Page: https://a.test\nbutton "Go" [ref=e1]');
    expect(snapshot).toHaveBeenCalledWith({ interactive: true, maxChars: 1500 });
  });

  it('summarizes a big page', async () => {
    snapshot.mockResolvedValue({ text: 'Snapshot: …', refs: 42, tooBig: true, page: { url: 'https://a.test', title: 'A' } });
    expect(await pageReport({ snapshot } as never)).toBe('Page: https://a.test · "A" · 42 interactive elements. `snapshot({"find":"<text>"})` gets the ones you need with their refs.');
  });
});

describe('runAction', () => {
  it('returns the change report', async () => {
    run.mockResolvedValue({ text: 'Clicked e3\nChanges:\n+ status "Saved"' });
    const result = await runAction({ run } as never, 'click', { target: 'e3' }, 'Clicked.');
    expect(result.content[0]).toEqual({ type: 'text', text: 'Clicked e3\nChanges:\n+ status "Saved"' });
  });

  it('turns errors into tool errors with the hint, unchanged', async () => {
    run.mockRejectedValue(new SessionError('REF_STALE', 'e9 no longer exists on the page.', { hint: 'Run `snapshot()` to get fresh refs.' }));
    const result = await runAction({ run } as never, 'click', { target: 'e9' }, 'Clicked.');
    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({ type: 'text', text: 'e9 no longer exists on the page.\nRun `snapshot()` to get fresh refs.' });
  });
});

describe('browser tools', () => {
  it('click_element clicks refs through the agent session', async () => {
    startSession('browser');
    run.mockResolvedValue({ text: 'Clicked e4 (button "Login")' });
    const result = await call(clickTool, { selector: 'e4' });
    expect(run).toHaveBeenCalledWith('click', { target: 'e4' });
    expect(result.content[0].text).toBe('Clicked e4 (button "Login")');
  });

  it('perform_actions runs actions in order and stops at the first failure', async () => {
    startSession('browser');
    run
      .mockResolvedValueOnce({ text: 'Filled e2' })
      .mockRejectedValueOnce(new Error('e99 was never assigned in this session.'));
    const result = await call(performActionsTool, {
      actions: [
        { action: 'fill', selector: 'e2', value: 'Ada' },
        { action: 'click', selector: 'e99' },
        { action: 'press', value: 'Enter' },
      ],
    });
    expect(run.mock.calls).toEqual([
      ['fill', { target: 'e2', text: 'Ada' }],
      ['click', { target: 'e99' }],
    ]);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Filled e2\n✖ click e99: e99 was never assigned in this session.\n1 later action skipped.');
  });

  it('perform_actions stops after a step that opens a listbox', async () => {
    startSession('browser');
    run.mockResolvedValueOnce({ text: 'Clicked e2', changes: { kind: 'changed', added: ['listbox "Country" [ref=e9]', 'option "Austria" [ref=e10]'], omitted: 0 } });
    const result = await call(performActionsTool, {
      actions: [{ action: 'click', selector: 'e2' }, { action: 'click', selector: 'e10' }, { action: 'press', value: 'Enter' }],
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('Clicked e2\n2 later actions skipped: the page changed (listbox "Country" [ref=e9]). Continue with the new refs.');
  });

  it('perform_actions keeps going when a fill opens a dialog', async () => {
    startSession('browser');
    run.mockResolvedValueOnce({ text: 'Filled e9', changes: { kind: 'changed', added: ['Opened dialog "Choose Date" [ref=e40]', '  - button "Next Month" [ref=e42]'], omitted: 0 } });
    run.mockResolvedValueOnce({ text: 'Filled e10' });
    const result = await call(performActionsTool, {
      actions: [{ action: 'fill', selector: 'e9', value: '21/11/2026' }, { action: 'fill', selector: 'e10', value: '23/11/2026' }],
    });
    expect(run).toHaveBeenCalledTimes(2);
    expect(result.content[0].text).not.toContain('skipped');
  });

  it('perform_actions completes when only the last step opens a dialog', async () => {
    startSession('browser');
    run
      .mockResolvedValueOnce({ text: 'Filled e2' })
      .mockResolvedValueOnce({ text: 'Clicked e3', changes: { kind: 'changed', added: ['dialog "Confirm" [ref=e8]'], omitted: 0 } });
    const result = await call(performActionsTool, { actions: [{ action: 'fill', selector: 'e2', value: 'Ada' }, { action: 'click', selector: 'e3' }] });
    expect(run).toHaveBeenCalledTimes(2);
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('Filled e2\nClicked e3');
  });

  it('perform_actions runs on app sessions and surfaces NOT_SUPPORTED from the agent', async () => {
    startSession('android');
    run.mockRejectedValue(new SessionError('NOT_SUPPORTED', '"check" is not supported for Android sessions.'));
    const result = await call(performActionsTool, { actions: [{ action: 'check', selector: 'e2' }] });
    expect(run).toHaveBeenCalledWith('check', { target: 'e2' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('is not supported for Android sessions.');
  });
});

describe('app tools', () => {
  it('click_element clicks refs through the agent session', async () => {
    startSession('android');
    run.mockResolvedValue({ text: 'Clicked e4' });
    await call(clickTool, { selector: 'e4' });
    expect(run).toHaveBeenCalledWith('click', { target: 'e4' });
  });

  it('tap_element taps a ref through the agent session', async () => {
    startSession('android');
    run.mockResolvedValue({ text: 'Tapped e4' });
    await call(tapElementTool, { selector: 'e4' });
    expect(run).toHaveBeenCalledWith('tap', { target: 'e4' });
  });

  it('snapshot calls agent.snapshot on android and appends notes', async () => {
    startSession('android');
    snapshot.mockResolvedValue({ text: 'button "Go" [ref=e1]', tooBig: false, notes: ['Note: x'] });
    const result = await call(snapshotTool, {});
    expect(snapshot).toHaveBeenCalledWith({ interactive: true, scope: undefined, viewport: false, maxChars: 12000 });
    expect(result.content[0].text).toBe('button "Go" [ref=e1]\nNote: x');
  });

  it('snapshot passes viewport to agent.snapshot', async () => {
    startSession('android');
    snapshot.mockResolvedValue({ text: 'button "Go" [ref=e1]', tooBig: false });
    await call(snapshotTool, { viewport: true });
    expect(snapshot).toHaveBeenCalledWith({ interactive: true, scope: undefined, viewport: true, maxChars: 12000 });
  });

  it('snapshot returns the summary of a big screen', async () => {
    startSession('android');
    snapshot.mockResolvedValue({ text: 'Snapshot: 900 lines, too big to return.', tooBig: true });
    const result = await call(snapshotTool, { full: true, scope: 'e3' });
    expect(snapshot).toHaveBeenCalledWith({ interactive: false, scope: 'e3', viewport: false, maxChars: 12000 });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('Snapshot: 900 lines, too big to return.');
  });

  it('snapshot find goes through the find action', async () => {
    startSession('android');
    run.mockResolvedValue({ text: 'match' });
    await call(snapshotTool, { find: 'Login' });
    expect(run).toHaveBeenCalledWith('find', { text: 'Login' });
  });

  it('snapshot rejects find together with viewport', async () => {
    startSession('browser');
    const result = await call(snapshotTool, { find: 'Login', viewport: true });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('find does not support viewport');
    expect(run).not.toHaveBeenCalled();
    expect(snapshot).not.toHaveBeenCalled();
  });
});

describe('action timeout for snapshots', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('snapshot returns the TIMEOUT error and hint when the page never answers', async () => {
    startSession('browser');
    snapshot.mockReturnValue(new Promise(() => {}));
    const pending = call(snapshotTool, {});
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pending;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('"snapshot" did not finish within 30s.\nThe page may still be busy. `snapshot()` shows where it is.');
  });

  it('pageReport reports the timeout instead of hanging', async () => {
    snapshot.mockReturnValue(new Promise(() => {}));
    const pending = pageReport({ snapshot } as never);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toContain('"snapshot" did not finish within 30s.');
  });
});
