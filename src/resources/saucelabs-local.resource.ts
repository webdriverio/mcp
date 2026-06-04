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
      downloadUrl: 'https://saucelabs.com/downloads/sc-4.9.2-osx.zip',
      platform: 'macOS',
      arch: arch === 'arm64' ? 'Apple Silicon' : 'Intel x64',
      binaryName: 'sc',
    };
  }

  if (platform === 'win32') {
    return {
      downloadUrl: 'https://saucelabs.com/downloads/sc-4.9.2-win32.zip',
      platform: 'Windows',
      arch: 'x86/x64',
      binaryName: 'sc.exe',
    };
  }

  // Linux
  return {
    downloadUrl: 'https://saucelabs.com/downloads/sc-4.9.2-linux.tar.gz',
    platform: 'Linux',
    arch: arch === 'arm64' ? 'ARM64' : 'x64',
    binaryName: 'sc',
  };
}

export const saucelabsLocalBinaryResource: ResourceDefinition = {
  name: 'saucelabs-local-binary',
  uri: 'wdio://saucelabs/local-binary',
  description: 'Sauce Connect Proxy binary download URL and daemon setup instructions for the current platform. MUST be read and followed before using saucelabsLocal: true in start_session.',
  handler: async () => {
    const info = getLocalBinaryInfo();
    const username = process.env.SAUCE_USERNAME ?? '<SAUCE_USERNAME>';
    const accessKey = process.env.SAUCE_ACCESS_KEY ?? '<SAUCE_ACCESS_KEY>';
    const region = process.env.SAUCE_REGION ?? 'eu-central-1';

    const content = {
      requirement: 'MUST start the Sauce Connect Proxy daemon BEFORE calling start_session with saucelabsLocal: true. Without it, all navigation to local/internal URLs will fail.',
      platform: info.platform,
      arch: info.arch,
      downloadUrl: info.downloadUrl,
      ...(info.note ? { note: info.note } : {}),
      setup: [
        `1. Download: curl -O ${info.downloadUrl}`,
        `2. Unzip: ${info.downloadUrl.endsWith('.tar.gz') ? `tar -xzf ${info.downloadUrl.split('/').pop()}` : `unzip ${info.downloadUrl.split('/').pop()}`}`,
        `3. Make executable (macOS/Linux): chmod +x ${info.binaryName}`,
        `4. Start daemon: ./${info.binaryName} -u ${username} -k ${accessKey} --region ${region}`,
      ],
      commands: {
        start: `./${info.binaryName} -u ${username} -k ${accessKey} --region ${region}`,
        stop: `./${info.binaryName} --stop`,
        status: `./${info.binaryName} --status`,
      },
      afterDaemonIsRunning: 'Call start_session with saucelabsLocal: true to route Sauce Labs traffic through the tunnel.',
    };

    return {
      contents: [{
        uri: 'wdio://saucelabs/local-binary',
        mimeType: 'application/json',
        text: JSON.stringify(content, null, 2),
      }],
    };
  },
};
