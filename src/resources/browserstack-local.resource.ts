import type { ResourceDefinition } from '../types/resource';

function getLocalBinaryInfo(): {
  downloadUrl: string;
  platform: string;
  arch: string;
  binaryName: string;
  note?: string;
} {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin') {
    return {
      downloadUrl: 'https://local-downloads.browserstack.com/BrowserStackLocal-darwin-x64.zip',
      platform: 'macOS',
      arch: arch === 'arm64' ? 'Apple Silicon (via Rosetta 2)' : 'Intel x64',
      binaryName: 'BrowserStackLocal',
      note: arch === 'arm64' ? 'macOS binary is Intel-only. Rosetta 2 must be installed (it is on most Apple Silicon Macs by default).' : undefined,
    };
  }

  if (platform === 'win32') {
    return {
      downloadUrl: 'https://local-downloads.browserstack.com/BrowserStackLocal-win32.zip',
      platform: 'Windows',
      arch: 'x86/x64',
      binaryName: 'BrowserStackLocal.exe',
    };
  }

  // Linux
  if (arch === 'arm64') {
    return {
      downloadUrl: 'https://local-downloads.browserstack.com/BrowserStackLocal-linux-arm64.zip',
      platform: 'Linux',
      arch: 'ARM64',
      binaryName: 'BrowserStackLocal',
    };
  }

  if (arch === 'ia32') {
    return {
      downloadUrl: 'https://local-downloads.browserstack.com/BrowserStackLocal-linux-ia32.zip',
      platform: 'Linux',
      arch: 'x86 32-bit',
      binaryName: 'BrowserStackLocal',
    };
  }

  return {
    downloadUrl: 'https://local-downloads.browserstack.com/BrowserStackLocal-linux-x64.zip',
    platform: 'Linux',
    arch: 'x64',
    binaryName: 'BrowserStackLocal',
  };
}

export const browserstackLocalBinaryResource: ResourceDefinition = {
  name: 'browserstack-local-binary',
  uri: 'wdio://browserstack/local-binary',
  description: 'BrowserStack Local binary download URL and daemon setup instructions for the current platform. Only needed for tunnel: "external" — tunnel: true starts BrowserStack Local for you.',
  handler: async () => {
    const info = getLocalBinaryInfo();
    const accessKey = process.env.BROWSERSTACK_ACCESS_KEY ?? '<BROWSERSTACK_ACCESS_KEY>';

    const content = {
      requirement: 'Start the BrowserStack Local daemon before calling start_session with tunnel: "external". Without a tunnel, navigation to local/internal URLs fails with ERR_TUNNEL_CONNECTION_FAILED. (tunnel: true starts it automatically.)',
      platform: info.platform,
      arch: info.arch,
      downloadUrl: info.downloadUrl,
      ...(info.note ? { note: info.note } : {}),
      setup: [
        `1. Download: curl -O ${info.downloadUrl}`,
        `2. Unzip: unzip ${info.downloadUrl.split('/').pop()}`,
        `3. Make executable (macOS/Linux): chmod +x ${info.binaryName}`,
        `4. Start daemon: ./${info.binaryName} --key ${accessKey} --force-local --daemon start`,
      ],
      commands: {
        start: `./${info.binaryName} --key ${accessKey} --force-local --daemon start`,
        stop: `./${info.binaryName} --key ${accessKey} --daemon stop`,
        status: `./${info.binaryName} --daemon list`,
      },
      afterDaemonIsRunning: 'Call start_session with tunnel: "external" to route BrowserStack traffic through the tunnel.',
    };

    return {
      contents: [{
        uri: 'wdio://browserstack/local-binary',
        mimeType: 'application/json',
        text: JSON.stringify(content, null, 2),
      }],
    };
  },
};