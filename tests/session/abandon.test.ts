import { describe, expect, it } from 'vitest';
import { createAgentSession } from '@wdio/session/agent';

/** enough of a browser for the real @wdio/session engine to run `exec` code that does not touch the page */
const stubBrowser = () => new Proxy({
  options: {}, capabilities: { browserName: 'chrome' }, sessionId: 'stub', isBidi: false, isMobile: false,
  getUrl: async () => 'about:blank', getTitle: async () => '', execute: async () => undefined, getWindowHandles: async () => ['main'],
} as Record<string, unknown>, {
  get: (target, key) => key in target ? target[key as string] : typeof key === 'string' && key !== 'then' ? async () => undefined : undefined,
}) as unknown as WebdriverIO.Browser;

const slowAction = 'await new Promise((resolve) => setTimeout(resolve, 300)); globalThis.late = 1';

// withActionTimeout relies on this @wdio/session behaviour; it must fail here, not silently, if the engine changes
describe('Session.abandon (real @wdio/session engine)', () => {
  it('an action that finishes after abandon() changes no history and reports that it was given up', async () => {
    const agent = await createAgentSession(stubBrowser(), { name: 'abandon', recordPage: false });
    const running = agent.runAction('exec', { code: slowAction });
    await new Promise((resolve) => setTimeout(resolve, 50));
    agent.session.abandon();
    await expect(running).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(agent.history).toEqual([]);
  });

  it('the same action without abandon() is recorded', async () => {
    const agent = await createAgentSession(stubBrowser(), { name: 'kept', recordPage: false });
    await agent.runAction('exec', { code: slowAction });
    expect(agent.history.map((entry) => entry.code)).toEqual([slowAction]);
  });
});
