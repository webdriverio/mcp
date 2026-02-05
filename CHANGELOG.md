# Changelog

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
