# WebDriverIO MCP Server

A Model Context Protocol (MCP) server that enables AI assistants to interact with web browsers and mobile applications
using WebDriverIO. Automate Chrome, Firefox, Edge, and Safari browsers plus iOS and Android apps—all through a unified interface.

## Installation

[![mcp MCP server](https://glama.ai/mcp/servers/webdriverio/mcp/badges/score.svg)](https://glama.ai/mcp/servers/webdriverio/mcp)

Add the following configuration to your MCP client settings:

**Standard config** (works in most clients):

```json
{
  "mcpServers": {
    "wdio-mcp": {
      "command": "npx",
      "args": ["-y", "@wdio/mcp@latest"]
    }
  }
}
```

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install%20Server-0098FF?style=flat-square)](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522wdio-mcp%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522%2540wdio%252Fmcp%2540latest%2522%255D%257D)
[![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install%20Server-24bfa5?style=flat-square)](https://insiders.vscode.dev/redirect?url=vscode-insiders%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522wdio-mcp%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522%2540wdio%252Fmcp%2540latest%2522%255D%257D)
[<img src="https://cursor.com/deeplink/mcp-install-dark.svg" alt="Install in Cursor">](https://cursor.com/en/install-mcp?name=WebDriverIO&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkB3ZGlvL21jcEBsYXRlc3QiXX0%3D)

<details>
<summary>Claude Desktop</summary>

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%\Claude\claude_desktop_config.json` (Windows), or `~/.config/Claude/claude_desktop_config.json` (Linux):

```json
{
  "mcpServers": {
    "wdio-mcp": {
      "command": "npx",
      "args": ["-y", "@wdio/mcp@latest"]
    }
  }
}
```
</details>

<details>
<summary>Claude Code</summary>

```bash
claude mcp add wdio-mcp -- npx -y @wdio/mcp@latest
```
</details>

<details>
<summary>Cline</summary>

Add to your VS Code `settings.json` or `cline_mcp_settings.json` file:

```json
{
  "mcpServers": {
    "wdio-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@wdio/mcp@latest"]
    }
  }
}
```
</details>

<details>
<summary>Cursor</summary>

Go to `Cursor Settings` → `MCP` → `Add new MCP Server`, or create `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "wdio-mcp": {
      "command": "npx",
      "args": ["-y", "@wdio/mcp@latest"]
    }
  }
}
```
</details>

<details>
<summary>Codex</summary>

Use the Codex CLI:

```bash
codex mcp add wdio-mcp npx "@wdio/mcp@latest"
```

Or edit `~/.codex/config.toml`:

```toml
[mcp_servers.wdio-mcp]
command = "npx"
args = ["@wdio/mcp@latest"]
```
</details>

<details>
<summary>Goose</summary>

Go to `Advanced settings` → `Extensions` → `Add custom extension`, or run:

```bash
goose configure
```

Or edit `~/.config/goose/config.yaml`:

```yaml
extensions:
  wdio-mcp:
    name: WebDriverIO MCP
    cmd: npx
    args: [-y, "@wdio/mcp@latest"]
    enabled: true
    type: stdio
```
</details>

<details>
<summary>Windsurf</summary>

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "wdio-mcp": {
      "command": "npx",
      "args": ["-y", "@wdio/mcp@latest"]
    }
  }
}
```
</details>

<details>
<summary>Zed</summary>

Edit Zed settings (`~/.config/zed/settings.json`):

```json
{
  "context_servers": {
    "wdio-mcp": {
      "source": "custom",
      "command": "npx",
      "args": ["-y", "@wdio/mcp@latest"]
    }
  }
}
```
</details>

<details>
<summary>VS Code (Copilot)</summary>

```bash
code --add-mcp '{"name":"wdio-mcp","command":"npx","args":["-y","@wdio/mcp@latest"]}'
```
</details>

----
> ⚠️ **Restart Required**: After adding the configuration, fully restart your MCP client to apply the changes.

### Option 2: Global Installation

If you prefer to install globally:

```bash
npm install -g @wdio/mcp
```

Then use `wdio-mcp` as the command:

```json
{
  "mcpServers": {
    "wdio-mcp": {
      "command": "wdio-mcp"
    }
  }
}
```

📖 **Need help?** Follow the [MCP install guide](https://modelcontextprotocol.io/quickstart/user).

### Prerequisites For Mobile App Automation

- **Appium Server**: Install globally with `npm install -g appium`
- **Platform Drivers**:
    - iOS: `appium driver install xcuitest` (requires Xcode on macOS)
    - Android: `appium driver install uiautomator2` (requires Android Studio)
- **Devices/Emulators**:
    - iOS Simulator (macOS) or physical device
    - Android Emulator or physical device
- **For iOS Real Devices**: You'll need the device's UDID (Unique Device Identifier)
    - **Find UDID on macOS**: Connect device → Open Finder → Select device → Click device name/model to reveal UDID
    - **Find UDID on Windows**: Connect device → iTunes or Apple Devices app → Click device icon → Click "Serial Number"
      to reveal UDID
    - **Xcode method**: Window → Devices and Simulators → Select device → UDID shown as "Identifier"

Start the Appium server before using mobile features:

```bash
appium
# Server runs at http://127.0.0.1:4723 by default
```

## BrowserStack

Run browser and mobile app tests on [BrowserStack](https://www.browserstack.com/) real devices and browsers without any local setup.

### Prerequisites

Set your credentials as environment variables:

```bash
export BROWSERSTACK_USERNAME=your_username
export BROWSERSTACK_ACCESS_KEY=your_access_key
```

Or add them to your MCP client config:

```json
{
  "mcpServers": {
    "wdio-mcp": {
      "command": "npx",
      "args": ["-y", "@wdio/mcp@latest"],
      "env": {
        "BROWSERSTACK_USERNAME": "your_username",
        "BROWSERSTACK_ACCESS_KEY": "your_access_key"
      }
    }
  }
}
```

### Browser Sessions

Run a browser on a specific OS/version combination:

```javascript
start_session({
  provider: 'browserstack',
  platform: 'browser',
  browser: 'chrome',           // chrome | firefox | edge | safari
  browserVersion: 'latest',    // default: latest
  os: 'Windows',               // e.g. "Windows", "OS X"
  osVersion: '11',             // e.g. "11", "Sequoia"
  reporting: {
    project: 'My Project',
    build: 'v1.2.0',
    session: 'Login flow'
  }
})
```

### Mobile App Sessions

Test on BrowserStack real devices. First upload your app (or use an existing `bs://` URL):

```javascript
// Upload a local .apk or .ipa (returns a bs:// URL)
upload_app({ path: '/path/to/app.apk' })

// Start a session with the returned URL
start_session({
  provider: 'browserstack',
  platform: 'android',         // android | ios
  app: 'bs://abc123...',       // bs:// URL or custom_id from upload
  deviceName: 'Samsung Galaxy S23',
  platformVersion: '13.0',
  reporting: {
    project: 'My Project',
    build: 'v1.2.0',
    session: 'Checkout flow'
  }
})
```

Use `list_apps` to see previously uploaded apps:

```javascript
list_apps()                               // own uploads, sorted by date
list_apps({ sortBy: 'app_name' })
list_apps({ organizationWide: true })     // all uploads in your org
```

### BrowserStack Local

To test against URLs that are only accessible on your local machine or internal network, enable the BrowserStack Local tunnel:

```javascript
start_session({
  provider: 'browserstack',
  platform: 'browser',
  browser: 'chrome',
  browserstackLocal: true      // starts tunnel automatically
})
```

### Reporting Labels

All session types support `reporting` labels that appear in the BrowserStack Automate dashboard:

| Field                     | Description                                |
|---------------------------|--------------------------------------------|
| `reporting.project`       | Group sessions under a project name        |
| `reporting.build`         | Tag sessions with a build/version label    |
| `reporting.session`       | Name for the individual test session       |

### BrowserStack Tools

| Tool          | Description                                                                      |
|---------------|----------------------------------------------------------------------------------|
| `upload_app`  | Upload a local `.apk` or `.ipa` to BrowserStack; returns a `bs://` URL          |
| `list_apps`   | List apps previously uploaded to your BrowserStack account                       |

## Features

### Browser Automation

- **Session Management**: Start and close browser sessions (Chrome, Firefox, Edge, Safari) with headless/headed modes
- **Navigation & Interaction**: Navigate URLs, click elements, fill forms, and retrieve content
- **Page Analysis**: Get visible elements, accessibility trees, take screenshots
- **Cookie Management**: Get, set, and delete cookies
- **Scrolling**: Smooth scrolling with configurable distances
- **Attach to running Chrome**: Connect to an existing Chrome window via `--remote-debugging-port` — ideal for testing authenticated or pre-configured sessions
- **Device emulation**: Apply mobile/tablet presets (iPhone 15, Pixel 7, etc.) to simulate responsive layouts without a physical device
- **Session Recording**: All tool calls are automatically recorded and exportable as runnable WebdriverIO JS

### Mobile App Automation (iOS/Android)

- **Native App Testing**: Test iOS (.app/.ipa) and Android (.apk) apps via Appium
- **Touch Gestures**: Tap, swipe, long-press, drag-and-drop
- **App Lifecycle**: Launch, background, terminate, check app state
- **Context Switching**: Seamlessly switch between native and webview contexts for hybrid apps
- **Device Control**: Rotate, lock/unlock, geolocation, keyboard control, notifications
- **Cross-Platform Selectors**: Accessibility IDs, XPath, UiAutomator (Android), Predicates (iOS)

## Available Tools

### Session Management

| Tool             | Description                                                                              |
|------------------|------------------------------------------------------------------------------------------|
| `start_session`  | Start a browser or app session. Use `platform: 'browser'` for web, `platform: 'ios'`/`'android'` for mobile, or `attach: true` to connect to a running Chrome instance |
| `launch_chrome`  | Launch a new Chrome instance with remote debugging enabled (for use with `start_session({ attach: true })`) |
| `close_session`  | Close or detach from the current session (supports `detach: true` to disconnect without terminating) |
| `emulate_device` | Emulate a mobile/tablet device preset (viewport, DPR, UA, touch); requires BiDi session |

### Navigation & Page Interaction (Web & Mobile)

| Tool            | Description                                                                                                                                                                                         |
|-----------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `navigate`      | Navigate to a URL                                                                                                                                                                                   |
| `get_elements`  | Get visible, interactable elements on the page. Supports `inViewportOnly` (default: true) to filter viewport elements, and `includeContainers` (default: false) to include layout containers on mobile |
| `scroll`        | Scroll in a direction (up/down) by specified pixels                                                                                                                                                 |
| `execute_script` | Execute arbitrary JavaScript in the browser context                                                                                                                                                |
| `switch_tab`    | Switch to a different browser tab by index or URL                                                                                                                                                   |

### Element Interaction (Web & Mobile)

| Tool            | Description                 |
|-----------------|-----------------------------|
| `click_element` | Click an element            |
| `set_value`     | Type text into input fields |

### Cookie Management (Web)

| Tool             | Description                                            |
|------------------|--------------------------------------------------------|
| `set_cookie`     | Set a cookie with name, value, and optional attributes |
| `delete_cookies` | Delete all cookies or a specific cookie                |

### Mobile Gestures (iOS/Android)

| Tool            | Description                               |
|-----------------|-------------------------------------------|
| `tap_element`   | Tap an element by selector or coordinates |
| `swipe`         | Swipe in a direction (up/down/left/right) |
| `drag_and_drop` | Drag from one location to another         |

### Context Switching (Hybrid Apps)

| Tool             | Description                                     |
|------------------|-------------------------------------------------|
| `switch_context` | Switch between native and webview contexts      |

### Device Control (iOS/Android)

| Tool              | Description                     |
|-------------------|---------------------------------|
| `rotate_device`   | Rotate to portrait or landscape |
| `hide_keyboard`   | Hide on-screen keyboard         |
| `set_geolocation` | Set device GPS location         |

### MCP Resources (read-only, no tool call needed)

| Resource                                  | Description                                            |
|-------------------------------------------|--------------------------------------------------------|
| `wdio://sessions`                         | Index of all recorded sessions                         |
| `wdio://session/current/steps`            | Step log for the active session                        |
| `wdio://session/current/code`             | Generated runnable WebdriverIO JS for the active session |
| `wdio://session/{id}/steps`               | Step log for any past session by ID                    |
| `wdio://session/{id}/code`                | Generated JS for any past session by ID                |
| `wdio://session/current/elements`         | Interactable elements (viewport-only by default)       |
| `wdio://session/current/accessibility`    | Accessibility tree                                     |
| `wdio://session/current/screenshot`       | Screenshot (base64)                                    |
| `wdio://session/current/cookies`          | Browser cookies                                        |
| `wdio://session/current/tabs`             | Open browser tabs                                      |
| `wdio://session/current/contexts`         | Native/webview contexts (mobile)                       |
| `wdio://session/current/context`          | Currently active context (mobile)                      |
| `wdio://session/current/app-state`        | Mobile app state                                       |
| `wdio://session/current/geolocation`      | Device geolocation                                     |
| `wdio://session/current/capabilities`     | Resolved WebDriver capabilities for the active session |
| `wdio://browserstack/local-binary`        | BrowserStack Local binary download URL and start command |

## Usage Examples

### Real-World Test Cases

**Example 1: Testing Demo Android App (Book Scanning)**

```
Test the Demo Android app at C:\Users\demo-liveApiGbRegionNonMinifiedRelease-3018788.apk on emulator-5554:
1. Start the app with auto-grant permissions
2. Get visible elements on the onboarding screen
3. Tap "Skip" to bypass onboarding
4. Verify main screen loads
5. Take a screenshot
```

**Example 2: Testing World of Books E-commerce Site**

```
You are a Testing expert, and want to assess the basic workflows of worldofbooks.com:
- Open World of Books (accept all cookies)
- Get visible elements to see navigation structure
- Search for a fiction book
- Choose one and validate if there are NEW and used book options
- Report your findings at the end
```

### Browser Automation

**Basic web testing prompt:**

```
You are a Testing expert, and want to assess the basic workflows of a web application:
- Open World of Books (accept all cookies)
- Search for a fiction book
- Choose one and validate if there are NEW and used book options
- Report your findings at the end
```

**Browser configuration options:**

```javascript
// Default settings (headed mode, 1280x1080)
start_session({platform: 'browser'})

// Firefox
start_session({platform: 'browser', browser: 'firefox'})

// Edge
start_session({platform: 'browser', browser: 'edge'})

// Safari (headed only; requires macOS)
start_session({platform: 'browser', browser: 'safari'})

// Headless mode
start_session({platform: 'browser', headless: true})

// Custom dimensions
start_session({platform: 'browser', windowWidth: 1920, windowHeight: 1080})

// Pass custom capabilities (e.g. Chrome extensions, profile, prefs)
start_session({
  platform: 'browser',
  headless: false,
  capabilities: {
    'goog:chromeOptions': {
      args: ['--user-data-dir=/tmp/wdio-mcp-profile', '--load-extension=/path/to/unpacked-extension']
    }
  }
})
```

**Attach to a running Chrome instance:**

```
// First, launch Chrome with remote debugging enabled:
//
//   macOS (must quit Chrome first — open -a ignores args if Chrome is already running):
//     pkill -x "Google Chrome" && sleep 1
//     /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
//       --remote-debugging-port=9222 \
//       --user-data-dir=/tmp/chrome-debug &
//
//   Linux:
//     google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug &
//
//   Verify it's ready: curl http://localhost:9222/json/version
start_session({attach: true})
start_session({attach: true, port: 9333})
start_session({attach: true, port: 9222, navigationUrl: 'https://app.example.com'})
```

**Device emulation (requires BiDi session):**

```
// Device emulation (requires BiDi session)
start_browser({capabilities: {webSocketUrl: true}})
emulate_device()                         // list available presets
emulate_device({device: 'iPhone 15'})    // activate emulation
emulate_device({device: 'Pixel 7'})      // switch device
emulate_device({device: 'reset'})        // restore desktop defaults
```

### Mobile App Automation

**Testing an iOS app on simulator:**

```
Test my iOS app located at /path/to/MyApp.app on iPhone 15 Pro simulator:
1. Start the app session
2. Tap the login button
3. Enter "testuser" in the username field
4. Take a screenshot of the home screen
5. Close the session
```

**Preserving app state between sessions:**

```
Test my Android app without resetting data:
1. Start app session with noReset: true and fullReset: false
2. App launches with existing login state and user data preserved
3. Run test scenarios
4. Close session (app remains installed with data intact)
```

**Testing an iOS app on real device:**

```
Test my iOS app on my physical iPhone:
1. Start app session with:
   - platform: iOS
   - appPath: /path/to/MyApp.ipa
   - deviceName: My iPhone
   - udid: 00008030-001234567890ABCD (your device's UDID)
   - platformVersion: 17.0
2. Run your test scenario
3. Close the session
```

**Testing an Android app:**

```
Test my Android app /path/to/app.apk on the Pixel_6_API_34 emulator:
1. Start the app with auto-grant permissions
2. Get visible elements (use inViewportOnly: false to see all elements)
3. Swipe up to scroll
4. Tap on the "Settings" button using text matching
5. Verify the settings screen is displayed
```

**Advanced element detection:**

```
Test my app and debug layout issues:
1. Start the app session
2. Get visible elements with includeContainers: true to see the layout hierarchy
3. Analyze ViewGroup, FrameLayout, and ScrollView containers
4. Use inViewportOnly: false to find off-screen elements that need scrolling
```

**Hybrid app testing (switching contexts):**

```
Test my hybrid app:
1. Start the Android app session
2. Tap "Open Web" button in native context
3. List available contexts
4. Switch to WEBVIEW context
5. Click the login button using CSS selector
6. Switch back to NATIVE_APP context
7. Verify we're back on the home screen
```

## Important Notes

⚠️ **Session Management:**

- Only one session (browser OR app) can be active at a time
- Always close sessions when done to free system resources
- To switch between browser and mobile, close the current session first
- Use `close_session({ detach: true })` to disconnect without terminating the session on the Appium server
- **State preservation** can be controlled with `noReset` and `fullReset` parameters during session creation
- Sessions created with `noReset: true` or without `appPath` will automatically detach on close

⚠️ **Task Planning:**

- Break complex automation into smaller, focused operations
- Claude may consume message limits quickly with extensive automation

⚠️ **Mobile Automation:**

- Appium server must be running before starting mobile sessions
- Ensure emulators/simulators are running and devices are connected
- iOS automation requires macOS with Xcode installed
- **iOS Real Devices**: Testing on physical iOS devices requires the device's UDID (40-character unique identifier). See
  Prerequisites section for how to find your UDID

## Selector Syntax Quick Reference

**Web (CSS/XPath):**

- CSS: `button.my-class`, `#element-id`
- XPath: `//button[@class='my-class']`
- Text: `button=Exact text`, `a*=Contains text`

**Mobile (Cross-Platform):**

- Accessibility ID: `~loginButton` (works on both iOS and Android)
- Android UiAutomator: `android=new UiSelector().text("Login")`
- iOS Predicate: `-ios predicate string:label == "Login" AND visible == 1`
- XPath: `//android.widget.Button[@text="Login"]`

## Advanced Features

### App State Preservation

**State Preservation with noReset/fullReset:**
Control app state when creating new sessions using the `noReset` and `fullReset` parameters:

| noReset | fullReset | Behavior                                              |
|---------|-----------|-------------------------------------------------------|
| `true`  | `false`   | Preserve state: App stays installed, data preserved   |
| `false` | `false`   | Clear app data but keep app installed (default)       |
| `false` | `true`    | Full reset: Uninstall and reinstall app (clean slate) |

**Example with state preservation:**

```javascript
// Preserve login state between test runs
start_session({
    platform: 'android',
    appPath: '/path/to/app.apk',
    deviceName: 'emulator-5554',
    noReset: true,         // Don't reset app state
    fullReset: false,      // Don't uninstall
    autoGrantPermissions: true,
    capabilities: {
        'appium:chromedriverExecutable': '/path/to/chromedriver',
        'appium:autoWebview': true
    }
})
// App launches with existing user data, login tokens, preferences intact
```

**Detach from Sessions:**
The `close_session` tool supports a `detach` parameter that disconnects from the session without terminating it on the
Appium server:

```javascript
// Detach without killing the session
close_session({detach: true})

// Standard session termination (closes the app and removes session)
close_session({detach: false})  // or just close_session()
```

Sessions created with `noReset: true` or without `appPath` will automatically detach on close.

This is particularly useful when:

* Preserving app state for manual testing continuation
* Debugging multi-step workflows (leave session running between tool invocations)
* Testing scenarios where you want the app to remain installed and in current state

### Smart Element Detection

- **Platform-specific element classification**: Automatically identifies interactable elements vs layout containers
    - Android: Button, EditText, CheckBox vs ViewGroup, FrameLayout, ScrollView
    - iOS: Button, TextField, Switch vs View, StackView, CollectionView
- **Multiple locator strategies**: Each element provides accessibility ID, resource ID, text, XPath, and
  platform-specific selectors
- **Viewport filtering**: Control whether to get only visible elements or all elements including off-screen
- **Layout debugging**: Optionally include container elements to understand UI hierarchy

### Automatic Permission & Alert Handling

Both iOS and Android sessions now support automatic handling of system permissions and alerts:

- `autoGrantPermissions` (default: true): Automatically grants app permissions (camera, location, etc.)
- `autoAcceptAlerts` (default: true): Automatically accepts system alerts and dialogs
- `autoDismissAlerts` (optional): Set to true to dismiss alerts instead of accepting them

This eliminates the need to manually handle permission popups during automated testing.

## Technical Details

- **Built with:** TypeScript, WebDriverIO, Appium
- **Browser Support:** Chrome, Firefox, Edge (headed/headless, automated driver management), Safari (headed only; macOS)
- **Mobile Support:** iOS (XCUITest) and Android (UiAutomator2/Espresso)
- **Protocol:** Model Context Protocol (MCP) for Claude Desktop integration
- **Session Model:** Single active session (browser or mobile app)
- **Data Format:** TOON (Token-Oriented Object Notation) for efficient LLM communication
- **Element Detection:** XML-based page source parsing with intelligent filtering and multi-strategy locator generation

### Session Recording & Code Export

Every tool call is automatically recorded to a session history. You can inspect sessions and export runnable code via MCP resources — no extra tool calls needed:

- `wdio://sessions` — lists all recorded sessions with type, timestamps, and step count
- `wdio://session/current/steps` — step log for the active session
- `wdio://session/current/code` — generated runnable WebdriverIO JS for the active session
- `wdio://session/{sessionId}/steps` — step log for any past session by ID
- `wdio://session/{sessionId}/code` — generated JS for any past session by ID

The generated script reconstructs the full session — including capabilities, navigation, clicks, and inputs — as a standalone `import { remote } from 'webdriverio'` file. For BrowserStack sessions it includes the full try/catch/finally with automatic session result marking.

## Troubleshooting

**Browser automation not working?**

- Ensure Chrome, Firefox, Edge, or Safari is installed (Safari requires macOS)
- Try restarting Claude Desktop completely
- Check that no other WebDriver instances are running

**Mobile automation not working?**

- Verify Appium server is running: `appium`
- Check device/emulator is running: `adb devices` (Android) or Xcode Devices (iOS)
- Ensure correct platform drivers are installed
- Verify app path is correct and accessible

**Found issues or have suggestions?** Please share your feedback!
