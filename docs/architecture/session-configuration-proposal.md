# Session Configuration Architecture Proposal

> **Status**: Draft
> **Date**: 2026-01-31
> **Goal**: Make session configuration extensible for cloud providers (BrowserStack, SauceLabs, etc.)

---

## Current State (The Problem)

```
src/
├── tools/
│   ├── browser.tool.ts      # Chrome caps hardcoded, creates sessions
│   └── app-session.tool.ts  # Appium caps, different patterns
└── config/
    └── appium.config.ts     # iOS/Android capability builders
```

### Issues

1. **Browser capabilities embedded in tool file** - Chrome args and options are hardcoded in `browser.tool.ts`
2. **Appium config separate from browser config** - Different patterns for local browser vs mobile
3. **No provider abstraction** - No way to switch between local and cloud execution
4. **Adding BrowserStack would fragment further** - Another tool + another config file

---

## Proposed Architecture Options

### Option A: Provider Pattern (Recommended)

```
src/
├── providers/
│   ├── types.ts                  # Common interfaces
│   ├── provider.registry.ts      # Registry + factory
│   ├── local/
│   │   ├── browser.provider.ts   # Local Chrome/Firefox
│   │   └── appium.provider.ts    # Local Appium
│   └── cloud/
│       ├── browserstack.provider.ts
│       └── saucelabs.provider.ts  # Future
├── tools/
│   ├── session.tool.ts           # Unified start_session / close_session
│   └── ... (other tools unchanged)
└── config/
    └── capabilities/
        ├── browser.caps.ts
        ├── ios.caps.ts
        ├── android.caps.ts
        └── browserstack.caps.ts
```

#### Provider Interface

```typescript
interface ConnectionConfig {
  protocol: 'http' | 'https';
  hostname: string;
  port: number;
  path: string;
  user?: string;
  key?: string;
}

interface CapabilityOptions {
  platform: 'browser' | 'ios' | 'android';
  browser?: 'chrome' | 'firefox' | 'safari' | 'edge';
  browserVersion?: string;
  deviceName?: string;
  platformVersion?: string;
  appPath?: string;
  // Provider-specific options passed through
  [key: string]: unknown;
}

interface ProviderOptions extends CapabilityOptions {
  // Connection overrides
  hostname?: string;
  port?: number;
  path?: string;
  // Auth (for cloud providers)
  user?: string;
  key?: string;
}

interface SessionProvider {
  name: string;
  type: 'local' | 'cloud';

  // Build connection config (hostname, port, auth)
  getConnectionConfig(options: ProviderOptions): ConnectionConfig;

  // Build platform capabilities
  buildCapabilities(options: CapabilityOptions): WebdriverIO.Capabilities;

  // Optional lifecycle hooks
  beforeSession?(options: ProviderOptions): Promise<void>;
  afterSession?(sessionId: string): Promise<void>;
}
```

#### Usage Examples

```typescript
// Local browser
start_session({ provider: 'local', platform: 'browser', browser: 'chrome', headless: true })

// Local Appium
start_session({ provider: 'local', platform: 'android', appPath: '/path/to/app.apk', deviceName: 'emulator-5554' })

// BrowserStack browser
start_session({
  provider: 'browserstack',
  platform: 'browser',
  browser: 'chrome',
  browserVersion: '120',
  os: 'Windows',
  osVersion: '11'
})

// BrowserStack app
start_session({
  provider: 'browserstack',
  platform: 'ios',
  app: 'bs://app-id-here',
  deviceName: 'iPhone 15 Pro',
  platformVersion: '17'
})
```

#### Pros

- Clean separation of concerns
- Easy to add new providers (implement interface, register)
- Single MCP tool for all session types
- Follows WebDriverIO's plugin pattern
- Type-safe provider-specific options

#### Cons

- More files upfront
- Unified tool schema is more complex
- Migration effort from current structure

---

### Option B: Layered Configuration (Simpler)

Keep separate tools but extract configuration into composable layers:

```
src/
├── config/
│   ├── connection/
│   │   ├── local.ts           # { hostname: 'localhost', port: 4723 }
│   │   └── browserstack.ts    # { hostname: 'hub-cloud.browserstack.com', user, key }
│   ├── capabilities/
│   │   ├── chrome.ts
│   │   ├── ios.ts
│   │   ├── android.ts
│   │   └── browserstack.ts    # bstack:options builder
│   └── presets/
│       ├── local-browser.ts   # Combines connection + chrome caps
│       ├── local-appium.ts
│       └── browserstack-app.ts
├── tools/
│   ├── browser.tool.ts        # Uses presets
│   ├── app-session.tool.ts
│   └── cloud-session.tool.ts  # New tool for BrowserStack
```

#### Pros

- Less restructuring required
- Separate tools are more discoverable in MCP
- Incremental migration path

#### Cons

- Still multiple entry points (tools)
- Presets add indirection
- Each cloud provider needs its own tool

---

### Option C: WebDriverIO-style Direct Config

Expose raw WebDriverIO `remote()` options with smart defaults:

```typescript
// Tool accepts nearly raw WebDriverIO config
start_session({
  // Provider shorthand (optional - sets hostname/auth)
  provider: 'browserstack', // or 'local', 'saucelabs'

  // Direct WebDriverIO capabilities
  capabilities: {
    platformName: 'iOS',
    'appium:deviceName': 'iPhone 15',
    'bstack:options': {
      projectName: 'My App',
      buildName: 'CI #123'
    }
  },

  // Connection overrides (optional)
  hostname: 'custom-hub.example.com',
  port: 4444
})
```

#### Pros

- Maximum flexibility
- Familiar to WebDriverIO users
- No abstraction layer to learn

#### Cons

- User needs to know capability formats
- Less guardrails / validation
- LLM might struggle with complex nested capability structures

---

## Recommendation: Option A (Provider Pattern)

### Rationale

1. **Extensibility** - Adding SauceLabs, LambdaTest, or custom Selenium Grid is just implementing the interface
2. **Clean boundaries** - Connection config vs capabilities vs hooks are separate concerns
3. **Type safety** - Each provider defines its own options schema with Zod
4. **Single tool** - `start_session` is the only entry point, reducing cognitive load for LLM
5. **Testability** - Providers can be unit tested independently

---

## Open Questions

### 1. Credentials Handling

How should cloud provider credentials be configured?

| Approach | Example | Pros | Cons |
|----------|---------|------|------|
| Environment variables only | `BROWSERSTACK_USERNAME` | Secure, standard practice | Can't switch accounts easily |
| Tool parameters | `start_session({ user: '...' })` | Flexible | Credentials in prompts |
| Config file | `.wdio-mcp.json` | Persistent, switchable | Another file to manage |
| Hybrid | Env vars default, params override | Best of both | More complex |

**Recommendation**: Hybrid - environment variables as default, tool parameters for override.

### 2. Backward Compatibility

Should we keep existing tools as aliases?

```typescript
// Option: Keep as thin wrappers
start_browser({ headless: true })
// → internally calls start_session({ provider: 'local', platform: 'browser', ... })

start_app_session({ platform: 'iOS', ... })
// → internally calls start_session({ provider: 'local', platform: 'ios', ... })
```

**Recommendation**: Yes, keep them as aliases for a transition period. Mark as deprecated in docs.

### 3. App Upload (BrowserStack-specific)

BrowserStack requires apps to be uploaded first, returning a `bs://app-id`. Options:

| Approach | Description |
|----------|-------------|
| Separate tool | `upload_app({ provider: 'browserstack', path: '...' })` returns app ID |
| Automatic | Provider detects local path, uploads, uses returned ID |
| Manual only | User uploads via BrowserStack UI/CLI, passes `bs://` URL |

**Recommendation**: Separate `upload_app` tool - explicit is better than magic.

### 4. Implementation Scope

| Phase | Scope |
|-------|-------|
| Phase 1 | Refactor to provider pattern with local providers only |
| Phase 2 | Add BrowserStack browser provider |
| Phase 3 | Add BrowserStack app provider + upload tool |
| Phase 4 | Add SauceLabs (if needed) |

---

## BrowserStack Capability Reference

### Browser Testing (Automate)

```typescript
{
  'bstack:options': {
    os: 'Windows',
    osVersion: '11',
    browserName: 'Chrome',
    browserVersion: '120.0',
    projectName: 'My Project',
    buildName: 'Build #123',
    sessionName: 'Login Test',
    local: false,
    debug: true,
    networkLogs: true,
    consoleLogs: 'verbose'
  }
}
```

### App Testing (App Automate)

```typescript
{
  'bstack:options': {
    deviceName: 'Samsung Galaxy S23 Ultra',
    platformName: 'android',
    platformVersion: '13.0',
    app: 'bs://j3c874f21852ba57957a3fdc33f47514288c4ba4',
    projectName: 'My App',
    buildName: 'Build #123',
    debug: true,
    networkLogs: true
  }
}
```

### Connection Config

```typescript
{
  protocol: 'https',
  hostname: 'hub-cloud.browserstack.com',
  port: 443,
  path: '/wd/hub',
  user: process.env.BROWSERSTACK_USERNAME,
  key: process.env.BROWSERSTACK_ACCESS_KEY
}
```

---

## References

- [WebdriverIO BrowserStack Service](https://webdriver.io/docs/browserstack-service/)
- [BrowserStack WebDriverIO App Automate Capabilities](https://www.browserstack.com/docs/app-automate/appium/wdio-browserstack-capabilities)
- [BrowserStack Capability Generator](https://www.browserstack.com/app-automate/capabilities)
- [WebdriverIO Capabilities Documentation](https://webdriver.io/docs/capabilities/)
