import { beforeEach, describe, expect, it, vi } from 'vitest';

const run = vi.fn();
const agent = { run, session: { isWeb: true } };

vi.mock('../../src/session/agent', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  agentFor: vi.fn(async () => agent),
}));

const { setCookieTool, deleteCookiesTool } = await import('../../src/tools/cookies.tool');
const { agentFor, noSession, APP_CHANGES_HINT } = await import('../../src/session/agent');

type Result = { content: { type: string; text: string }[]; isError?: boolean };
const call = (tool: unknown, args: Record<string, unknown>) => (tool as (a: Record<string, unknown>) => Promise<Result>)(args);

beforeEach(() => {
  vi.clearAllMocks();
  agent.session.isWeb = true;
  run.mockResolvedValue({ text: '' });
});

describe('set_cookie', () => {
  it('sets the cookie through the agent cookies action', async () => {
    const result = await call(setCookieTool, { name: 'session', value: 'abc', expiry: 1900000000, httpOnly: true, sameSite: 'lax' });
    expect(run).toHaveBeenCalledWith('cookies', { sub: 'set', name: 'session', value: 'abc', path: '/', expiry: 1900000000, httpOnly: true, sameSite: 'lax' });
    expect(result.content[0].text).toBe('Cookie "session" set successfully');
  });

  it('forwards domain, secure, httpOnly, expiry and sameSite unchanged', async () => {
    await call(setCookieTool, { name: 'session', value: 'abc', domain: 'example.com', secure: true, httpOnly: true, expiry: 1900000000, sameSite: 'strict' });
    expect(run).toHaveBeenCalledWith('cookies', { sub: 'set', name: 'session', value: 'abc', domain: 'example.com', path: '/', expiry: 1900000000, httpOnly: true, secure: true, sameSite: 'strict' });
  });

  it('returns the text the agent reported', async () => {
    run.mockResolvedValueOnce({ text: 'session=abc set on example.com' });
    const result = await call(setCookieTool, { name: 'session', value: 'abc' });
    expect(result.content[0].text).toBe('session=abc set on example.com');
  });

  it('returns isError when the agent rejects', async () => {
    run.mockRejectedValueOnce(new Error('boom'));
    const result = await call(setCookieTool, { name: 'session', value: 'abc' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('boom');
  });

  it('omits the app-screen hint on non-web sessions', async () => {
    agent.session.isWeb = false;
    const result = await call(setCookieTool, { name: 'session', value: 'abc' });
    expect(result.content[0].text).not.toContain(APP_CHANGES_HINT);
  });
});

describe('no active session', () => {
  it.each([
    ['set_cookie', setCookieTool, { name: 'session', value: 'abc' }],
    ['delete_cookies', deleteCookiesTool, {}],
  ])('%s returns the noSession result', async (_name, tool, args) => {
    vi.mocked(agentFor).mockReturnValueOnce(undefined);
    expect(await call(tool, args)).toEqual(noSession());
    expect(run).not.toHaveBeenCalled();
  });
});

describe('delete_cookies', () => {
  it('clears one cookie by name through the agent', async () => {
    await call(deleteCookiesTool, { name: 'session' });
    expect(run).toHaveBeenCalledWith('cookies', { sub: 'clear', name: 'session' });
  });

  it('clears all cookies when no name is given', async () => {
    const result = await call(deleteCookiesTool, {});
    expect(run).toHaveBeenCalledWith('cookies', { sub: 'clear' });
    expect(run.mock.calls[0][1].name).toBeUndefined();
    expect(result.content[0].text).toBe('All cookies deleted successfully');
  });

  it('treats an empty name as clear-all', async () => {
    await call(deleteCookiesTool, { name: '' });
    expect(run.mock.calls[0][1].name).toBeUndefined();
  });
});
