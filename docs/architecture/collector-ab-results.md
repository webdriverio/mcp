# Collector A/B results: `get_elements` collector vs `@wdio/session` agent snapshot (web only)

Run date: 2026-11-14. Versions: `webdriverio` 10.2.0 and `@wdio/session` 10.2.0 (from this repo's `node_modules`), Chrome 149.0.7827.155, headless, window 1280x800.

## Verdict

No `get_elements` switch in v4.x. `get_elements` is registered only for ios, android and electron sessions (`src/toolsets.ts`, line 17: `get_elements: ['ios', 'android', 'electron']`), so a web-page A/B does not measure a path that tool serves. The web numbers below can only inform the browser `elements` and `accessibility` resources, which still use the web collector. The mobile half, which is the half that would bear on `get_elements`, was not run.

## Mobile half: NOT RUN

No adb, no Appium binary and no iOS simulator on the Linux host.

## What was measured

Per page, the same live browser session was used for both collectors:

- OLD: `getElements(browser, { inViewportOnly: false, includeContainers: false, includeBounds: false, limit: 0, offset: 0 })` from `src/scripts/get-elements.ts` (the `get_elements` tool defaults), output encoded as the tool does.
- NEW: `agent.snapshot({ interactive: true, maxChars: 1e9 })` on an agent session created with `recordPage: true`. Count is `snapshot.refs`, size is `snapshot.text`. Each ref was resolved to a selector with `refs.stableSelector`.
- Metrics: element count, output characters, collector wall-clock time, selector uniqueness (`$$(sel).length === 1`), selector uniqueness again after a reload, and coverage by DOM node identity (which collector's selectors reach elements the other misses).
- Characters are reported as measured. Divide by 4 for a rough token estimate; no tokenizer was run. NEW ms covers the snapshot call only, not stable-selector resolution (MDN selector resolution took 150 s, other pages 0.04 to 6 s).

Pages were visited in this order: example.com, Wikipedia (WebdriverIO), webdriver.io getting started, MDN `<input>` reference, Hacker News, the-internet login, tables and dropdown, TodoMVC (React), and the WebdriverIO GitHub repository.

Sample size: n = 1 run over 9 pages. A second run was planned and never started. Only large differences are detectable, and the pages are live public sites.

| page | OLD n | NEW n | OLD chars | NEW chars | OLD ms | NEW ms | OLD unique sel | NEW unique sel | both | OLD only | NEW only |
|---|---|---|---|---|---|---|---|---|---|---|---|
| example.com | 1 | 1 | 176 | 83 | 12 | 355 | 100% | 100% | 1 | 0 | 0 |
| en.wikipedia.org/wiki/WebdriverIO | 52 | 64 | 5872 | 2981 | 21 | 424 | 98% | 100% | 51 | 1 | 13 |
| webdriver.io/docs/gettingstarted | 141 | 165 | 12690 | 10734 | 42 | 522 | 87% | 99% | 141 | 0 | 37 |
| developer.mozilla.org/en-US/docs/Web/HTML/Element/input | 657 | 1810 | 64711 | 111741 | 423 | 15244 | 67% | 91% | 530 | 9 | 1183 |
| news.ycombinator.com | 230 | 230 | 20876 | 13430 | 71 | 510 | 90% | 100% | 230 | 0 | 22 |
| the-internet.herokuapp.com/login | 7 | 8 | 486 | 618 | 10 | 351 | 100% | 100% | 7 | 0 | 1 |
| the-internet.herokuapp.com/tables | 20 | 33 | 1830 | 3394 | 12 | 360 | 20% | 100% | 20 | 0 | 21 |
| the-internet.herokuapp.com/dropdown | 5 | 6 | 430 | 485 | 9 | 369 | 100% | 100% | 5 | 0 | 1 |
| todomvc.com/examples/react/dist/ | 12 | 12 | 1141 | 841 | 12 | 348 | 100% | 100% | 12 | 0 | 0 |

Totals over the 9 pages: OLD 1125 elements and 108212 characters, NEW 2329 elements and 144307 characters. Pooled selector uniqueness (weighted by element count): OLD 75.3%, NEW 93.1%. Across all pages, 997 elements were matched by both collectors, 10 only by OLD and 1278 only by NEW. NEW output is smaller in characters than OLD on 5 of the 8 non-MDN pages and larger on the other 3 (the-internet login, tables, dropdown); MDN dominates the totals and goes the other way.

NEW is slower to collect on every page: 348 to 522 ms against 9 to 71 ms for OLD on the eight non-MDN pages, and 15244 ms against 423 ms on MDN.

## What the data did not cover

- The GitHub repository page was not measured. The run was cut short while the driver was still working on it: its chromedriver was killed from outside, and the ECONNREFUSED errors in the log on that page come from that kill, not from the collectors. It says nothing about GitHub. The driver then exited with an unhandled ECONNREFUSED while closing its session, after recording the GitHub page with only an error and no measurements, and the final results file held the same nine measured pages as the earlier snapshot plus that error entry; nothing was added to the tables.
- Run 2 never started, so there is no run-to-run noise estimate.
- On MDN, 1188 of the 1810 NEW selectors came from the fallback `candidates[0]` after the 150 s per-page validation budget ran out, plus 29 from a throwing resolver, so NEW's 91% uniqueness there is partly unvalidated. The shares for the other eight pages are fully validated.
- Mobile (ios, android, electron) was not run, and nothing here measures the Electron surface.
- The `accessibility` resource path (`getBrowserAccessibilityTree`) was collected as secondary data but is not tabulated here.
- Whether NEW's extra elements are useful to an agent, or just noise from a larger set, was not judged; only counts, sizes, times and selector validity were measured.
