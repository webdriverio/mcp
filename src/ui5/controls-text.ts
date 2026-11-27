import { encode } from '@toon-format/toon';
import { getUi5Controls, type GetUi5ControlsOptions, type Ui5ControlInfo } from '../scripts/get-ui5-controls';
import { SNAPSHOT_MAX_CHARS } from '../utils/snapshot-text';
import { ensureUi5Injected } from './runtime';

const encodeControls = (controls: Ui5ControlInfo[]): string => encode(controls).replace(/,""/g, ',').replace(/"",/g, ',');

const truncatedText = (controls: Ui5ControlInfo[], kept: number): string =>
  encodeControls(controls.slice(0, kept)) +
  `\n… truncated: showing ${kept} of ${controls.length} UI5 controls; the rest is NOT in this output. Narrow with inViewportOnly: true and includeContainers: false.`;

export async function getUi5ControlsText(browser: WebdriverIO.Browser, options: GetUi5ControlsOptions): Promise<string> {
  await ensureUi5Injected(browser);
  const controls = await getUi5Controls(browser, options);
  const full = encodeControls(controls);
  if (full.length <= SNAPSHOT_MAX_CHARS) return full;

  let lo = 0;
  let hi = controls.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    [lo, hi] = truncatedText(controls, mid).length <= SNAPSHOT_MAX_CHARS ? [mid, hi] : [lo, mid - 1];
  }
  return truncatedText(controls, lo);
}
