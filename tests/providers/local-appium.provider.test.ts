import { describe, it, expect } from 'vitest';
import { localAppiumProvider } from '../../src/providers/local-appium.provider';

describe('LocalAppiumProvider', () => {
  it('builds iOS capabilities with bundleId', () => {
    const caps = localAppiumProvider.buildCapabilities({
      platform: 'iOS',
      deviceName: 'iPhone 15',
      appPath: '/path/to/app.app',
    });
    expect(caps.platformName).toBe('iOS');
    expect(caps['appium:app']).toBe('/path/to/app.app');
  });

  it('builds Android capabilities', () => {
    const caps = localAppiumProvider.buildCapabilities({
      platform: 'Android',
      deviceName: 'Pixel 7',
      appPath: '/path/to/app.apk',
    });
    expect(caps.platformName).toBe('Android');
  });

  it('getSessionType returns ios for iOS', () => {
    expect(localAppiumProvider.getSessionType({ platform: 'iOS' })).toBe('ios');
  });

  it('shouldAutoDetach true when noReset', () => {
    expect(localAppiumProvider.shouldAutoDetach({ noReset: true })).toBe(true);
  });

  it('shouldAutoDetach true when no appPath', () => {
    expect(localAppiumProvider.shouldAutoDetach({})).toBe(true);
  });

  it('shouldAutoDetach false when appPath provided', () => {
    expect(localAppiumProvider.shouldAutoDetach({ appPath: '/app.apk' })).toBe(false);
  });
});
