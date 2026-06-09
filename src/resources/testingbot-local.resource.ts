import type { ResourceDefinition } from '../types/resource';

// TestingBot Tunnel is distributed as a single cross-platform Java JAR (requires Java 11+),
// not per-platform native binaries like the other providers.
const DOWNLOAD_URL = 'https://testingbot.com/downloads/testingbot-tunnel.zip';
const JAR_NAME = 'testingbot-tunnel.jar';

export const testingbotLocalBinaryResource: ResourceDefinition = {
  name: 'testingbot-local-binary',
  uri: 'wdio://testingbot/local-binary',
  description: 'TestingBot Tunnel download URL and daemon setup instructions. The tunnel is a single cross-platform Java JAR (requires Java 11+). MUST be read and followed before using tunnel: "external" in start_session with provider: testingbot.',
  handler: async () => {
    const key = process.env.TESTINGBOT_KEY ?? '<TESTINGBOT_KEY>';
    const secret = process.env.TESTINGBOT_SECRET ?? '<TESTINGBOT_SECRET>';

    const content = {
      requirement: 'MUST start the TestingBot Tunnel BEFORE calling start_session with tunnel: "external". Without it, all navigation to local/internal URLs will fail. (Use tunnel: true to let the provider auto-start it instead.)',
      runtime: 'Java 11+ (17 LTS recommended) — the tunnel is a single cross-platform JAR, no per-platform binary.',
      downloadUrl: DOWNLOAD_URL,
      setup: [
        `1. Download: curl -O ${DOWNLOAD_URL}`,
        '2. Unzip: unzip testingbot-tunnel.zip',
        `3. Start: java -jar ${JAR_NAME} ${key} ${secret}`,
      ],
      commands: {
        start: `java -jar ${JAR_NAME} ${key} ${secret}`,
        stop: 'Press Ctrl+C in the tunnel terminal, or kill the java process.',
      },
      afterTunnelIsRunning: 'Call start_session with tunnel: "external" and provider: testingbot to route TestingBot traffic through the tunnel.',
    };

    return {
      contents: [{
        uri: 'wdio://testingbot/local-binary',
        mimeType: 'application/json',
        text: JSON.stringify(content, null, 2),
      }],
    };
  },
};
