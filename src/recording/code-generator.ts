// src/recording/code-generator.ts
import type { RecordedStep, SessionHistory } from '../types/recording';

/** Escape single quotes so generated JS string literals are valid. */
function escapeStr(value: unknown): string {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatParams(params: Record<string, unknown>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
}

function indentJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
    .split('\n')
    .map((line, i) => (i > 0 ? `  ${line}` : line))
    .join('\n');
}

function generateStep(step: RecordedStep): string {
  if (step.tool === '__session_transition__') {
    const newId = (step.params.newSessionId as string) ?? 'unknown';
    return `// --- new session: ${newId} started at ${step.timestamp} ---`;
  }

  if (step.status === 'error') {
    return `// [error] ${step.tool}: ${formatParams(step.params)} — ${step.error ?? 'unknown error'}`;
  }

  const p = step.params;
  switch (step.tool) {
    case 'start_browser': {
      const browserName = p.browser === 'edge' ? 'msedge' : String(p.browser ?? 'chrome');
      const headless = p.headless !== false;
      const width = (p.windowWidth as number | undefined) ?? 1920;
      const height = (p.windowHeight as number | undefined) ?? 1080;
      const args: string[] = [`--window-size=${width},${height}`];
      if (headless && browserName !== 'safari') {
        args.push('--headless=new', '--disable-gpu', '--disable-dev-shm-usage');
      }
      const caps: Record<string, unknown> = { browserName };
      if (browserName === 'chrome') caps['goog:chromeOptions'] = { args };
      else if (browserName === 'msedge') caps['ms:edgeOptions'] = { args };
      else if (browserName === 'firefox' && headless) caps['moz:firefoxOptions'] = { args: ['-headless'] };
      const extra = p.capabilities as Record<string, unknown> | undefined;
      const merged = extra ? { ...caps, ...extra } : caps;
      const nav = p.navigationUrl ? `\nawait browser.url('${escapeStr(p.navigationUrl)}');` : '';
      return `const browser = await remote({\n  capabilities: ${indentJson(merged)}\n});${nav}`;
    }
    case 'start_app_session': {
      const caps: Record<string, unknown> = {
        platformName: p.platform,
        'appium:deviceName': p.deviceName,
        ...(p.platformVersion !== undefined && { 'appium:platformVersion': p.platformVersion }),
        ...(p.automationName !== undefined && { 'appium:automationName': p.automationName }),
        ...(p.appPath !== undefined && { 'appium:app': p.appPath }),
        ...(p.udid !== undefined && { 'appium:udid': p.udid }),
        ...(p.noReset !== undefined && { 'appium:noReset': p.noReset }),
        ...(p.fullReset !== undefined && { 'appium:fullReset': p.fullReset }),
        ...(p.autoGrantPermissions !== undefined && { 'appium:autoGrantPermissions': p.autoGrantPermissions }),
        ...(p.autoAcceptAlerts !== undefined && { 'appium:autoAcceptAlerts': p.autoAcceptAlerts }),
        ...(p.autoDismissAlerts !== undefined && { 'appium:autoDismissAlerts': p.autoDismissAlerts }),
        ...(p.appWaitActivity !== undefined && { 'appium:appWaitActivity': p.appWaitActivity }),
        ...(p.newCommandTimeout !== undefined && { 'appium:newCommandTimeout': p.newCommandTimeout }),
        ...((p.capabilities as Record<string, unknown> | undefined) ?? {}),
      };
      const config: Record<string, unknown> = {
        protocol: 'http',
        hostname: p.appiumHost ?? 'localhost',
        port: p.appiumPort ?? 4723,
        path: p.appiumPath ?? '/',
        capabilities: caps,
      };
      return `const browser = await remote(${indentJson(config)});`;
    }
    case 'navigate':
      return `await browser.url('${escapeStr(p.url)}');`;
    case 'click_element':
      return `await browser.$('${escapeStr(p.selector)}').click();`;
    case 'set_value':
      return `await browser.$('${escapeStr(p.selector)}').setValue('${escapeStr(p.value)}');`;
    case 'scroll': {
      const scrollAmount = (p.direction as string) === 'down' ? (p.pixels as number) : -(p.pixels as number);
      return `await browser.execute(() => window.scrollBy(0, ${scrollAmount}));`;
    }
    case 'tap_element':
      if (p.selector !== undefined) {
        return `await browser.$('${escapeStr(p.selector)}').click();`;
      }
      return `await browser.tap({ x: ${p.x}, y: ${p.y} });`;
    case 'swipe':
      return `await browser.execute('mobile: swipe', { direction: '${escapeStr(p.direction)}' });`;
    case 'drag_and_drop':
      if (p.targetSelector !== undefined) {
        return `await browser.$('${escapeStr(p.sourceSelector)}').dragAndDrop(browser.$('${escapeStr(p.targetSelector)}'));`;
      }
      return `await browser.$('${escapeStr(p.sourceSelector)}').dragAndDrop({ x: ${p.x}, y: ${p.y} });`;
    default:
      return `// [unknown tool] ${step.tool}`;
  }
}

export function generateCode(history: SessionHistory): string {
  const steps = history.steps.map(generateStep).join('\n');
  return `import { remote } from 'webdriverio';\n\n${steps}\n\nawait browser.deleteSession();`;
}
