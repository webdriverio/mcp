import { afterAll, describe, expect, it } from 'vitest';
import { closeSessionTool, startSessionTool } from '../../src/tools/session.tool';
import { getElementsTool } from '../../src/tools/get-elements.tool';
import { clickTool } from '../../src/tools/click.tool';
import { getBrowser } from '../../src/session/state';
import { getElements } from '../../src/scripts/get-elements';

const runIntegration = Boolean(process.env.WDI5_UI5_INTEGRATION);

const UI5_APP_URL = 'https://sdk.openui5.org/test-resources/sap/m/demokit/cart/webapp/index.html';

type Result = { content: { text: string }[]; isError?: boolean };
const callStart = startSessionTool as unknown as (args: Record<string, unknown>, extra: unknown) => Promise<Result>;
const callElements = getElementsTool as unknown as (args: Record<string, unknown>) => Promise<Result>;
const callClick = clickTool as unknown as (args: Record<string, unknown>) => Promise<Result>;
const callClose = closeSessionTool as unknown as (args: Record<string, unknown>) => Promise<Result>;

describe.skipIf(!runIntegration)('ui5 integration (real Chrome)', () => {
  afterAll(async () => {
    if (!runIntegration) return;
    await callClose({});
  });

  it('starts a UI5 session, discovers controls, and clicks one', async () => {
    const started = await callStart({
      platform: 'ui5',
      browser: 'chrome',
      headless: true,
      baseUrl: UI5_APP_URL,
      wdi5: { waitForUI5Timeout: 30000 },
    }, {});
    expect(started.isError).toBeFalsy();
    expect(started.content[0].text).toContain('UI5 session started');

    const found = await callElements({ inViewportOnly: false, limit: 10 });
    expect(found.isError).toBeFalsy();
    // The tool emits toon, where the ui5 selector string is quote-escaped — assert presence only
    // and take the exact selector from the raw script result below.
    expect(found.content[0].text).toContain('ui5:');

    const raw = await getElements(getBrowser(), { inViewportOnly: false, limit: 10, ui5: true });
    const target = raw.elements
      .map((el) => (el as { selector?: string }).selector)
      .find((selector): selector is string => typeof selector === 'string' && selector.startsWith('ui5:'));
    expect(target).toBeDefined();

    const clicked = await callClick({ selector: target });
    expect(clicked.isError).toBeFalsy();
  }, 180000);
});