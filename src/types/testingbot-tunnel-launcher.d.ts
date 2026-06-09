declare module 'testingbot-tunnel-launcher' {
  interface TestingBotTunnelOptions {
    apiKey?: string;
    apiSecret?: string;
    tunnelIdentifier?: string;
    logfile?: string;
    verbose?: boolean;
    'se-port'?: number | string;
    [key: string]: string | number | boolean | undefined;
  }

  interface TestingBotTunnel {
    close(callback?: () => void): void;
    pid?: number;
  }

  interface TestingBotTunnelLauncher {
    /** Callback form — downloads (if needed) and starts the tunnel. */
    (options: TestingBotTunnelOptions, callback: (err: Error | null, tunnel: TestingBotTunnel) => void): void;
    /** Promise form — resolves with the running tunnel handle. */
    downloadAndRunAsync(options: TestingBotTunnelOptions): Promise<TestingBotTunnel>;
    /** Stops any tunnel started by this process. */
    killAsync(): Promise<void>;
  }

  const launcher: TestingBotTunnelLauncher;
  export default launcher;
}
