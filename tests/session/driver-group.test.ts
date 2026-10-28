import { describe, expect, it, vi } from 'vitest';
import { killDriverGroup } from '../../src/session/driver-group';

describe('killDriverGroup', () => {
  it('SIGKILLs the process group whose id is the driver pid', () => {
    const kill = vi.fn();
    killDriverGroup(4321, kill, 'linux');
    expect(kill).toHaveBeenCalledWith(-4321, 'SIGKILL');
  });

  it('does nothing on win32 or without a pid', () => {
    const kill = vi.fn();
    killDriverGroup(4321, kill, 'win32');
    killDriverGroup(undefined, kill, 'linux');
    expect(kill).not.toHaveBeenCalled();
  });

  it('swallows ESRCH when the group is already gone', () => {
    const kill = vi.fn(() => { throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' }); });
    expect(() => killDriverGroup(4321, kill, 'linux')).not.toThrow();
  });

  it('logs other kill errors without throwing', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const kill = vi.fn(() => { throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' }); });
    try {
      expect(() => killDriverGroup(4321, kill, 'linux')).not.toThrow();
      expect(error).toHaveBeenCalledWith('[WARN] Failed to kill chromedriver process group:', expect.any(Error));
    } finally {
      error.mockRestore();
    }
  });
});
