import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('deprecation warnings', () => {
  let stderrWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warnDeprecated writes once per entry', async () => {
    const { warnDeprecated, DEPRECATION_MESSAGES } = await import('../../src/utils/deprecation');

    warnDeprecated('trace');
    warnDeprecated('trace');

    expect(stderrWrite).toHaveBeenCalledTimes(1);
    expect(stderrWrite).toHaveBeenCalledWith(`(@wdio/mcp) DeprecationWarning: ${DEPRECATION_MESSAGES.trace}\n`);
  });

  it('warnDeprecated writes nothing when process.noDeprecation is set', async () => {
    const { warnDeprecated } = await import('../../src/utils/deprecation');
    const previous = process.noDeprecation;
    process.noDeprecation = true;

    try {
      warnDeprecated('trace');

      expect(stderrWrite).not.toHaveBeenCalled();
    } finally {
      process.noDeprecation = previous;
    }
  });

  it('importing the snapshot entry writes the snapshot warning once', async () => {
    const { DEPRECATION_MESSAGES } = await import('../../src/utils/deprecation');

    await import('../../src/snapshot');

    expect(stderrWrite).toHaveBeenCalledTimes(1);
    expect(stderrWrite).toHaveBeenCalledWith(`(@wdio/mcp) DeprecationWarning: ${DEPRECATION_MESSAGES.snapshot}\n`);
  });

  it('importing the trace entry writes the trace warning once', async () => {
    const { DEPRECATION_MESSAGES } = await import('../../src/utils/deprecation');

    await import('../../src/trace');

    expect(stderrWrite).toHaveBeenCalledTimes(1);
    expect(stderrWrite).toHaveBeenCalledWith(`(@wdio/mcp) DeprecationWarning: ${DEPRECATION_MESSAGES.trace}\n`);
  });
});
