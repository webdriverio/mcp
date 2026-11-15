# Roadmap: @wdio/mcp v5

Unshipped work only. Not a commitment to dates.

## What v5 is

Consolidation. MCP becomes a protocol layer (transport, toolsets, tool descriptions, resources, docs search, multiple sessions) over `@wdio/session` (launch, page model, actions, generated code) and devtools (trace). Success means deleting MCP's own launch, trace and element-collection code without regressing what the [provider parity matrix](docs/architecture/provider-parity-matrix.md) and the trace acceptance criteria in the [v5 plan](docs/architecture/v5-proposal.md) describe.

Decided: one launch path for session-backed targets, with no fallback to v4 launch code. Kept outside it: `attach_session`, `provider: 'external'`, and Digital.ai only if its port misses the gating `@wdio/session` release.

v5 is a coordinated release. It ships only when every upstream change it depends on is merged and published at a named version. Until then, work goes to the v4 line.

## What v5 is not

- Not a feature release. New tools wait for the investment decision (open decision 4).
- Not trace feature work. Trace capability is whatever devtools ships.
- No launch logic of MCP's own.

## Breaking changes to announce

- The `trace` parameter: format, location and player change.
- The `./snapshot` and `./trace` exports and the `wdio-show-trace` bin are removed, after the v4 deprecation window.
- `start_session` input moves to target, config or provider.
- Launch defaults and names that differ between MCP and `@wdio/session`. Each is decided in upstream issue S1; see the parity matrix.

## Gates, in dependency order

Every upstream step counts only when merged and published at a named version.

### Owner decisions

See the [v5 plan](docs/architecture/v5-proposal.md), "Open decisions".

| Decision | Status |
| --- | --- |
| 1. `@wdio/session` is the engine, MCP the adapter | open, session owner |
| 2. Devtools accepts session action events as a step source | open, devtools owners |
| 4. MCP investment after v5 | open; decides the "After v5" list |
| 5. Who connects action events to the devtools recorder | open |
| 6. Cutoff date for parking v5 | open |
| 7. Fate of `@wdio/session`'s own `trace` action | open |

### Publish the evidence

| Item | Status |
| --- | --- |
| Make the v5 plan, parity matrix and probe results reachable on the default branch | ready, needs approval |
| File the [upstream issues](docs/architecture/v5-upstream-issues-to-file.md) | ready once the matrix resolves |

### Chain A: collector

| Item | Status |
| --- | --- |
| A3. `collectScript()` feasibility; devtools captures trace snapshots with it | open |
| A4. Devtools deletes its collector copies | blocked on A3 |

### Chain B: engine (critical path)

| Item | Status |
| --- | --- |
| B1. In-process launch API with hook injection (S1) and the action-event schema (S2) | in review: webdriverio/webdriverio#16464 (S1), #16466 (S2) |
| B2. `@wdio/session` release with `@wdio/session/launch` and the Digital.ai provider (S3) | not started; blocked on B1 |
| B3. Devtools accepts session action events (D7) | blocked on decision 2 and B1 |
| B4. Devtools release that meets the trace acceptance criteria (upstream issues D1-D6, D8) | blocked on devtools |

### MCP-side gates

| Item | Status |
| --- | --- |
| v4.x with the deprecations published, window elapsed | blocked on pushing and merging feature/v4-prep-10.2 (no PR yet) |
| Collector comparison on a mobile app and an Electron app | blocked on a device run; no owner |

## MCP v5 changes

Detail: the [v5 plan](docs/architecture/v5-proposal.md), section "v5".

| Change | Status |
| --- | --- |
| `start_session` through session's plan, launch and agent; delete `src/providers/` except attach and external | blocked on B2 |
| Trace through devtools from action events; delete `src/trace/` | blocked on Chain A, B3, B4 |
| Delete `src/scripts/` and `src/locators/` | blocked on the collector comparison |
| Remove `./snapshot`, `./trace`, `wdio-show-trace` | blocked on the deprecation window |
| Reduce the code generator to what session cannot generate | blocked on S5 for the full reduction |
| Launch and configuration design ([session configuration proposal](docs/architecture/session-configuration-proposal.md)) | folds into upstream S1 (`@wdio/session` launch); no MCP-side work of its own |
| Pin policy: exact pins | decided; revisit when the agent contract is declared stable |

## Upstream defects, not blocking

S4 (`exec` code and arguments), S6 (TypeScript in generated frame code), W1-W3 (webdriverio). See the [upstream issue list](docs/architecture/v5-upstream-issues-to-file.md).

## After v5

Depends on open decision 4.

- [Interaction sequencing](docs/architecture/interaction-sequencing-proposal.md): stale draft; re-scope against the agent first.
- Cross-process session registry.
- Visual regression, file upload/download, assertion helpers.
