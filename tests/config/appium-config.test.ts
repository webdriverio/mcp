import { describe, expect, it } from 'vitest';
import { buildAndroidCapabilities, buildIOSCapabilities } from '../../src/config/appium.config';

describe('buildAndroidCapabilities', () => {
  // Simulate how app-session.tool.ts calls this — all params destructured, unset ones are undefined
  const defaultOptions = { deviceName: 'emulator-5554', autoAcceptAlerts: undefined, autoDismissAlerts: undefined, autoGrantPermissions: undefined };

  it('includes autoAcceptAlerts: true by default when param is undefined', () => {
    const caps = buildAndroidCapabilities('/app.apk', defaultOptions);
    expect(caps['appium:autoAcceptAlerts']).toBe(true);
  });

  it('includes autoGrantPermissions: true by default when param is undefined', () => {
    const caps = buildAndroidCapabilities('/app.apk', defaultOptions);
    expect(caps['appium:autoGrantPermissions']).toBe(true);
  });

  it('respects explicit autoAcceptAlerts: false', () => {
    const caps = buildAndroidCapabilities('/app.apk', { ...defaultOptions, autoAcceptAlerts: false });
    expect(caps['appium:autoAcceptAlerts']).toBe(false);
  });

  it('sets autoDismissAlerts and clears autoAcceptAlerts when autoDismissAlerts is set', () => {
    const caps = buildAndroidCapabilities('/app.apk', { ...defaultOptions, autoDismissAlerts: true });
    expect(caps['appium:autoDismissAlerts']).toBe(true);
    expect(caps['appium:autoAcceptAlerts']).toBeUndefined();
  });
});

describe('buildIOSCapabilities', () => {
  const defaultOptions = { deviceName: 'iPhone 15', autoAcceptAlerts: undefined, autoDismissAlerts: undefined, autoGrantPermissions: undefined };

  it('includes autoAcceptAlerts: true by default when param is undefined', () => {
    const caps = buildIOSCapabilities('/app.app', defaultOptions);
    expect(caps['appium:autoAcceptAlerts']).toBe(true);
  });

  it('includes autoGrantPermissions: true by default when param is undefined', () => {
    const caps = buildIOSCapabilities('/app.app', defaultOptions);
    expect(caps['appium:autoGrantPermissions']).toBe(true);
  });
});
