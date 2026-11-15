# `@wdio/mcp` v5 — Engine Consolidation

**Status:** Proposal — not yet implemented. Facts re-checked 2026-11-14 against `@wdio/mcp` `origin/main` (`982d6e7`,
v4.1.0), `webdriverio` tag v10.2.0 (`5743972`, published 2026-11-06), and devtools `main` (`5c7d21a6`;
`@wdio/devtools-service` 11.2.0, `@wdio/elements` 1.3.0). `webdriverio` paths below are at that tag. Claims marked
*(unverified)* were not checked against code.

**Release model:** v5 is a **coordinated release**. It does not ship until the cross-repo changes it depends on are
merged *and published*. Until then MCP prepares in non-breaking v4.x minors.

---

## Problem

`@wdio/mcp` started as the proof of concept for element detection and trace recording. Each later extraction copied the
code forward and nobody deleted the source, so several implementations are live:

```
mcp src/scripts + src/locators        original POC — still used by get_elements, the elements and
   │                                   accessibility resources, and the ./snapshot export
   └─► devtools @wdio/elements         cleaned-up copy; used by @wdio/devtools-service
          └─► @wdio/snapshot           re-extraction; used by @wdio/session, and by MCP through the agent

mcp src/trace                         one trace step per MCP tool call, Playwright-compatible zip, vibium player
devtools packages/trace               per-WebDriver-command capture, own format and player, multi-framework
```

The element collectors are true copies. The two trace implementations are **different products**, not a copy: MCP's
records tool calls and works on mobile, cloud, attach and Electron sessions; devtools records WebDriver commands across
frameworks. Replacing one with the other is a feature swap with regressions (see *Trace swap acceptance criteria*).

Launch logic is duplicated as well. `@wdio/session` and MCP each carry their own target planning and cloud provider
table, and every launch fix lands in session first. Session reaches targets MCP cannot: Windows Appium (`windows` in
`APPIUM_TARGETS`), Tauri and Dioxus (`DESKTOP_APP_TARGETS`), and `wdio.conf.ts` files (`isConfigTarget`)
(`packages/wdio-session/src/targets/index.ts:16-17`, `:30-32`). Session has Electron too
(`packages/wdio-session/src/targets/electron.ts:51`, `:139`, `electronPlan`/`launchElectron`). Digital.ai is the only
cloud provider MCP has that session lacks; session's are BrowserStack, Sauce Labs, TestingBot and TestMu
(`packages/wdio-session/src/targets/cloud.ts:13`).

The interaction layer is already shared: v4 routes snapshots, refs and actions through `@wdio/session/agent`
(`src/session/agent.ts`), and agent actions already return generated code, which MCP records at `src/session/agent.ts:75`.

---

## Target layering

| Package | Owns | Depends on |
| --- | --- | --- |
| `@wdio/snapshot` | Page-tree collection, refs, selector candidates, native XML parsing, text output, diffs | — |
| `@wdio/elements` | The JSON element format (ranked locators per element), kept for compatibility, then deprecated | `@wdio/snapshot` — since 1.3.0 an optional peer dependency, `^10.2.0` (devtools #429; `packages/elements/package.json:54`, `:58-59`) |
| devtools | Capture, trace format, player, dashboard, framework adapters (WebdriverIO, Selenium, Nightwatch, Python) | `@wdio/snapshot` |
| `@wdio/session` | Launch (targets, cloud, config files, tunnels), page model, actions, code export, daemon; **emits** action events *(not implemented: the agent has no `onAction` or emitter, only the pull-style `history` getter at `packages/wdio-session/src/agent.ts:228`; Chain B step 1)* | `@wdio/snapshot` |
| `@wdio/mcp` | Transport, toolsets, tool descriptions, resources, docs search, multiple sessions for sub-agents | session, devtools-service |

Anything a non-MCP consumer could use lives below MCP. MCP composes those packages and shapes tools.

**Trace** belongs to devtools. Session emits what happened (an action ran, the page changed, code was generated); a
recorder subscribes. Devtools already has BiDi capture (`packages/core/src/bidi.ts`), mobile support
(`packages/service/src/mobile.ts`) and a conformance suite (`packages/conformance`), so MCP's roadmap items
"Trace: WebDriver BiDi Mode" and "Trace: Mobile / Appium Support" (`ROADMAP.md`) are devtools work.

`@wdio/session` already has its own trace: the `trace` and `record` actions (`packages/wdio-session/src/actions/index.ts:83-84`,
implemented in `packages/wdio-session/src/actions/evidence.ts:205` and `:255`). `trace` writes a directory with a JSONL event
log (`trace.trace`), a `transcript.md` with one section per step (code, text, error), and optional screenshots and
snapshots; `record` saves a video of the session (BiDi screencast, frame sequence, or Appium recording).

**Page model:** MCP uses the `@wdio/session` agent. `get_elements` and the `elements`/`accessibility` resources become
views over the agent snapshot. MCP does not adopt `@wdio/elements`, which this layering deprecates. `@wdio/snapshot` is
the single collector; `collectScript()` (`packages/wdio-snapshot/src/collect.ts:43`, exported from `src/index.ts`)
returns the collector as one self-contained JS expression string that any page-eval API can run.

---

## v4.x preparation (MCP-only, non-breaking)

Work MCP can do now, without waiting on other repos. It shrinks v5 to integration work.

1. **Done (#177).** **Concurrent sessions** — PR #177 (issue #170 Phase 1). Additive, so it ships in v4.x, not v5.
2. **Prepared, not yet submitted.** **Deprecate in place.** A new
   `src/utils/deprecation.ts` (`warnDeprecated`, `src/utils/deprecation.ts:13-17`) writes
   `(@wdio/mcp) DeprecationWarning: …` to stderr once per entry, synchronously, and honours `process.noDeprecation`.
   It is synchronous because `process.emitWarning` is asynchronous and its output was lost when `wdio-show-trace`
   called `process.exit(1)`. `src/snapshot.ts:16`, `src/trace.ts:14` and `src/show-trace.ts:8` call it at module load,
   so importing `./snapshot` or `./trace` or running `wdio-show-trace` warns once on stderr. Each export of `./snapshot`
   and `./trace` is re-declared with its own `@deprecated` JSDoc (`src/snapshot.ts:18-38`, `src/trace.ts:16-33`),
   because a JSDoc on `export { … } from` did not reach the emitted `.d.ts`. One machine: `lib/snapshot.d.ts` has 8
   `@deprecated` tags and `lib/trace.d.ts` 9, matching the source; the implementations are unchanged. The
   `wdio-show-trace` message points to devtools' `show-trace`
   bin (`devtools/packages/service/package.json:16`). The `trace` parameter descriptions of `start_session` and
   `attach_session` (`src/tools/session.tool.ts`) end with the suffix "Format, location and player change in v5." No
   re-exports from the new packages: devtools has no equivalent of `./trace`'s API (`buildTraceZip`,
   `createTraceSession`, `mapToolToTraceAction`), and re-exporting `./snapshot` from another package would change its
   shape inside a minor. **Still open:** size the window with a GitHub code search for `@wdio/mcp/snapshot` and
   `@wdio/mcp/trace`; npm downloads cannot show subpath usage.
3. **Move `get_elements`, `elements` and `accessibility` onto the agent**, keeping the input schema
   (`inViewportOnly`, `includeContainers`, `includeBounds`, `limit`, `offset`). The output is read by a model, so this
   is not semver-breaking. `src/scripts` stays only to back the deprecated `./snapshot` export. **Gate:** run both
   collectors on a fixed page set (about 10 web pages, 1 Android app, 1 iOS app) and compare selector uniqueness
   (`$$(sel).length === 1`), uniqueness after reload, TOON tokens per page, and coverage (elements found by one but not
   the other). Switch only if the agent matches or beats the current collector within run-to-run noise. Not done: these
   tools and resources are still on `src/scripts` on both `main` and the prep change (not yet submitted).

   **Constraint:** `get_elements` is listed only for `ios`, `android` and `electron` sessions (`src/toolsets.ts:17`),
   and the router rejects it on other session types (`src/session/routing.ts:108`). A web-page A/B therefore measures
   the browser `elements` and `accessibility` resources, not the `get_elements` tool. The tool needs a mobile or
   Electron measurement before its switch can be decided; a web A/B can decide only the browser resources.

   Gate result: incomplete. A web-only A/B on 9 pages in one run (2026-11-14, webdriverio and `@wdio/session`
   10.2.0) found the snapshot collector returns more elements and higher selector uniqueness (93% against 75%; both figures
   driven largely by MDN, where most snapshot selectors are unvalidated fallbacks) but is
   far slower (348-522 ms against 9-71 ms per page outside MDN). The mobile half was not run, and `get_elements` serves
   only mobile and Electron sessions, so there is no `get_elements` switch in v4.x; the numbers inform only the browser
   `elements` and `accessibility` resources.
4. **Done as a document: `provider-parity-matrix.md`.** **Provider parity matrix** as the acceptance spec for session's
   `launch`: tunnels, cloud result marking via `onSessionClose`, attach, the external provider
   (`src/providers/external.provider.ts`), local Appium (`src/providers/local-appium.provider.ts`), Electron, regions,
   Digital.ai. It compares MCP at `982d6e7` with `@wdio/session` 10.2.0 over 56 behaviours: 7 covered, 29 partial,
   20 absent. Take it to the session owner; it turns open decision 1 into a review of something concrete. Findings that
   change the plan:
   - Ten of the 29 partial rows exist only in session's daemon or CLI path (among them the post-launch viewport, the
     headless user-agent rewrite, initial navigation, the process-group kill, named and concurrent sessions, the
     `deleteSession` time bound and close-all on shutdown). A caller of an in-process `launch` would not get them, so exporting `./launch` as it is
     today does not close them.
   - Session has no cloud result marking and no pass/fail notion at close, for any provider (rows 11a–11f).
   - Session starts and stops a tunnel for BrowserStack only; for Sauce Labs, TestMu and TestingBot it sets the
     capability and the user must start the tunnel (rows 10b–10e).
   - Session cannot attach to an existing session by id (row 7a). This needs no session change: on real Chrome,
     webdriverio `attach()` followed by `createAgentSession` gave a working snapshot (2026-11-15; with caps-only attach
     `isBidi` was false, and BiDi-dependent features were not checked), so MCP's `attach_session` keeps
     calling `attach()` itself and never calls `cleanup`. Detach is fixed when the session is opened; `close` takes no
     detach argument (row 7d).

   Rows added by #181 and #177 (verified on `982d6e7`):
   - Chrome driver-tree kill (`src/session/driver-tree.ts`; `tracksDriverTree`, `src/providers/local-browser.provider.ts:9`);
   - `connectionRetryTimeout` 45 s and `connectionRetryCount: 0` (`local-browser.provider.ts:6`, `:28-29`);
   - `networkLogs` mapped to `goog:loggingPrefs` / `ms:loggingPrefs` (`local-browser.provider.ts:83`, `:90`);
   - per-session trace finalize, including orphan takeover (`src/session/lifecycle.ts:98`, `:163`);
   - named and routable sessions (`src/session/routing.ts`).
   - Tunnels: the `tunnel` parameter (`src/tools/session.tool.ts:84`) is the only contract. The legacy
     `browserstackLocal`/`saucelabsLocal`/`testmuLocal` aliases were removed by #182 (`982d6e7`).
5. **Drafted, not filed: `v5-upstream-issue-drafts.md`.** The paste-ready version is `v5-upstream-issues-to-file.md`: 17 issues, 9 in `webdriverio/webdriverio` (S1–S6, W1–W3) and 8 in `webdriverio/devtools` (D1–D8). **File the
   devtools contract as issues**, so they become release criteria instead of v5 surprises. Behaviour measured with
   `@wdio/devtools-service` 11.2.0 in `devtools-trace-probe-results.md` (one machine, each probe run once):
   - a supported way to select trace mode. `setupForDevtools()` constructs the service without options
     (`packages/service/src/standalone.ts:46`) and ignores `wdio:devtoolsOptions.mode`, so no trace is written; trace
     mode needs a hand-built `DevToolsHookService({ mode: 'trace' })`;
   - behaviour on non-BiDi sessions. `#injectScriptSync` throws `SevereServiceError`
     (`packages/service/src/index.ts:1052-1057`), but the caller catches it and logs an error (`:282-289`); the session
     continues and a trace is still written. Whether that trace is complete was not assessed;
   - console patching per session, not per process. It is process-wide today (`patchConsole`,
     `packages/core/src/session-capturer.ts:667-670`, reassigns `console[method]`; `patchStreams`, `:697`, wraps
     `process.stdout.write` and `process.stderr.write`), and the patched functions are not restored to the originals
     after the session ends. With concurrent sessions now on `main`, this is a blocker, not a risk. In one run on one machine, a Node console line
  logged after A closed while B was still open was missing from B's trace (probe P6, observed once);
   - no writes to stdout. The service prints `DevTools trace saved to …` with `process.stdout.write`
     (`packages/service/src/index.ts:1001-1004`), which would corrupt MCP's stdio transport;
   - output directory: `test-results/` is always appended, also to a custom `outputDir` (see *Corrections*);
   - finalizing a trace through `after()` without `deleteSession`. `after()` writes the trace and leaves the session
     usable, but `setupForDevtools()` does not return the service, so `after()` is not reachable from the published
     API, and `deleteSession()` finalizes a second time;
   - published types: the package's `.d.ts` files import `../packages/{shared,core,elements}/src/index.ts`, paths that
     are not in the tarball.
6. **Done (#181 to `10.1.0`); `10.2.0` prepared, not yet submitted.** **Bump `@wdio/session` and
   `webdriverio`**: `main` pins both at exact `10.1.0` (`package.json:63`, `:70`); the prep branch bumps both to exact
   `10.2.0`. Exact pinning is a decision taken on 2026-11-14, because `@wdio/session/agent` is still experimental, even
   though session and snapshot now peer on `webdriverio ^10.0.0`. The bump also fixes `set_cookie` with
   `sameSite`: on `main` (pinned 10.1.0) `'lax'` and `'strict'` throw `invalid argument: invalid 'sameSite'`, and 10.2.0
   accepts both (one machine, 3 repetitions per cell; `src/tools/cookies.tool.ts:36` passes the value through).
7. **Prepared, not yet submitted.** **Route non-agent tools through agent
   actions.** `execute_script` (`exec`), mocks (`mock`/`unmock`), cookies (`cookies`/`storage`) and device tools (`app`,
   `deeplink`, `rotate`, `keyboard`, `background`, `lock`, `unlock`) exist as actions in
   `packages/wdio-session/src/actions/index.ts:28`, `:59-65`, `:75-78`, but only some could be routed without changing
   behaviour:
   - **Routed:** `set_cookie` and `delete_cookies` (`cookies`).
   - **Held until a device run:** `rotate_device` (`rotate`), `hide_keyboard` (`keyboard`) and `drag_and_drop` with a
     target selector and no duration (`drag`). All three are restricted to `ios` and `android` by `src/toolsets.ts`, and
     no device was available to run them, so they stay direct and `rotate_device`/`hide_keyboard` stay unrecorded.
   - **Newly recorded via `instrument`** (`src/server.ts`): `switch_frame`, `set_geolocation`, `set_cookie` and
     `delete_cookies`.
   - **Kept direct** (session paths relative to `packages/wdio-session/`): `execute_script` — session's `exec` takes a
     code string and no script arguments, and its result has no `code`, only a history entry
     (`src/actions/exec.ts:96-155`; `src/session.ts:405-415` appends that entry and strips it from the result). The mock
     tools — session's `mock` keeps its own registry in the session store (`src/actions/network.ts:114-118`), so routing
     only creation would leave two mock stores. `scroll` — session's uses `browser.scroll`, a wheel action
     (`src/actions/interact.ts:1179`); MCP's uses `window.scrollBy` (`src/tools/scroll.tool.ts:32` in MCP). `swipe` and
     drag with a duration — session's `swipe` and `drag` take no duration (`src/actions/interact.ts:1167-1171`,
     `:1202-1210`). Coordinate tap and offset drag, and all Electron tools, also stay direct.

   This did **not** shrink `src/recording/code-generator.ts`. On the prep branch it grew by two cases: `switch_frame`
   (`src/recording/code-generator.ts:298-301`, a comment-only fallback) and `set_geolocation` (`:302-303`). The cookie
   tools never had a `case` there, and the `drag_and_drop` case (`:308-312` on `main`) is still needed for
   the duration and offset paths. The gain is that the routed tools' steps now appear in generated scripts, as code the
   agent returned. `AgentActionResult.code` is optional (`packages/wdio-session/src/agent/types.ts:62`); only `exec` was
   checked for leaving it empty.

   **Frame recording.** On a BiDi session the agent's `frame` action returns variable-based code, and later in-frame
   steps reference that variable. `switch_frame` is registered without `instrument` on `main` (`src/server.ts:170` at
   `982d6e7`), so without a recorded `switch_frame` step a generated script with in-frame actions uses undeclared
   variables. This is inferred from the captured code; no base-commit run was made. `browser.switchFrame(null)` throws
   on BiDi sessions in WebdriverIO 10 (the error says `switchFrame` was removed for WebDriver BiDi sessions), which is
   why the `switch_frame` case emits a comment.

   **Generated frame code is not JavaScript.** The page declaration carries a TypeScript non-null assertion, so a script
   with a frame switch fails with `SyntaxError: Unexpected token '!'` (see the code-generator row above). One machine:
   with that `!` removed, `let browser` hoisted (the prep branch now generates it that way) and the
   `browser.switchFrame(null)` lines removed by hand, a script with
   two nested frame switches, an in-frame click, a third frame switch on another page, cookie set/delete and geolocation
   ran to completion (exit 0).

**Do not port the `feature/wdio-elements` trace wiring.** Its hooks attach to the options MCP passes to
`remote()`/`attach()`. Once session owns launch, MCP no longer builds those options, so the wiring would be thrown away.

---

## v5 (coordinated, final step)

| Change | Current state on `origin/main` | Needs |
| --- | --- | --- |
| Delete `src/scripts/` and `src/locators/` | Only `src/scripts/get-visible-mobile-elements.ts` imports `src/locators/` | v4.x item 3 |
| Remove the `./snapshot` and `./trace` exports and the `wdio-show-trace` bin | In `package.json` `exports` and `bin` | v4.x deprecation window |
| Trace via devtools recording session action events, one step per agent action; delete `src/trace/` | `src/trace/` holds recorder, state, tool-mapping, types, zip-writer | Chain A + B, devtools release |
| **User-visible break:** the `trace` parameter's contract (Playwright-compatible zip in `.trace/`, vibium player) changes | Promised in `src/tools/session.tool.ts` `trace` descriptions | — |
| Delete `src/providers/` except what `attach_session` and `provider: 'external'` need (Digital.ai only if the S3 port slips out of the gating release); `start_session` takes `target \| config \| provider` and hands it to session's plan builder | MCP's own provider table (5 cloud providers + local + external). `provider-parity-matrix.md` shows 49 of 56 behaviours partial or absent in session 10.2.0, so this row depends on more than a `./launch` export | `@wdio/session/launch` that closes the matrix gaps (issue drafts S1, S3) |
| Reduce `src/recording/code-generator.ts` (710 lines) to what session cannot generate; per-action code comes from the agent | Session returns code per action. Its only whole-file exporter (`run('export')`; `generateSpec`, `packages/wdio-session/src/export/spec.ts:244`, not exported from the package root) writes a `describe`/`it` spec on `@wdio/globals`, with no `remote()`, capabilities, cloud, Appium, Electron, attach or teardown. So it cannot replace the generator entirely. MCP keeps: the launch preamble for every runtime (`:156-286`) and teardown (`:709`); cloud hub, tunnel and status code (`:382-394`, `:457-707`); the Electron header (`:427-445`); the attach file shape (`:40-120`, `:447-455`); the session-transition sentinel (`:137-140`); the `$`/`$$` shim (`:134`, `:413-415`); and the per-step cases for coordinate gestures (`:301-312`), Electron (`:318-322`, `:357-368`), mocks (`:323-356`) and web extensions (`:369-376`) | A session code exporter with a launch preamble (issue draft S5); until then MCP keeps the reduced generator |

**Decided (2026-11-15): one launch path for session-backed targets.** v5 `start_session` goes `buildPlan` → `launch` → `createAgentSession`, with no fallback to the v4 launch code. MCP becomes a protocol layer without its own launch logic. MCP keeps these outside that path: `attach_session` (calls webdriverio `attach()`, see the attach finding above), `provider: 'external'` (`src/providers/external.provider.ts`), and Digital.ai (`src/providers/cloud/digitalai.provider.ts`) only if the S3 port slips out of the gating session release. Chain B step 2 puts that port inside the gate, so no Digital.ai exception is expected at release. The code generator's launch preamble is generation, not launch; see the code-generator row above.

Two defects in generated scripts were found on 2026-11-14 (one machine). Neither blocks v5, and each needs an owner:

- **Non-null assertion in frame code (session).** `pageExpression` appends `!` to the page lookup
  (`packages/wdio-session/src/actions/contexts.ts:172-173` at `v10.2.0`), and frame declarations build on that variable
  (`declareHeld`, `packages/wdio-session/src/actions/contexts.ts:341-366`). The emitted code is TypeScript, so a
  JavaScript script with a frame switch fails with `SyntaxError: Unexpected token '!'`. Session owns the fix (issue
  draft S6).
- **`browser` out of scope in `finally` (MCP `main`).** The plain local template wraps the steps in
  `try { … } finally { await browser.deleteSession(); }` (`src/recording/code-generator.ts:709` at `982d6e7`), while the
  local `start_session` step emits `const browser = await remote({` inside that `try` (`:275`). In `finally`, `browser`
  is not defined, so cleanup throws `ReferenceError` and masks the real error. The cloud and Electron templates declare
  `let browser` outside the `try`. MCP owns the fix; it is fixed in the prep change, not yet submitted
  (`src/recording/code-generator.ts:716`).

---

## Dependency graph

**Step 0 — owner decisions.** Nothing below has a date until these are answered (see *Open decisions* 1–2; decision 3
is answered).

**Chain A — collector and trace capture:**

1. **Done in 10.2.0** (webdriverio #16344). `@wdio/snapshot` and `@wdio/session` list `webdriverio` under
   `peerDependencies` as `^10.0.0` (`packages/wdio-snapshot/package.json:43-44`, `packages/wdio-session/package.json:80`,
   `:86`); the `workspace:*` entry is now a `devDependency` in both. Still true: session's `./launch` is not exported,
   and the planner `buildPlan` is internal (`packages/wdio-session/src/targets/index.ts:39`).
2. **Done.** devtools #429 (snapshot-backed `@wdio/elements`) is merged and released as `@wdio/elements` 1.3.0.
3. Open. Feasibility check of `collectScript()`, then devtools captures trace snapshots with it.
4. Open. devtools deletes `core/locators` and `element-scripts`.

**Chain B — engine (critical path), S1 and S2 prototyped, not yet submitted upstream; S3 not started:**

1. Design session's `launch` API (against the parity matrix, including hook/service injection) and the action-event
   schema.
2. Session release with `@wdio/session/launch` and the Digital.ai port.
3. Devtools accepts session action events as a step source, and the same call accepts steps from tools that stay outside the agent (see Trace swap acceptance criteria).
4. Devtools release that meets the trace acceptance criteria. (Peering on webdriverio 10 is already met:
   `@wdio/devtools-service@11.2.0`, npm `latest`, peers `webdriverio ^9.19.1 || ^10.0.0`.)

**Then:** MCP pinning policy (exact pins, decided 2026-11-14; see *Open decisions* 8) → **MCP v5**.

Every cross-repo step is gated on **merged and published at a named version**, not just merged.

**Edges the first draft missed:**

- **Launch × trace hooks.** Once session builds the browser, `launch()` must accept hooks or services, or devtools must
  attach to an already-running browser. Otherwise trace has nowhere to attach.
- **Session's own webdriverio dependency — resolved in 10.2.0.** Session listed `"webdriverio": "workspace:*"` under
  `dependencies`, the same exact-pin problem as snapshot. #16344 moved it to `peerDependencies` (`^10.0.0`,
  `packages/wdio-session/package.json:86`) together with the snapshot change.
- **Who connects session events to the devtools recorder** — MCP (it owns the agent and the recorder wiring) or
  devtools subscribing to session directly. This decides which repo's release closes Chain B (open decision 5).

devtools #442 (capture only for page-changing commands; merged on `main`) is useful for devtools' existing users but
not on MCP's critical path: session action events replace command-name heuristics for agent traces.

After #429, `packages/core/src/action-snapshot.ts` on devtools `main` still imports `buildElementScripts` (`:5`) and
`./locators/xml-parsing.js` (`:12`), so devtools keeps two collectors until Chain A step 3 lands.

### Release train

| Package | Version MCP v5 pins | Gate |
| --- | --- | --- |
| `@wdio/snapshot` | 10.2.0 | peerDependency change published — met |
| `@wdio/session` | TBD | own webdriverio dependency fixed — met in 10.2.0; `./launch` + action events published — still missing |
| `@wdio/devtools-service` | TBD | accepts session events; acceptance criteria met — 11.2.0 does not meet them (`devtools-trace-probe-results.md`), though it peers on webdriverio 10 |
| `@wdio/elements` | not a direct dependency | transitive through devtools-service only |

### Trace swap acceptance criteria

The devtools release MCP v5 adopts must not regress these, relative to MCP's current `src/trace`:

| Area | Today (MCP `src/trace`) |
| --- | --- |
| Granularity | One step per tool call — preserved by one step per agent action |
| Direct-tool steps | `execute_script`, mocks, `scroll`, `swipe`, coordinate `tap_element`, offset `drag_and_drop` and Electron tools get a step today through `instrument()` in `src/server.ts`, but stay outside the agent in v5; devtools must accept a step for them too (D7), or they lose their step while their WebDriver commands are still captured |
| Format and player | Playwright-compatible zip, vibium player — users must be told what replaces it |
| Location | `.trace/` under cwd |
| Coverage | Local browser, mobile, cloud, attach, Electron sessions |
| BiDi | Not required by MCP today, so devtools must record without it. In one run a classic session logged an injection error and still wrote a trace; completeness not assessed (probe P4) |
| Console | MCP redirects console to stderr. Measured on 11.2.0: devtools patches `console.*` and `process.stdout`/`stderr.write` process-wide and does not restore them after the session ends; with two concurrent sessions one trace missed a console line (probes P5, P6) |
| Stdout cleanliness | MCP's stdio transport needs a clean stdout; `src/server.ts` reassigns console output to stderr. Measured on 11.2.0: the service prints `DevTools trace saved to …` on stdout when a trace is finalized; nothing else from the service reached stdout (probes P1c, P3, P5) |
| Install footprint | `yazl` only. Measured on one machine: `@wdio/devtools-service` 11.2.0 adds +43 MB and +106 packages over `webdriverio` 10.2.0 alone, with one `webdriverio` copy; `fluent-ffmpeg` (a wrapper, no bundled binary) and the dashboard backend and app are present |

---

## Corrections to earlier assumptions

- **Output directory is configurable.** `#outputDir` (`packages/service/src/index.ts:1041`) uses
  `browser.options.outputDir || rootDir`; `resolveAdapterOutputDir` (`packages/core/src/output-dir.ts:61`) honours it as
  the base but always appends a `test-results/` subfolder. Confirmed by measurement (probe P1c in
  `devtools-trace-probe-results.md`).
- **Detached sessions can be traced.** `after()` is public on the class (`packages/service/src/index.ts:978`); MCP's
  `closeSession` can call it before detaching, as `finalizeTrace` works today. The probe (P3) confirms the session stays
  usable after `after()`, but only on a hand-built service: `setupForDevtools()` does not return the instance.
- **`setupForDevtools()` cannot record traces.** It constructs the service without options
  (`packages/service/src/standalone.ts:46`), and the service defaults to `mode: 'live'`
  (`packages/service/src/index.ts:254`). Confirmed by measurement on 11.2.0: no trace is written, with or without
  `wdio:devtoolsOptions.mode` (probes P1b, P2).
- **`@wdio/session/launch` does not exist.** Unchanged at 10.2.0: `wdio-session` exports `.`, `./cli`, `./daemon`,
  `./agent` and `./package.json` (`packages/wdio-session/package.json:10-30`).
- **The snapshot peerDependency affects MCP — resolved in 10.2.0.** The published exact pin would have pulled a second
  `webdriverio` next to MCP's own once devtools-service is in MCP's tree. With the peer range in place, the probe
  measured a single `webdriverio` copy with `@wdio/devtools-service` 11.2.0 installed.

---

## Prior art: `feature/wdio-elements`

Based on v3.12.1, before v4 introduced the session agent (commits `3799594`, `26cc501`, `0c2e490`, `27c01cd`). Reference
only — not a merge or port candidate.

- Its probe findings on devtools still hold: `beforeSession()` rejects capabilities without top-level
  `browserName`/`platformName`; published types reject `mode` without a cast; `remote()` and `attach()` both honour
  `beforeCommand`/`afterCommand`; Electron sessions (`startWdioSession()`) are not traced.
- Its `eN` ref store (`element-refs.ts`, `withRefs()`) is superseded by the agent's refs. Two ref systems in one server
  would let a ref from one model reach tools that resolve the other.
- Known gap: upstream `packages/core/src/element-snapshot.ts` hardcodes `uiautomator2` for Android, so Espresso
  sessions get selectors that do not resolve *(not re-checked on current devtools)*.

---

## Risks

- **Cost of waiting.** Until v5, v4.x keeps every collector copy, its own trace and its own provider table, and keeps
  falling behind session's targets.
- **Agent API stability.** `@wdio/session/agent` is experimental. MCP uses `createAgentSession`, `SessionError`,
  `ActionArgsOf`, `AgentActionName`, `AgentSession`, `PageChange` (`src/session/agent.ts:1`) and `HintFormatter`
  (`src/session/hints.ts:1`); `src/tools/page-input.tool.ts:5` and `src/tools/session.tool.ts:17` import symbols from
  the same list. That list is the contract to stabilise or release in lockstep. The agent surface did not change
  between v10.1.0 and v10.2.0: `git diff v10.1.0 v10.2.0` is empty for `packages/wdio-session/src/agent.ts` and
  `src/agent/`.
- **Owners and release cadence.** Session, devtools and snapshot have different owners; a breaking snapshot change
  breaks another team's product. Semver discipline and a contract test are needed.
- **Reviewer objections to pre-empt.** Session owner: the symbol list above, a `launch` sketch covering the parity
  matrix, an `onAction` schema, and who does the session-side work. Devtools owners: MCP must not depend on unsupported
  internals (hand-built service, `mode` cast); running devtools' conformance suite in webdriverio CI moves CI cost to
  another organisation.
- **No test or migration plan yet** for what replaces the deleted `src/scripts` and `src/trace` tests. The install size
  comparison now exists (`devtools-trace-probe-results.md`, *Install footprint*).
- **webdriverio fixes MCP needs — resolved by the bump.** #16244 (stale ref without selector), #16131 (BiDi selector
  attach), #16150 (Android UiSelector) and #16273 (scoped mock restore) are all in v10.2.0. MCP gets them with the
  `10.2.0` pins of v4.x item 6, which are prepared and not yet submitted. The general cost stays: with
  exact pins, every later fix needs a release plus a manual bump.
- **`getCookies()` under-reports on BiDi sessions (worked around in MCP; upstream draft W1).** In `webdriverio` 10.1.0
  and 10.2.0, BiDi `getCookies()` reads the page-origin `storageKey` partition, which Chrome fills only with Secure
  cookies, and falls back to classic only on an empty result. MCP's `readCookies` in the prep change passes
  `sourceOrigin: null`, which reads the whole jar across domains. Cause and repro are in `v5-upstream-issue-drafts.md`
  (W1), unfiled.

---

## Open decisions

1. **Session owner:** is `@wdio/session` the engine and MCP the adapter? Engine features would land in session first
   even when MCP needs them first.
2. **Devtools owners:** does devtools accept session action events as a step source alongside WebDriver commands?
3. **Answered (webdriverio #16344, in 10.2.0).** **webdriverio monorepo:** is `workspace:*` in `dependencies` (snapshot
   and session) a deliberate lockstep policy? No: both packages now peer on `webdriverio ^10.0.0` (Chain A step 1).
4. **Investment:** how many MCP users run shell-based agents (where the session CLI plus a skill is often better) versus
   clients without a shell? The answer decides whether MCP grows or goes into maintenance after v5.
5. **Connector:** who wires session action events into the devtools recorder — MCP or devtools?
6. **Cutoff:** if decisions 1–2 stay open past an agreed date, is v5 explicitly parked while v4.x preparation continues?
7. **Session trace:** does session's `trace` action stay, merge into devtools, or get dropped? Otherwise there is a third
   trace implementation next to MCP's `src/trace` and devtools' `packages/trace`.
8. **Taken (2026-11-14).** **Pin policy:** MCP pins `@wdio/session` and `webdriverio` at exact versions, because
   `@wdio/session/agent` is still experimental. Revisit when the agent contract is declared stable.

This proposal supersedes `trace-extraction-proposal.md`, whose standalone `@wdio/trace` package is replaced by
devtools owning trace.
