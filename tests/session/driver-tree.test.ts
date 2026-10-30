import { describe, expect, it, vi } from 'vitest';
import { captureDriverRoots, driverTree, killPids, type ProcessEntry, type ProcessIdentity } from '../../src/session/driver-tree';

const OWNER_PID = 1000;
const processes: ProcessEntry[] = [
  { pid: 4321, ppid: OWNER_PID, started: 'T1' },
  { pid: 4400, ppid: 4321, started: 'T2' },
  { pid: 4401, ppid: 4400, started: 'T3' },
  { pid: 5000, ppid: 1, started: 'T4' },
];
const reparented: ProcessEntry[] = [
  { pid: 4400, ppid: 1, started: 'T2' },
  { pid: 4401, ppid: 4400, started: 'T3' },
  { pid: 5000, ppid: 1, started: 'T4' },
];

describe('captureDriverRoots', () => {
  it('returns the driver and its direct children, with their start times', () => {
    expect(captureDriverRoots(4321, processes, 'linux', OWNER_PID)).toEqual([
      { pid: 4321, started: 'T1' },
      { pid: 4400, started: 'T2' },
    ]);
  });

  it('returns nothing when the driver is not a direct child of ownerPid (recycled pid)', () => {
    expect(captureDriverRoots(4321, processes, 'linux', 2000)).toEqual([]);
  });

  it('returns nothing when the driver pid is absent from the process list', () => {
    expect(captureDriverRoots(4321, processes.filter((p) => p.pid !== 4321), 'linux', OWNER_PID)).toEqual([]);
  });

  it('returns nothing on win32 or without a pid', () => {
    expect(captureDriverRoots(4321, processes, 'win32', OWNER_PID)).toEqual([]);
    expect(captureDriverRoots(undefined, processes, 'linux', OWNER_PID)).toEqual([]);
  });
});

describe('driverTree', () => {
  const driverRoot = { pid: 4321, started: 'T1' };
  const chromeRoot = { pid: 4400, started: 'T2' };

  it('returns the driver identity and its nested descendants, excluding unrelated processes', () => {
    expect(driverTree([driverRoot], processes, 'linux')).toEqual([
      { pid: 4321, started: 'T1' },
      { pid: 4400, started: 'T2' },
      { pid: 4401, started: 'T3' },
    ]);
  });

  it('keeps the tree after the driver dies and Chrome is reparented', () => {
    expect(driverTree([driverRoot, chromeRoot], reparented, 'linux')).toEqual([
      { pid: 4400, started: 'T2' },
      { pid: 4401, started: 'T3' },
    ]);
  });

  it('excludes a root whose pid was recycled to a process with a different start time', () => {
    const recycled: ProcessEntry[] = [
      { pid: 4400, ppid: 1, started: 'T9' },
      { pid: 4401, ppid: 4400, started: 'T3' },
    ];
    expect(driverTree([chromeRoot], recycled, 'linux')).toEqual([]);
  });

  it('returns nothing on win32 or without roots', () => {
    expect(driverTree([driverRoot], processes, 'win32')).toEqual([]);
    expect(driverTree(undefined, processes, 'linux')).toEqual([]);
    expect(driverTree([], processes, 'linux')).toEqual([]);
  });
});

describe('killPids', () => {
  const tree: ProcessIdentity[] = [{ pid: 4321, started: 'T1' }, { pid: 4400, started: 'T2' }];

  it('SIGKILLs every identity that is still live with the same start time', () => {
    const kill = vi.fn();
    killPids(tree, processes, kill);
    expect(kill).toHaveBeenCalledTimes(2);
    expect(kill).toHaveBeenCalledWith(4321, 'SIGKILL');
    expect(kill).toHaveBeenCalledWith(4400, 'SIGKILL');
  });

  it('skips an identity whose pid is live with a different start time (recycled)', () => {
    const kill = vi.fn();
    killPids([{ pid: 4321, started: 'T9' }], processes, kill);
    expect(kill).not.toHaveBeenCalled();
  });

  it('skips an identity whose pid is absent from the process list', () => {
    const kill = vi.fn();
    killPids([{ pid: 9999, started: 'T1' }], processes, kill);
    expect(kill).not.toHaveBeenCalled();
  });

  it('does nothing for an empty tree', () => {
    const kill = vi.fn();
    expect(() => killPids([], undefined, kill)).not.toThrow();
    expect(kill).not.toHaveBeenCalled();
  });

  it('swallows ESRCH when a process is already gone', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const kill = vi.fn(() => { throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' }); });
    try {
      expect(() => killPids([{ pid: 4321, started: 'T1' }], processes, kill)).not.toThrow();
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it('logs other kill errors without throwing', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const kill = vi.fn(() => { throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' }); });
    try {
      expect(() => killPids([{ pid: 4321, started: 'T1' }], processes, kill)).not.toThrow();
      expect(error).toHaveBeenCalledWith('[WARN] Failed to kill chromedriver process tree:', expect.any(Error));
    } finally {
      error.mockRestore();
    }
  });
});
