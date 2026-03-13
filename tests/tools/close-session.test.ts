import { beforeEach, describe, expect, it, vi } from 'vitest';

// No mock of browser.tool — closeSessionTool reads from the module-level state directly.
// We inject test sessions via getBrowser().__state, which IS the module-level state object.
import { closeSessionTool, getBrowser } from '../../src/tools/browser.tool';

type ToolFn = (args: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
const callClose = closeSessionTool as unknown as ToolFn;

const mockDeleteSession = vi.fn();

function setupSession(sessionId: string, isAttached: boolean) {
  const state = (getBrowser as any).__state;
  state.browsers.set(sessionId, { deleteSession: mockDeleteSession });
  state.currentSession = sessionId;
  state.sessionMetadata.set(sessionId, { type: 'browser', capabilities: {}, isAttached });
}

beforeEach(() => {
  vi.clearAllMocks();
  const state = (getBrowser as any).__state;
  state.browsers.clear();
  state.sessionMetadata.clear();
  state.currentSession = null;
});

describe('close_session', () => {
  it('calls deleteSession when isAttached is false', async () => {
    setupSession('sess-1', false);
    await callClose({});
    expect(mockDeleteSession).toHaveBeenCalledOnce();
  });

  it('skips deleteSession when isAttached is true', async () => {
    setupSession('sess-attached', true);
    await callClose({});
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });

  it('returns "detached from" message when isAttached is true and detach is false', async () => {
    setupSession('sess-attached', true);
    const result = await callClose({});
    expect(result.content[0].text).toContain('detached from');
  });

  it('cleans up local state in both cases', async () => {
    setupSession('sess-2', true);
    await callClose({});
    const state = (getBrowser as any).__state;
    expect(state.currentSession).toBeNull();
    expect(state.browsers.has('sess-2')).toBe(false);
  });
});
