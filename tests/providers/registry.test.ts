import { describe, it, expect } from 'vitest';
import { getProvider } from '../../src/providers/registry';
import { LocalBrowserProvider } from '../../src/providers/local-browser.provider';
import { LocalAppiumProvider } from '../../src/providers/local-appium.provider';
import { BrowserStackProvider } from '../../src/providers/cloud/browserstack.provider';

describe('getProvider', () => {
  it('returns LocalBrowserProvider for local browser', () => {
    expect(getProvider('local', 'browser')).toBeInstanceOf(LocalBrowserProvider);
  });

  it('returns LocalAppiumProvider for local android', () => {
    expect(getProvider('local', 'android')).toBeInstanceOf(LocalAppiumProvider);
  });

  it('returns LocalAppiumProvider for local ios', () => {
    expect(getProvider('local', 'ios')).toBeInstanceOf(LocalAppiumProvider);
  });

  it('returns BrowserStackProvider for browserstack browser', () => {
    expect(getProvider('browserstack', 'browser')).toBeInstanceOf(BrowserStackProvider);
  });

  it('returns BrowserStackProvider for browserstack android', () => {
    expect(getProvider('browserstack', 'android')).toBeInstanceOf(BrowserStackProvider);
  });

  it('returns BrowserStackProvider for browserstack ios', () => {
    expect(getProvider('browserstack', 'ios')).toBeInstanceOf(BrowserStackProvider);
  });

  it('defaults to local when provider is undefined', () => {
    expect(getProvider(undefined as unknown as string, 'browser')).toBeInstanceOf(LocalBrowserProvider);
  });
});
