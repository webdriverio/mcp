# `@wdio/mcp` v5 — upstream issue drafts

**Status: unposted drafts, written 2026-11-14.** Nothing here has been filed. Each section is meant to be copied by hand
into the named repository, so that the cross-repo work `@wdio/mcp` v5 depends on (see `v5-proposal.md`) becomes tracked
release criteria.

Versions the drafts were checked against:

- `@wdio/session` 10.2.0 — source read at tag `v10.2.0` (commit `5743972`) of the webdriverio monorepo. Paths in the
  session issues are relative to `packages/wdio-session/`.
- `@wdio/devtools-service` 11.2.0 with `webdriverio` 10.2.0 — behaviour measured on 2026-11-14 in
  `devtools-trace-probe-results.md` (one machine: Node 24.22.1, headless Chrome 149, Linux/WSL2, each probe run once).
  Source line references are to `webdriverio/devtools` at `5c7d21a6`, whose `packages/service/package.json` is 11.2.0.
- `@wdio/mcp` 4.1.0 at `982d6e7`, which depends on `@wdio/session` 10.1.0 and `webdriverio` 10.1.0 (exact pins).
- Launch parity: `provider-parity-matrix.md` (56 rows; 49 are `partial` or `absent`).

Where `v5-proposal.md` disagrees with the matrix or the probe, the matrix and the probe were used.

## Dependency order

| Issue | Needs first | Blocks |
| --- | --- | --- |
| S1 public `launch` | — | MCP's use of S3; D1 needs its hook/service injection point (or attach-after-launch) |
| S2 action events | — | D7 |
| S3 Digital.ai provider | independent to implement; consumed through S1 | — |
| S4 `exec` returns `code`, takes args | — | carried by S2 events once both exist |
| S5 public exporter | — | — |
| S6 JavaScript-valid frame code | — | — |
| D1 trace for a standalone session | — | D2–D5 and D8 are only reachable once D1 exists |
| D2 no stdout writes | D1 | — |
| D3 per-session console capture | D1 | — |
| D4 finalize without ending the session | D1 | — |
| D5 exact output path | D1 | — |
| D6 published types | — | typed use of D1 |
| D7 session action events as steps | S2 (published), D1 | — |
| D8 classic sessions | D1 | — |

MCP v5 needs S1, S2, D1, D2, D3, D4, D7 and D8 published at named versions. D4 and D8 are required because the
proposal's trace-swap acceptance criteria require no regression for attach/external (detached) sessions and for
sessions without BiDi. S3, S4, S5, S6, D5 and D6 each remove a workaround or a regression relative to MCP 4.1.0; the issue
text says which. S6 is a workaround remover, not a v5 blocker: until it lands, a script with a frame switch needs its
`!` removed by hand.

---

# `@wdio/session` (repo: `webdriverio/webdriverio`)

## S1. Public `launch` API

**Title:** Export an in-process launch API (`@wdio/session/launch`) with hook injection

**Target repo:** `webdriverio/webdriverio` (`packages/wdio-session`)

````markdown
**Problem**

`@wdio/session` can plan and start a browser for a target, a `wdio.conf` or a cloud provider, but only its CLI and
daemon can reach that code. A library that wants the same launch in-process must keep its own copy of the target and
provider logic, as `@wdio/mcp` does today.

**Evidence** (`@wdio/session` 10.2.0, tag `v10.2.0`, paths under `packages/wdio-session/`)

- `package.json:10-30` exports `.`, `./cli`, `./daemon`, `./agent`, `./package.json`; there is no `./launch`.
- `buildPlan` (`src/targets/index.ts:39`) and `launch` (`src/targets/launch.ts:31`) are not re-exported by
  `src/index.ts` or `src/agent.ts`.
- `launch()` already returns `{ browser, pids, cleanup }` (`src/targets/launch.ts:16-23`).
- Row-by-row comparison with `@wdio/mcp` 4.1.0: `docs/architecture/provider-parity-matrix.md` in `webdriverio/mcp`
  (49 of 56 rows `partial` or `absent`).

**Request**

- [ ] Export plan building and launch; accept caller hooks/services and extra `remote()` options (rows 15a-15c).
- [ ] Daemon/CLI-only behaviour available in-process: viewport, headless user agent, initial navigation, driver
      process-group kill, bounded `deleteSession`, close-all, replace ordering (1c, 1g, 1h, 4, 8c, 13a-13d, 15e, 15f).
- [ ] Attach to an existing session by id; CDP attach readiness (7a-7c).
- [ ] Detach chosen per close, with mocks released (5d, 6, 7d, 7e).
- [ ] Cloud result marking at close (11a-11f).
- [ ] Tunnel start/stop for Sauce Labs, TestMu and TestingBot, plus generated names and reuse (10a-10e).
- [ ] Naming/default drifts decided: `LT_*` and `LT:Options` vs `TESTMU_*`/`lt:options`, Sauce default region
      `us-west-1` vs `eu-central-1`, one BrowserStack hub, viewport 1280x720 vs 1280x800, `autoAcceptAlerts`
      (5a-5c, 9a-9d).
- [ ] Local defaults: user `args` replace built-ins, retry/BiDi timeouts, `networkLogs`, Electron without an app path
      (1d, 1e, 2a, 2b, 3, 8a). Say whether 12a-12b, 13c and 14 belong to launch or to the caller.

**Why it matters to @wdio/mcp**

MCP v5 plans to delete its provider table and call this API; the list is what would regress otherwise.
````

**Prototype of the first item (local, not pushed):** branch `feat/session-launch-api`, cut from upstream `main` at
`4ef7adc33`, uncommitted.
- **Exports:** a new `@wdio/session/launch` entry re-exports `buildPlan`, `launch`, and the types `OpenArgs`,
  `PlanContext`, `OpenPlan`, `Launched`, `LaunchOptions` and `SessionResult`.
- **`remoteOptions`:** `launch(plan, { remoteOptions })` merges extra `remote()` options. Hooks, services and timeouts
  are allowed; the plan's capabilities always win. The options are threaded into the webview `remote()` call. Electron
  and webview services that bring `startWdioSession` ignore them.
- **Callers own the setup:** `launch` does not navigate. Viewport, event capture and the other daemon setup steps stay
  with the caller.
- **Checks:**
  - `@wdio/session` unit tests: 645/645, with 5 new tests. The baseline was 640/640.
  - Typecheck, typings and oxlint: clean.
  - Real headless Chrome smoke run: `buildPlan`, then `launch` with an `afterCommand` hook, then `createAgentSession`,
    then `snapshot`, then `cleanup`. 20 commands were counted and no processes leaked.
- **Covered by this slice:** rows 15a-15c. The second slice below adds 7b and settles 7a; the third adds 11b-11e, with 11a caller-side and 11f blocked on 9e; every other item is still open.
- **Found while testing:** a single-function hook fails in `remote()` itself (W2).

**Second slice, attach (rows 7a-7c, same branch, local only):**

- **7b, debugger wait in `launch()`.** On a plan with `debuggerAddress`, `launch()` polls
  `http://<address>/json/version` for up to 10 s before calling `remote()`. Each request is bounded by the remaining
  time.
- **Measured** on real headless Chrome 149 under WSL2:
  - Attaching right after spawning Chrome succeeded 10/10 both with and without the wait. A Chrome spawned 4 s after
    the attach started succeeded 3/3 in both arms. **The start-up race the wait was meant for did not reproduce**:
    chromedriver retries the connection itself.
  - With no Chrome on the port, the wait rejects in about 10.2 s with `SESSION_START_FAILED`, and leaves no process
    behind (3/3).
  - Without the wait, `remote()` rejects in about 60 s with
    `session not created: cannot connect to chrome at localhost:<port>` and leaves one chromedriver running per
    failure (3/3; see W3).
  - **The wait's value is fail-fast and no leak, not race-proofing.** The cost is about 150-200 ms per attach.
- **Checks:** `@wdio/session` unit tests 649/649 (4 new for the wait, including cleanup on timeout); typecheck, typings
  and oxlint clean.
- **7a, attach by session id: no change needed in session.** The caller attaches with webdriverio `attach()`, then calls
  `createAgentSession`, and must not call `cleanup`. On real Chrome the snapshot worked both with the full capabilities
  and with `{ browserName: 'chrome' }` only. In the second case `isBidi` was false. Whether features that need BiDi
  degrade silently there was not checked.
- **Out of scope:** 7c (spawning Chrome with a debugging port) is a launcher of its own. MCP's stale BiDi mapper cleanup
  and tab restore are MCP heuristics with no recurrence evidence outside MCP.

**Third slice, cloud result marking (rows 11b-11e, same branch, local only):**

- **Added:** `launch()` result gains `markResult({ passed, reason? })`, implemented by `markCloudResult` in
  `packages/wdio-session/src/targets/cloud.ts`, with one entry per provider in the PROVIDERS table. No-op for non-cloud
  plans. API failure rejects with `SessionError` code `INTERNAL`. Sauce Labs with a hub host that does not match
  `ondemand.<region>.saucelabs.com` (lookalikes such as `ondemand.proxy.example.com` included) rejects with
  `NOT_SUPPORTED` before any request is sent.
- **Endpoints** mirror MCP's provider code: BrowserStack `PUT` to `automate/sessions` or `app-automate/sessions`
  (app-automate chosen by app session, `plan.applies.includes('M')`); Sauce Labs `PUT` to `api.<region>.saucelabs.com/rest/v1/<user>/jobs/<id>`;
  TestMu web `PATCH` and mobile `lambda-status=` execute; TestingBot `PUT` with a form body.
  Differences: session marks with the credentials stored on `plan.remote` (MCP reads them from env); session rejects on
  failure where MCP logs and continues, so MCP callers must catch; the Sauce Labs region comes from the hub hostname
  (MCP defaults to `eu-central-1`, `src/providers/cloud/saucelabs.provider.ts:138`).
- **Caller-side:** pass/fail derivation (11a) stays with the caller. MCP keeps `getSessionResult(history)` and passes
  the result to `markResult`.
- **Blocked:** 11f (Digital.ai) waits on porting the provider (9e).
- **Checks:** `@wdio/session` package tests 661/661 (12 new tests; was 649); typecheck and oxlint clean.
- **Real-cloud evidence (2026-11-15, read back from the sessions API):** BrowserStack iOS app (iPhone 15,
  `BStackSampleApp.ipa`, App Automate) and desktop Chrome / Windows 11 (Automate): failed with reason and passed both
  read back correctly. iOS Safari (iPhone 15, Automate): before the fix the mark got HTTP 404 from app-automate and was
  not applied; after the fix it reads back failed with reason. Sauce Labs, TestMu and TestingBot are stub-tested only,
  unverified against their live APIs.
- **Finding for MCP (code reading, not run):** `src/providers/cloud/browserstack.provider.ts` `getSessionType` (lines
  80-84) returns `ios`/`android` for mobile browser sessions too, and `onSessionClose` (around line 126) then picks
  app-automate for them, the same misrouting as the iOS Safari 404 above.

## S2. Action events on the agent

**Title:** Emit action events from `AgentSession` (`onAction` option or an emitter)

**Target repo:** `webdriverio/webdriverio` (`packages/wdio-session`)

````markdown
**Problem**

A recorder that wants one step per agent action has no way to observe actions run through `AgentSession`. It can only
wrap every `run()` call itself or poll `history`, and `history` holds only the steps that recorded code, without
duration, page change or errors.

**Evidence** (`@wdio/session` 10.2.0, tag `v10.2.0`, paths under `packages/wdio-session/`)

- `AgentSessionOptions` (`src/agent.ts:28-64`) has no callback; `AgentSession` exposes the pull-style `history` getter
  (`src/agent.ts:228`) and no emitter.
- `HistoryEntry` (`src/types.ts:169-180`) carries `n`, `time`, `kind`, `code`, `action`, `args`, `path` only.
- A before/after probe already exists internally: `dispatch` reads `trace` from the session store and calls
  `before(action, args)` / `after(action, args, outcome)` (`src/session.ts:325-327`, `:414`). It is not a public option.

**Request**

- [ ] A public subscription, either `createAgentSession(browser, { onAction })` or `agent.on('action', …)`.
- [ ] Fired once per dispatched action, including failed ones and ones that record no code.
- [ ] A documented, versioned event shape. Proposal only, names open:

```ts
interface AgentActionEvent {
    phase: 'before' | 'after'
    /** same id on both phases */
    id: string
    action: string
    args: Record<string, unknown>
    startedAt: number            // epoch ms
    durationMs?: number          // after
    code?: string                // after: generated WebdriverIO code
    changes?: PageChange         // after
    page?: PageInfo              // after
    error?: { code: string; message: string }
}
```

**Why it matters to @wdio/mcp**

MCP v5 plans to drop its own trace recorder and feed one step per agent action to a devtools recorder; this event is
that feed.
````

**Prototype (local, not pushed):** branch `feat/session-action-events`, cut from upstream `main` at `4ef7adc33`, uncommitted.
- **API:** `createAgentSession(browser, { onAction })`. Public `Session.dispatch` wraps the unchanged body, which is now private `#dispatch`. This covers early failures (unknown, unsupported or dialog-blocked actions, `limitPageLoad`) and abandoned timeouts.
- **Skipped events:** none are emitted without a handler. Nested `$internal` snapshots inside `exec` are skipped.
- **Event shape:**
  - `id` is a per-session number, not a string.
  - `$`-prefixed keys are removed from `args`.
  - `error.code` is the session `ErrorCode`.
- **Handlers:** a handler that throws or rejects never affects the action.
- **Checks:** `@wdio/session` unit tests 648/648 (baseline 640/640 on the same base), with 7 new tests. Typecheck and oxlint are clean. `test:e2e:session`: 28 of 29 files and 191 of 192 tests passed, with 1 skipped. The failing file is `electron.test.ts` ("Chrome instance exited"). The same test fails the same way on a clean `main`, so the failure comes from the WSL host and not from this change.

## S3. Digital.ai as a cloud provider

**Title:** Add Digital.ai as a cloud provider

**Target repo:** `webdriverio/webdriverio` (`packages/wdio-session`)

````markdown
**Problem**

`@wdio/session` supports four cloud providers. `@wdio/mcp` supports those four and Digital.ai Testing. If MCP moves
its launch onto `@wdio/session`, Digital.ai users lose their provider unless session gains it.

**Evidence** (`@wdio/session` 10.2.0, tag `v10.2.0`; `@wdio/mcp` 4.1.0 at `982d6e7`)

- `CloudProviderId` is `'browserstack' | 'saucelabs' | 'testingbot' | 'testmu'`
  (`packages/wdio-session/src/targets/cloud.ts:13`).
- MCP's implementation is `src/providers/cloud/digitalai.provider.ts` in `webdriverio/mcp` (165 lines) and can be
  ported. It covers: host from `DIGITALAI_CLOUD_URL` normalised to a hostname, `https`, port 443, path `/wd/hub`;
  `DIGITALAI_ACCESS_KEY` sent as a capability (`digitalai:accessKey` for web, inside `digitalai:options` for mobile);
  mobile `deviceQuery`; `cloud:<name>` app references; result marking through
  `browser.execute('seetest:client.setReportStatus', status, message)`.
- Parity matrix rows 9e and 11f (`docs/architecture/provider-parity-matrix.md` in `webdriverio/mcp`) mark both
  `absent` on the session side.
- MCP's provider has no tunnel support, so none is requested here.

**Request**

- [ ] `digitalai` accepted by `--provider` and by the launch plan for browser and mobile targets.
- [ ] Credentials and host read from `DIGITALAI_CLOUD_URL` / `DIGITALAI_ACCESS_KEY`, or state the names session
      prefers.
- [ ] `deviceQuery` and `cloud:<name>` app references supported for mobile.
- [ ] Result marking, if cloud result marking lands in session (see the launch API issue).

**Why it matters to @wdio/mcp**

It is the one provider MCP has that session lacks. MCP can contribute the port.
````

## S4. `exec` result and arguments

**Title:** `exec` action: return `code` in the result and accept arguments

**Target repo:** `webdriverio/webdriverio` (`packages/wdio-session`)

````markdown
**Problem**

Other agent actions return the WebdriverIO code they ran in `AgentActionResult.code`. `exec` records its code in the
history but does not return it, so a caller that builds a script from action results has to special-case `exec`.
`exec` also takes only source text; values cannot be passed in without serialising them into the code string.

**Evidence** (`@wdio/session` 10.2.0, tag `v10.2.0`, paths under `packages/wdio-session/`)

- `exec` returns `{ text, data, files, history }` (`src/actions/exec.ts:150-155`). `history` is the ref-rewritten
  source.
- `dispatch` appends `outcome.history` to the history and then removes it from the returned object
  (`src/session.ts:405-415`), so the result has no `code` field for `exec`.
- `AgentActionResult.code` exists and is optional (`src/agent/types.ts:62`).
- Inputs read by `exec` are `args.code`, `args.filename` and `args.history` (`src/actions/exec.ts:97-98`, `:149`); the
  CLI options are `-e` and `--history` (`src/actions/specs.ts:182-192`).

**Request**

- [ ] `exec` sets `code` on its result to the same text it records in the history (absent when nothing is recorded,
      e.g. `history: false` or read-only code).
- [ ] `exec` accepts an optional `args` array that the code can read (for example as `args` in scope), JSON values at
      minimum.
- [ ] The recorded/returned code is runnable on its own when `args` were passed (values inlined or declared).

**Why it matters to @wdio/mcp**

MCP's `execute_script` tool takes a script plus an `args` array. Routing it through `exec` lets its recorded code come
from the agent like every other action.
````

## S5. Public code exporter

**Title:** Public exporter for a standalone script with a launch preamble

**Target repo:** `webdriverio/webdriverio` (`packages/wdio-session`)

````markdown
**Problem**

The exporter turns a session history into a test-runner spec. A consumer that needs a script runnable with plain
`node` (it starts its own browser with `remote()`, or `startWdioSession()` for Electron) cannot get one, and cannot
reuse the exporter in-process because it is not exported.

**Evidence** (`@wdio/session` 10.2.0, tag `v10.2.0`, paths under `packages/wdio-session/`)

- `generateSpec` (`src/export/spec.ts:244`) is called only by the `export` action (`src/actions/export.ts:30`) and is
  not re-exported by `src/index.ts` or `src/agent.ts`.
- Its output always starts with `import { browser, …, expect } from '@wdio/globals'` (`src/export/spec.ts:306`) and
  wraps the steps in `describe`/`it` (`:319-320`). Nothing in the file emits a `remote()` call or capabilities.
- `ExportOptions` (`src/export/spec.ts:8-21`) has `title`, `pageObjects`, `baseUrl`, `cwd`, `outDir`; no output-kind
  or preamble option.
- Through the agent the exporter is reachable only as `run('export')`, which writes files to disk.

**Request**

One of:

- [ ] an exporter mode that emits a standalone script: launch preamble built from the session's plan/capabilities,
      the recorded steps, and session teardown; or
- [ ] `generateSpec` (or a lower-level "render steps" function) exported from a public subpath, with a hook for the
      caller to supply the preamble and wrapper.

In both cases: return the text without writing files, and keep the existing spec output unchanged.

**Why it matters to @wdio/mcp**

MCP serves generated code as a resource and currently keeps its own 710-line generator, mostly for launch preambles.
A public exporter lets MCP delete it.
````

## S6. JavaScript-valid frame code

**Title:** Agent-generated frame code is TypeScript, not JavaScript

**Target repo:** `webdriverio/webdriverio` (`packages/wdio-session`)

````markdown
**Problem**

The agent's `frame` action returns WebdriverIO code with a TypeScript non-null assertion. Generated code is run as
JavaScript (in `node`, or as a `.js` script), so any script that switches frames fails to parse.

**Evidence** (`@wdio/session` 10.2.0, tag `v10.2.0`, paths under `packages/wdio-session/`)

- `pageExpression` appends `!` to the page lookup, in both the `.filter(...)[index]!` and the `.find(...)!` form
  (`src/actions/contexts.ts:172-173`). Frame declarations are built on that page variable (`declareHeld`, `:341-366`),
  so the captured code reads `const page = (await browser.browsingContexts()).find((context) => context.url === '…')!`,
  then `const frame = await page.frame(page.$('…'))`.
- Measured on one machine (Node 24.22.1, webdriverio 10.2.0, headless Chrome 149): running such a script fails with
  `SyntaxError: Unexpected token '!'`.

**Request**

- [ ] Emit code that is valid JavaScript, with no type assertions; or
- [ ] an output option (for example `'js' | 'ts'`) so a JavaScript consumer gets JavaScript.

**Why it matters to @wdio/mcp**

MCP records the agent's code into the scripts it generates. Until this lands, a generated script with a frame switch
needs its `!` removed by hand before it runs. This is a workaround remover, not a v5 blocker.
````

---

# devtools (repo: `webdriverio/devtools`)

## D1. Trace for a standalone session

**Title:** Standalone: `setupForDevtools()` cannot select trace mode

**Target repo:** `webdriverio/devtools` (`packages/service`)

````markdown
**Problem**

The README documents `remote(setupForDevtools({...}))` for standalone use and `mode: 'trace'` for trace output, but
the standalone entry point takes no service options, so a standalone session cannot record a trace through it.

**Evidence** (`@wdio/devtools-service` 11.2.0, `webdriverio` 10.2.0, headless Chrome 149, one machine, 2026-11-14;
source at `5c7d21a6`)

- `setupForDevtools(opts)` takes only the WebdriverIO options and calls `new DevToolsHookService()` with no arguments
  (`packages/service/src/standalone.ts:42-46`).
- Mode is read from the service options: `this.#options.mode ?? 'live'` (`packages/service/src/index.ts:254`). The
  `wdio:devtoolsOptions` capability is passed only to the `SessionCapturer` constructor (`:251-253`).
- Measured: with `capabilities['wdio:devtoolsOptions'] = { mode: 'trace' }` the session ran, exit 0, and no trace or
  `test-results/` directory was written.
- Measured (probe P1a): `setupForDevtools({ capabilities: { browserName: 'chrome', 'wdio:devtoolsOptions': { mode: 'trace' } } })`
  fails with `SevereServiceError: The DevTools hook does not support multiremote yet`, because the options object is
  passed as the capabilities (`standalone.ts:50`, `index.ts:357-359`). It runs once `browserName` is also set at the
  top level (probe P1b).
- A trace is written when the service is built by hand with `new DevToolsHookService({ mode: 'trace' })`.

**Request**

- [ ] `setupForDevtools(opts, serviceOptions)` or an equivalent documented entry point that accepts `ServiceOptions`.
- [ ] Either honour `wdio:devtoolsOptions.mode` or document that it is ignored.
- [ ] The README standalone snippet runs as written.
- [ ] A way to attach to a browser that something else created (a returned service handle, or `attach(browser)`).

**Why it matters to @wdio/mcp**

MCP is a standalone consumer. Without this it would have to copy the body of `setupForDevtools` and construct the
service class itself.
````

## D2. No writes to stdout

**Title:** Trace mode writes "DevTools trace saved to …" to stdout

**Target repo:** `webdriverio/devtools` (`packages/service`)

````markdown
**Problem**

When a trace is finalized the service writes a line to `process.stdout`. A host process that uses stdout as a protocol
channel (an MCP server on stdio, a JSON-lines tool, a language server) gets that line inside its protocol stream.

**Evidence** (`@wdio/devtools-service` 11.2.0, `webdriverio` 10.2.0, one machine, 2026-11-14; source at `5c7d21a6`)

- `#announceTraces()` calls `process.stdout.write(`DevTools trace saved to ${path}\n`)` for every retained trace
  (`packages/service/src/index.ts:1001-1004`), from `after()` (`:997`).
- Measured, trace mode, service constructed by hand: the whole stdout of a session that printed nothing itself was

  ```
  DevTools trace saved to <scratch>/out/p1_manual_default/test-results/trace-e9921e0484267e3e6ec9f55773f43998.zip
  ```

- Measured: that was the only stdout content the service added. Page `console.log` / `console.error` output did not
  reach the process stdout or stderr.
- When `after()` ran before `deleteSession()`, the line was printed three times for one file.
- Not checked: whether an existing option suppresses the line.

**Request**

- [ ] No unconditional stdout write from the service; route the message through the logger (stderr), or
- [ ] an option to turn the announcement off, and
- [ ] the saved paths available programmatically (return value of the finalize call or a callback), so a host can
      report them itself.

**Why it matters to @wdio/mcp**

MCP's default transport is stdio; one stray stdout line breaks the client connection.
````

## D3. Console and stream patching

**Title:** Console and stream patching is process-wide and never restored

**Target repo:** `webdriverio/devtools` (`packages/service`, `packages/core`)

````markdown
**Problem**

The service replaces `console.*` and `process.stdout.write` / `process.stderr.write` for the whole process when it is
constructed, and the originals are not back after the session ends. In one run on one machine with two overlapping
sessions, a line logged after session A closed while B was still open was missing from B's trace.

**Evidence** (`@wdio/devtools-service` 11.2.0, `webdriverio` 10.2.0, one machine, each probe run once, 2026-11-14;
source at `5c7d21a6`)

- The service's `SessionCapturer` constructor calls `patchConsole()` and `patchStreams()`
  (`packages/service/src/session.ts:94-97`). One capturer is created as a field initialiser
  (`packages/service/src/index.ts:93`), a second in `before()` (`:251`); `after()` cleans up only the second (`:996`),
  whose saved originals are already the patched functions.
- Measured with `===` against references taken beforehand (probe P5): `console.log` and `process.stdout.write` were not
  the original functions after setup, after `remote()`, after `deleteSession()` and later. `console.error` and
  `process.stderr.write` had no pre-setup reference, so they are not compared.
- Measured, two sessions A and B (A open, B open, A close, B close), one service each: two separate zips were
  written. `LOG-BOTH` (logged while both were open) is in both traces. `LOG-B-ONLY`, logged after A closed while B was
  still open, is missing from B's trace.

**Request**

- [ ] Patch when capture starts for a session, not at construction.
- [ ] Restore the exact original functions when the last capturing session finalizes.
- [ ] Define and test attribution with concurrent sessions: a line logged while a session is open appears in that
      session's trace, including after another session closed.
- [ ] An option to disable Node-side console/stream capture.

**Why it matters to @wdio/mcp**

MCP runs several sessions in one long-lived process and redirects its own console to stderr.
````

## D4. Finalize without ending the session

**Title:** Finalize a trace without ending the session

**Target repo:** `webdriverio/devtools` (`packages/service`)

````markdown
**Problem**

In standalone use a trace is written only when `deleteSession` is issued. A host that detaches from a browser and
leaves it running (attached sessions, a user's own Chrome, a session handed to another tool) has no supported call to
write the trace.

**Evidence** (`@wdio/devtools-service` 11.2.0, `webdriverio` 10.2.0, one machine, one run, 2026-11-14; source at
`5c7d21a6`)

- `after()` is a public method (`packages/service/src/index.ts:978`), but `setupForDevtools()` keeps the service in a
  local variable and returns only the options (`packages/service/src/standalone.ts:46`, `:84`).
- The standalone hook calls `service.after()` when the command is `deleteSession` (`standalone.ts:72-73`).
- Measured with a hand-built service: calling `after()` wrote `trace-<sessionId>.zip`; the browser stayed usable (title
  read, second navigation succeeded). The later `deleteSession()` ran `after()` again: the same file name was written
  again (one zip on disk afterwards) and `DevTools trace saved to …` was printed three times in total.

**Request**

- [ ] A documented finalize call reachable from the standalone API (for example a handle returned next to the
      options).
- [ ] Finalize is idempotent: after an explicit finalize, `deleteSession()` does not write or announce again unless
      new steps were captured.
- [ ] Documented behaviour for commands issued after finalize (ignored, or a new trace).
- [ ] The finalize call resolves with the written path(s).

**Why it matters to @wdio/mcp**

`close_session` detaches by default for attached and externally provided sessions; those sessions are traced today and
would stop being traced.
````

## D5. Output directory

**Title:** Option to write traces to an exact directory (no `test-results/` suffix)

**Target repo:** `webdriverio/devtools` (`packages/core`, `packages/service`)

````markdown
**Problem**

The trace location can be moved with `outputDir`, but a `test-results/` segment is always appended. A consumer that
has an established artifact directory cannot make the service write there. `outputDir` is also the WebdriverIO option
that redirects driver logs, so using it to place the trace moves those too.

**Evidence** (`@wdio/devtools-service` 11.2.0, `webdriverio` 10.2.0, one machine, 2026-11-14; source at `5c7d21a6`)

- `resolveAdapterOutputDir` returns `path.join(resolveBaseDir(input), OUTPUT_SUBDIR)` with
  `OUTPUT_SUBDIR = 'test-results'` (`packages/core/src/output-dir.ts:29`, `:61-65`).
- The service derives the base from `browser.options.outputDir || rootDir` (`packages/service/src/index.ts:1041-1047`).
- Measured, no `outputDir`: `<cwd>/test-results/trace-<sessionId>.zip`.
- Measured, `remote({ outputDir: '<custom outputDir>' })`:

  ```
  DevTools trace saved to <custom outputDir>/test-results/trace-c46f7cb0837eea01cc791e117f6dd789.zip
  ```

  and `<custom outputDir>/wdio-chromedriver-34619.log` appeared in the same base directory.

**Request**

- [ ] A service option (for example `traceDir`) that is used as the exact directory, with nothing appended.
- [ ] It is independent of WebdriverIO's `outputDir`.
- [ ] Default behaviour (`test-results/` under the resolved base) unchanged.
- [ ] Optionally, a file-name option or callback, so a host can name traces by its own session name.

**Why it matters to @wdio/mcp**

MCP writes traces to `.trace/` under the working directory today; users and scripts read that path.
````

## D6. Published types

**Title:** Published `.d.ts` files import `../packages/*/src`, which is not in the tarball

**Target repo:** `webdriverio/devtools` (`packages/service`)

````markdown
**Problem**

The declaration files in the published `@wdio/devtools-service` reference workspace source paths that are not shipped.
A TypeScript consumer gets unresolved-module errors, and with `skipLibCheck` the option types degrade so that `mode`
is not a known property of `ServiceOptions`.

**Evidence** (`@wdio/devtools-service` 11.2.0 from npm, TypeScript 6.0.3, `module`/`moduleResolution: NodeNext`,
`strict`, one machine, 2026-11-14)

- `dist/types.d.ts` lines 1-4 import from `'../packages/shared/src/index.ts'` and `'../packages/elements/src/index.ts'`;
  other `dist/*.d.ts` files import `'../packages/core/src/index.ts'`. `node_modules/@wdio/devtools-service/packages`
  does not exist.
- Without `skipLibCheck`:

  ```
  dist/types.d.ts(1,55): error TS2307: Cannot find module '../packages/elements/src/index.ts' ...
  dist/types.d.ts(2,78): error TS2307: Cannot find module '../packages/shared/src/index.ts' ...
  dist/session.d.ts(2,37): error TS2307: Cannot find module '../packages/core/src/index.ts' ...
  dist/standalone.d.ts(11,75): error TS2344: Type '"sendUpstream"' does not satisfy the constraint 'keyof SessionCapturer'.
  ```

- With `--skipLibCheck`: `error TS2353: … 'mode' does not exist in type 'ServiceOptions'`.
- Separate finding from the same run: `setupForDevtools(opts: Options.WebdriverIO)` rejects `{ capabilities }`,
  because `Options.WebdriverIO` in `@wdio/types` 10.2.0 has no `capabilities` property. A control without
  devtools-service shows the same error, so it comes from the parameter type, not from the missing paths.

**Request**

- [ ] Published declarations are self-contained (bundled, or the referenced packages published and imported by name).
- [ ] A consumer type-check (no `skipLibCheck`) of the packed tarball in CI.
- [ ] `ServiceOptions.mode` and the other documented options visible to consumers.
- [ ] `setupForDevtools` typed so the README call shape compiles.

**Why it matters to @wdio/mcp**

MCP type-checks with `tsc --noEmit` as its release gate and would otherwise need a cast for every service option.
````

## D7. Session action events as a step source

**Title:** Accept `@wdio/session` action events as a step source

**Target repo:** `webdriverio/devtools` (`packages/service`, `packages/trace`)

````markdown
**Problem**

Trace steps are derived from WebDriver commands. An agent driving the browser through `@wdio/session` performs one
logical action (click a ref, fill a field) as several commands, so the trace shows command rows, not the action, its
arguments or its generated code.

**Evidence** (`@wdio/devtools-service` 11.2.0, source at `5c7d21a6`)

- The standalone entry point wires only `beforeCommand` / `afterCommand` (`packages/service/src/standalone.ts:52-82`);
  the service captures in those hooks (`packages/service/src/index.ts:776`, `:879`).
- Exported trace actions are built from the command log (`buildActionEvents`,
  `packages/trace/src/trace-action-events.ts:386`, input types `CommandLog` / `CommandNode`).
- A search of `packages/*/src` for `@wdio/session` finds two code comments in
  `packages/elements/src/wdio-snapshot.ts` and no API that takes externally produced action events.
- The producing side does not exist yet: `@wdio/session` 10.2.0 has no action event. A separate issue in
  `webdriverio/webdriverio` requests it (action, args, generated code, page change, timing, error).

**Request**

- [ ] A documented call on the service (or its handle) that accepts a before/after action event and records it as one
      step, with the WebDriver commands issued in between nested under it.
- [ ] The step keeps the action name, arguments, generated code and error in `trace.trace` and `transcript.md`.
- [ ] Snapshot and screenshot capture can be tied to action boundaries.
- [ ] The accepted event shape is versioned and agreed with `@wdio/session`.

**Why it matters to @wdio/mcp**

MCP's current trace has one step per tool call. Command-level steps would be a granularity regression for its users.
````

## D8. Classic (non-BiDi) sessions

**Title:** Clarify support for classic (non-BiDi) sessions in trace mode

**Target repo:** `webdriverio/devtools` (`packages/service`)

````markdown
**Problem**

It is not documented whether trace mode supports a session without WebDriver BiDi. The service logs an error at
session start, then continues and writes a trace, so a consumer cannot tell whether the result is complete.

**Evidence** (`@wdio/devtools-service` 11.2.0, `webdriverio` 10.2.0, headless Chrome 149 with
`'wdio:enforceWebDriverClassic': true`, trace mode, service constructed by hand, one machine, one run, 2026-11-14;
source at `5c7d21a6`)

- `#injectScriptSync` throws `SevereServiceError` when `!browser.isBidi` (`packages/service/src/index.ts:1052-1057`).
  The caller catches it and logs (`:282-289`); injection is skipped entirely for Appium sessions.
- Measured stderr:

  ```
  ERROR @wdio/devtools-service: Failed to inject script at session start: Can not set up devtools for session with id "0e5105d0..." because it doesn't support WebDriver Bidi
  ```

- Measured: exit 0, nothing thrown, and a 303129-byte `trace-<sessionId>.zip` was written with the same entry types as
  the BiDi run (`trace.trace`, `trace.network`, `trace.mutations`, screenshots, snapshots).
- `trace.mutations` was 16683 bytes against 18524 for the BiDi run of the same script. Whether its content is complete
  was not assessed.

**Request**

- [ ] State in the docs whether classic sessions are supported in trace mode, and which trace parts are absent or
      reduced (mutations, console, network, filmstrip).
- [ ] If supported: log the missing injection below ERROR level, once, with what is affected.
- [ ] If not supported: fail in a way the caller can detect before any command runs, or expose a capability check.
- [ ] A conformance case for a classic session.

**Why it matters to @wdio/mcp**

MCP traces attached, cloud and mobile sessions, some of them classic, and must tell users what the trace contains.
````

---

# webdriverio core (repo: `webdriverio/webdriverio`)

Not a v5 dependency: a v4.x bug that `@wdio/mcp` works around. Paths are relative to `packages/webdriverio/src/` at
tag `v10.2.0`.

## W1. BiDi `getCookies()` hides non-secure cookies once a Secure cookie exists

````markdown
**Title:** BiDi `getCookies()` returns only Secure cookies when any Secure cookie is set (Chrome)

**Summary**

On a BiDi Chrome session, `browser.getCookies()` with no `sourceOrigin` reads the `storageKey` partition of the page
origin (`commands/browser/getCookies.ts:85`, `utils/cookiePartition.ts:106`). Chrome stores only Secure cookies in
that partition. Non-secure cookies, whether set by the server or by `setCookies` after its classic fallback
(`commands/browser/setCookies.ts:128-132`), are unpartitioned. The classic fallback in `getCookies` runs only when the
BiDi result is empty (`commands/browser/getCookies.ts:125`), so one Secure cookie makes every other cookie invisible.

**Repro** (webdriverio 10.2.0, chromedriver 149.0.7827.155, headless, page on `http://127.0.0.1:<port>/`)

```js
await browser.setCookies([
  { name: 'c_plain', value: '1' },
  { name: 'c_secure', value: '1', secure: true },
  { name: 'c_http', value: '1', httpOnly: true },
])
console.log((await browser.getCookies()).map(c => c.name))             // ['c_secure']
console.log((await browser.getCookies(undefined, null)).map(c => c.name)) // ['c_plain', 'c_secure', 'c_http']
```

The same session with `wdio:enforceWebDriverClassic: true` returns all three from `getCookies()`. Without the Secure
cookie, BiDi `getCookies()` returns everything, because the empty-result fallback runs. The same pattern was seen on an
https page in 10.1.0 and 10.2.0.

**Expected**

`getCookies()` returns the cookies visible to the current page, as classic does.

**Possible directions**

- Read without a partition (or with a `context` partition) and filter by the page URL, as the window-scope path
  already does with `cookieMatchesUrl`.
- Or merge the partitioned result with the unpartitioned one instead of falling back only on empty.

**Why it matters to @wdio/mcp**

The `wdio://session/current/cookies` resource and the `get_cookies` tool under-reported on BiDi sessions. `@wdio/mcp`
now passes `sourceOrigin: null`, which returns the whole jar across domains, not the page-visible set.
````

Not verified: Chrome's or chromium-bidi's reason for keeping non-secure cookies out of the `storageKey` partition, and
Firefox behaviour.

## W2. Standalone `remote()` rejects a hook given as a function, which its type allows

**Title:** `remote({ afterCommand: fn })` throws `Expected option "afterCommand" to be type of object`

**Target repo:** `webdriverio/webdriverio` (`packages/wdio-config`, `packages/wdio-types`)

````markdown
**Problem**

`remote()` accepts `beforeCommand`/`afterCommand` in its options type as a function or an array
(`Services.Hooks` maps each hook to `HookFunctions[k] | NonNullable<HookFunctions[k]>[]`). At runtime a single function
fails validation:

    Error: Expected option "afterCommand" to be type of object but was function
        at validateConfig (packages/wdio-config/build/index.js)
        at remote (packages/webdriverio/build/node.js)

Passing `[fn]` works. The defaults declare these hooks as `[]` (`packages/wdio-config/src/constants.ts:68-69`), so
`validateConfig` expects `object`.

**Reproduction** (upstream `main` `4ef7adc33`, Chrome headless)

```js
await remote({ capabilities: { browserName: 'chrome' }, afterCommand: () => {} })
```

**Request**

- [ ] Accept a function as the testrunner does (`ConfigParser.addService` normalises function-or-array hooks over `SUPPORTED_HOOKS`); or narrow the type
      to arrays.
````

Found while smoke-running the S1 prototype. Not checked: whether other hooks in the `remote()` options type behave the same.

## W3. `remote()` leaves its chromedriver running when session creation fails

**Title:** Failed `remote()` session creation leaks the auto-started chromedriver

**Target repo:** `webdriverio/webdriverio` (`packages/webdriverio`, `packages/utils` driver start)

````markdown
**Problem**

When `remote()` starts chromedriver itself and the `POST /session` fails, the chromedriver process keeps running after
`remote()` rejects. The caller has no browser object, so it has no `wdio:driverPID` to kill.

**Reproduction** (upstream `main` `4ef7adc33`, Chrome 149, Linux)

```js
await remote({
    capabilities: {
        browserName: 'chrome',
        'goog:chromeOptions': { debuggerAddress: 'localhost:<a port nothing listens on>' }
    }
}).catch(() => {})
// `pgrep -fa chromedriver` still lists `chromedriver --port=<n>`
```

3 runs: each rejected after about 60 s with `session not created: cannot connect to chrome at localhost:<port>` and
left one chromedriver behind.

**Request**

- [ ] Stop the driver process that `remote()` started when session creation fails.
````

The leak is inferred from the process count rising by 1 per failed run, with each surviving chromedriver's start time
and port matching one run. The code path that skips the stop was not traced. Not checked: other drivers
(geckodriver, msedgedriver) and other failure causes.

---

## Unverified

Everything below is marked **unverified** as of 2026-11-14, unless an item gives its own date.

- **Matrix rows cited in S1 and S3 — unverified here.** The grouping in S1 repeats the row statuses and gap notes of
  `provider-parity-matrix.md`. Only these were re-read at tag `v10.2.0` for this file: the `package.json` exports,
  `buildPlan` (`src/targets/index.ts:39`), `launch` and `Launched` (`src/targets/launch.ts:16-31`), `CloudProviderId`
  (`src/targets/cloud.ts:13`) and the contents of `src/index.ts` and `src/agent.ts`. The specific drift values quoted in
  S1 (`LT_*`, `LT:Options`, `us-west-1`, 1280x720, single BrowserStack hub, `autoAcceptAlerts`) are taken from the
  matrix as given.
- **Matrix link target — unverified.** S1 and S3 link `docs/architecture/provider-parity-matrix.md` in `webdriverio/mcp`.
  That file is untracked in this checkout (`feature/v5`), so the link resolves only after it is committed and pushed.
- **All devtools measurements — single machine, mostly single run.** Node 24.22.1, headless Chrome 149 with
  `--no-sandbox`, Linux/WSL2. Not examined: Firefox, Safari, native mobile, a long-lived process over many sessions.
- **D2 — unverified** whether an existing option suppresses the `DevTools trace saved to` line (the probe did not
  check; no such option was searched for in the source for this file).
- **D3 — the missing `LOG-B-ONLY` line was observed once** (probe P6). The source reading offered as its mechanism
  (two capturers, cleanup of the second only) explains why the functions are never restored; that it also explains
  the missing line is an inference, not a measurement.
- **D4 — "printed three times"** is from one run (probe P3); why three and not two was not traced in the source.
- **D6 — unverified against the working tree.** `packages/service/dist` is not present in the devtools checkout, so the
  `.d.ts` findings rest on the probe's reading of the npm tarball. The `TS2344` line in `dist/standalone.d.ts` is
  quoted from the probe; its cause was not analysed.
- **D7 — the search for an existing action-event API** covered `packages/*/src` for the strings `onAction` and
  `@wdio/session` only. Open pull requests and other branches of `webdriverio/devtools` were not searched.
- **D8 — completeness of a classic-session trace is unverified**; only sizes and entry types were compared.
- **S2 — the event shape is a proposal**, not derived from an existing session type beyond `PageChange` and `PageInfo`
  (`src/agent/types.ts:5-10`). Whether the internal `trace` probe (`src/session.ts:325`) fires for every action or only
  while the `trace` action is active was not checked.
- **S4 — unverified** which other actions leave `AgentActionResult.code` empty; only `exec` was read.
- **S5 — unverified** that `run('export')` is the only agent route to the exporter; it is inferred from `generateSpec`
  having a single caller. ("710-line" was re-counted with `wc -l` on `src/recording/code-generator.ts` at `982d6e7`;
  "mostly for launch preambles" is a characterisation, not a measurement.)
- **Existing upstream issues — unverified.** Neither repository's issue tracker was searched for duplicates of these
  drafts.

## Candidate, not drafted

The BiDi `getCookies()` candidate is now drafted as W1, with its cause.
