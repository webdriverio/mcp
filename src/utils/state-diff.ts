export interface StateDelta {
  appeared: string[];
  disappeared: string[];
  changed: string[];
  urlChanged?: string;
  titleChanged?: string;
}

export async function captureStateDelta(
  browser: WebdriverIO.Browser,
  before: { selector?: string; text?: string }[],
  after: { selector?: string; text?: string }[],
  beforeUrl?: string,
  beforeTitle?: string,
): Promise<StateDelta> {
  const beforeMap = new Map<string, string>();
  const afterMap = new Map<string, string>();

  for (const el of before) {
    if (el.selector) beforeMap.set(el.selector, el.text ?? '');
  }
  for (const el of after) {
    if (el.selector) afterMap.set(el.selector, el.text ?? '');
  }

  const appeared = [...afterMap.keys()].filter((k) => !beforeMap.has(k));
  const disappeared = [...beforeMap.keys()].filter((k) => !afterMap.has(k));
  const changed = [...afterMap.keys()].filter((k) => beforeMap.has(k) && beforeMap.get(k) !== afterMap.get(k));

  // Capture current URL/title
  const { url, title } = await browser.execute(() => ({
    url: window.location.href,
    title: document.title,
  })) as { url: string; title: string };

  const delta: StateDelta = { appeared, disappeared, changed };

  if (beforeUrl !== undefined && url !== beforeUrl) {
    delta.urlChanged = url;
  }
  if (beforeTitle !== undefined && title !== beforeTitle) {
    delta.titleChanged = title;
  }

  return delta;
}
