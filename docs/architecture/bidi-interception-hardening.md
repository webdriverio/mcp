# BiDi interception hardening — follow-ups from browser mocks

Deferred items from the `mockType: 'browser'` work (PR #153, branch `feature/browser-mocks`).
Each was deliberately left out of that change; none block it. Verified facts are dated —
re-check against the installed `webdriverio` before acting.

## 1. Upstream bug: `respond(undefined)` sends an invalid BiDi `network.provideResponse`

**Status:** resolved upstream in webdriverio 10.2.0 (verified 2026-11-18, local Chrome): `respond(undefined)` throws at configure time with no crash, and `respond(null)` is accepted with no crash. The respond-value guard in `src/tools/mock.tool.ts` stays.

**What:** calling `mock.respond(undefined)` (or `null`) on a real BiDi session makes webdriverio
emit `network.provideResponse` with body `{"type":"string"}` and no value. The BiDi endpoint
rejects it (`invalid argument - Invalid input in "body"`), and because
`#handleResponseStarted` invokes the command synchronously inside the network event handler
(mitt emitter, `webdriverio/build/index.js` ~:4349), the rejected promise throws through the
handler into the host process — an uncaught exception that kills it. Reproduced standalone
against plain `webdriverio@9.31.6` on 2026-09-22; the same crash killed the MCP dev server
during live verification of the mock tools.

**Why upstream:** the failure class is webdriverio's — an invalid overwrite payload should be
rejected at `respond()` time (argument validation), not surface as a process-killing throw at
request-interception time. A fix there deletes the class for every consumer.

**Action:** none for 10.2.0. Re-check `respond(undefined)` on webdriverio upgrades; the guard stays.

**Adjacent, same guard class:** `WebDriverInterception` also exposes `request`/`requestOnce`
overwrites (deliberately unexposed by the MCP tools today). If they are ever added to the
behavior enum, they need the same validate-at-configure-time treatment — any invalid
overwrite payload reaches the same synchronous-throw path.

## 2. Process-level containment for throws inside BiDi event handlers

**What:** any uncaught throw inside a BiDi event handler (the class above is one instance)
reaches the process. `src/utils/crash-handlers.ts` (installed in `src/server.ts`) logs `unhandledRejection` and keeps running, and logs `uncaughtException` and exits 1. webdriverio 10.2.0's `RequestArbiter` wraps its own network handlers in try/catch, so throws there do not reach the process; that catch does not cover other BiDi listeners. The
respond-value guard closes the one known reachable path; unknown webdriverio bugs in
interception, or any other BiDi subsystem emitting through the same handler chain, remain
process-fatal.

**Status:** containment exists (`src/utils/crash-handlers.ts`, installed at `src/server.ts`). Only BiDi listeners outside the arbiter can still reach it.

**Open:** where containment belongs for those listeners: per-handler try/catch in the wdio event subscription, or session invalidation from a top-level handler. Continuing after an uncaught throw risks a corrupted BiDi socket and zombie sessions that look alive; "log and exit" forfeits the session but keeps state honest.

**Action:** decide that model, then implement behind it. Until then the exit-on-uncaught behavior stands.

## Related, lower priority

- **Replay gap (accepted limitation):** a `mock` step that fails at configure time is
  retained by the runtime registry (retry-friendly) but emitted by the generator only as an
  error comment; a later successful `get_mock_calls` for the same key then replays against a
  key the generated script never set — a `TypeError` at replay. Emitted code is best-effort
  and the error comment flags the gap; making `get_mock_calls` emit a creation line would
  trade a loud failure for a silently-empty one.
- **Behavior-taxonomy table:** the generator dispatches browser behaviors by string prefix
  (`startsWith('respond')` etc. in `src/recording/code-generator.ts`) instead of a table
  shared with the tool's zod enum. Pinned by generator tests; revisit only when the behavior
  enum grows — nothing structural forces a new behavior to update both sides today.
