import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { installCrashHandlers } from '../../src/utils/crash-handlers';

describe('installCrashHandlers', () => {
  function fakeProc() {
    const exit = vi.fn();
    const proc = Object.assign(new EventEmitter(), { exit }) as unknown as NodeJS.Process;
    return { proc, exit };
  }

  it('logs unhandled rejections with prefix and reason and keeps running', () => {
    const { proc, exit } = fakeProc();
    const log = vi.fn();
    const error = new Error('boom');
    installCrashHandlers(proc, log);

    expect(() => proc.emit('unhandledRejection', error, Promise.resolve())).not.toThrow();

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('Unhandled rejection (server kept running):', error);
    expect(exit).not.toHaveBeenCalled();
  });

  it('logs uncaught exceptions then exits with code 1', () => {
    const { proc, exit } = fakeProc();
    const log = vi.fn();
    const error = new Error('spawn failed');
    installCrashHandlers(proc, log);

    proc.emit('uncaughtException', error);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('Uncaught exception, exiting:', error);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
