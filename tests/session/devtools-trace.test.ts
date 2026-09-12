import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@wdio/devtools-service', () => {
  const instances: Array<{
    captureType: unknown;
    beforeSession: ReturnType<typeof vi.fn>;
    beforeCommand: ReturnType<typeof vi.fn>;
    afterCommand: ReturnType<typeof vi.fn>;
    before: ReturnType<typeof vi.fn>;
    after: ReturnType<typeof vi.fn>;
  }> = [];
  class MockDevToolsHookService {
    static constructorArgs: unknown[] = [];
    static instances = instances;
    captureType: unknown;
    beforeSession = vi.fn();
    beforeCommand = vi.fn();
    afterCommand = vi.fn();
    before = vi.fn();
    after = vi.fn();
    constructor(args?: unknown) {
      MockDevToolsHookService.constructorArgs.push(args);
      MockDevToolsHookService.instances.push(this);
    }
  }
  return {
    default: MockDevToolsHookService,
    TraceType: { Standalone: 'standalone', Testrunner: 'testrunner' },
  };
});

import MockDevToolsHookService from '@wdio/devtools-service';
import { attachDevtoolsTrace, beginDevtoolsTrace, finishDevtoolsTrace } from '../../src/session/devtools-trace';

const MockService = MockDevToolsHookService as unknown as {
  new (args?: unknown): {
    captureType: unknown;
    beforeSession: ReturnType<typeof vi.fn>;
    beforeCommand: ReturnType<typeof vi.fn>;
    afterCommand: ReturnType<typeof vi.fn>;
    before: ReturnType<typeof vi.fn>;
    after: ReturnType<typeof vi.fn>;
  };
  constructorArgs: unknown[];
  instances: Array<{
    captureType: unknown;
    beforeSession: ReturnType<typeof vi.fn>;
    beforeCommand: ReturnType<typeof vi.fn>;
    afterCommand: ReturnType<typeof vi.fn>;
    before: ReturnType<typeof vi.fn>;
    after: ReturnType<typeof vi.fn>;
  }>;
};

const lastInstance = () => MockService.instances[MockService.instances.length - 1];

beforeEach(() => {
  MockService.constructorArgs.length = 0;
  MockService.instances.length = 0;
  vi.clearAllMocks();
});

describe('attachDevtoolsTrace', () => {
  it('constructs the service in trace mode and sets standalone capture', () => {
    attachDevtoolsTrace({}, {});

    expect(MockService.constructorArgs[0]).toEqual({ mode: 'trace', traceFormat: 'zip' });
    expect(lastInstance().captureType).toBe('standalone');
  });

  it('creates hook arrays when absent and pushes the bound service methods', async () => {
    const opts: Record<string, unknown> = {};
    attachDevtoolsTrace(opts, {});

    const instance = lastInstance();
    const beforeHooks = opts.beforeCommand as unknown[];
    const afterHooks = opts.afterCommand as unknown[];
    expect(beforeHooks).toHaveLength(1);
    expect(afterHooks).toHaveLength(1);

    await (beforeHooks[0] as (...a: unknown[]) => unknown)('cmd');
    await (afterHooks[0] as (...a: unknown[]) => unknown)('cmd');
    expect(instance.beforeCommand).toHaveBeenCalledTimes(1);
    expect(instance.afterCommand).toHaveBeenCalledTimes(1);
  });

  it('preserves a pre-existing single hook function first in the array', async () => {
    const before = vi.fn();
    const after = vi.fn();
    const opts: Record<string, unknown> = { beforeCommand: before, afterCommand: after };
    attachDevtoolsTrace(opts, {});

    const beforeHooks = opts.beforeCommand as unknown[];
    const afterHooks = opts.afterCommand as unknown[];
    expect(beforeHooks).toHaveLength(2);
    expect(beforeHooks[0]).toBe(before);
    expect(afterHooks).toHaveLength(2);
    expect(afterHooks[0]).toBe(after);

    await (beforeHooks[0] as (...a: unknown[]) => unknown)('cmd');
    await (afterHooks[0] as (...a: unknown[]) => unknown)('cmd');
    expect(before).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('passes the options object and the real capabilities to beforeSession', () => {
    const opts: Record<string, unknown> = {};
    const capabilities = { browserName: 'chrome' };
    attachDevtoolsTrace(opts, capabilities);

    // Upstream treats capabilities without a top-level browserName/platformName as
    // multiremote and throws, so the capabilities must not be the options bag.
    const calls = lastInstance().beforeSession.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(opts);
    expect(calls[0][1]).toBe(capabilities);
  });
});

describe('beginDevtoolsTrace', () => {
  it('awaits before with the browser capabilities, an empty array, and the browser', async () => {
    const opts: Record<string, unknown> = {};
    attachDevtoolsTrace(opts, {});
    const instance = lastInstance();
    const browser = { capabilities: { browserName: 'chrome' } };

    await beginDevtoolsTrace(instance as never, browser as never);

    const calls = instance.before.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual({ browserName: 'chrome' });
    expect(calls[0][1]).toEqual([]);
    expect(calls[0][2]).toBe(browser);
  });
});

describe('finishDevtoolsTrace', () => {
  it('awaits after', async () => {
    attachDevtoolsTrace({}, {});
    const instance = lastInstance();

    await finishDevtoolsTrace(instance);

    expect(instance.after).toHaveBeenCalledTimes(1);
  });

  it('ignores undefined and null handles without calling after', async () => {
    attachDevtoolsTrace({}, {});
    const instance = lastInstance();

    await finishDevtoolsTrace(undefined);
    await finishDevtoolsTrace(null);

    expect(instance.after).not.toHaveBeenCalled();
  });
});
