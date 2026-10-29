import { describe, expect, it, vi } from 'vitest';
import { driverTree, killPids, type ProcessEntry } from '../../src/session/driver-tree';

const processes: ProcessEntry[] = [
  { pid: 4400, ppid: 4321 },
  { pid: 4401, ppid: 4400 },
  { pid: 5000, ppid: 1 },
];

describe('driverTree', () => {
  it('returns the driver pid and its nested descendants, excluding unrelated processes', () => {
    expect(driverTree(4321, processes, 'linux')).toEqual([4321, 4400, 4401]);
  });

  it('returns nothing on win32 or without a pid', () => {
    expect(driverTree(4321, processes, 'win32')).toEqual([]);
    expect(driverTree(undefined, processes, 'linux')).toEqual([]);
  });
});

describe('killPids', () => {
  it('SIGKILLs every pid', () => {
    const kill = vi.fn();
    killPids([4321, 4400], kill);
    expect(kill).toHaveBeenCalledTimes(2);
    expect(kill).toHaveBeenCalledWith(4321, 'SIGKILL');
    expect(kill).toHaveBeenCalledWith(4400, 'SIGKILL');
  });

  it('swallows ESRCH when a process is already gone', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const kill = vi.fn(() => { throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' }); });
    try {
      expect(() => killPids([4321], kill)).not.toThrow();
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it('logs other kill errors without throwing', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const kill = vi.fn(() => { throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' }); });
    try {
      expect(() => killPids([4321], kill)).not.toThrow();
      expect(error).toHaveBeenCalledWith('[WARN] Failed to kill chromedriver process tree:', expect.any(Error));
    } finally {
      error.mockRestore();
    }
  });
});
