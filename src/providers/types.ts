export interface ConnectionConfig {
  hostname?: string;
  port?: number;
  path?: string;
  protocol?: string;
  user?: string;
  key?: string;
}

export interface SessionProvider {
  name: string;
  getConnectionConfig(options: Record<string, unknown>): ConnectionConfig;
  buildCapabilities(options: Record<string, unknown>): Record<string, unknown>;
  getSessionType(options: Record<string, unknown>): 'browser' | 'ios' | 'android';
  shouldAutoDetach(options: Record<string, unknown>): boolean;
}
