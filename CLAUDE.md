# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WebDriverIO MCP Server is a Model Context Protocol (MCP) server that enables Claude Desktop to interact with web browsers and mobile applications using WebDriverIO for automation. The server supports:
- **Browser automation**: Chrome browser control (headed/headless)
- **Mobile app automation**: iOS and Android native app testing via Appium
- **Cross-platform**: Unified API for web, iOS, and Android automation

The server is published as an npm package (`webdriverio-mcp`) and runs via stdio transport.

## Development Commands

### Build and Package
```bash
npm run bundle           # Clean, build with tsup, make executable, and create .tgz package
npm run prebundle        # Clean lib directory and .tgz files
npm run postbundle       # Create npm package tarball
```

### Run Server
```bash
npm run dev              # Run development server with tsx (no build)
npm start                # Run built server from lib/server.js
```

## Architecture

### Core Components

**Server Entry Point** (`src/server.ts`)
- Initializes MCP server using `@modelcontextprotocol/sdk`
- Redirects console output to stderr to avoid interfering with MCP protocol (Chrome writes to stdout)
- Registers all tool handlers with the MCP server
- Uses StdioServerTransport for communication with Claude Desktop

**Session State Management** (`src/tools/browser.tool.ts` and `src/tools/app-session.tool.ts`)
- Maintains global state with three Maps:
  - `browsers`: Map<sessionId, WebdriverIO.Browser> - stores all browser/app instances
  - `currentSession`: string | null - tracks the single active session
  - `sessionMetadata`: Map<sessionId, {type, capabilities}> - tracks session type and config
- `getBrowser()` helper retrieves the current active browser/app instance
- `startBrowserTool` creates Chrome browser session with configurable options:
  - Headless mode support
  - Custom window dimensions (400-3840 width, 400-2160 height)
  - Chrome-specific arguments (sandbox, security, media stream, etc.)
- `startAppTool` creates iOS/Android app session via Appium with platform-specific capabilities:
  - `noReset`: Controls whether to preserve app state between sessions (default: false)
  - `fullReset`: Controls whether to uninstall app before/after session (default: true)
  - Sessions created with `noReset: true` will automatically detach on close (preserves session state)
- `closeSessionTool` properly cleans up browser/app sessions and metadata:
  - `detach: false` (default): Calls `deleteSession()` to terminate on server
  - `detach: true`: Disconnects without terminating (preserves session for manual testing)
  - Sessions created without `appPath` or with `noReset: true` automatically detach

**Tool Pattern**
All tools follow a consistent pattern:
1. Export Zod schema for arguments validation (e.g., `navigateToolArguments`)
2. Export ToolCallback function (e.g., `navigateTool`)
3. Use `getBrowser()` to access current session
4. Return `CallToolResult` with text content
5. Wrap operations in try-catch and return errors as text content

**Browser Script Execution** (`src/scripts/get-interactable-elements.ts`)
- Returns a function that executes in the browser context (not Node.js)
- `getInteractableElements()` finds all visible, interactable elements on the page
- Uses modern `element.checkVisibility()` API with fallback for older browsers
- Generates CSS selectors using IDs, classes, or nth-child path-based selectors
- Returns element metadata: tagName, type, id, className, textContent, value, placeholder, href, ariaLabel, role, cssSelector, isInViewport

**Mobile Element Detection** (`src/locators/` and `src/utils/mobile-elements.ts`)
- Uses XML-based page source parsing to extract all element attributes
- Platform-specific element classification:
  - `ANDROID_INTERACTABLE_TAGS`: Button, EditText, CheckBox, RadioButton, Switch, Spinner, etc.
  - `ANDROID_LAYOUT_CONTAINERS`: ViewGroup, LinearLayout, RelativeLayout, FrameLayout, ScrollView, etc.
  - `IOS_INTERACTABLE_TAGS`: Button, TextField, SecureTextField, Switch, Picker, etc.
  - `IOS_LAYOUT_CONTAINERS`: View, ScrollView, StackView, CollectionView, etc.
- Generates multiple locator strategies per element:
  - Accessibility ID (cross-platform)
  - Resource ID / Name
  - Text / Label matching
  - XPath (full and simplified)
  - UiAutomator (Android) / Predicates (iOS)
- Smart filtering with `inViewportOnly` and `includeContainers` parameters

### Build Configuration

**TypeScript** (`tsconfig.json`)
- Target: ES2022, Module: ESNext
- Source: `src/`, Output: `build/` (but not used for distribution)
- Strict mode disabled
- Includes types for Node.js and `@wdio/types`

**Bundler** (`tsup.config.ts`)
- Entry: `src/server.ts`
- Output: `lib/` directory (ESM format only)
- Generates declaration files and sourcemaps
- Externalizes `zod` dependency
- The shebang `#!/usr/bin/env node` in server.ts is preserved for CLI execution

### Selector Syntax

**Web Browsers:**
- CSS selectors: `button.my-class`, `#element-id`
- XPath: `//button[@class='my-class']`
- Text matching: `button=Exact text` (exact match), `a*=Link containing` (partial match)

**Mobile Apps:**
- Accessibility ID: `~loginButton` (works on both iOS and Android)
- Android UiAutomator: `android=new UiSelector().text("Login")`
- iOS Class Chain: `-ios class chain:**/XCUIElementTypeButton[\`label == "Login"\`]`
- iOS Predicate String: `-ios predicate string:label == "Login" AND visible == 1`
- XPath: `//android.widget.Button[@text="Login"]` or `//XCUIElementTypeButton[@label="Login"]`

## Mobile App Automation

### Prerequisites

**Appium Server Setup:**
The server requires an Appium server running to connect to iOS/Android devices and emulators.

1. **Install Appium:**
   ```bash
   npm install -g appium
   ```

2. **Install Platform Drivers:**
   ```bash
   # For iOS
   appium driver install xcuitest

   # For Android
   appium driver install uiautomator2
   ```

3. **Start Appium Server:**
   ```bash
   appium
   # Default: http://127.0.0.1:4723
   ```

**Device/Emulator Requirements:**
- **iOS**: Xcode installed, iOS Simulator running, or physical device connected
- **Android**: Android Studio installed, emulator running, or physical device connected

### Configuration

The server can be configured via environment variables or per-session parameters:

**Environment Variables:**
- `APPIUM_URL`: Appium server hostname (default: `127.0.0.1`)
- `APPIUM_URL_PORT`: Appium server port (default: `4723`)
- `APPIUM_PATH`: Appium server path (default: `/`)

**Example `.env`:**
```bash
APPIUM_URL=127.0.0.1
APPIUM_URL_PORT=4723
APPIUM_PATH=/
```

### Starting a Mobile App Session

Use the `start_app_session` tool with platform-specific parameters:

**iOS Example (Simulator):**
```typescript
const parameters = {
  platform: 'iOS',
  appPath: '/path/to/MyApp.app',
  deviceName: 'iPhone 15 Pro',
  platformVersion: '17.0',
  automationName: 'XCUITest',        // Optional, defaults to XCUITest
  autoGrantPermissions: true,        // Optional, defaults to true (grants app permissions)
  autoAcceptAlerts: true,            // Optional, defaults to true (auto-accepts system alerts)
  autoDismissAlerts: false,          // Optional, set to true to dismiss instead of accept
  noReset: false,                    // Optional, defaults to false (preserves app state if true)
  fullReset: true,                   // Optional, defaults to true (uninstalls app if true)
  newCommandTimeout: 300,            // Optional, session timeout in seconds (default: 60)
}
```

**iOS Example (Real Device):**
```typescript
const parameters = {
  platform: 'iOS',
  appPath: '/path/to/MyApp.ipa',
  deviceName: 'My iPhone',           // Physical device name
  platformVersion: '17.0',
  udid: '00008030-001234567890ABCD',  // Required for physical devices (40-character hex string)
  automationName: 'XCUITest',        // Optional, defaults to XCUITest
  autoGrantPermissions: true,        // Optional, defaults to true (grants app permissions)
  autoAcceptAlerts: true,            // Optional, defaults to true (auto-accepts system alerts)
  autoDismissAlerts: false,          // Optional, set to true to dismiss instead of accept
}
```

**Finding Your iOS Device UDID:**
The UDID (Unique Device Identifier) is a 40-character alphanumeric string required when testing on physical iOS devices.

Methods to find your device's UDID:

1. **Xcode (Devices and Simulators):**
   - Connect your iOS device via USB
   - Open Xcode → Window → Devices and Simulators
   - Select your device in the left sidebar
   - The UDID is shown as "Identifier" (e.g., `00008030-001234567890ABCD`)

2. **Terminal (using xcrun):**
   ```bash
   xcrun xctrace list devices
   ```
   Output shows connected devices with their UDIDs:
   ```
   My iPhone (17.0) (00008030-001234567890ABCD)
   ```

3. **Finder (macOS Catalina and later):**
   - Connect your device via USB
   - Open Finder and select your device in the sidebar
   - Click on the device info below the device name to cycle through information
   - The UDID will be displayed

**Android Example:**
```typescript
const parameters = {
  platform: 'Android',
  appPath: '/path/to/app.apk',
  deviceName: 'Pixel_6_API_34',
  platformVersion: '14',
  automationName: 'UiAutomator2',      // Optional, defaults to UiAutomator2
  autoGrantPermissions: true,           // Optional, defaults to true (grants app permissions automatically)
  autoAcceptAlerts: true,               // Optional, defaults to true (auto-accepts system alerts)
  autoDismissAlerts: false,             // Optional, set to true to dismiss instead of accept
  appWaitActivity: 'com.example.MainActivity',  // Optional, specific activity to wait for
  noReset: false,                       // Optional, defaults to false (preserves app state if true)
  fullReset: true,                      // Optional, defaults to true (uninstalls app if true)
  newCommandTimeout: 300,               // Optional, session timeout in seconds (default: 60)
}
```

**Override Appium Server:**
```typescript
const parameters = {
  platform: 'Android',
  appPath: '/path/to/app.apk',
  deviceName: 'emulator-5554',
  appiumHost: 'localhost',  // Override APPIUM_URL
  appiumPort: 4724,         // Override APPIUM_URL_PORT
  appiumPath: '/wd/hub',    // Override APPIUM_PATH
}
```

**App State Reset Behavior:**

Control how app state is handled during session creation using `noReset` and `fullReset` parameters:

| noReset | fullReset | Behavior |
|---------|-----------|----------|
| `false` (default) | `true` (default) | Full reset: Uninstall and reinstall app (clean state) |
| `false` | `false` | Clear app data but keep app installed |
| `true` | `false` | Preserve state: App stays installed, data preserved |

**Examples:**
```typescript
// Default: Clean install (uninstall/reinstall)
start_app_session({ platform: 'Android', appPath: '/path/to/app.apk', deviceName: 'emulator-5554' })

// Continue from current state (preserve app data)
start_app_session({
  platform: 'Android',
  appPath: '/path/to/app.apk',
  deviceName: 'emulator-5554',
  noReset: true,
  fullReset: false
})

// Clear app data but don't uninstall
start_app_session({
  platform: 'Android',
  appPath: '/path/to/app.apk',
  deviceName: 'emulator-5554',
  noReset: false,
  fullReset: false
})
```

**Session Timeout (newCommandTimeout):**

Control how long Appium keeps the session alive when no commands are received. This is essential when using `close_session({ detach: true })` to preserve sessions for manual testing or reconnection.

| newCommandTimeout | Behavior |
|-------------------|----------|
| undefined (default) | Uses Appium's default (~60 seconds) |
| `300` | Session stays alive for 5 minutes without commands |
| `600` | Session stays alive for 10 minutes without commands |
| `0` | Session never times out (use with caution) |

**Example - Keep session alive for manual testing:**
```typescript
// Start session that stays alive for 5 minutes after detaching
start_app_session({
  platform: 'Android',
  deviceName: 'emulator-5554',
  noReset: true,
  newCommandTimeout: 300,  // 5 minutes
})

// ... run some automation ...

// Detach (session stays alive on Appium server for 5 minutes)
close_session({ detach: true })

// You now have 5 minutes to manually interact with the app or reconnect
```

### Session Management

The server maintains a **single-session model**: only one browser or app session is active at a time.

**Session Creation:**
- `start_browser`: Start a new Chrome browser session
- `start_app_session`: Start a new iOS or Android app session with full control over app state (noReset/fullReset)
  - Sessions created with `noReset: true` will automatically detach on close (preserves session state)
  - Sessions created without `appPath` will automatically detach on close

**Session Closure:**
- `close_session`: Close or detach from the current session
  - `detach: false` (default): Terminate session on Appium server
  - `detach: true`: Disconnect without terminating (preserves session for manual testing)
  - Automatically detaches sessions created with `noReset: true` or without `appPath`

**Session Switching:**
To switch from browser to app (or vice versa), close the current session first, then start a new one.

### Shared Tools (Web & Mobile)

**Element Detection:**
- `get_visible_elements`: Get visible, interactable elements on the page
  - Parameters:
    - `inViewportOnly` (boolean, default: `true`): Only return elements within the visible viewport
      - Set to `false` to get ALL elements on the page, including off-screen elements
      - Useful for finding elements that need scrolling to reach
    - `includeContainers` (boolean, default: `false`): Include layout containers in results
      - Mobile only: ViewGroup, FrameLayout, ScrollView (Android) or View, StackView (iOS)
      - Set to `true` to see full layout hierarchy for debugging complex UIs
      - Web: Not applicable, web elements are not classified as containers
  - Example usage:
    ```typescript
    // Get only viewport-visible interactive elements (default)
    get_visible_elements()

    // Get all elements including off-screen (useful for scroll testing)
    get_visible_elements({ inViewportOnly: false })

    // Get all elements including layout containers (mobile debugging)
    get_visible_elements({ includeContainers: true })

    // Get ALL elements including containers and off-screen
    get_visible_elements({ inViewportOnly: false, includeContainers: true })
    ```

### Mobile-Specific Tools

**Touch Gestures:**
- `tap_element`: Tap element by selector or coordinates
- `swipe`: Swipe in a direction (up/down/left/right) with configurable duration
- `drag_and_drop`: Drag from one location to another

**App Lifecycle:**
- `get_app_state`: Check app state (not installed, not running, background, foreground)

**Context Switching (Hybrid Apps):**
- `get_contexts`: List available contexts (NATIVE_APP, WEBVIEW_*)
- `get_current_context`: Show active context
- `switch_context`: Switch between native and webview contexts

**Device Interaction:**
- `rotate_device`: Set orientation (PORTRAIT/LANDSCAPE)
- `hide_keyboard`: Hide on-screen keyboard
- `get_geolocation` / `set_geolocation`: GPS control

**Script Execution (Advanced):**

- `execute_script`: Run JavaScript in browser or Appium mobile commands
    - Browser JS: `execute_script({ script: "return document.title" })`
    - Android key press: `execute_script({ script: "mobile: pressKey", args: [{ keycode: 4 }] })` (BACK=4, HOME=3)
    - Activate app: `execute_script({ script: "mobile: activateApp", args: [{ appId: "com.example" }] })`
    - Terminate app: `execute_script({ script: "mobile: terminateApp", args: [{ appId: "com.example" }] })`
    - Deep link:
      `execute_script({ script: "mobile: deepLink", args: [{ url: "myapp://screen", package: "com.example" }] })`
    - Shell command (Android):
      `execute_script({ script: "mobile: shell", args: [{ command: "dumpsys", args: ["battery"] }] })`

### Real-World Examples

**Example 1: Testing Demo Android App (Book Scanning App)**
```typescript
// Real test case: Validate Demo onboarding screen
// APK: C:\Users\demo-liveApiGbRegionNonMinifiedRelease-3018788.apk

// 1. Start Demo app on Android emulator
start_app_session({
  platform: 'Android',
  appPath: 'C:\\Users\\demo-liveApiGbRegionNonMinifiedRelease-3018788.apk',
  deviceName: 'emulator-5554',
  autoGrantPermissions: true,  // Auto-grant camera/storage permissions for scanning
})

// 2. Get onboarding elements (found 5 elements on "Step 1: Scan" screen)
get_visible_elements()
// Returns:
// - ImageView: "Step One, Scan." (accessibility ID: ~Step One, Scan.)
// - TextView: "Step 1: Scan" (resourceId: uk.co.demo:id/text_description_onboarding)
// - TextView: "Scan your old and unwanted items."
// - TextView: "Skip" button
// - Button: Navigation button (likely "Next")

// 3. Tap Skip to bypass onboarding
tap_element({ selector: 'android=new UiSelector().text("Skip")' })

// 4. Interact with main app...
```

**Example 2: Testing World of Books Website (E-commerce)**
```typescript
// Real test case: Validate worldofbooks.com homepage

// 1. Start browser session
start_browser({ headless: false, windowWidth: 1920, windowHeight: 1080 })

// 2. Navigate to World of Books
navigate({ url: 'https://www.worldofbooks.com' })

// 3. Get visible elements (found 32 elements including navigation, search, products)
get_visible_elements()
// Returns:
// - Navigation: Cyber Monday, Christmas, Fiction Books, Children's Books, etc.
// - User account links: Help, Account, Wishlist, Basket
// - Search input with Algolia autocomplete
// - Product wishlist buttons (6 products visible)
// - Cookie consent banner (3 buttons: Settings, Reject All, Accept All)

// 4. Accept cookies
click_element({ selector: '#onetrust-accept-btn-handler' })

// 5. Search for a book
set_value({ selector: '#autocomplete-0-input', value: 'Harry Potter' })
click_element({ selector: '#searchButton' })
```

### Example Workflows

**Workflow 1: Preserve App State Between Sessions**
```typescript
// Scenario: App already installed and logged in, want to test from current state

// 1. Start session without resetting app state
start_app_session({
  platform: 'Android',
  appPath: '/path/to/app.apk',
  deviceName: 'emulator-5554',
  noReset: true,           // Preserve app data
  fullReset: false,        // Don't uninstall
})

// 2. App continues from current state (user logged in, settings preserved)
get_visible_elements()

// 3. Test feature without re-login
tap_element({ selector: 'android=new UiSelector().text("Dashboard")' })

// 4. Close session normally (app stays installed)
close_session()
```

**Workflow 2: Clean App Install for Fresh Test**
```typescript
// Scenario: Need fresh app state for regression testing

// 1. Start session with full reset (default behavior)
start_app_session({
  platform: 'Android',
  appPath: '/path/to/app.apk',
  deviceName: 'emulator-5554',
  // noReset defaults to false, fullReset defaults to true
})

// 2. App is freshly installed (no previous data)
get_visible_elements()

// 3. Test onboarding flow from scratch
tap_element({ selector: 'android=new UiSelector().text("Get Started")' })

// 4. Close session (app uninstalled automatically)
close_session()
```

**Testing an iOS App (Simulator):**
```typescript
// 1. Start app session on simulator
start_app_session({
  platform: 'iOS',
  appPath: '/path/to/MyApp.app',
  deviceName: 'iPhone 15 Pro',
})

// 2. Interact with elements
tap_element({ selector: '~loginButton' })
set_value({ selector: '~usernameField', value: 'testuser' })
tap_element({ selector: '-ios predicate string:label == "Submit"' })

// 3. Verify state
get_app_state({ bundleId: 'com.example.myapp' })

// 4. Take screenshot
take_screenshot({ filename: 'login-screen.png' })

// 5. Close session
close_session()
```

**Testing an iOS App (Real Device):**
```typescript
// 1. Start app session on physical device
start_app_session({
  platform: 'iOS',
  appPath: '/path/to/MyApp.ipa',
  deviceName: 'My iPhone',
  platformVersion: '17.0',
  udid: '00008030-001234567890ABCD',  // Device UDID required
})

// 2. Interact with elements
tap_element({ selector: '~loginButton' })
set_value({ selector: '~usernameField', value: 'testuser' })
tap_element({ selector: '-ios predicate string:label == "Submit"' })

// 3. Test device-specific features
get_device_info()  // Returns physical device info
set_geolocation({ latitude: 37.7749, longitude: -122.4194 })

// 4. Take screenshot
take_screenshot({ filename: 'real-device-test.png' })

// 5. Close session
close_session()
```

**Testing an Android App with Webview:**
```typescript
// 1. Start app
start_app_session({
  platform: 'Android',
  appPath: '/path/to/app.apk',
  deviceName: 'emulator-5554',
  autoGrantPermissions: true,
})

// 2. Native app interaction
tap_element({ selector: 'android=new UiSelector().text("Open Web")' })

// 3. Switch to webview context
get_contexts()  // Lists: NATIVE_APP, WEBVIEW_com.example.app
switch_context({ context: 'WEBVIEW_com.example.app' })

// 4. Web interaction (use CSS selectors)
click_element({ selector: '#loginButton' })
set_value({ selector: '#username', value: 'testuser' })

// 5. Switch back to native
switch_context({ context: 'NATIVE_APP' })

// 6. Close
close_session()
```

**Device Manipulation:**
```typescript
// Rotate device
rotate_device({ orientation: 'LANDSCAPE' })

// Swipe gesture
swipe({ direction: 'up', duration: 500 })

// Set location
set_geolocation({ latitude: 37.7749, longitude: -122.4194 })
```

### Key Implementation Details

1. **Console Output Redirection**: All console methods (log, info, warn, debug) are redirected to stderr because Chrome writes to stdout, which would corrupt the MCP stdio protocol.

2. **Element Visibility**: The `get-interactable-elements.ts` script runs in the browser and must be completely self-contained (no external dependencies). It filters for visible, non-disabled elements and returns all of them regardless of viewport status.

3. **Mobile Element Detection & Locator Generation** (New Architecture - Inspired by `appium-mcp`):
   - **XML Parsing**: Uses `browser.getPageSource()` to retrieve native XML hierarchy, then parses with platform-specific parsers
   - **Element Classification**: Filters elements based on platform-specific tag sets:
     - Interactable elements: Buttons, inputs, checkboxes, switches, pickers, etc.
     - Layout containers: ViewGroups, ScrollViews, StackViews, CollectionViews, etc.
   - **Multi-Strategy Locator Generation**: For each element, generates multiple selector options:
     - Primary: Accessibility ID / Resource ID (most stable)
     - Secondary: Text/Label matching (language-dependent)
     - Fallback: XPath with attributes (most specific but brittle)
     - Platform-specific: UiAutomator (Android) or Predicates (iOS)
   - **Smart Filtering**:
     - `inViewportOnly`: Filters elements by screen bounds to show only visible items
     - `includeContainers`: Controls whether layout wrappers are included in results
     - `hasMeaningfulContent`: Checks if element has text, description, or interactive children
   - **Files**: `src/locators/element-filter.ts`, `src/locators/generate-all-locators.ts`, `src/locators/source-parsing.ts`

4. **Scroll Behavior**: Click operations default to scrolling elements into view (`scrollIntoView` with center alignment) before clicking.

5. **Session Management**: The server maintains a Map of browser/app sessions keyed by sessionId, with a `sessionMetadata` Map tracking session type ('browser', 'ios', 'android') and capabilities. Only one `currentSession` is active at a time. All tools operate on the current session. Sessions can be created with `start_browser` or `start_app_session`. When closing, `detach: true` preserves the session on the Appium server for continued manual testing. Sessions created with `noReset: true` or without `appPath` automatically detach on close.

6. **Mobile State Sharing**: The `browser.tool.ts` exports state via `(getBrowser as any).__state` to allow `app-session.tool.ts` to access and modify the shared session state. This maintains single-session behavior across browser and mobile automation.

7. **Automatic Permission & Alert Handling**: Appium capabilities now include `autoGrantPermissions`, `autoAcceptAlerts`, and `autoDismissAlerts` by default, eliminating manual handling of permission popups. These settings are applied during session initialization in `src/config/appium.config.ts`.

8. **Error Handling**: Tools catch errors and return them as text content rather than throwing, ensuring the MCP protocol remains stable.

9. **Cross-Platform Compatibility**: Many existing tools (click_element, set_value, take_screenshot, etc.) work seamlessly on both web browsers and mobile apps. Mobile-specific tools (gestures, app lifecycle, device interaction) only work with app sessions.

## Adding New Tools

To add a new tool:

1. Create a new file in `src/tools/` (e.g., `my-tool.tool.ts`)
2. Define Zod schema for arguments: `export const myToolArguments = { ... }`
3. Implement the tool callback: `export const myTool: ToolCallback = async ({ args }) => { ... }`
4. Import and register in `src/server.ts`: `server.tool('my_tool', 'description', myToolArguments, myTool)`

Example:
```typescript
import { getBrowser } from './browser.tool';
import { z } from 'zod';
import { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';

export const myToolArguments = {
  param: z.string().describe('Description of parameter'),
};

export const myTool: ToolCallback = async ({ param }: { param: string }) => {
  try {
    const browser = getBrowser();
    // ... implementation
    return {
      content: [{ type: 'text', text: `Success: ${result}` }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error: ${e}` }],
    };
  }
};
```
