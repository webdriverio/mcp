import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getState } from '../../src/session/state';
import { closeAllSessions } from '../../src/session/lifecycle';

function addSession(id: string, metadata: Record<string, unknown> = {}) {
  const browser = { deleteSession: vi.fn(async () => {}) };
  const state = getState();
  state.browsers.set(id, browser as unknown as WebdriverIO.Browser);
  state.sessionMetadata.set(id, { type: 'browser', capabilities: {}, isAttached: false, ...metadata } as never);
  return browser;
}

beforeEach(() => {
  const state = getState();
  state.browsers.clear();
  state.sessionMetadata.clear();
  state.currentSession = null;
});

describe('closeAllSessions', () => {
  it('ends the sessions the server started and detaches from the others', async () => {
    const local = addSession('local');
    const attached = addSession('attached', { isAttached: true });
    const external = addSession('external', { externallyManaged: true });
    await closeAllSessions();
    expect(local.deleteSession).toHaveBeenCalledTimes(1);
    expect(attached.deleteSession).not.toHaveBeenCalled();
    expect(external.deleteSession).not.toHaveBeenCalled();
    expect(getState().browsers.size).toBe(0);
  });

  it('keeps going when one session fails to close', async () => {
    const broken = addSession('broken');
    broken.deleteSession.mockRejectedValue(new Error('gone'));
    const fine = addSession('fine');
    await expect(closeAllSessions()).resolves.toBeUndefined();
    expect(fine.deleteSession).toHaveBeenCalledTimes(1);
  });
});
