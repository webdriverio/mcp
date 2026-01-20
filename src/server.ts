#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  closeSessionTool,
  closeSessionToolArguments,
  startBrowserTool,
  startBrowserToolArguments
} from './tools/browser.tool';
import { navigateTool, navigateToolArguments } from './tools/navigate.tool';
import { clickTool, clickToolArguments, clickToolViaText } from './tools/click.tool';
import { setValueTool, setValueToolArguments } from './tools/set-value.tool';
import { findElementTool, findElementToolArguments } from './tools/find-element.tool';
import { getElementTextTool, getElementTextToolArguments } from './tools/get-element-text.tool';
import { isDisplayedTool, isDisplayedToolArguments } from './tools/is-displayed.tool';
import { scrollDownTool, scrollDownToolArguments } from './tools/scroll-down.tool';
import { scrollUpTool, scrollUpToolArguments } from './tools/scroll-up.tool';
import { getVisibleElementsTool, getVisibleElementsToolArguments } from './tools/get-visible-elements.tool';
import { takeScreenshotTool, takeScreenshotToolArguments } from './tools/take-screenshot.tool';
import {
  deleteCookiesTool,
  deleteCookiesToolArguments,
  getCookiesTool,
  getCookiesToolArguments,
  setCookieTool,
  setCookieToolArguments,
} from './tools/cookies.tool';
import { getAccessibilityTreeTool, getAccessibilityToolArguments } from './tools/get-accessibility-tree.tool';
import { startAppTool, startAppToolArguments } from './tools/app-session.tool';
import {
  dragAndDropTool,
  dragAndDropToolArguments,
  longPressTool,
  longPressToolArguments,
  swipeTool,
  swipeToolArguments,
  tapElementTool,
  tapElementToolArguments,
} from './tools/gestures.tool';
import {
  activateAppTool,
  activateAppToolArguments,
  getAppStateTool,
  getAppStateToolArguments,
  terminateAppTool,
  terminateAppToolArguments,
} from './tools/app-actions.tool';
import {
  getContextsTool,
  getCurrentContextTool,
  switchContextTool,
  switchContextToolArguments
} from './tools/context.tool';
import {
  getDeviceInfoTool,
  getGeolocationTool,
  getOrientationTool,
  hideKeyboardTool,
  isDeviceLockedTool,
  isKeyboardShownTool,
  lockDeviceTool,
  openNotificationsTool,
  pressKeyCodeTool,
  pressKeyCodeToolArguments,
  rotateDeviceTool,
  rotateDeviceToolArguments,
  sendKeysTool,
  sendKeysToolArguments,
  setGeolocationTool,
  setGeolocationToolArguments,
  shakeDeviceTool,
  unlockDeviceTool,
} from './tools/device.tool';

// IMPORTANT: Redirect all console output to stderr to avoid messing with MCP protocol (Chrome writes to console)
const _originalConsoleLog = console.log;
const _originalConsoleInfo = console.info;
const _originalConsoleWarn = console.warn;
const _originalConsoleDebug = console.debug;

console.log = (...args) => console.error('[LOG]', ...args);
console.info = (...args) => console.error('[INFO]', ...args);
console.warn = (...args) => console.error('[WARN]', ...args);
console.debug = (...args) => console.error('[DEBUG]', ...args);

const server = new McpServer({
  name: 'MCP WebdriverIO',
  version: '1.4.0',
}, {
  capabilities: {
    resources: {},
    tools: {},
  },
});

// Browser and App Session Management
server.tool('start_browser', 'starts a browser session and sets it to the current state', startBrowserToolArguments, startBrowserTool);
server.tool('start_app_session', 'starts a mobile app session (iOS/Android) via Appium', startAppToolArguments, startAppTool);
server.tool('close_session', 'closes or detaches from the current browser or app session', closeSessionToolArguments, closeSessionTool);
server.tool('navigate', 'navigates to a URL', navigateToolArguments, navigateTool);

server.tool('get_visible_elements', 'get a list of visible (in viewport & displayed) interactable elements on the page (buttons, links, inputs). Use elementType="visual" for images/SVGs. Must prefer this to take_screenshot for interactions', getVisibleElementsToolArguments, getVisibleElementsTool);
server.tool('get_accessibility', 'gets accessibility tree snapshot with semantic information about page elements (roles, names, states). Browser-only - use when get_visible_elements does not return expected elements.', getAccessibilityToolArguments, getAccessibilityTreeTool);

server.tool('scroll_down', 'scrolls the page down by specified pixels', scrollDownToolArguments, scrollDownTool);
server.tool('scroll_up', 'scrolls the page up by specified pixels', scrollUpToolArguments, scrollUpTool);

server.tool('find_element', 'finds an element', findElementToolArguments, findElementTool);
server.tool('click_element', 'clicks an element', clickToolArguments, clickTool);
server.tool('click_via_text', 'clicks an element', clickToolArguments, clickToolViaText);
server.tool('set_value', 'set value to an element, aka typing', setValueToolArguments, setValueTool);

server.tool('get_element_text', 'gets the text content of an element', getElementTextToolArguments, getElementTextTool);
server.tool('is_displayed', 'checks if an element is displayed', isDisplayedToolArguments, isDisplayedTool);

server.tool('take_screenshot', 'captures a screenshot of the current page', takeScreenshotToolArguments, takeScreenshotTool);

server.tool('get_cookies', 'gets all cookies or a specific cookie by name', getCookiesToolArguments, getCookiesTool);
server.tool('set_cookie', 'sets a cookie with specified name, value, and optional attributes', setCookieToolArguments, setCookieTool);
server.tool('delete_cookies', 'deletes all cookies or a specific cookie by name', deleteCookiesToolArguments, deleteCookiesTool);

// Mobile Gesture Tools
server.tool('tap_element', 'taps an element by selector or coordinates (mobile)', tapElementToolArguments, tapElementTool);
server.tool('swipe', 'performs a swipe gesture in specified direction (mobile)', swipeToolArguments, swipeTool);
server.tool('long_press', 'performs a long press on element or coordinates (mobile)', longPressToolArguments, longPressTool);
server.tool('drag_and_drop', 'drags from one location to another (mobile)', dragAndDropToolArguments, dragAndDropTool);

// App Lifecycle Management
server.tool('get_app_state', 'gets the state of an app (not installed, not running, background, foreground)', getAppStateToolArguments, getAppStateTool);
server.tool('activate_app', 'activates/brings an app to foreground', activateAppToolArguments, activateAppTool);
server.tool('terminate_app', 'terminates a running app', terminateAppToolArguments, terminateAppTool);

// Context Switching (Native/WebView)
server.tool('get_contexts', 'lists available contexts (NATIVE_APP, WEBVIEW)', {}, getContextsTool);
server.tool('get_current_context', 'shows the currently active context', {}, getCurrentContextTool);
server.tool('switch_context', 'switches between native and webview contexts', switchContextToolArguments, switchContextTool);

// Device Interaction
server.tool('get_device_info', 'gets device information (platform, version, screen size)', {}, getDeviceInfoTool);
server.tool('rotate_device', 'rotates device to portrait or landscape orientation', rotateDeviceToolArguments, rotateDeviceTool);
server.tool('get_orientation', 'gets current device orientation', {}, getOrientationTool);
server.tool('lock_device', 'locks the device screen', {}, lockDeviceTool);
server.tool('unlock_device', 'unlocks the device screen', {}, unlockDeviceTool);
server.tool('is_device_locked', 'checks if device is locked', {}, isDeviceLockedTool);
server.tool('shake_device', 'shakes the device (iOS only)', {}, shakeDeviceTool);
server.tool('send_keys', 'sends keys to the app (Android only)', sendKeysToolArguments, sendKeysTool);
server.tool('press_key_code', 'presses an Android key code (Android only)', pressKeyCodeToolArguments, pressKeyCodeTool);
server.tool('hide_keyboard', 'hides the on-screen keyboard', {}, hideKeyboardTool);
server.tool('is_keyboard_shown', 'checks if keyboard is visible', {}, isKeyboardShownTool);
server.tool('open_notifications', 'opens the notifications panel (Android only)', {}, openNotificationsTool);
server.tool('get_geolocation', 'gets current device geolocation', {}, getGeolocationTool);
server.tool('set_geolocation', 'sets device geolocation (latitude, longitude, altitude)', setGeolocationToolArguments, setGeolocationTool);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('WebdriverIO MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
