# DevTools trace probe results

Date: 2026-11-14. Feasibility probe only; no design conclusions are drawn here.

## Environment

- Node v24.22.1, npm 11.19.1, Linux 6.18.58.1-microsoft-standard-WSL2
- Google Chrome 149.0.7827.155 (headless=new, `--no-sandbox`); chromedriver 149.0.7827.155 (auto-downloaded by webdriverio to `<tmp>/chromedriver/`)
- webdriverio 10.2.0, @wdio/devtools-service 11.2.0, @wdio/elements 1.3.0, @wdio/devtools-backend 2.2.0, @wdio/devtools-script 1.9.0, @wdio/devtools-app 1.13.0, fluent-ffmpeg 2.1.3, typescript 6.0.3 (P7 only, installed after the footprint numbers were taken)
- Scratch dir: `<scratch>/` (probes in `probes/`, per-probe stdout/stderr in `out/<probe>/stdout.txt|stderr.txt`, P7 in `p7/`)
- Reference source (read only): `<devtools checkout>` at 5c7d21a6. The published dist behaves the same as that source on every point checked below.
- Wall-clock minutes: about 7 (scratch dir created at epoch 1794658361, last probe finished about 1794658732, plus report writing).

## Install footprint

Commands: `npm init -y; npm pkg set type=module; npm i webdriverio@10.2.0`, then `npm i @wdio/devtools-service@11.2.0`.

| Step | `du -sk node_modules` | `find node_modules -name package.json -maxdepth 3 \| wc -l` | `npm ls --all --parseable \| wc -l` |
|---|---|---|---|
| webdriverio@10.2.0 only | 72720 KB | 149 | 168 |
| + @wdio/devtools-service@11.2.0 | 115964 KB | 256 | 274 |

Delta: +43244 KB, +106 packages (npm: "added 106 packages, and audited 274 packages").

- Distinct `webdriverio` copies: 1. `npm ls webdriverio --all` shows `webdriverio@10.2.0` at the top level; `@wdio/devtools-service` and `@wdio/elements` both show it as `deduped`.
- `@wdio/snapshot`: NOT installed (`node_modules/@wdio/snapshot` does not exist). `grep` finds a reference to the string only in `@wdio/elements/package.json`.
- Native/binary deps: no `*.node` files in `node_modules`. `fluent-ffmpeg@2.1.3` is installed (a JS wrapper that shells out to a system ffmpeg; no ffmpeg binary is bundled, no `ffmpeg-static`). `/usr/bin/ffmpeg` and `/usr/bin/ffprobe` exist on this machine, so whether the wrapper needs a system ffmpeg was not tested. `node_modules/fluent-ffmpeg` is 12556 KB, `@wdio/devtools-app` 3572 KB. The `edgedriver` and `geckodriver` postinstall scripts come from the webdriverio-only install, not from devtools-service.
- `@wdio/devtools-service` runtime deps include `@wdio/devtools-backend`, which pulls fastify and plugins (`@fastify/rate-limit`, `@fastify/static`, `@fastify/websocket`), `fflate`, `get-port`, `shell-quote` and `@wdio/devtools-app`.
- npm output after the second install: no peer-dependency warnings. Only these lines: `npm warn deprecated fluent-ffmpeg@2.1.3: Package no longer supported...`, the `install-scripts` notice (edgedriver, geckodriver), and "4 moderate severity vulnerabilities". `@wdio/allure-reporter` (optional peer, `peerDependenciesMeta`) was not installed.
- The package declares `engines.node` as `>=22.23.4 <23 || >=24.22.1 <25 || >=26.12.1`; Node 24.22.1 is the exact lower bound of the 24 range.

## P1. BiDi session, trace mode via the documented API

Documented usage (README, Live Mode > Standalone): `remote(setupForDevtools({ capabilities: { browserName: 'chrome' } }))`. The README Trace Mode section says only "Set `mode: 'trace'`" and does not show standalone code.

### P1a. Exactly as documented, with `capabilities: { browserName, 'wdio:devtoolsOptions': { mode: 'trace' } }`

Command: `node probes/p1.mjs` (cwd `out/...`), exit 1, stdout 0 bytes.

```
SevereServiceError: The DevTools hook does not support multiremote yet
    at e.beforeSession (.../@wdio/devtools-service/dist/index.js:6633:62)
    at Gd (.../dist/index.js:6397:41)
```

Cause, from `standalone.ts`: `setupForDevtools` calls `service.beforeSession(opts, opts)`, so the options object itself is treated as the capabilities and must have a top-level `browserName` or `platformName`. A nested `capabilities.browserName` is not enough.

Finding: the documented standalone snippet throws in 11.2.0 unless `browserName` is also set at the top level of the options.

### P1b. Same, plus top-level `browserName: 'chrome'` (`TOPCAP=1 node probes/p1.mjs`)

Exit 0, stdout 0 bytes, stderr: `isBidi true`, then url `https://www.iana.org/help/example-domains` (click worked), `deleted`. No `test-results/` directory and no trace written in the cwd or anywhere else. Re-run with `outputDir=<custom outputDir>`: also no trace; only `wdio-chromedriver-*.log` appears there.

Cause (source and dist): `setupForDevtools` does `new DevToolsHookService()` with no arguments, so `#options` is `{}`; `mode` is read from `#options.mode`, not from the `wdio:devtoolsOptions` capability (the capability only goes to the `SessionCapturer` constructor). `setupForDevtools` has no options parameter.

Finding: through `setupForDevtools()` there is no way to select trace mode; the `wdio:devtoolsOptions: { mode: 'trace' }` capability has no effect and no trace is written.

### P1c. Manual wiring (deviation from the documented API)

`probes/wire.mjs` copies the dist `setupForDevtools` body but constructs `new DevToolsHookService({ mode: 'trace' })` (default export of the package) and returns the service handle. `probes/p1m.mjs` uses it, top-level `browserName`, BiDi, navigates to example.com, clicks the link, `deleteSession()`. Exit 0.

Default output dir (`out/p1_manual_default`, no `outputDir`), stdout 139 bytes:

```
DevTools trace saved to <scratch>/out/p1_manual_default/test-results/trace-e9921e0484267e3e6ec9f55773f43998.zip
```

File: `test-results/trace-<sessionId>.zip`, 305742 bytes, relative to the process cwd. Zip entries: `trace.trace` (6008), `trace.network` (34363), `transcript.md` (97), `trace.mutations` (18524), `page-resources.ndjson` (358), `resources/page@<id>-<ts>.png` (3 screenshots, 1906/42578/69156), `resources/page@...-snapshot.txt` (3), `resources/page@...-elements.json` (1), content-hashed `resources/<sha1>.png` (3) and two extensionless hashed resources (121482, 135580). `trace.trace` has 19 lines of JSON events (types seen: context-options, before/after, console, stdout, stderr, screencast-frame, frame-snapshot, resource-snapshot and others).

Custom `outputDir` (`remote({ outputDir: '<custom outputDir>' })`), stdout 102 bytes:

```
DevTools trace saved to <custom outputDir>/test-results/trace-c46f7cb0837eea01cc791e117f6dd789.zip
```

File listing: `<custom outputDir>/test-results/trace-<id>.zip` 305711 bytes, plus `<custom outputDir>/wdio-chromedriver-34619.log` 351 bytes (wdio log redirect because `outputDir` is set). `test-results/` IS appended to a custom `outputDir` (matches `resolveAdapterOutputDir`, which always `path.join`s `test-results`).

Finding: with manual wiring a BiDi trace.zip is written at `deleteSession()` under `<outputDir or cwd>/test-results/`, and the service prints `DevTools trace saved to ...` to real stdout.

## P2. Default mode via `setupForDevtools()` without the capability

Command: `node probes/p2.mjs` (setupForDevtools, top-level `browserName`, no devtools capability), exit 0, stdout 0 bytes. Listening ports snapshotted with `ss -ltnpH` before and during the session.

New listeners during the session: only `chromedriver` (`*:40487`) and `chrome` (`127.0.0.1:40667`, the debug port). No listener owned by the node probe process, no `xdg-open`/extra browser process in the process tree (only chromedriver and its headless chrome children), nothing printed to stdout. No trace or `test-results/` written.

Source note: `mode` defaults to `'live'` (`this.#options.mode ?? 'live'`), but the SessionCapturer only opens a WebSocket when given a `hostname` and `port` (`session-capturer.ts` constructor), and the backend server is started by the launcher (test-runner path), not by `setupForDevtools`.

Finding: yes, it runs in `live` mode; in standalone that starts no server, opens no port and no UI, and persists nothing.

## P3. Finalize without ending the session (manual wiring, `service.after()`)

`after()` is not reachable from the published API: `setupForDevtools` closes over its service instance and returns only the options. It was called here on the instance from `probes/wire.mjs`. Command: `node probes/p3.mjs`, exit 0, stdout 372 bytes.

```
[probe] before after(): []
[probe] after after(): ["trace-550e038a67a0ca39499979952521c64c.zip"]
[probe] alive: title = Example Domains url = https://www.iana.org/help/example-domains
[probe] alive: navigated again, title = Example Domain
[probe] after deleteSession: ["trace-550e038a67a0ca39499979952521c64c.zip"]
```

Trace was 347732 bytes after the whole run. The line `DevTools trace saved to ...` was printed three times on stdout (same path each time; the later `deleteSession()` triggers `after()` a second time, which re-announces the accumulated artifact list). Only one zip file exists afterwards, so the second `after()` overwrote the same file name.

Finding: with manual wiring `after()` writes the trace and the browser session stays usable afterwards; it is not exposed by `setupForDevtools()`.

## P4. Classic (non-BiDi) session

Command: `node probes/p4.mjs` (manual wiring, trace mode, `'wdio:enforceWebDriverClassic': true`), exit 0, stdout 124 bytes (the one `DevTools trace saved to .../out/p4/test-results/trace-0e5105d09bd68edf2628c844e5209897.zip` line).

stderr (wdio logger, not thrown):

```
ERROR @wdio/devtools-service: Failed to inject script at session start: Can not set up devtools for session with id "0e5105d0..." because it doesn't support WebDriver Bidi
[probe] isBidi false webSocketUrl
```

The session completed and a 303129-byte trace.zip was written with the same entry types as the BiDi trace (`trace.trace`, `trace.network`, `trace.mutations`, screenshots, snapshots).

Finding: classic sessions do not throw; the service logs the injection failure at ERROR to stderr and still writes a trace. Whether that trace's DOM mutation content is complete was not assessed (`trace.mutations` is 16683 bytes vs 18524 for BiDi).

## P5. Console and stream hygiene (manual wiring, trace mode)

Command: `node probes/p5.mjs`, exit 0, stdout 146 bytes:

```
PROBE-LOG
PROBE-WRITE
DevTools trace saved to <scratch>/out/p5/test-results/trace-c8330b00e23bd683933a39b872475f2a.zip
```

Page-side `console.log('PAGE-LOG')` and `console.error('PAGE-ERR')` (via `browser.execute`) did not reach the process stdout or stderr; they appear in `trace.trace` (6 matches each). `PROBE-LOG` and `PROBE-WRITE` from the Node process appear on stdout once each and also in `trace.trace`. The only stdout content added by the service is the `DevTools trace saved to ...` line (written with `process.stdout.write` in `#announceTraces`, after cleanup).

Function identity (`probes/p5.mjs`, `probes/p5b.mjs`), compared with `===` against references taken before `wire()`:

| Point | console.log / console.error / stdout.write / stderr.write same as original |
|---|---|
| T0 before `wire()` | true / (not checked) / true / (not checked) |
| T1 after `wire()` (service constructed, `beforeSession` called; before `remote()`) | false / false / false / false |
| T2 after `remote()` | false |
| T3 after first command (when `before()` builds the real capturer) | false |
| T4 after `deleteSession()` | false |
| T5 later (after another `console.log`) | false |

Patching happens at service construction/`beforeSession`, not at the first command, and the functions are not back to the originals after `deleteSession()` (`after()` calls `cleanup()` on the capturer created in `before()`, whose saved "originals" are already the patched functions).

Finding: stdout stays clean except for the `DevTools trace saved to` line, but `console.*` and `process.stdout/stderr.write` are patched from `setupForDevtools()` time and are NOT restored to the original functions after the session ends.

## P6. Two concurrent sessions, one process (A open, B open, A close, B close)

Command: `node probes/p6.mjs <p6 outdir>` (manual wiring, each with its own `service`, `outputDir` `<p6 outdir>/A` and `<p6 outdir>/B`), exit 0, stdout 231 bytes:

```
LOG-A-ONLY
LOG-BOTH
DevTools trace saved to <p6 outdir>/A/test-results/trace-7e8c6ed3948de4a0e4af344e5c2edffb.zip
LOG-B-ONLY
DevTools trace saved to <p6 outdir>/B/test-results/trace-f6f8d5688ccaa48cf630945ae7d5b4eb.zip
LOG-AFTER-ALL
```

Identity after each step (`console.log`, `process.stdout.write` vs originals): `false` at A open, A+B open, A closed (B open) and A and B closed.

Separate traces: yes, two zips (87575 and 87522 bytes). Console lines found in `trace.trace` (extracted and grepped):

- A: `LOG-A-ONLY`, `LOG-BOTH`
- B: `LOG-BOTH` only. `LOG-A-ONLY` (logged before B existed) is absent, as expected; `LOG-B-ONLY` (logged after A closed, while B was still open) is also absent from B's trace.
- Neither trace contains a line that was logged only while the other session was the sole open one except as described above; `LOG-BOTH` (logged while both were open) is in both.

Finding: each session gets its own trace, the console functions are never restored to the originals, and B's trace misses a Node console line logged after A closed while B was still open.

## P7. Consumer type-check of the published package

Reading the installed files: `node_modules/@wdio/devtools-service/dist/types.d.ts` lines 1-4 import and re-export from `'../packages/shared/src/index.ts'` and `'../packages/elements/src/index.ts'`; other `.d.ts` files (`allure`, `assert-capture`, `assertion-tracker`, `action-snapshot`, `screencast`, `screencast-lifecycle`, `command-error`, `session`, `test-metadata`) import from `'../packages/core/src/index.ts'` and `'../packages/shared/src/index.ts'`. The path `node_modules/@wdio/devtools-service/packages` does NOT exist (`ls: No such file or directory`).

Command: `npx tsc -p p7` with `module/moduleResolution: NodeNext`, `strict`, TypeScript 6.0.3, `@types/node@24`, consumer `p7/consumer.ts` importing `setupForDevtools` and `ServiceOptions`/`DevToolsMode` from `@wdio/devtools-service/types`.

Without `skipLibCheck` (exit 2), decisive devtools-service errors:

```
dist/types.d.ts(1,55): error TS2307: Cannot find module '../packages/elements/src/index.ts' ...
dist/types.d.ts(2,78): error TS2307: Cannot find module '../packages/shared/src/index.ts' ...
dist/session.d.ts(2,37): error TS2307: Cannot find module '../packages/core/src/index.ts' ...
dist/standalone.d.ts(11,75): error TS2344: Type '"sendUpstream"' does not satisfy the constraint 'keyof SessionCapturer'.
```

The same run also reports errors from other packages (duplicate `URLPattern` identifiers between `lib.dom` / `@types/node` / `urlpattern-polyfill`, `puppeteer-core` not found in webdriverio's types, `@wdio/types` `Browser` interface), which are not attributed to devtools-service.

With `--skipLibCheck` (exit 2), consumer-file errors:

```
p7/consumer.ts(5,30): error TS2353: Object literal may only specify known properties, and 'mode' does not exist in type 'ServiceOptions'.
p7/consumer.ts(6,24): error TS2345: Argument of type 'WebdriverIO' is not assignable to parameter of type 'WebdriverIOConfig'.
  p7/consumer.ts(6,43): error TS2353: ... 'capabilities' does not exist in type 'WebdriverIO'.
```

Control (`p7/control.ts`, no devtools-service import): `const o: Options.WebdriverIO = { capabilities: { browserName: 'chrome' } }` fails with the same `'capabilities' does not exist in type 'WebdriverIO'` error, while `remote({ capabilities: ... })` type-checks. So the `capabilities` error comes from `setupForDevtools(opts: Options.WebdriverIO)` using a type that has no `capabilities` property in @wdio/types 10.2.0, not from the missing paths. The `'mode' does not exist in ServiceOptions` error is a consequence of the unresolved `BaseDevToolsOptions` import from the missing path.

Finding: the published package's `.d.ts` files reference `../packages/{shared,core,elements}/src/index.ts` that do not exist in the install; a consumer gets TS2307 errors without `skipLibCheck`, and with it `ServiceOptions.mode` is not visible to the type system and the README call shape does not type-check against `setupForDevtools`.

## NOT RUN

Nothing was skipped. Chrome and chromedriver started normally under WSL2 (no errors). Not examined: Firefox/Safari, native mobile sessions, a long-lived server process over many sessions, whether the `DevTools trace saved to` line can be suppressed by an option, and whether fluent-ffmpeg is actually invoked in trace mode (`traceVideo` and `screencast` options were left at defaults).