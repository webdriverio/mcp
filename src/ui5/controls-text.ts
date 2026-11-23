import { encode } from '@toon-format/toon';
import { getUi5Controls, type GetUi5ControlsOptions } from '../scripts/get-ui5-controls';
import { truncateSnapshot } from '../utils/snapshot-text';
import { ensureUi5Injected } from './runtime';

export async function getUi5ControlsText(browser: WebdriverIO.Browser, options: GetUi5ControlsOptions): Promise<string> {
  await ensureUi5Injected(browser);
  const controls = await getUi5Controls(browser, options);
  return truncateSnapshot(encode(controls).replace(/,""/g, ',').replace(/"",/g, ','));
}
