export interface PageInfo {
  url?: string;
  title?: string;
}

/** URL and title of a browser page; empty for apps and on errors */
export async function pageInfo(browser: WebdriverIO.Browser): Promise<PageInfo> {
  if (browser.isMobile && browser.isNativeContext) return {};
  try {
    return { url: await browser.getUrl(), title: await browser.getTitle() };
  } catch {
    return {};
  }
}

/**
 * A line naming the page an action ended on, when it differs from the page
 * before. Saves the agent a screenshot or element listing just to find out
 * whether a click navigated.
 */
export async function pageChange(browser: WebdriverIO.Browser, before: PageInfo): Promise<string> {
  const after = await pageInfo(browser);
  if (!after.url || (after.url === before.url && after.title === before.title)) return '';
  return `\nPage: ${after.url}${after.title ? ` "${after.title}"` : ''}`;
}
