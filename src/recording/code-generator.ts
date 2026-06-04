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

function generateStep(step: RecordedStep, history: SessionHistory): string {
  if (step.tool === '__session_transition__') {
    const newId = (step.params.newSessionId as string) ?? 'unknown';
    return `// --- new session: ${newId} started at ${step.timestamp} ---`;
  }

  if (step.status === 'error') {
    return `// [error] ${step.tool}: ${formatParams(step.params)} — ${step.error ?? 'unknown error'}`;
  }

  const p = step.params;
  switch (step.tool) {
    case 'start_session': {
      const platform = p.platform as string;
      const isBrowserStack = 'bstack:options' in history.capabilities;
      const isSauceLabs = 'sauce:options' in history.capabilities;
      const capJson = indentJson(history.capabilities)
        .split('\n')
        .map((line, i) => (i > 0 ? `  ${line}` : line))
        .join('\n');

      if (isBrowserStack) {
        const nav =
          platform === 'browser' && p.navigationUrl
            ? `\nawait browser.url('${escapeStr(p.navigationUrl)}');`
            : '';
        return [
          'const browser = await remote({',
          "  protocol: 'https',",
          "  hostname: 'hub.browserstack.com',",
          '  port: 443,',
          "  path: '/wd/hub',",
          '  user: process.env.BS_USER,',
          '  key: process.env.BS_KEY,',
          `  capabilities: ${capJson}`,
          `});${nav}`,
        ].join('\n');
      }

      if (isSauceLabs) {
        const region = ((history.capabilities['sauce:options'] as Record<string, unknown> | undefined)?.region as string) ?? 'eu-central-1';
        const nav =
          platform === 'browser' && p.navigationUrl
            ? `\nawait browser.url('${escapeStr(p.navigationUrl)}');`
            : '';
        return [
          'const browser = await remote({',
          "  protocol: 'https',",
          `  hostname: 'ondemand.${region}.saucelabs.com',`,
          '  port: 443,',
          "  path: '/wd/hub',",
          '  user: process.env.SAUCE_USERNAME,',
          '  key: process.env.SAUCE_ACCESS_KEY,',
          `  capabilities: ${capJson}`,
          `});${nav}`,
        ].join('\n');
      }

      if (platform === 'browser') {
        const nav = p.navigationUrl ? `\nawait browser.url('${escapeStr(p.navigationUrl)}');` : '';
        return `const browser = await remote({\n  capabilities: ${indentJson(history.capabilities)}\n});${nav}`;
      }
      // Mobile (ios/android)
      const config: Record<string, unknown> = {
        protocol: 'http',
        hostname: history.appiumConfig?.hostname ?? 'localhost',
        port: history.appiumConfig?.port ?? 4723,
        path: history.appiumConfig?.path ?? '/',
        capabilities: history.capabilities,
      };
      return `const browser = await remote(${indentJson(config)});`;
    }
    case 'close_session':
      return '// Session closed';
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
    case 'execute_script': {
      const scriptCode = `'${escapeStr(p.script)}'`;
      const scriptArgs = (p.args as unknown[])?.length ? `, ${indentJson(p.args)}` : '';
      return `await browser.execute(${scriptCode}${scriptArgs});`;
    }
    default:
      return `// [unknown tool] ${step.tool}`;
  }
}

function bsStatusUpdateLines(sessionType: 'browser' | 'ios' | 'android'): string[] {
  const apiUrl = sessionType === 'browser'
    ? 'https://api.browserstack.com/automate/sessions/'
    : 'https://api-cloud.browserstack.com/app-automate/sessions/';
  return [
    "    const bsAuth = Buffer.from(`${process.env.BS_USER}:${process.env.BS_KEY}`).toString('base64');",
    `    await fetch('${apiUrl}' + browser.sessionId + '.json', {`,
    "      method: 'PUT',",
    "      headers: { Authorization: 'Basic ' + bsAuth, 'Content-Type': 'application/json' },",
    '      body: JSON.stringify({ status: bsStatus, ...(bsReason ? { reason: bsReason } : {}) })',
    '    });',
  ];
}

export function generateCode(history: SessionHistory): string {
  const bstackOptions = history.capabilities['bstack:options'] as Record<string, unknown> | undefined;
  const sauceOptions = history.capabilities['sauce:options'] as Record<string, unknown> | undefined;
  const isBrowserStack = bstackOptions !== undefined;
  const isSauceLabs = sauceOptions !== undefined;
  const usesLocalTunnel = isBrowserStack ? bstackOptions?.local === true : (sauceOptions?.tunnel === true);

  const steps = history.steps
    .map(step => generateStep(step, history))
    .join('\n')
    .split('\n')
    .map(line => `  ${line}`)
    .join('\n');

  if (isBrowserStack) {
    const bsSteps = steps.replace(/const browser = await remote\(/g, 'browser = await remote(');
    const statusUpdate = bsStatusUpdateLines(history.type).join('\n');
    const preamble = 'let browser;\nlet bsStatus = \'passed\';\nlet bsReason;';
    const catchBlock = '} catch (e) {\n  bsStatus = \'failed\';\n  bsReason = String(e);\n  throw e;';
    const finallyBody = `  if (browser) {\n${statusUpdate}\n    await browser.deleteSession();\n  }`;

    if (usesLocalTunnel) {
      const tunnelSetup = [
        '',
        'const tunnel = new BrowserstackTunnel();',
        'const startTunnel = promisify(tunnel.start.bind(tunnel));',
        'const stopTunnel = promisify(tunnel.stop.bind(tunnel));',
        'await startTunnel({ key: process.env.BROWSERSTACK_ACCESS_KEY });',
        '',
      ].join('\n');

      return [
        "import { remote } from 'webdriverio';",
        "import { Local as BrowserstackTunnel } from 'browserstack-local';",
        "import { promisify } from 'node:util';",
        tunnelSetup,
        preamble,
        'try {',
        bsSteps,
        catchBlock,
        '} finally {',
        finallyBody,
        '  await stopTunnel();',
        '}',
      ].join('\n');
    }

    return [
      "import { remote } from 'webdriverio';",
      '',
      preamble,
      'try {',
      bsSteps,
      catchBlock,
      '} finally {',
      finallyBody,
      '}',
    ].join('\n');
  }

  if (isSauceLabs) {
    const slSteps = steps.replace(/const browser = await remote\(/g, 'browser = await remote(');
    const preamble = 'let browser;\nlet slStatus = \'passed\';\nlet slReason;';
    const catchBlock = '} catch (e) {\n  slStatus = \'failed\';\n  slReason = String(e);\n  throw e;';
    const statusUpdate = [
      "    const slAuth = Buffer.from(`${process.env.SAUCE_USERNAME}:${process.env.SAUCE_ACCESS_KEY}`).toString('base64');",
      '    await fetch(`https://saucelabs.com/rest/v1/${process.env.SAUCE_USERNAME}/jobs/` + browser.sessionId, {',
      "      method: 'PUT',",
      "      headers: { Authorization: 'Basic ' + slAuth, 'Content-Type': 'application/json' },",
      '      body: JSON.stringify({ passed: slStatus === \'passed\' })',
      '    });',
    ].join('\n');
    const finallyLines = [
      '  if (browser) {',
      statusUpdate,
      '    await browser.deleteSession();',
      '  }',
    ];

    if (usesLocalTunnel) {
      const tunnelSetup = [
        '',
        "import sauceConnectLauncher from 'sauce-connect-launcher';",
        '',
        'const startTunnel = promisify(sauceConnectLauncher);',
        'const sc = await startTunnel({',
        '  username: process.env.SAUCE_USERNAME,',
        '  accessKey: process.env.SAUCE_ACCESS_KEY,',
        '});',
        'const stopTunnel = promisify(sc.close.bind(sc));',
        '',
      ].join('\n');

      return [
        "import { remote } from 'webdriverio';",
        "import { promisify } from 'node:util';",
        tunnelSetup,
        preamble,
        'try {',
        slSteps,
        catchBlock,
        '} finally {',
        ...finallyLines,
        '  await stopTunnel();',
        '}',
      ].join('\n');
    }

    return [
      "import { remote } from 'webdriverio';",
      '',
      preamble,
      'try {',
      slSteps,
      catchBlock,
      '} finally {',
      ...finallyLines,
      '}',
    ].join('\n');
  }

  return `import { remote } from 'webdriverio';\n\ntry {\n${steps}\n} finally {\n  await browser.deleteSession();\n}`;
}
