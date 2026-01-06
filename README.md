# WebDriverIO MCP Server

A Model Context Protocol (MCP) server that enables Claude Desktop to interact with web browsers and mobile applications
using WebDriverIO. Automate Chrome browsers, iOS apps, and Android apps—all through a unified interface.

## Installation

### Setup

**Option 1: Configure Claude Desktop or Claude Code (Recommended)**

Add the following configuration to your Claude MCP settings:

```json
{
  "mcpServers": {
    "webdriverio-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@wdio/mcp"
      ]
    }
  }
}
```

**Option 2: Global Installation**

```bash
npm i -g @wdio/mcp
```

Then configure MCP:

```json
{
  "mcpServers": {
    "webdriverio-mcp": {
      "command": "webdriverio-mcp"
    }
  }
}
```

> **Note:** The npm package is `@wdio/mcp`, but the executable binary is `webdriverio-mcp`.

**Restart Claude Desktop**

⚠️ You may need to fully restart Claude Desktop. On Windows, use Task Manager to ensure it's completely closed before
restarting.

📖 **Need help?** Read the [official MCP configuration guide](https://modelcontextprotocol.io/quickstart/user)

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

## Features

### Browser Automation

- **Session Management**: Start and close Chrome browser sessions with headless/headed modes
- **Navigation & Interaction**: Navigate URLs, click elements, fill forms, and retrieve content
- **Page Analysis**: Get visible elements, accessibility trees, take screenshots
- **Cookie Management**: Get, set, and delete cookies
- **Scrolling**: Smooth scrolling with configurable distances

### Mobile App Automation (iOS/Android)

- **Native App Testing**: Test iOS (.app/.ipa) and Android (.apk) apps via Appium
- **Touch Gestures**: Tap, swipe, long-press, drag-and-drop
- **App Lifecycle**: Launch, background, terminate, check app state
- **Context Switching**: Seamlessly switch between native and webview contexts for hybrid apps
- **Device Control**: Rotate, lock/unlock, geolocation, keyboard control, notifications
- **Cross-Platform Selectors**: Accessibility IDs, XPath, UiAutomator (Android), Predicates (iOS)

## Available Tools

### Session Management

| Tool                | Description                                                                              |
|---------------------|------------------------------------------------------------------------------------------|
| `start_browser`     | Start a Chrome browser session (headless/headed, custom dimensions)                      |
| `start_app_session` | Start an iOS or Android app session via Appium (supports state preservation via noReset) |
| `close_session`     | Close or detach from the current browser or app session (supports detach mode)           |

### Navigation & Page Interaction (Web & Mobile)

| Tool                   | Description                                                                                                                                                                                            |
|------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `navigate`             | Navigate to a URL                                                                                                                                                                                      |
| `get_visible_elements` | Get visible, interactable elements on the page. Supports `inViewportOnly` (default: true) to filter viewport elements, and `includeContainers` (default: false) to include layout containers on mobile |
| `get_accessibility`    | Get accessibility tree with semantic element information                                                                                                                                               |
| `scroll_down`          | Scroll down by specified pixels                                                                                                                                                                        |
| `scroll_up`            | Scroll up by specified pixels                                                                                                                                                                          |
| `take_screenshot`      | Capture a screenshot                                                                                                                                                                                   |

### Element Interaction (Web & Mobile)

| Tool               | Description                                                     |
|--------------------|-----------------------------------------------------------------|
| `find_element`     | Find an element using CSS selectors, XPath, or mobile selectors |
| `click_element`    | Click an element                                                |
| `click_via_text`   | Click an element by text content                                |
| `set_value`        | Type text into input fields                                     |
| `get_element_text` | Get text content of an element                                  |
| `is_displayed`     | Check if an element is displayed                                |

### Cookie Management (Web)

| Tool             | Description                                            |
|------------------|--------------------------------------------------------|
| `get_cookies`    | Get all cookies or a specific cookie by name           |
| `set_cookie`     | Set a cookie with name, value, and optional attributes |
| `delete_cookies` | Delete all cookies or a specific cookie                |

### Mobile Gestures (iOS/Android)

| Tool            | Description                               |
|-----------------|-------------------------------------------|
| `tap_element`   | Tap an element by selector or coordinates |
| `swipe`         | Swipe in a direction (up/down/left/right) |
| `long_press`    | Long press an element or coordinates      |
| `drag_and_drop` | Drag from one location to another         |

### App Lifecycle (iOS/Android)

| Tool            | Description                                                  |
|-----------------|--------------------------------------------------------------|
| `get_app_state` | Check app state (installed, running, background, foreground) |
| `activate_app`  | Bring app to foreground                                      |
| `terminate_app` | Terminate a running app                                      |

### Context Switching (Hybrid Apps)

| Tool                  | Description                                     |
|-----------------------|-------------------------------------------------|
| `get_contexts`        | List available contexts (NATIVE_APP, WEBVIEW_*) |
| `get_current_context` | Show the currently active context               |
| `switch_context`      | Switch between native and webview contexts      |

### Device Control (iOS/Android)

| Tool                                  | Description                                   |
|---------------------------------------|-----------------------------------------------|
| `get_device_info`                     | Get device platform, version, screen size     |
| `rotate_device`                       | Rotate to portrait or landscape orientation   |
| `get_orientation`                     | Get current device orientation                |
| `lock_device` / `unlock_device`       | Lock or unlock device screen                  |
| `is_device_locked`                    | Check if device is locked                     |
| `shake_device`                        | Shake the device (iOS only)                   |
| `send_keys`                           | Send keyboard input (Android only)            |
| `press_key_code`                      | Press Android key code (BACK=4, HOME=3, etc.) |
| `hide_keyboard` / `is_keyboard_shown` | Control on-screen keyboard                    |
| `open_notifications`                  | Open notifications panel (Android only)       |
| `get_geolocation` / `set_geolocation` | Get or set device GPS location                |

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
start_browser()

// Headless mode
start_browser({headless: true})

// Custom dimensions
start_browser({windowWidth: 1920, windowHeight: 1080})

// Headless with custom dimensions
start_browser({headless: true, windowWidth: 1920, windowHeight: 1080})
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
start_app_session({
    platform: 'Android',
    appPath: '/path/to/app.apk',
    deviceName: 'emulator-5554',
    noReset: true,         // Don't reset app state
    fullReset: false,      // Don't uninstall
    autoGrantPermissions: true
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
- **Browser Support:** Chrome (headed/headless, automated driver management)
- **Mobile Support:** iOS (XCUITest) and Android (UiAutomator2/Espresso)
- **Protocol:** Model Context Protocol (MCP) for Claude Desktop integration
- **Session Model:** Single active session (browser or mobile app)
- **Data Format:** TOON (Token-Oriented Object Notation) for efficient LLM communication
- **Element Detection:** XML-based page source parsing with intelligent filtering and multi-strategy locator generation

## Troubleshooting

**Browser automation not working?**

- Ensure Chrome is installed
- Try restarting Claude Desktop completely
- Check that no other WebDriver instances are running

**Mobile automation not working?**

- Verify Appium server is running: `appium`
- Check device/emulator is running: `adb devices` (Android) or Xcode Devices (iOS)
- Ensure correct platform drivers are installed
- Verify app path is correct and accessible

**Found issues or have suggestions?** Please share your feedback!