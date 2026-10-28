// webdriver kills only the chromedriver pid when deleteSession fails, so its Chrome children survive.
// The group kill only reaches them because the driver is spawned detached (see local-browser.provider.ts).
export function killDriverGroup(
  pid: number | undefined,
  kill: (pid: number, signal: NodeJS.Signals) => void = process.kill,
  platform: NodeJS.Platform = process.platform,
): void {
  if (!pid || platform === 'win32') return;
  try {
    kill(-pid, 'SIGKILL');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ESRCH') return;
    console.error('[WARN] Failed to kill chromedriver process group:', e);
  }
}
