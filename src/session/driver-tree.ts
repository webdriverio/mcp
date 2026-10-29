import { execFileSync } from 'node:child_process';

export type ProcessEntry = { pid: number; ppid: number };

export function listProcesses(): ProcessEntry[] {
  try {
    const out = execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' });
    return out.split('\n').flatMap((line) => {
      const match = /^\s*(\d+)\s+(\d+)/.exec(line);
      return match ? [{ pid: Number(match[1]), ppid: Number(match[2]) }] : [];
    });
  } catch {
    return [];
  }
}

// webdriver kills only the driver pid on a failed deleteSession, so its Chrome children are reparented and must be captured before it.
export function driverTree(
  pid: number | undefined,
  processes?: ProcessEntry[],
  platform: NodeJS.Platform = process.platform,
): number[] {
  if (!pid || platform === 'win32') return [];
  const entries = processes ?? listProcesses();
  const tree = [pid];
  for (let i = 0; i < tree.length; i++) {
    for (const { pid: childPid, ppid } of entries) {
      if (ppid === tree[i] && !tree.includes(childPid)) tree.push(childPid);
    }
  }
  return tree;
}

export function killPids(
  pids: number[],
  kill: (pid: number, signal: NodeJS.Signals) => void = process.kill,
): void {
  for (const pid of pids) {
    try {
      kill(pid, 'SIGKILL');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ESRCH') continue;
      console.error('[WARN] Failed to kill chromedriver process tree:', e);
    }
  }
}
