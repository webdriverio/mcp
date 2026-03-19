export interface StateSignature {
  url: string;
  title: string;
  elementCount: number;
  documentReady: boolean;
}

const POLL_INTERVAL_MS = 200;
const STABLE_DURATION_MS = 500;
const TIMEOUT_MS = 5000;

export async function captureSignature(browser: WebdriverIO.Browser): Promise<StateSignature> {
  return browser.execute(() => ({
    url: window.location.href,
    title: document.title,
    elementCount: document.querySelectorAll('*').length,
    documentReady: document.readyState === 'complete',
  })) as Promise<StateSignature>;
}

function signaturesEqual(a: StateSignature, b: StateSignature): boolean {
  return a.url === b.url && a.title === b.title && a.elementCount === b.elementCount && a.documentReady === b.documentReady;
}

export async function waitForStability(browser: WebdriverIO.Browser): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;
  let stableSince: number | null = null;
  let last: StateSignature | null = null;

  while (Date.now() < deadline) {
    let sig: StateSignature;
    try {
      sig = await captureSignature(browser);
    } catch {
      return; // Browser disconnected or session ended — proceed without stability check
    }
    if (last && signaturesEqual(last, sig)) {
      stableSince ??= Date.now();
      if (Date.now() - stableSince >= STABLE_DURATION_MS) return; // stable
    } else {
      stableSince = null;
    }
    last = sig;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  // Timeout — proceed anyway
}
