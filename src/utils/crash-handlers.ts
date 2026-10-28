// An unhandled rejection is survivable and a dead stdio server loses every live session, so keep running;
// after an uncaught exception process state is undefined (per Node docs), so exit.
export function installCrashHandlers(proc: NodeJS.Process, log: (...args: unknown[]) => void): void {
  proc.on('unhandledRejection', (reason) => log('Unhandled rejection (server kept running):', reason));
  proc.on('uncaughtException', (error) => {
    log('Uncaught exception, exiting:', error);
    proc.exit(1);
  });
}
