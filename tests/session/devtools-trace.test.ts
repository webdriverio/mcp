import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MockInstance {
  captureType: unknown;
  beforeSession: ReturnType<typeof vi.fn>;
  beforeCommand: ReturnType<typeof vi.fn>;
  afterCommand: ReturnType<typeof vi.fn>;
  before: ReturnType<typeof vi.fn>;
  after: ReturnType<typeof vi.fn>;
}

vi.mock('@wdio/devtools-service', () => {
  const instances: MockInstance[] = [];
  const constructorArgs: unknown[] = [];

  class MockDevToolsHookService {
    static instances = instances;
    static constructorArgs = constructorArgs;
    captureType: unknown;
    beforeSession = vi.fn();
    beforeCommand = vi.fn();
    afterCommand = vi.fn();
    before = vi.fn();
    after = vi.fn();
    constructor(args?: unknown) {
      constructorArgs.push(args);
      instances.push(this);
    }
  }

  return {
    default: MockDevToolsHookService,
    TraceType: { Standalone: 'standalone', Testrunner: 'testrunner' },
  };
});

import MockDevToolsHookService from '@wdio/devtools-service';
import {
  attachDevtoolsTrace,
  beginDevtoolsTrace,
  finishDevtoolsTrace,
} from '../../src/session/devtools-trace';

const MockService = MockDevToolsHookService as unknown as {
  new (args?: unknown): MockInstance;
  constructorArgs: unknown[];
  instances: MockInstance[];
};

const lastInstance = () => MockService.instances[MockService.instances.length - 1];

beforeEach(() => {
  MockService.constructorArgs.length = 0;
  MockService.instances.length = 0;
  vi.clearAllMocks();
});

describe('attachDevtoolsTrace', () => {
  it('constructs the service in trace mode and sets standalone capture', () => {
    attachDevtoolsTrace({});

    expect(MockService.constructorArgs[0]).toEqual({ mode: 'trace', traceFormat: 'zip' });
    expect(lastInstance().captureType).toBe('standalone');
  });

  it('passes the options object and its real capabilities to beforeSession', () => {
    const opts: Record<string, unknown> = { capabilities: { browserName: 'chrome' } };

    attachDevtoolsTrace(opts);

    // Upstream treats capabilities without a top-level browserName/platformName as
    // multiremote and throws, so the capabilities must not be the options bag.
    const calls = lastInstance().beforeSession.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(opts);
    expect(calls[0][1]).toBe(opts.capabilities);
  });

  it.each(['beforeCommand', 'afterCommand'] as const)('creates the %s array when absent', async (key) => {
    const opts: Record<string, unknown> = {};

    attachDevtoolsTrace(opts);

    const hooks = opts[key] as unknown[];
    expect(hooks).toHaveLength(1);
    await (hooks[0] as (...a: unknown[]) => unknown)('cmd');
    expect(lastInstance()[key]).toHaveBeenCalledTimes(1);
  });

  it.each(['beforeCommand', 'afterCommand'] as const)('keeps a pre-existing single %s first', async (key) => {
    const existing = vi.fn();
    const opts: Record<string, unknown> = { [key]: existing };

    attachDevtoolsTrace(opts);

    const hooks = opts[key] as unknown[];
    expect(hooks).toHaveLength(2);
    expect(hooks[0]).toBe(existing);
    await (hooks[0] as (...a: unknown[]) => unknown)('cmd');
    expect(existing).toHaveBeenCalledTimes(1);
  });
});

describe('beginDevtoolsTrace', () => {
  it('awaits before with the browser capabilities, an empty array, and the browser', async () => {
    attachDevtoolsTrace({});
    const instance = lastInstance();
    const browser = { capabilities: { browserName: 'chrome' } };

    await beginDevtoolsTrace(instance as never, browser as never);

    const calls = instance.before.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual({ browserName: 'chrome' });
    expect(calls[0][1]).toEqual([]);
    expect(calls[0][2]).toBe(browser);
  });

  it('swallows a failing capture so the live session is not orphaned', async () => {
    attachDevtoolsTrace({});
    const instance = lastInstance();
    const failure = new Error('no BiDi');
    instance.before.mockRejectedValue(failure);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(beginDevtoolsTrace(instance as never, { capabilities: {} } as never)).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('failed to start'), failure);
    consoleError.mockRestore();
  });
});

describe('finishDevtoolsTrace', () => {
  it('awaits after', async () => {
    attachDevtoolsTrace({});
    const instance = lastInstance();

    await finishDevtoolsTrace(instance as never);

    expect(instance.after).toHaveBeenCalledTimes(1);
  });

  it('ignores an absent handle without calling after', async () => {
    attachDevtoolsTrace({});
    const instance = lastInstance();

    await finishDevtoolsTrace();

    expect(instance.after).not.toHaveBeenCalled();
  });
});
