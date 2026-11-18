# Roadmap: @wdio/mcp v4

Unshipped work only. Not a commitment to dates.

## What v4 is

v4 is the maintenance and preparation line while v5 waits on upstream releases. It takes:

- fixes for defects users hit today, including in code v5 will delete (providers, trace, element collection);
- MCP-only, non-breaking changes that make v5 smaller: deprecations, dependency bumps, routing tools through the `@wdio/session` agent;
- additive work in areas MCP keeps after v5: multiple sessions, tool descriptions, resources, docs search.

## What v4 is not

- New launch, target or cloud-provider features. In v5, launch belongs to `@wdio/session`; propose them there.
- New trace features. In v5, trace belongs to devtools.
- New element-collection logic. `@wdio/snapshot` owns the collector.
- Anything breaking, or anything that needs an unpublished upstream release. That is v5.

A fix under `src/providers/` is also checked against `@wdio/session`'s equivalent and recorded in the provider parity matrix, so the v5 launch path does not regress it.

The v5 plan, provider parity matrix and upstream issue list are in `docs/architecture/` ([`v5-proposal.md`](docs/architecture/v5-proposal.md), [`provider-parity-matrix.md`](docs/architecture/provider-parity-matrix.md), [`v5-upstream-issues-to-file.md`](docs/architecture/v5-upstream-issues-to-file.md)).

## Fixes

| Item | Status | Owner of detail |
| --- | --- | --- |
| BrowserStack: mark mobile browser sessions on the Automate API | fix in PR #193 | `src/providers/cloud/browserstack.provider.ts` |
| BrowserStack mobile: the `browser` option is ignored; a mobile browser session needs `browserName` in capabilities | fix in PR #193 | `src/providers/cloud/browserstack.provider.ts` |
| Mobile without `app` overwrites a user-supplied `appium:app` (BrowserStack, Sauce Labs, TestMu, TestingBot) | fix in PR #193 | `src/providers/cloud/browserstack.provider.ts` |
| Sauce Labs: result marking may fail silently on an unchecked response | fix in PR #193 | `src/providers/cloud/saucelabs.provider.ts` |
| Generated local script declares `browser` inside `try` and uses it in `finally` | fixed, not yet submitted | `src/recording/code-generator.ts` |
| Trace remaining Appium mobile tools (PR #191, fixes #190; also fixes `select_option`, `press_key` and `perform_actions` emitting no trace events) | open PR; belongs in v4 as a fix to code v5 deletes | PR #191 (branch `feature/appium-trace`) |

## v5 preparation (non-breaking)

Detail: v5 plan, section "v4.x preparation".

| Item | Status |
| --- | --- |
| Deprecate the `./snapshot` and `./trace` exports and the `wdio-show-trace` bin, with a one-time warning | prepared, not yet submitted; open: size usage with a code search |
| Bump `webdriverio` and `@wdio/session` (exact pins) | prepared, not yet submitted |
| Route cookie tools through the agent; record `switch_frame`, `set_geolocation` and the cookie tools | prepared, not yet submitted |
| Read the whole cookie jar on BiDi sessions (workaround for upstream W1) | prepared, not yet submitted |
| Route `rotate_device`, `hide_keyboard`, `drag_and_drop` through the agent | blocked on a device run |
| Browser `elements` / `accessibility` resources on the agent snapshot | proposal; web A/B incomplete, decision open |
| `get_elements` on the agent snapshot | blocked on a mobile and Electron measurement |

A published v4.x with the deprecations starts the window v5's export removal depends on.

## Multiple sessions

MCP keeps this after v5.

| Item | Status |
| --- | --- |
| List live sessions by name | open; `wdio://sessions` has no name field |
| Idle timeout and a cap on live sessions, failing loudly | proposal |
| Cleanup policy for cloud sessions left running | proposal |

## Proposals

| Proposal | Placement |
| --- | --- |
| [BiDi interception hardening](docs/architecture/bidi-interception-hardening.md) | v4: MCP keeps the mock tools; the follow-ups land here |
| [Session configuration](docs/architecture/session-configuration-proposal.md) | v5: folds into upstream S1 (`@wdio/session` launch) |
| [Trace recording and replay](docs/architecture/trace-recording-and-replay.md) | future work; trace moves to devtools in v5 |

## Moved out of v4

- Trace via BiDi: devtools, as part of v5.
- [Interaction sequencing](docs/architecture/interaction-sequencing-proposal.md): after v5, if MCP keeps growing.
- Visual regression, file upload/download, assertion helpers: after v5, same condition.
- Cross-process session registry: after v5; overlaps `@wdio/session`'s daemon.
- iframe support: shipped (`switch_frame`).
- Record and replay: recording ships as generated code; replay goes with trace to devtools (see the trace replay proposal).

## How to influence this roadmap

Open an issue with the use case, or comment on a proposal in `docs/architecture/`.
