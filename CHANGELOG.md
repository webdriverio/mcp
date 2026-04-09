# Changelog

## [3.2.4](https://github.com/webdriverio/mcp/compare/v3.2.3...v3.2.4) (2026-04-09)

## [3.2.3](https://github.com/webdriverio/mcp/compare/v3.2.2...v3.2.3) (2026-04-06)

## [3.2.2](https://github.com/webdriverio/mcp/compare/v3.2.1...v3.2.2) (2026-04-01)

### Bug Fixes

* Account for `clickable` attribute in tag filter validation ([3918d22](https://github.com/webdriverio/mcp/commit/3918d22aa5eb9188dc7726246af0993653107374))

## [3.2.1](https://github.com/webdriverio/mcp/compare/v3.2.0...v3.2.1) (2026-04-01)

### Bug Fixes

* Add support for external BrowserStack Local tunnel handling and dynamic connection configurations ([ef016bd](https://github.com/webdriverio/mcp/commit/ef016bd05b680a3009f01c6a60efcb09347ff9c6))

## [3.2.0](https://github.com/webdriverio/mcp/compare/v3.1.1...v3.2.0) (2026-04-01)

### Features

* Integrate auto-start BrowserStack Local tunnel on session start & management ([5827a99](https://github.com/webdriverio/mcp/commit/5827a99a57d621375d25d13fec1e9608ad5f8486))

### Bug Fixes

* Handle existing BrowserStack tunnel gracefully in `start` method ([0084513](https://github.com/webdriverio/mcp/commit/00845133beff9a32c2c5f9c047cbc0bcfbfae5bb))

## [3.1.1](https://github.com/webdriverio/mcp/compare/v3.1.0...v3.1.1) (2026-03-30)

### Bug Fixes

* Add `.js` extensions to type imports for ESM compatibility ([0dbc8b4](https://github.com/webdriverio/mcp/commit/0dbc8b4bc96f6d4631a98c0ed6c9f859fa0d35a2))

## [3.1.0](https://github.com/webdriverio/mcp/compare/v3.0.0...v3.1.0) (2026-03-30)

### Features

* Add BrowserStack Local binary resource with supporting and enhance session handling ([447e266](https://github.com/webdriverio/mcp/commit/447e266dbbecbea73c4aaecac446c0b55d981404))
* Introduce BrowserStack provider and tools ([2904997](https://github.com/webdriverio/mcp/commit/2904997e88432c779fa65aad0aa868e39c378b52))

## [3.0.0](https://github.com/webdriverio/mcp/compare/v2.5.3...v3.0.0) (2026-03-30)

### ⚠ BREAKING CHANGES

* Consolidated session management tooling into 1 single tool.
* Deleted tools: `get_visible_element`, `get_accessibility_tree`, `get_cookie`, `get_tabs`, `get_app_state`, etc. The READ tooling is mainly resources going forward.

### Features

* Initial commit for v3.0.0 ([37831d1](https://github.com/webdriverio/mcp/commit/37831d180d564cb0664d39dfaced928144f5a0da))
* Re-add `get_elements` tool for retrieving interactable page elements ([e0d94c7](https://github.com/webdriverio/mcp/commit/e0d94c7737ef2520660158d2287e12f6d75bea9f))

### Bug Fixes

* Address issues with session management and code generation of new session tool ([9864253](https://github.com/webdriverio/mcp/commit/98642537a76bf0d4cd503ab7226ccae41ea7438e))
* Remove ResourceTemplate usage and simplify resource handlers ([59f83a5](https://github.com/webdriverio/mcp/commit/59f83a539794601af3863f3a289a0a80f8a1e2bb))
* Use `z.coerce` to correctly manage booleans with OpenCode and Codex ([ff37196](https://github.com/webdriverio/mcp/commit/ff371966108fc2cff011be22fd571dc6d45be51b))

### Refactoring

* Refine session lifecycle handling and simplify logic ([4a301fe](https://github.com/webdriverio/mcp/commit/4a301feea864474b9d2be8996763f9bb1c0ee934))
* Separate MCP resources from tools ([e1be10f](https://github.com/webdriverio/mcp/commit/e1be10fbd2a629b388c8e8aa3162dd1b53cb1e16))

## [2.5.3](https://github.com/webdriverio/mcp/compare/v2.5.2...v2.5.3) (2026-03-20)

### Bug Fixes

* Add authentication step for MCP Registry publishing ([610e364](https://github.com/webdriverio/mcp/commit/610e36476e2c6c057deea0befdc15cae66f2fdcf))
* Change mcp-publisher installation method ([94d1d11](https://github.com/webdriverio/mcp/commit/94d1d11cddf6dcc47c0781a419d4869d3fa7f8cc))

## [2.5.2](https://github.com/webdriverio/mcp/compare/v2.5.1...v2.5.2) (2026-03-20)

### Features

* Add `launch_chrome` tool for launching Chrome with remote debugging ([eab139c](https://github.com/webdriverio/mcp/commit/eab139cc22c5e0c0956a154469f6c64adb0782d4))

## [2.5.1](https://github.com/webdriverio/mcp/compare/v2.5.0...v2.5.1) (2026-03-20)

## [2.5.0](https://github.com/webdriverio/mcp/compare/v2.4.1...v2.5.0) (2026-03-18)

### Bug Fixes

* Use correct abstraction for attach_browser, start_app_session, start_browser tools ([9cebdbd](https://github.com/webdriverio/mcp/commit/9cebdbd81237c89cc1dd03f88f05dc0b07df460b))

### Refactoring

* Mark tool errors with `isError` flag for consistent error detection and handling throughout the codebase ([186a03a](https://github.com/webdriverio/mcp/commit/186a03a21ce539101f228e0de1e3456854bbcd14))
* Separate session steps (in JSON) and code generation (in JS) in Resources ([ad7ff03](https://github.com/webdriverio/mcp/commit/ad7ff0318ada815720d07e424b1409033007fee3))

## [2.4.1](https://github.com/webdriverio/mcp/compare/v2.4.0...v2.4.1) (2026-03-17)

### Features

* implement session step recording, history lifecycle, and WebdriverIO code generation ([6c41763](https://github.com/webdriverio/mcp/commit/6c417632fe05414659119e8531bab7394d81318d))

### Bug Fixes

* Use browser.$() for element instead of $() ([630201b](https://github.com/webdriverio/mcp/commit/630201b140b3f6d399ef452796c3a71feca8011a))

## [2.4.0](https://github.com/webdriverio/mcp/compare/v2.3.1...v2.4.0) (2026-03-17)

### Features

* add attach_browser tool for CDP port connection ([5ad9923](https://github.com/webdriverio/mcp/commit/5ad9923785ba1c1399a1eab730466ec758be3b0d))
* add emulate_device tool with BiDi guard and restore support ([49e8b77](https://github.com/webdriverio/mcp/commit/49e8b770f1682a85968ce4f4e5a332566e8a3321))
* add userDataDir param to attach_browser (default: /tmp/chrome-debug) ([7204dd0](https://github.com/webdriverio/mcp/commit/7204dd0b77798241fd19a2f4cc31a0565767b6d0))

## [2.3.1](https://github.com/webdriverio/mcp/compare/v2.3.0...v2.3.1) (2026-03-12)

### Features

* Default browser tool to headless mode and improve script usage guidance ([4ba256b](https://github.com/webdriverio/mcp/commit/4ba256ba7c4a607fa1f3202ccae7f470d82107d1))

## [2.3.0](https://github.com/webdriverio/mcp/compare/v2.2.1...v2.3.0) (2026-02-24)

### Features

* allow custom appium capabilities in start_app_session ([5d8f91e](https://github.com/webdriverio/mcp/commit/5d8f91e26e7969853b056bbf0862d2a527139d91))
* allow start_browser custom capabilities ([8f10b60](https://github.com/webdriverio/mcp/commit/8f10b6016ef59e6ce40286408eb996479f42bdac))
* Enhance browser snapshot scripts with predefined selectors and removed noisy properties ([fd38790](https://github.com/webdriverio/mcp/commit/fd387908320f3d776c4122e69906d256c883b375))

## [2.2.1](https://github.com/webdriverio/mcp/compare/v2.2.0...v2.2.1) (2026-02-08)

### Bug Fixes

* Improve XML node comparison logic for cross-traversal compatibility ([11e8291](https://github.com/webdriverio/mcp/commit/11e8291e97ba84a9a835d47012f4dfb3f232a586))

## [2.2.0](https://github.com/webdriverio/mcp/compare/v2.1.0...v2.2.0) (2026-02-05)

### Features

* Add `snapshot` subpath export and include lightweight element utilities ([e6afa09](https://github.com/webdriverio/mcp/commit/e6afa09868bb663e969afbb719e466620b8b6010))
* Add browser accessibility tree support and improve element handling ([97a4a0f](https://github.com/webdriverio/mcp/commit/97a4a0fb886a91f02e901acc5d671b6a89e1ab9a))
* Rework mobile locator generation ([7e290e1](https://github.com/webdriverio/mcp/commit/7e290e11ba9155c17eaf1ad1dcbed0c68c8c101a))

### Refactoring

* Modularize and clean up locator generation and XML parsing components ([e09e9aa](https://github.com/webdriverio/mcp/commit/e09e9aaeb9037784610c5df1395f0889bdae3127))

## [2.1.0](https://github.com/webdriverio/mcp/compare/v2.0.0...v2.1.0) (2026-01-27)

### Performance

* Use uniform field structures for TOON tabular format across tools and scripts ([1b70736](https://github.com/webdriverio/mcp/commit/1b70736305a00d62afd4547d81d3116144c8822e))

## [2.0.0](https://github.com/webdriverio/mcp/compare/v1.6.1...v2.0.0) (2026-01-23)

### ⚠ BREAKING CHANGES

* Removed deprecated tools (`find_element`, `getElementText`, `longPress`, `isDisplayed`, `clickViaText`, etc.) and unused utilities (`mobile-selectors`, `get_orientation`, `lock_device`, etc.).

### Features

* Add `execute_script` tool for running browser JavaScript and Appium mobile commands ([ade4484](https://github.com/webdriverio/mcp/commit/ade448441f67fdbaba3152f35508669503c6e42c))
* Add `navigationUrl` support to `startBrowserTool` and default dimensions ([bae7ca7](https://github.com/webdriverio/mcp/commit/bae7ca7362cbf5e1432a009496aa02aa389a807e))
* Add `newCommandTimeout` support to session configuration ([ce09399](https://github.com/webdriverio/mcp/commit/ce093996b47d581ebeda47f888693ee7607f1812))
* Simplify tools and consolidate functionality ([ae66bc4](https://github.com/webdriverio/mcp/commit/ae66bc48534f8a8b497554084431508d1d2b396f))

### Refactoring

* Rename scripts for clarity and update imports ([adaa015](https://github.com/webdriverio/mcp/commit/adaa015c8f174fbdb4c1cb918cc171dfd86295e9))
* Simplify `cookies.tool` handling and update object structures ([80291ec](https://github.com/webdriverio/mcp/commit/80291ecddf7327fa561afa9d840a08bd6341677f))

## [1.6.1](https://github.com/webdriverio/mcp/compare/v1.6.0...v1.6.1) (2026-01-22)

### Performance

* Add image processing for screenshots with `sharp` ([e396b0a](https://github.com/webdriverio/mcp/commit/e396b0acf05bacad894c9e44e7e3cf8af61524a8))

## [1.6.0](https://github.com/webdriverio/mcp/compare/v1.5.1...v1.6.0) (2026-01-22)

### Features

* Add pagination support to `get-visible-elements` and `get-accessibility-tree` ([90517e0](https://github.com/webdriverio/mcp/commit/90517e0d79ab79423ed38ab62eb96316788555bc))

### Performance

* Clean up mobile selectors and introduce `includeBounds` options, decrease token size ([187e84b](https://github.com/webdriverio/mcp/commit/187e84b))

## [1.5.1](https://github.com/webdriverio/mcp/compare/1.5.0...1.5.1) (2026-01-20)

### Refactoring

* Replace tool argument exports with unified tool
  definitions ([93a0f4e](https://github.com/webdriverio/mcp/commit/93a0f4e))

# [1.5.0](https://github.com/webdriverio/mcp/compare/1.4.1...1.5.0) (2026-01-20)

### Features

* Add utility for cleaning objects and enhance element visibility
  tool ([c85de0a](https://github.com/webdriverio/mcp/commit/c85de0a9a2a34edd0295c2ee6ddcaed4c54932e0))

## [1.4.1](https://github.com/webdriverio/mcp/compare/1.4.0...1.4.1) (2026-01-07)

### Bug Fixes

* Fix release pipeline ([570f2ee](https://github.com/webdriverio/mcp/commit/570f2ee7ca3eeb58684efdd26db1e70e4ce98e09))
* Remove pnpm version from release
  workflow ([2344fe6](https://github.com/webdriverio/mcp/commit/2344fe6e2c61f1dff2f7196bdcda60d45afc55b7))
* Use correct project naming for
  package.json ([0a79f1f](https://github.com/webdriverio/mcp/commit/0a79f1f715ed076a3d7855c5be87bb7297119251))

### Features

* Add ESLint, TypeScript checking, and Husky for linting; update
  dependencies ([30ccbc5](https://github.com/webdriverio/mcp/commit/30ccbc5ff2615200cd77cd49db4b087abaa61c4a))
* Add GitHub Actions for manual npm publishing, update naming, and improve
  documentation ([6f54819](https://github.com/webdriverio/mcp/commit/6f54819ee90124bbe6a08b0e9a9d1c812e6ce2a1))
* Migrate to pnpm instead of
  npm/shrinkwrap ([b402fc0](https://github.com/webdriverio/mcp/commit/b402fc058207c7ea32b85e2991683e9c66e89ec7))

# [1.4.0](https://github.com/webdriverio/mcp/compare/1.3.0...1.4.0) (2025-12-18)

### Features

* Simplify session management and enhance Appium state
  control ([5ff2efc](https://github.com/webdriverio/mcp/commit/5ff2efc948d7b924ecb4f8752dad8d5283e6945c))

# [1.3.0](https://github.com/webdriverio/mcp/compare/1.2.1...1.3.0) (2025-12-17)

### Features

* Add support for iOS real device testing with UDID
  configuration ([f3a576b](https://github.com/webdriverio/mcp/commit/f3a576bab812b01ea845c55a2ae7028fd25bb6ca))

## [1.2.1](https://github.com/webdriverio/mcp/compare/1.2.0...1.2.1) (2025-12-01)

### Documentation

* Update README and CLAUDE.md for element detection
  enhancements ([c974bce](https://github.com/webdriverio/mcp/commit/c974bce))

### Refactoring

* Improve locator generation for mobile platforms inspired by
  `appium-mcp` ([a9d76d1](https://github.com/webdriverio/mcp/commit/a9d76d1))
* Enhance Appium session options with auto-permission and alert
  handling ([61bb55a](https://github.com/webdriverio/mcp/commit/61bb55a))

# [1.2.0](https://github.com/webdriverio/mcp/compare/1.1.0...1.2.0) (2025-11-20)

### Features

* Add mobile app automation support with Appium
  integration ([7ffbfef](https://github.com/webdriverio/mcp/commit/7ffbfef53cf65950bda0d45223e48713ff4d355c))

# [1.1.0](https://github.com/webdriverio/mcp/compare/1.0.3...1.1.0) (2025-11-18)

### Features

* Add cookie management and accessibility tree
  tools ([2068c8e](https://github.com/webdriverio/mcp/commit/2068c8e04be0c06284e6e3802e9b30254a6b5647))

### Refactoring

* Replace `null` with `undefined` for optional properties and include all elements regardless of viewport
  status ([2b3c7c7](https://github.com/webdriverio/mcp/commit/2b3c7c7))

### Chores

* Adding CLAUDE.md ([f2f075f](https://github.com/webdriverio/mcp/commit/f2f075f))

## [1.0.3](https://github.com/webdriverio/mcp/compare/1.0.2...1.0.3) (2025-08-15)

### Chores

* Update package metadata and enhance element interaction
  behavior ([bf821ca](https://github.com/webdriverio/mcp/commit/bf821ca))

## [1.0.2](https://github.com/webdriverio/mcp/compare/d69476c916f9d2ecacedfe67ba1b9a4615e8531c...1.0.2) (2025-07-02)

### Features

* Introduce MCP WebdriverIO server with core
  tools ([d69476c](https://github.com/webdriverio/mcp/commit/d69476c916f9d2ecacedfe67ba1b9a4615e8531c))

### Bug Fixes

* Update documentation and package configuration for MCP integration while cleaning up
  package.json ([43f0914](https://github.com/webdriverio/mcp/commit/43f09142acd5cbc1aedb317ac76f676d847c217b))

### Chores

* Add repository info to package.json and expand browser dimension
  constraints ([590acd7](https://github.com/webdriverio/mcp/commit/590acd7))
