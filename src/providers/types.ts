export interface ConnectionConfig {
  hostname?: string;
  port?: number;
  path?: string;
  protocol?: string;
  user?: string;
  key?: string;
  services?: unknown[];
}

export interface SessionResult {
  status: 'passed' | 'failed';
  reason?: string;
}

export interface SessionProvider {
  name: string;
  getConnectionConfig(options: Record<string, unknown>): ConnectionConfig;
  buildCapabilities(options: Record<string, unknown>): Record<string, unknown>;
  getSessionType(options: Record<string, unknown>): 'browser' | 'ios' | 'android';
  shouldAutoDetach(options: Record<string, unknown>): boolean;
  startTunnel?(options: Record<string, unknown>): Promise<unknown>;
  onSessionClose?(sessionId: string, sessionType: 'browser' | 'ios' | 'android', result: SessionResult, tunnelHandle?: unknown): Promise<void>;
}
