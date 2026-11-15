# Provider parity matrix: `@wdio/mcp` launch and lifecycle vs `@wdio/session` 10.2.0

Refs checked on 2026-11-14: `@wdio/mcp` at `982d6e7` and `@wdio/session` at
the `v10.2.0` tag (commit `5743972`). `@wdio/session` 10.2.0 exports only `.`, `./cli`, `./daemon`, `./agent` and
`./package.json` (`package.json:10-30`), so there is no `./launch` subpath, and `buildPlan` is internal: it is declared
in `src/targets/index.ts:39`, its only caller is `src/cli/command.ts:21,291`, and neither `src/index.ts:1-11` nor
`src/agent.ts:24-26` re-exports it. `launch()` (`src/targets/launch.ts:31`) is likewise only imported by the daemon
(`src/daemon/main.ts:10,78`). Prototype notes in rows 7a and 11a–11f were added 2026-11-15.

Reading notes. MCP paths are relative to the `@wdio/mcp` repo root; `@wdio/session` paths are relative to
`packages/wdio-session/` at the tag. "Daemon only" means the behaviour lives in `src/daemon/*` or `src/cli/*`, which a
caller of an in-process launch function would not get. MCP at `982d6e7` depends on `@wdio/session` 10.1.0
(`package.json:63`) and uses it only through `createAgentSession` (`src/session/agent.ts:25`); the comparison below is
against 10.2.0 as requested. Status values: `covered`, `partial`, `absent`, `unverified`.

## Main matrix

| # | Behaviour | MCP today | `@wdio/session` 10.2.0 | Status | Gap note |
|---|-----------|-----------|------------------------|--------|----------|
| 1a | Local browser launch: Chrome, Firefox, Edge, Safari | `src/providers/local-browser.provider.ts:78-102`; enum `src/tools/session.tool.ts:22`; `remote()` at `src/tools/session.tool.ts:326` | `src/targets/browser.ts:8-16,57-93`; `remote()` at `src/targets/launch.ts:81-86` | covered | Edge `browserName` is `msedge` in MCP and `MicrosoftEdge` in session; session rejects Safari off macOS (`src/targets/browser.ts:22-24`) |
| 1b | Headless (default on; Safari falls back to headed) | `src/providers/local-browser.provider.ts:35,41-42,56-67`; note at `src/tools/session.tool.ts:395-397` | `src/targets/browser.ts:30-37,66,82` | covered | session adds `--enable-unsafe-swiftshader`, MCP adds `--disable-gpu` and `--disable-dev-shm-usage` |
| 1c | Window size | default 1280x800 `src/tools/session.tool.ts:50-51`; `--window-size` `src/providers/local-browser.provider.ts:45`; `setWindowSize` `src/tools/session.tool.ts:370` | default 1280x720 `src/constants.ts:11`; `src/targets/browser.ts:38,67,83-84`; applied in `src/daemon/init.ts:15-22` | partial | launch arg is set by the plan, but the post-launch viewport call is daemon only |
| 1d | User-supplied capabilities merge | `src/providers/local-browser.provider.ts:104-112,131-146` (vendor option objects merged, `args` arrays concatenated) | `src/targets/index.ts:114-117`; `src/targets/utils.ts:15-23` (deep merge, arrays replaced) | partial | a user `args` array replaces the built-in args instead of extending them |
| 1e | Default Chromium flags and base capabilities (`--no-sandbox`, `--disable-web-security`, fake media, `acceptInsecureCerts: true`) | `src/providers/local-browser.provider.ts:44-54,69-76` | `src/targets/browser.ts:41-52,63-72` (none of those flags; no `acceptInsecureCerts`) | absent | session sets only headless, window size, profile and `AutomationControlled` |
| 1f | `pageLoadStrategy: 'eager'` | `src/providers/local-browser.provider.ts:75` | `src/targets/browser.ts:51` | covered | none |
| 1g | Headless user agent rewritten to the headed one (local Chrome/Edge, BiDi) | `src/providers/local-browser.provider.ts:150-155`; called at `src/tools/session.tool.ts:328-336` | `src/daemon/userAgent.ts:24-36`; called from `src/daemon/init.ts:41` | partial | daemon only; `createAgentSession` does not apply it (`src/agent.ts:251-274`) |
| 1h | Initial navigation with a bounded wait (`navigationUrl`) | `src/tools/session.tool.ts:378-390` | `src/daemon/init.ts:46-52` | partial | daemon only; `launch()` does not navigate |
| 2a | `connectionRetryTimeout` 45000, `connectionRetryCount` 0, `bidiResponseTimeout` 30000 for local browsers | `src/providers/local-browser.provider.ts:4-6,25-31` | `src/targets/index.ts:44-55` (browser plans set no retry options); `src/types.ts:73-85` (`RemoteOptions` has no `bidiResponseTimeout`) | absent | session sets retry options for Android/iOS only (`src/targets/index.ts:89-94`, 480000 ms / 0 via `src/targets/mobile.ts:26`) |
| 2b | `connectionRetryTimeout` 30000, `connectionRetryCount` 3 for CDP attach | `src/tools/session.tool.ts:668-672` | `src/targets/index.ts:44-55` (none set) | absent | no retry options on the `--attach` path |
| 3 | `networkLogs` mapped to `goog:loggingPrefs` / `ms:loggingPrefs` `{ performance: 'ALL' }` | `src/providers/local-browser.provider.ts:82-84,89-91,108,110`; param `src/tools/session.tool.ts:87,292` | absent (no `loggingPrefs` in `src/`; `src/targets/browser.ts:57-78` builds only the options object) | absent | reachable only by passing the capability by hand through `--capabilities` (`src/targets/index.ts:114-117`) |
| 4 | Chrome driver process-tree kill on close | roots captured at start `src/tools/session.tool.ts:340,349`; `src/providers/local-browser.provider.ts:9-11`; `src/session/driver-tree.ts:20-32,34-52,54-70`; kill on `deleteSession` failure `src/session/lifecycle.ts:184-190,114-118`; on exit `src/session/lifecycle.ts:224-229`, `src/server.ts:247,354` | `src/targets/launch.ts:87-111` (SIGKILL the driver pid only when the session died); process-group kill `src/daemon/main.ts:52-58`, `src/daemon/state.ts:112-121` | partial | group kill is daemon only; a failed `deleteSession` is logged, not followed by a kill (`src/targets/launch.ts:128-134`) |
| 5a | Local Appium: iOS capability building | `src/config/appium.config.ts:57-111`; `src/providers/local-appium.provider.ts:50-62` | `src/targets/mobile.ts:46-116` | partial | no `autoDismissAlerts`; `autoAcceptAlerts` is `false` (`src/targets/mobile.ts:73`) vs MCP default `true` (`src/config/appium.config.ts:92`); `newCommandTimeout` fixed at 3600 (`src/targets/mobile.ts:52`); requires app, bundle id or browser (`src/targets/mobile.ts:111-113`) |
| 5b | Local Appium: Android capability building | `src/config/appium.config.ts:116-170`; `src/providers/local-appium.provider.ts:63-74` | `src/targets/mobile.ts:46-116` | partial | no `appWaitActivity` or `autoDismissAlerts`; `autoAcceptAlerts` not set; adds install/launch timeouts MCP does not set (`src/targets/mobile.ts:60-71`) |
| 5c | Local Appium: host/port/path/protocol of a running server | `src/providers/local-appium.provider.ts:25-33`; env defaults `APPIUM_URL`, `APPIUM_URL_PORT`, `APPIUM_PATH`, `APPIUM_PROTOCOL` at `src/config/appium.config.ts:45-52`; param `src/tools/session.tool.ts:77-82` | `--appium-url` `src/actions/specs.ts:97`; `src/targets/mobile.ts:139-141`; `src/targets/utils.ts:74-87` | partial | one URL instead of four fields; no env var defaults; without it session spawns its own server (`src/targets/mobile.ts:142-146`) |
| 5d | `noReset` on close: session is closed, app data kept; `detach: true` leaves it running | `src/providers/local-appium.provider.ts:95-97`; `src/tools/session.tool.ts:182,780-791`; start note `src/tools/session.tool.ts:559-561` | `appium:noReset` from `--no-reset` `src/targets/mobile.ts:81-83`; close always `deleteSession` `src/targets/launch.ts:110` | partial | close-by-default matches; no way to leave the Appium session running |
| 6 | External provider: user-supplied hub, capabilities passed through, browser only | `src/providers/external.provider.ts:19-27,29-46,52-54`; guard `src/tools/session.tool.ts:732-737`; schema `src/tools/session.tool.ts:71-76` | `--hostname/--port/--path/--protocol` `src/actions/specs.ts:71-74`; `src/targets/index.ts:47-55` | partial | local browser args stay in the capabilities (stripped only for cloud, `src/targets/cloud.ts:299`); no detach-by-default for such sessions |
| 7a | Attach to an existing WebDriver/Appium session by id (`attach_session`) | `src/tools/session.tool.ts:575-650,757-771` (`attach()` at `591-596`) | absent (no `attach(` call in `src/`; `createAgentSession` wraps a browser object the caller already holds, `src/agent.ts:251-264`) | absent | no session-id attach in the launch path; closable caller-side: webdriverio `attach()` + `createAgentSession` gave a working snapshot on real Chrome (2026-11-15); with caps-only attach `isBidi` was false and BiDi-dependent features were not checked |
| 7b | Attach to a running Chrome over CDP (`start_session` `attach: true`) | `src/tools/session.tool.ts:652-718`; CDP wait `269-281`; stale BiDi mapper cleanup and tab restore `230-267` | `--attach` `src/actions/specs.ts:85`; `src/targets/browser.ts:25-28,60-61,103` | partial | no CDP readiness wait, mapper cleanup or tab restore; session also accepts Edge |
| 7c | Spawn Chrome with a debugging port for later attach (`launch_chrome`) | `src/tools/launch-chrome.tool.ts:15,75-84` | absent (no `remote-debugging-port` in `src/`) | absent | none |
| 7d | Detach vs close on `close_session`: `detach` param; attached and external sessions detach by default; `detach: false` force-closes | `src/tools/session.tool.ts:180-188,773-804`; `src/session/lifecycle.ts:142-148,166-170,207-210`; attach metadata `src/tools/session.tool.ts:602-603,679` | `detach` is a plan field `src/types.ts:106-109`, set only by `--attach` (`src/targets/browser.ts:103`) and `attachedPlan` (`src/debug.ts:49-70`); applied at `src/targets/launch.ts:99-109`; `close` takes no argument (`src/actions/lifecycle.ts:48-56`) | partial | decided at open time, not per close; detach sends SIGTERM to the driver pid |
| 7e | Mocks released when detaching | `src/session/lifecycle.ts:103-106,207-210`; `src/tools/mock.tool.ts:157-165` | absent (`dispose` runs registered disposers only, `src/session.ts:251-259`; none restores mocks: `src/actions/contexts.ts:664`, `src/daemon/capture.ts:322`, `src/daemon/watchdog.ts:66`, `src/helpers.ts:449,477`) | absent | mocks are removed only by the `unmock` action (`src/actions/network.ts:207-216`) |
| 8a | Electron launch through `@wdio/electron-service` `startWdioSession` | `src/tools/session.tool.ts:425-490` (call at `459,470`); lazy import `src/electron/runtime.ts:7-13` | `src/targets/electron.ts:51-129,139-145`; dispatch `src/targets/launch.ts:66-67` | partial | session requires an app path (`src/targets/electron.ts:52-59`) and passes `rootDir: plan.cwd` (`145`); MCP also accepts `electronRootDir` alone or caller-built `wdio:electronServiceOptions` (`src/tools/session.tool.ts:433-443,470`) |
| 8b | Electron cleanup (`cleanupWdioSession` before `deleteSession`) | `src/electron/runtime.ts:15-23`; `src/session/lifecycle.ts:179-183,113`; start-failure disposers `src/tools/session.tool.ts:480-481` | `src/targets/electron.ts:146-160` | covered | none |
| 8c | Replaced Electron session fully torn down before the next one starts; Electron cannot be detached | `src/tools/session.tool.ts:448-457,781-783` | `--replace` closes and waits for the daemon to exit `src/cli/command.ts:302-310,349-372` | partial | daemon only; no in-process equivalent |
| 9a | BrowserStack: hub, credentials, capability namespace, app refs, browser + mobile | hub `hub.browserstack.com` / `hub-cloud.browserstack.com` `src/providers/cloud/browserstack.provider.ts:11-22`; env `19-20`; `bstack:options` `30-49,52-77`; app ref `71`; upload tool `src/tools/cloud-provider.tool.ts:52-71` | `src/targets/cloud.ts:43-58,186-210`; auto-upload of a local app `318-325`; applied to browser and mobile plans `src/targets/index.ts:73-75,96-98` | partial | one hub for both (`src/targets/cloud.ts:52`); no `browserVersion: 'latest'`, `appiumVersion` or `deviceType` defaults; credentials also written into the options object (`179-182`); forces classic protocol (`300,340`) |
| 9b | Sauce Labs: region hub, credentials, capability namespace, app refs, browser + mobile | `ondemand.<region>.saucelabs.com`, default `eu-central-1` `src/providers/cloud/saucelabs.provider.ts:14-28`; regions `src/tools/session.tool.ts:83`; `sauce:options` `37-55,78-95`; `storage:filename=` refs `src/tools/cloud-provider.tool.ts:74-94` | `src/targets/cloud.ts:10,59-78,140-146,211-220` | partial | default region is `us-west-1` (`src/targets/cloud.ts:141`); `os`/`osVersion` not mapped; upload returns `storage:<id>` (`73-76`) |
| 9c | TestMu / LambdaTest: hub, credentials, capability namespace, app refs, browser + mobile | `hub.lambdatest.com` / `mobile-hub.lambdatest.com`, env `TESTMU_USERNAME` / `TESTMU_ACCESS_KEY` `src/providers/cloud/testmu.provider.ts:11-22`; `lt:options` `30-49,72-92`; upload `src/tools/cloud-provider.tool.ts:97-121` | `src/targets/cloud.ts:95-116,231-255` | partial | env vars are `LT_USERNAME` / `LT_ACCESS_KEY` (`src/targets/cloud.ts:98-99`); options key is `LT:Options` (`100`) |
| 9d | TestingBot: hub, credentials, capability namespace, app refs, browser + mobile | `hub.testingbot.com`, env `TESTINGBOT_KEY` / `TESTINGBOT_SECRET` `src/providers/cloud/testingbot.provider.ts:11-21`; `tb:options` `29-47,70-84`; upload `src/tools/cloud-provider.tool.ts:124-144` | `src/targets/cloud.ts:79-94,221-230` | partial | `os`/`osVersion` not mapped (MCP maps them to `platformName`, default `Windows 11`, `src/providers/cloud/testingbot.provider.ts:45`) |
| 9e | Digital.ai: `DIGITALAI_CLOUD_URL` host, `DIGITALAI_ACCESS_KEY`, flat `digitalai:*` (web) / `digitalai:options` (mobile), `deviceQuery`, `cloud:<name>` app refs, report URL note | `src/providers/cloud/digitalai.provider.ts:9-16,26-38,40-103,116-119,155-163`; upload `src/tools/cloud-provider.tool.ts:147-169` | absent (`CloudProviderId` at `src/targets/cloud.ts:13`; `--provider` choices `src/actions/specs.ts:101`) | absent | provider not known to session |
| 9f | Cloud reporting labels (`reporting.project/build/session`) | `src/tools/session.tool.ts:44-48`; e.g. `src/providers/cloud/browserstack.provider.ts:38-42` | `--project/--build/--name` `src/actions/specs.ts:107-109`; `src/targets/cloud.ts:183-185,193-201,212-217,222-227,233-241` | covered | MCP falls back to the project as the session name on Sauce Labs, TestMu and TestingBot (e.g. `src/providers/cloud/saucelabs.provider.ts:41-42`); session does not |
| 10a | `tunnel` parameter: `true` starts a tunnel, `'external'` uses a running one; tunnel name generated when omitted | `src/tools/session.tool.ts:84-85,307-309,322-324,510-518` | `--tunnel`, `--tunnel-name` `src/actions/specs.ts:105-106`; `src/targets/cloud.ts:302-306` | partial | no generated name; a non-`external` string value doubles as the name |
| 10b | BrowserStack tunnel start/stop | start `src/providers/cloud/browserstack.provider.ts:90-106` (`browserstack-local`, `forceLocal`, reuse when one is already running); stop inside `onSessionClose` `114-118`, i.e. before `deleteSession` (`src/session/lifecycle.ts:171-177`) | `src/targets/cloud.ts:307-313,352-367`; started and stopped by `src/targets/launch.ts:53-56,128-135` | partial | no reuse of an already running tunnel; start options differ (`force`, `onlyAutomate`, `localIdentifier`) |
| 10c | Sauce Labs tunnel start/stop | start `src/providers/cloud/saucelabs.provider.ts:108-128` (`saucelabs` `startSauceConnect`); stop `162-167`, after `deleteSession` `src/session/lifecycle.ts:195-205` | absent (`src/targets/cloud.ts:314-316` prints a note; only `tunnelName` is set, `218-220`) | absent | user must start the tunnel |
| 10d | TestMu tunnel start/stop | start `src/providers/cloud/testmu.provider.ts:105-127` (`@lambdatest/node-tunnel`); stop `179-184` | absent (`src/targets/cloud.ts:314-316`; capability only, `249-254`) | absent | user must start the tunnel |
| 10e | TestingBot tunnel start/stop | start `src/providers/cloud/testingbot.provider.ts:97-118` (`testingbot-tunnel-launcher`); stop `159-167` | absent (`src/targets/cloud.ts:314-316`; capability only, `228-230`) | absent | user must start the tunnel |
| 10f | Tunnel stopped when session start or registration fails | `src/tools/session.tool.ts:361-362,545-546`; `src/session/lifecycle.ts:123-126` | `src/targets/launch.ts:34-42,137-140` | covered | BrowserStack only on the session side (see 10c-10e) |
| 11a | Session result derived from the first failed recorded step | `src/session/lifecycle.ts:41-46,174`; startup failure `src/tools/session.tool.ts:219` | absent (`src/targets/launch.ts:87-111` ends the session without a result) | absent | no pass/fail notion at close on 10.2.0. Prototype (local, not yet submitted, uncommitted, unreleased): pass/fail derivation stays caller-side; MCP keeps `getSessionResult(history)` and passes the result to `markResult` |
| 11b | BrowserStack result marking: `PUT https://api.browserstack.com/automate/sessions/<id>.json` or `https://api-cloud.browserstack.com/app-automate/sessions/<id>.json`, body `{ status, reason }` | `src/providers/cloud/browserstack.provider.ts:108-135` | absent (no such request in `src/`) | absent | Prototype (unreleased): `markResult({ passed, reason? })` on the `launch()` result via `markCloudResult`; no-op for non-cloud plans; API failure rejects with `SessionError` code `INTERNAL`. App-automate is chosen by app session (`plan.applies.includes('M')`), so mobile browser sessions go to automate. Real 2026-11-15: iOS app (iPhone 15, `BStackSampleApp.ipa`) failed+reason and passed both read back from the app-automate sessions API; desktop Chrome (Windows 11) failed+reason and passed both read back from the automate sessions API; iOS Safari (iPhone 15) got HTTP 404 from app-automate before the fix and was not applied, and after the fix reads back failed+reason from the automate sessions API |
| 11c | Sauce Labs result marking: `PUT https://api.<region>.saucelabs.com/rest/v1/<user>/jobs/<id>`, body `{ passed }` | `src/providers/cloud/saucelabs.provider.ts:130-160` | absent (no such request in `src/`) | absent | Prototype (unreleased): `markResult` via `markCloudResult`. A hub host that does not match `ondemand.<region>.saucelabs.com` (lookalikes such as `ondemand.proxy.example.com` included) rejects `NOT_SUPPORTED` before any request is sent. Stub-tested only, unverified against the live API |
| 11d | TestMu result marking: web `PATCH https://api.lambdatest.com/automation/api/v1/sessions/<id>` body `{ status_ind }`; mobile `browser.execute('lambda-status=<status>')` | `src/providers/cloud/testmu.provider.ts:129-177` | absent (no such request in `src/`) | absent | Prototype (unreleased): `markResult` via `markCloudResult`; web PATCH and mobile `lambda-status=` execute. Stub-tested only, unverified against the live API |
| 11e | TestingBot result marking: `PUT https://api.testingbot.com/v1/tests/<id>`, form body `test[success]`, `test[status_message]` | `src/providers/cloud/testingbot.provider.ts:120-157` | absent (no such request in `src/`) | absent | Prototype (unreleased): `markResult` via `markCloudResult`; form PUT. Stub-tested only, unverified against the live API |
| 11f | Digital.ai result marking: `browser.execute('seetest:client.setReportStatus', status, message)` | `src/providers/cloud/digitalai.provider.ts:130-148` | absent (provider absent, see 9e) | absent | Blocked on porting the provider to the prototype (see 9e); not in the prototype's result marking |
| 12a | Per-session trace finalized on close: Playwright-compatible zip written to `.trace/` | `src/session/lifecycle.ts:20-39,162-164`; started at `src/tools/session.tool.ts:364-366,483,549-551,625-630,693-695` | `trace start/stop` action writing `trace.trace` and `transcript.md` under the artifacts dir `src/actions/evidence.ts:205-238`; no disposer finalizes it (`src/session.ts:251-259`) | partial | different format, explicit start/stop, nothing happens at close |
| 12b | Trace of an orphaned (replaced) session finalized during takeover | `src/session/lifecycle.ts:95-102` | absent (replacement is a daemon close, `src/cli/command.ts:302-310`) | absent | none |
| 13a | Multiple concurrent sessions in one process with a default session | `src/session/state.ts:27-33`; `src/session/routing.ts:83-104` | one daemon per session name `src/cli/command.ts:186`, `src/cli/help.ts:7`, `src/daemon/state.ts:45-55`; `createAgentSession` holds one browser and no registry `src/agent.ts:251-274` | partial | daemon only; no in-process registry or default |
| 13b | Named sessions, unique among live ones, resolvable by name or id | `src/session/routing.ts:23-31,67-75`; `src/tools/session.tool.ts:33,739,759-766` | `--session` name `src/cli/help.ts:7`; `SESSION_EXISTS` `src/cli/command.ts:302-308` | partial | daemon only |
| 13c | Routing: per-session call queue, 90 s queued-call timeout, `[session: ...]` prefix, platform applicability check | `src/session/routing.ts:38-48,56-65,83-125`; `src/server.ts:130-136` | absent in the launch/agent path (each daemon serves its own socket, `src/daemon/main.ts:92-107`) | absent | none |
| 13d | `keep` in `registerSession`: new session does not replace or become the default | `src/session/lifecycle.ts:66-85`; `onExisting` `src/tools/session.tool.ts:34,190-192,360` | `--replace` is the only knob, and it closes the same-named session `src/actions/specs.ts:67`, `src/cli/command.ts:302-310` | partial | daemon only; no default-session concept |
| 14 | Session transition: `__session_transition__` step appended to the outgoing session history, old session closed in the background | `src/session/lifecycle.ts:48-64,78-80,87-134` | absent (`src/cli/command.ts:304-310` closes the old session; the only history marker is `// restart`, `src/daemon/init.ts:43-45`) | absent | none |
| 15a | Options passed into `remote()` / `attach()`: provider connection config plus capabilities | `src/tools/session.tool.ts:326,520,591-596,668-672`; shape `src/providers/types.ts:3-14` (`services` is declared at `:10` but set by no provider) | `src/targets/launch.ts:81-86`; shape `src/types.ts:73-85` | partial | launch accepts no caller hooks or extra remote options; `RemoteOptions` lacks `bidiResponseTimeout` |
| 15b | Post-launch, pre-navigation hook point: trace started, driver pid captured, user agent fixed before the first page loads | `src/tools/session.tool.ts:328-336,349,354-391`; `src/trace/recorder.ts:9` | `launch()` returns `{ browser, pids, cleanup }` `src/targets/launch.ts:16-23,125-136`; navigation is a separate daemon step `src/daemon/init.ts:28-53` | partial | the return shape fits, but `launch()` is not exported |
| 15c | Per-action trace/recording wrapper around every tool call | `src/server.ts:159-160`; `src/trace/recorder.ts:66` | internal before/after probe read from the session store `src/session.ts:325-327`, installed by `src/actions/evidence.ts:93-98` | partial | not a public option of `createAgentSession` (`src/agent.ts:28-64`) |
| 15d | Failed startup disposes the new session (delete session, stop tunnel, runtime cleanup) | `src/tools/session.tool.ts:195-226,361-362,480-481,545-546` | `src/targets/launch.ts:34-42,137-140`; `src/daemon/main.ts:130-139` | covered | none |
| 15e | `deleteSession` bounded by a 90 s timeout so close cannot hang | `src/session/lifecycle.ts:17-18,186-187` | 20 s hard exit of the daemon `src/daemon/main.ts:44-45`; `src/targets/launch.ts:110` has no timeout | partial | daemon only |
| 15f | Server shutdown closes every session (external and attached ones detach) and kills driver trees | `src/session/lifecycle.ts:236-245`; `src/server.ts:247,345-357` | signal handlers and idle timeout `src/daemon/main.ts:38-64,96-97` | partial | daemon only |

Digital.ai has no tunnel on the MCP side either: `src/providers/cloud/digitalai.provider.ts` defines neither
`startTunnel` nor `stopTunnel`, so there is no tunnel row for it.

## Targets `@wdio/session` has that MCP lacks

MCP side for every row: `start_session` accepts platforms `browser`, `electron`, `ios`, `android`
(`src/tools/session.tool.ts:20`) and automation names `XCUITest`, `UiAutomator2` (`src/tools/session.tool.ts:23`); the
provider registry has no other entries (`src/providers/registry.ts:11-22`).

| Target | `@wdio/session` 10.2.0 | MCP today |
|--------|------------------------|-----------|
| Windows desktop apps (Appium `Windows` driver) | `src/targets/index.ts:17`; `src/targets/desktop.ts:19-46`; `src/targets/mobile.ts:15,32` | absent |
| macOS desktop apps (Appium `Mac2` driver) | `src/targets/index.ts:17`; `src/targets/desktop.ts:6-17`; `src/targets/mobile.ts:14,31` | absent |
| Tauri | `src/targets/index.ts:16,101-103`; `src/targets/webview.ts:20-26,55-105,146-199` | absent |
| Dioxus | `src/targets/index.ts:16,101-103`; `src/targets/webview.ts:27-33,55-105,146-199` | absent |
| `wdio.conf.ts` config targets (capability picked by index or name) | `src/targets/index.ts:30-32,104-109`; `src/targets/config.ts:59-81,162-200` | absent |
| Self-started local Appium server | `src/targets/mobile.ts:126-129,142-146`; `src/targets/appium.ts:73-100`; `src/targets/launch.ts:58-62` | absent (connects to a running server, `src/config/appium.config.ts:45-52`) |
| Display server started for headed Linux sessions | `src/targets/browser.ts:104`; `src/targets/launch.ts:45-51` | absent |
| Local app file uploaded to the cloud during launch | `src/targets/cloud.ts:259-287,318-325` | absent in `start_session` (separate `upload_app` tool, `src/tools/cloud-provider.tool.ts:289-290,330`) |

## Gaps to close for a `launch` API

Only rows whose status is `partial` or `absent`.

- 1c: apply the viewport after launch outside the daemon.
- 1d: concatenate user `args` with the built-in ones instead of replacing them.
- 1e: MCP default Chromium flags and `acceptInsecureCerts` are not set.
- 1g: headless user agent rewrite is daemon only.
- 1h: initial navigation is daemon only.
- 2a: no `connectionRetryTimeout` / `connectionRetryCount` / `bidiResponseTimeout` for local browsers.
- 2b: no retry options on the CDP attach path.
- 3: no `networkLogs` to `goog:loggingPrefs` / `ms:loggingPrefs` mapping.
- 4: no driver process-tree kill outside the daemon, and none after a failed `deleteSession`.
- 5a: iOS capability defaults and options differ (`autoAcceptAlerts`, `autoDismissAlerts`, `newCommandTimeout`).
- 5b: Android options missing (`appWaitActivity`, `autoDismissAlerts`, `autoAcceptAlerts`).
- 5c: Appium server address is a single URL with no env var defaults.
- 5d: a `noReset` Appium session cannot be left running on close.
- 6: an external hub still receives local browser args and is not detached by default.
- 7a: no attach to an existing session by id (closable caller-side with webdriverio `attach()`, see row 7a).
- 7b: CDP attach lacks the readiness wait, stale mapper cleanup and tab restore.
- 7c: no way to spawn Chrome with a debugging port.
- 7d: detach is fixed at open time; `close` has no detach argument.
- 7e: mocks are not released on detach.
- 8a: Electron needs an app path; no project-root-only or caller-built service options start.
- 8c: replaced Electron session teardown ordering is daemon only.
- 9a: BrowserStack mobile hub, version defaults and credential placement differ.
- 9b: Sauce Labs default region differs; `os`/`osVersion` not mapped; different app ref form.
- 9c: TestMu env var names and options key differ.
- 9d: TestingBot `os`/`osVersion` not mapped.
- 9e: Digital.ai provider missing.
- 10a: no generated tunnel name.
- 10b: BrowserStack tunnel is not reused when already running; start options differ.
- 10c: Sauce Labs tunnel is not started or stopped.
- 10d: TestMu tunnel is not started or stopped.
- 10e: TestingBot tunnel is not started or stopped.
- 11a: no session result at close (derivation stays caller-side; the prototype takes the result in `markResult`).
- 11b: no BrowserStack result marking on 10.2.0 (prototype: iOS app, desktop Chrome and iOS Safari verified live 2026-11-15).
- 11c: no Sauce Labs result marking on 10.2.0 (prototype: stub-tested only).
- 11d: no TestMu result marking on 10.2.0 (prototype: stub-tested only).
- 11e: no TestingBot result marking on 10.2.0 (prototype: stub-tested only).
- 11f: no Digital.ai result marking (blocked on 9e).
- 12a: no trace finalize on close; trace format differs.
- 12b: no trace finalize for a replaced session.
- 13a: no in-process multi-session registry or default session.
- 13b: session names exist at daemon level only.
- 13c: no per-session call queue, timeout or result prefix.
- 13d: no `keep` semantics.
- 14: no session transition step.
- 15a: launch accepts no caller hooks or extra remote options.
- 15b: `launch()` is not exported, so its post-launch hook point is unreachable.
- 15c: the per-action before/after probe is not a public option.
- 15e: `deleteSession` has no timeout outside the daemon.
- 15f: close-all on shutdown is daemon only.
