import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getState } from '../../src/session/state';

const run = vi.fn();
const createAgentSession = vi.fn(async (browser: unknown) => ({ browser, run }));
vi.mock('@wdio/session/agent', () => ({ createAgentSession: (...args: unknown[]) => createAgentSession(...(args as [unknown])) }));

const { forMcp, runAction, webAgent } = await import('../../src/session/agent');
const { performActionsTool } = await import('../../src/tools/page-input.tool');
const { clickTool } = await import('../../src/tools/click.tool');

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
  createAgentSession.mockClear();
});

describe('webAgent', () => {
  it('creates one agent session per browser, recording the page', async () => {
    startSession('browser');
    const first = await webAgent();
    const second = await webAgent();
    expect(first).toBe(second);
    expect(createAgentSession).toHaveBeenCalledTimes(1);
    expect(createAgentSession).toHaveBeenCalledWith(expect.anything(), { name: 'mcp', recordPage: true });
  });

  it('has none for app sessions', () => {
    startSession('android');
    expect(webAgent()).toBeUndefined();
  });
});

describe('forMcp', () => {
  it('names tools instead of shell commands', () => {
    expect(forMcp('`wdio session find <text>` gets them; `snapshot -i` lists all.'))
      .toBe('`snapshot` with `find` gets them; `snapshot` lists all.');
    expect(forMcp('Run `wdio session snapshot` to get refs.')).toBe('Run `snapshot` with `full: true` to get refs.');
  });
});

describe('runAction', () => {
  it('returns the change report', async () => {
    run.mockResolvedValue({ text: 'Clicked e3\nChanges:\n+ status "Saved"' });
    const result = await runAction({ run } as never, 'click', { target: 'e3' }, 'Clicked.');
    expect(result.content[0]).toEqual({ type: 'text', text: 'Clicked e3\nChanges:\n+ status "Saved"' });
  });

  it('turns errors into tool errors with the hint', async () => {
    run.mockRejectedValue(Object.assign(new Error('e9 no longer exists on the page.'), { hint: 'Run `wdio session snapshot` to get fresh refs.' }));
    const result = await runAction({ run } as never, 'click', { target: 'e9' }, 'Clicked.');
    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({ type: 'text', text: 'e9 no longer exists on the page.\nRun `snapshot` with `full: true` to get fresh refs.' });
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

  it('perform_actions is browser only', async () => {
    startSession('android');
    const result = await call(performActionsTool, { actions: [{ action: 'press', value: 'Enter' }] });
    expect(result.isError).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });
});
