import { describe, it, expect } from 'vitest';
import { getProvider } from '../../src/providers/registry';
import { LocalBrowserProvider } from '../../src/providers/local-browser.provider';
import { LocalAppiumProvider } from '../../src/providers/local-appium.provider';
import { BrowserStackProvider } from '../../src/providers/cloud/browserstack.provider';
import { TestMuProvider } from '../../src/providers/cloud/testmu.provider';
import { TestingBotProvider } from '../../src/providers/cloud/testingbot.provider';
import { DigitalAiProvider } from '../../src/providers/cloud/digitalai.provider';

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

  it('returns TestMuProvider for testmu browser', () => {
    expect(getProvider('testmu', 'browser')).toBeInstanceOf(TestMuProvider);
  });

  it('returns TestMuProvider for testmu android', () => {
    expect(getProvider('testmu', 'android')).toBeInstanceOf(TestMuProvider);
  });

  it('returns TestMuProvider for testmu ios', () => {
    expect(getProvider('testmu', 'ios')).toBeInstanceOf(TestMuProvider);
  });

  it('returns TestingBotProvider for testingbot browser', () => {
    expect(getProvider('testingbot', 'browser')).toBeInstanceOf(TestingBotProvider);
  });

  it('returns TestingBotProvider for testingbot android', () => {
    expect(getProvider('testingbot', 'android')).toBeInstanceOf(TestingBotProvider);
  });

  it('returns TestingBotProvider for testingbot ios', () => {
    expect(getProvider('testingbot', 'ios')).toBeInstanceOf(TestingBotProvider);
  });

  it('returns DigitalAiProvider for digitalai browser', () => {
    expect(getProvider('digitalai', 'browser')).toBeInstanceOf(DigitalAiProvider);
  });

  it('returns DigitalAiProvider for digitalai android', () => {
    expect(getProvider('digitalai', 'android')).toBeInstanceOf(DigitalAiProvider);
  });

  it('returns DigitalAiProvider for digitalai ios', () => {
    expect(getProvider('digitalai', 'ios')).toBeInstanceOf(DigitalAiProvider);
  });

  it('defaults to local when provider is undefined', () => {
    expect(getProvider(undefined as unknown as string, 'browser')).toBeInstanceOf(LocalBrowserProvider);
  });
});
