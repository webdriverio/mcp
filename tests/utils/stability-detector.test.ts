import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { captureSignature, waitForStability } from '../../src/utils/stability-detector';

function makeBrowser(signatures: object[]) {
  let idx = 0;
  return {
    execute: vi.fn().mockImplementation(() => Promise.resolve(signatures[Math.min(idx++, signatures.length - 1)])),
  } as unknown as WebdriverIO.Browser;
}

describe('waitForStability', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves when signature is stable for 500ms', async () => {
    const stable = { url: 'https://a.com', title: 'A', elementCount: 10, documentReady: true };
    // Return same signature 5+ times to trigger stability
    const browser = makeBrowser(Array(10).fill(stable));

    const p = waitForStability(browser);
    // Advance time by 1500ms in 200ms increments to let the polling happen
    for (let i = 0; i < 8; i++) {
      await vi.advanceTimersByTimeAsync(200);
    }
    await p;
    // If we get here without timeout, the test passes
    expect(true).toBe(true);
  });
});

describe('captureSignature', () => {
  it('captures url, title, elementCount, documentReady', async () => {
    const expected = { url: 'https://x.com', title: 'X', elementCount: 42, documentReady: true };
    const browser = { execute: vi.fn().mockResolvedValue(expected) } as unknown as WebdriverIO.Browser;
    const sig = await captureSignature(browser);
    expect(sig).toEqual(expected);
  });
});
