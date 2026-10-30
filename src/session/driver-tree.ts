import { execFileSync } from 'node:child_process';

export type ProcessEntry = { pid: number; ppid: number; started: string };
export type ProcessIdentity = { pid: number; started: string };

export function listProcesses(): ProcessEntry[] {
  try {
    const out = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,lstart='], { encoding: 'utf8' });
    return out.split('\n').flatMap((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
      return match ? [{ pid: Number(match[1]), ppid: Number(match[2]), started: match[3] }] : [];
    });
  } catch {
    return [];
  }
}

// webdriver kills only the driver pid, and Chrome is reparented once the driver dies, so roots are captured at session start.
// Matching by start time keeps a recycled pid from being killed.
export function captureDriverRoots(
  driverPid: number | undefined,
  processes?: ProcessEntry[],
  platform: NodeJS.Platform = process.platform,
  ownerPid: number = process.pid,
): ProcessIdentity[] {
  if (!driverPid || platform === 'win32') return [];
  const entries = processes ?? listProcesses();
  if (entries.find((e) => e.pid === driverPid)?.ppid !== ownerPid) return [];
  return entries
    .filter((e) => e.pid === driverPid || e.ppid === driverPid)
    .map(({ pid, started }) => ({ pid, started }));
}

export function driverTree(
  roots: ProcessIdentity[] | undefined,
  processes?: ProcessEntry[],
  platform: NodeJS.Platform = process.platform,
): ProcessIdentity[] {
  if (!roots?.length || platform === 'win32') return [];
  const entries = processes ?? listProcesses();
  const tree: ProcessEntry[] = [];
  for (const root of roots) {
    const entry = entries.find((e) => e.pid === root.pid && e.started === root.started);
    if (entry && !tree.some((t) => t.pid === entry.pid)) tree.push(entry);
  }
  for (let i = 0; i < tree.length; i++) {
    for (const entry of entries) {
      if (entry.ppid === tree[i].pid && !tree.some((t) => t.pid === entry.pid)) tree.push(entry);
    }
  }
  return tree.map(({ pid, started }) => ({ pid, started }));
}

export function killPids(
  tree: ProcessIdentity[],
  processes?: ProcessEntry[],
  kill: (pid: number, signal: NodeJS.Signals) => void = process.kill,
): void {
  if (!tree.length) return;
  const live = processes ?? listProcesses();
  for (const { pid, started } of tree) {
    if (!live.some((e) => e.pid === pid && e.started === started)) continue;
    try {
      kill(pid, 'SIGKILL');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ESRCH') continue;
      console.error('[WARN] Failed to kill chromedriver process tree:', e);
    }
  }
}
