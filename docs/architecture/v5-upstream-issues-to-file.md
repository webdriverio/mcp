# `@wdio/mcp` v5 — upstream issues to file

Status: not filed. Paste each section's title and body into the repo named in the table. 9 items go to `webdriverio/webdriverio` (S1-S6, W1-W3) and 8 to `webdriverio/devtools` (D1-D8). The `<ID> —` heading prefix and the prototype line are not pasted. Cross-references (for example "see the launch API issue") get real issue numbers back-filled after filing. Labels are suggestions; non-maintainers may not be able to set them.

| ID | Title | Repo | Label |
| --- | --- | --- | --- |
| S1 | Export an in-process launch API (`@wdio/session/launch`) with hook injection | `webdriverio/webdriverio` | `Enhancement` |
| S2 | Emit action events from `AgentSession` (`onAction` option or an emitter) | `webdriverio/webdriverio` | `Enhancement` |
| S3 | Add Digital.ai as a cloud provider | `webdriverio/webdriverio` | `Enhancement` |
| S4 | `exec` action: return `code` in the result and accept arguments | `webdriverio/webdriverio` | `Enhancement` |
| S5 | Public exporter for a standalone script with a launch preamble | `webdriverio/webdriverio` | `Enhancement` |
| S6 | Agent-generated frame code is TypeScript, not JavaScript | `webdriverio/webdriverio` | `Bug 🐛` |
| D1 | Standalone: `setupForDevtools()` cannot select trace mode | `webdriverio/devtools` | `bug` |
| D2 | Trace mode writes "DevTools trace saved to …" to stdout | `webdriverio/devtools` | `bug` |
| D3 | Console and stream patching is process-wide and never restored | `webdriverio/devtools` | `bug` |
| D4 | Finalize a trace without ending the session | `webdriverio/devtools` | `enhancement` |
| D5 | Option to write traces to an exact directory (no `test-results/` suffix) | `webdriverio/devtools` | `enhancement` |
| D6 | Published `.d.ts` files import `../packages/*/src`, which is not in the tarball | `webdriverio/devtools` | `bug` |
| D7 | Accept `@wdio/session` action events as a step source | `webdriverio/devtools` | `enhancement` |
| D8 | Clarify support for classic (non-BiDi) sessions in trace mode | `webdriverio/devtools` | `documentation` |
| W1 | BiDi `getCookies()` returns only Secure cookies when any Secure cookie is set (Chrome) | `webdriverio/webdriverio` | `Bug 🐛` |
| W2 | `remote({ afterCommand: fn })` throws `Expected option "afterCommand" to be type of object` | `webdriverio/webdriverio` | `Bug 🐛` |
| W3 | Failed `remote()` session creation leaks the auto-started chromedriver | `webdriverio/webdriverio` | `Bug 🐛` |

---

### S1 — Export an in-process launch API (`@wdio/session/launch`) with hook injection

**Problem:** `@wdio/session` can plan and start a browser for a target, a `wdio.conf` or a cloud provider, but only its CLI and daemon can reach that code; an in-process caller must keep its own copy of the target and provider logic.
**Proposal:** Export `buildPlan` and `launch` from `@wdio/session/launch`; `launch` accepts caller hooks/services and extra `remote()` options; make the daemon-only setup (viewport, headless user agent, initial navigation, driver process-group kill, bounded `deleteSession`, close-all, replace ordering) available in-process; add per-close detach, cloud result marking at close, and tunnel start/stop with generated names and reuse for Sauce Labs, TestMu and TestingBot. Optional: a fail-fast wait for `debuggerAddress` (polls `/json/version` for up to 10 s; about 150-200 ms per attach; not race-proofing).
Default and naming drifts to decide:
- Naming: session uses `LT_USERNAME`, `LT_ACCESS_KEY` and `LT:Options` (`src/targets/cloud.ts:98-100`); MCP uses `TESTMU_USERNAME`, `TESTMU_ACCESS_KEY` and `lt:options` (`src/providers/cloud/testmu.provider.ts:19-20`, `:48`).
- Sauce Labs default region: session uses `us-west-1` (`src/targets/cloud.ts:141`); MCP uses `eu-central-1` (`src/providers/cloud/saucelabs.provider.ts:15`, `:138`).
- BrowserStack hub: session uses `hub.browserstack.com` for every platform (`src/targets/cloud.ts:52`); MCP uses `hub-cloud.browserstack.com` for mobile (`src/providers/cloud/browserstack.provider.ts:13`).
- Viewport: session uses 1280x720 (`src/constants.ts:11`); MCP uses 1280x800 (`src/providers/local-browser.provider.ts:36-37`).
- `autoAcceptAlerts`: session uses `false` for non-Android targets (`src/targets/mobile.ts:73`); MCP uses the caller's value, defaulting to `true`, unless `autoDismissAlerts` is set (`src/providers/cloud/saucelabs.provider.ts:91`, `testmu.provider.ts:86`, `testingbot.provider.ts:78`).
- Local defaults: user `args` replace built-ins, retry/BiDi timeouts, `networkLogs`, Electron without an app path.

**Evidence:** `@wdio/session` 10.2.0 (tag `v10.2.0`, paths under `packages/wdio-session/`): `package.json:10-30` has no `./launch` export; `buildPlan` (`src/targets/index.ts:39`) and `launch` (`src/targets/launch.ts:31`) are not re-exported by `src/index.ts` or `src/agent.ts`; `launch()` already returns `{ browser, pids, cleanup }` (`src/targets/launch.ts:16-23`). MCP paths are relative to `webdriverio/mcp` at `982d6e7`. Prototype ready; PR to follow.

### S2 — Emit action events from `AgentSession` (`onAction` option or an emitter)

**Problem:** A recorder that wants one step per agent action cannot observe actions run through `AgentSession`; `history` holds only steps that record code, without duration, page change or errors.
**Proposal:** A public subscription, `createAgentSession(browser, { onAction })` or `agent.on('action', …)`, fired once per dispatched action, including failed actions and actions that record no code. Event shape (names open): `phase` (`'before' | 'after'`), `id` (same on both phases), `action`, `args`, `startedAt` (epoch ms); `after` adds `durationMs`, `code`, `changes`, `page`, and `error` (`{ code, message }`).
**Evidence:** `@wdio/session` 10.2.0 (tag `v10.2.0`): `AgentSessionOptions` (`src/agent.ts:28-64`) has no callback and `AgentSession` exposes only the `history` getter (`src/agent.ts:228`); `HistoryEntry` (`src/types.ts:169-180`) carries `n`, `time`, `kind`, `code`, `action`, `args`, `path` only. `dispatch` already reads `trace` and calls `before`/`after` (`src/session.ts:325-327`, `:414`), but that hook is internal, not a public option. Prototype ready; PR to follow.

### S3 — Add Digital.ai as a cloud provider

**Problem:** `@wdio/session` supports BrowserStack, Sauce Labs, TestingBot and TestMu; Digital.ai Testing is missing, so Digital.ai users would lose their provider when MCP launches through `@wdio/session`.
**Proposal:** Accept `digitalai` in `--provider` and in the launch plan for browser and mobile targets; read host and access key from `DIGITALAI_CLOUD_URL` / `DIGITALAI_ACCESS_KEY` (or state the names session prefers); support mobile `deviceQuery` and `cloud:<name>` app references; result marking if cloud result marking lands (see the launch API issue).
**Evidence:** `CloudProviderId` is `'browserstack' | 'saucelabs' | 'testingbot' | 'testmu'` (`packages/wdio-session/src/targets/cloud.ts:13`). `@wdio/mcp` 4.1.0 at `982d6e7` has a port source, `src/providers/cloud/digitalai.provider.ts` (165 lines): host from `DIGITALAI_CLOUD_URL`, normalised to a hostname, `https`, port 443, path `/wd/hub`; key as `digitalai:accessKey` (web) or inside `digitalai:options` (mobile); marking via `browser.execute('seetest:client.setReportStatus', status, message)`. MCP's provider has no tunnel support, so none is requested here.

### S4 — `exec` action: return `code` in the result and accept arguments

**Problem:** Other agent actions return the WebdriverIO code they ran in `AgentActionResult.code`; `exec` records its code in history but does not return it, so callers building a script from action results must special-case `exec`. `exec` also takes only source text, so values must be serialised into the code string.
**Proposal:** `exec` sets `code` on its result to the text it records (absent when nothing is recorded, e.g. `history: false` or read-only code); accept an optional `args` array the code can read (JSON values at minimum); recorded and returned code runs standalone when `args` are passed (inlined or declared).
**Evidence:** `@wdio/session` 10.2.0 (tag `v10.2.0`): `exec` returns `{ text, data, files, history }` (`src/actions/exec.ts:150-155`); `dispatch` appends `outcome.history` then removes it from the returned object (`src/session.ts:405-415`); `AgentActionResult.code` is optional (`src/agent/types.ts:62`).

### S5 — Public exporter for a standalone script with a launch preamble

**Problem:** The exporter turns a session history into a test-runner spec. A consumer that needs a script runnable with plain `node` (its own `remote()`, or `startWdioSession()` for Electron) cannot get one, and cannot reuse the exporter in-process because it is not exported.
**Proposal:** Either an exporter mode that emits a standalone script (launch preamble built from the plan/capabilities, recorded steps, session teardown), or `generateSpec` (or a lower-level render-steps function) exported from a public subpath with a hook for the caller's preamble and wrapper. Both return the text without writing files and keep the existing spec output unchanged.
**Evidence:** `@wdio/session` 10.2.0 (tag `v10.2.0`): `generateSpec` (`src/export/spec.ts:244`) is called only by the `export` action (`src/actions/export.ts:30`) and is not re-exported from `src/index.ts` or `src/agent.ts`; its output starts with `import { browser, …, expect } from '@wdio/globals'` (`src/export/spec.ts:306`), wraps steps in `describe`/`it` (`:319-320`), and never emits `remote()` or capabilities.

### S6 — Agent-generated frame code is TypeScript, not JavaScript

**Problem:** The agent's `frame` action returns WebdriverIO code with a TypeScript non-null assertion; generated code runs as JavaScript, so any script that switches frames fails to parse.
**Proposal:** Emit valid JavaScript with no type assertions, or add an output option (for example `'js' | 'ts'`) so a JavaScript consumer gets JavaScript.
**Evidence:** `@wdio/session` 10.2.0 (tag `v10.2.0`): `pageExpression` appends `!` in both the `.filter(...)[index]!` and `.find(...)!` forms (`src/actions/contexts.ts:172-173`), and frame declarations build on that variable (`declareHeld`, `:341-366`). Measured (Node 24.22.1, webdriverio 10.2.0, headless Chrome 149): `SyntaxError: Unexpected token '!'`.

### D1 — Standalone: `setupForDevtools()` cannot select trace mode

**Problem:** The README documents `remote(setupForDevtools({...}))` with `mode: 'trace'`, but the standalone entry point takes no service options, so a standalone session cannot record a trace through it.
**Proposal:** `setupForDevtools(opts, serviceOptions)` or an equivalent documented entry point accepting `ServiceOptions`; either honour `wdio:devtoolsOptions.mode` or document that it is ignored; the README standalone snippet runs as written; a way to attach to a browser something else created (a returned service handle, or `attach(browser)`).
**Evidence:** `@wdio/devtools-service` 11.2.0, `webdriverio` 10.2.0, headless Chrome 149 (2026-11-14, one machine; source `5c7d21a6`): `setupForDevtools(opts)` calls `new DevToolsHookService()` with no arguments (`packages/service/src/standalone.ts:42-46`). The mode is read from service options, `this.#options.mode ?? 'live'` (`packages/service/src/index.ts:254`), while `wdio:devtoolsOptions` reaches only the `SessionCapturer` constructor (`index.ts:251-253`). With `wdio:devtoolsOptions: { mode: 'trace' }` the session ran, exited 0, and wrote no trace; a trace is written with `new DevToolsHookService({ mode: 'trace' })`. `setupForDevtools({ capabilities: { ... } })` fails with `SevereServiceError: The DevTools hook does not support multiremote yet` (`standalone.ts:50`, `index.ts:357-359`).

### D2 — Trace mode writes "DevTools trace saved to …" to stdout

**Problem:** On trace finalize the service writes a line to `process.stdout`. A host that uses stdout as a protocol channel (an MCP server on stdio, a JSON-lines tool, a language server) receives that line inside its protocol stream.
**Proposal:** No unconditional stdout write from the service (route the message through the logger, stderr), or an option to turn the announcement off; and the saved paths available programmatically (finalize return value or callback).
**Evidence:** `@wdio/devtools-service` 11.2.0, `webdriverio` 10.2.0 (2026-11-14, one machine; source `5c7d21a6`): `#announceTraces()` calls `process.stdout.write` once per retained trace (`packages/service/src/index.ts:1001-1004`), from `after()` (`:997`). Measured, the only stdout the service added was the `DevTools trace saved to <path>` line; when `after()` ran before `deleteSession()` it printed three times for one file. Not checked: whether an existing option suppresses it.

### D3 — Console and stream patching is process-wide and never restored

**Problem:** The service replaces `console.*`, `process.stdout.write` and `process.stderr.write` for the whole process at construction and never restores the originals. With two overlapping sessions, a line logged after session A closed while B was open was missing from B's trace (observed once).
**Proposal:** Patch when capture starts for a session, not at construction; restore the exact original functions when the last capturing session finalizes; define and test attribution with concurrent sessions; an option to disable Node-side console/stream capture.
**Evidence:** `@wdio/devtools-service` 11.2.0, `webdriverio` 10.2.0 (2026-11-14; source `5c7d21a6`): `SessionCapturer` constructor calls `patchConsole()` and `patchStreams()` (`packages/service/src/session.ts:94-97`); one capturer is a field initialiser (`packages/service/src/index.ts:93`), a second is created in `before()` (`:251`), and `after()` cleans up only the second (`:996`). `console.log` and `process.stdout.write` were not the original functions after `deleteSession()` (`===` against references taken beforehand). The second capturer's saved originals (`packages/core/src/session-capturer.ts:84`, `:205`) are taken after the first has patched, so its cleanup (`:752`, `:758`) restores patched functions and nothing restores the process originals.

### D4 — Finalize a trace without ending the session

**Problem:** In standalone use a trace is written only when `deleteSession` is issued. A host that detaches and leaves the browser running (an attached session, a user's own Chrome) has no supported call to write the trace.
**Proposal:** A documented finalize call reachable from the standalone API (for example a handle returned next to the options); finalize is idempotent, so after an explicit finalize `deleteSession()` does not write or announce again unless new steps were captured; documented behaviour for commands issued after finalize; finalize resolves with the written path(s).
**Evidence:** `@wdio/devtools-service` 11.2.0, `webdriverio` 10.2.0 (one run, 2026-11-14; source `5c7d21a6`): `after()` is public (`packages/service/src/index.ts:978`), but `setupForDevtools()` keeps the service in a local variable and returns only the options (`standalone.ts:46`, `:84`). The standalone hook calls `service.after()` on `deleteSession` (`standalone.ts:72-73`). With a hand-built service, `after()` wrote `trace-<sessionId>.zip` and the browser stayed usable; a later `deleteSession()` rewrote the same file and printed `DevTools trace saved to …` three times in total.

### D5 — Option to write traces to an exact directory (no `test-results/` suffix)

**Problem:** The trace location can be moved with `outputDir`, but a `test-results/` segment is always appended. `outputDir` is also WebdriverIO's option that redirects driver logs, so using it to place the trace moves those too.
**Proposal:** A service option (for example `traceDir`) used as the exact directory with nothing appended; independent of WebdriverIO's `outputDir`; default behaviour (`test-results/` under the resolved base) unchanged; optionally a file-name option or callback.
**Evidence:** `@wdio/devtools-service` 11.2.0, `webdriverio` 10.2.0 (2026-11-14; source `5c7d21a6`): `resolveAdapterOutputDir` returns `path.join(resolveBaseDir(input), OUTPUT_SUBDIR)` with `OUTPUT_SUBDIR = 'test-results'` (`packages/core/src/output-dir.ts:29`, `:61-65`); the base is `browser.options.outputDir || rootDir` (`packages/service/src/index.ts:1041-1047`). With `remote({ outputDir })` the trace went to `<outputDir>/test-results/` and `wdio-chromedriver-34619.log` appeared in `<outputDir>`.

### D6 — Published `.d.ts` files import `../packages/*/src`, which is not in the tarball

**Problem:** The declaration files in the published `@wdio/devtools-service` reference workspace source paths that are not shipped. TypeScript consumers get unresolved-module errors, and with `skipLibCheck` the option types degrade so that `mode` is not a known property of `ServiceOptions`.
**Proposal:** Self-contained declarations (bundled, or the referenced packages published and imported by name); a consumer type-check of the packed tarball in CI without `skipLibCheck`; `ServiceOptions.mode` and the other documented options visible to consumers; `setupForDevtools` typed so the README call shape compiles.
**Evidence:** `@wdio/devtools-service` 11.2.0 from npm, TypeScript 6.0.3, `module`/`moduleResolution: NodeNext`, `strict` (2026-11-14, one machine): `dist/types.d.ts` lines 1-4 import `'../packages/shared/src/index.ts'` and `'../packages/elements/src/index.ts'`, other `dist/*.d.ts` import `'../packages/core/src/index.ts'`, and `node_modules/@wdio/devtools-service/packages` does not exist (`error TS2307: Cannot find module '../packages/elements/src/index.ts'`). `setupForDevtools(opts: Options.WebdriverIO)` also rejects `{ capabilities }`, because `@wdio/types` 10.2.0 has no `capabilities` property on that type; a control without devtools-service shows the same error.

### D7 — Accept `@wdio/session` action events as a step source

**Problem:** Trace steps are derived from WebDriver commands. An agent driving the browser through `@wdio/session` performs one logical action (click a ref, fill a field) as several commands, so the trace shows command rows, not the action, its arguments or its generated code.
**Proposal:** A documented call on the service (or its handle) that accepts a before/after action event and records it as one step, with the WebDriver commands issued in between nested under it; the step keeps the action name, arguments, generated code and error in `trace.trace` and `transcript.md`; snapshot and screenshot capture tied to action boundaries; a versioned event shape agreed with `@wdio/session`. The same call must accept steps from a caller that is not `@wdio/session` (for example MCP's `execute_script` or `mock` tools, which call WebdriverIO directly), so those calls keep a step of their own.
**Evidence:** `@wdio/devtools-service` 11.2.0 (source `5c7d21a6`): the standalone entry wires only `beforeCommand`/`afterCommand` (`packages/service/src/standalone.ts:52-82`); exported trace actions are built from the command log (`buildActionEvents`, `packages/trace/src/trace-action-events.ts:386`). No API in `packages/*/src` accepts externally produced action events; `@wdio/session` 10.2.0 does not emit them yet (see the action events issue in `webdriverio/webdriverio`).

### D8 — Clarify support for classic (non-BiDi) sessions in trace mode

**Problem:** The docs do not say whether trace mode supports sessions without WebDriver BiDi. The service logs an error at session start, then continues and writes a trace, so a consumer cannot tell whether the result is complete.
**Proposal:** State in the docs whether classic sessions are supported and which trace parts are absent or reduced (mutations, console, network, filmstrip); if supported, log the missing injection below ERROR level, once, with what is affected; if not, fail in a way the caller can detect before any command runs, or expose a capability check; add a conformance case for a classic session.
**Evidence:** `@wdio/devtools-service` 11.2.0, `webdriverio` 10.2.0, headless Chrome 149 with `'wdio:enforceWebDriverClassic': true` (2026-11-14, one machine; source `5c7d21a6`): `#injectScriptSync` throws `SevereServiceError` when `!browser.isBidi` (`packages/service/src/index.ts:1052-1057`), and the caller logs it (`:282-289`); injection is skipped entirely for Appium sessions (`isAppiumSession` check, `:282`). Measured: stderr `ERROR @wdio/devtools-service: Failed to inject script at session start: Can not set up devtools for session with id "…" because it doesn't support WebDriver Bidi`; exit 0; a trace was written with the same entry types as the BiDi run, with `trace.mutations` at 16683 bytes against 18524 (completeness not assessed).

### W1 — BiDi `getCookies()` returns only Secure cookies when any Secure cookie is set (Chrome)

**Problem:** On a BiDi Chrome session, `browser.getCookies()` with no `sourceOrigin` reads the `storageKey` partition of the page origin (`commands/browser/getCookies.ts:85`, `utils/cookiePartition.ts:106`). Chrome stores only Secure cookies in that partition, and the classic fallback runs only when the BiDi result is empty (`commands/browser/getCookies.ts:125`), so one Secure cookie hides every other cookie. Without one, BiDi `getCookies()` returns everything, because the empty-result fallback runs. Cookies stored by `setCookies`' classic fallback are unpartitioned (note `commands/browser/setCookies.ts:121-122`; fallback `:131-133`). Expected: the cookies visible to the current page, as classic returns them.
**Proposal:** Read without a partition (or with a `context` partition) and filter by the page URL, as the window-scope path already does with `cookieMatchesUrl`; or merge the partitioned result with the unpartitioned one instead of falling back only on empty.
**Evidence:** webdriverio 10.2.0 (tag `v10.2.0`, paths under `packages/webdriverio/src/`), chromedriver 149.0.7827.155, headless, page on `http://127.0.0.1:<port>/`: after `setCookies` of `c_plain`, `c_secure` (secure) and `c_http` (httpOnly), `getCookies()` returns `['c_secure']` and `getCookies(undefined, null)` returns all three; with `wdio:enforceWebDriverClassic: true` all three are returned. Same pattern on an https page in 10.1.0 and 10.2.0. Not verified: Chrome's reason for the partitioning, and Firefox.

### W2 — `remote({ afterCommand: fn })` throws `Expected option "afterCommand" to be type of object`

**Problem:** `remote()` types `beforeCommand`/`afterCommand` as a function or an array, but at runtime a single function fails validation: `Error: Expected option "afterCommand" to be type of object but was function`. Passing `[fn]` works.
**Proposal:** Accept a function as the testrunner does (`ConfigParser.addService` normalises function-or-array hooks over `SUPPORTED_HOOKS`), or narrow the type to arrays.
**Evidence:** Upstream `main` `4ef7adc33`, Chrome headless: `remote({ capabilities: { browserName: 'chrome' }, afterCommand: () => {} })` rejects. The defaults declare these hooks as `[]` (`packages/wdio-config/src/constants.ts:68-69`), so `validateConfig` expects an object. Not checked: other hooks in the `remote()` options type.

### W3 — Failed `remote()` session creation leaks the auto-started chromedriver

**Problem:** When `remote()` starts chromedriver itself and `POST /session` fails, the chromedriver process keeps running after `remote()` rejects. The caller has no browser object, so it has no `wdio:driverPID` to kill.
**Proposal:** Stop the driver process that `remote()` started when session creation fails.
**Evidence:** Upstream `main` `4ef7adc33`, Chrome 149, Linux: `remote()` with `goog:chromeOptions.debuggerAddress` pointing at a port nothing listens on rejects after about 60 s with `session not created: cannot connect to chrome at localhost:<port>` and leaves one chromedriver running (3/3 runs). The leak is inferred from the process count, not traced in code. Not checked: geckodriver, msedgedriver, other failure causes.
