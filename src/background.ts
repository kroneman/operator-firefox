// Background event page: the one place commands actually execute.
//
// Two ways in, one exit:
//   1. Keyboard shortcuts declared in the manifest -> commands.onCommand
//   2. The popup -> runtime.sendMessage({ type: "run-command", id })
// Both resolve to the same command function, so behaviour can't drift.

import { commandsById } from "src/commands";

interface RunCommandMessage {
  type: "run-command";
  id: string;
}

interface FocusTabMessage {
  type: "focus-tab";
  tabId: number;
  windowId?: number;
}

function isRunCommandMessage(msg: unknown): msg is RunCommandMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as RunCommandMessage).type === "run-command" &&
    typeof (msg as RunCommandMessage).id === "string"
  );
}

function isFocusTabMessage(msg: unknown): msg is FocusTabMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as FocusTabMessage).type === "focus-tab" &&
    typeof (msg as FocusTabMessage).tabId === "number"
  );
}

// Activate a tab (from popup tab-search) and raise its window. Runs here so it
// completes even though the popup closes the instant it sends the message.
async function focusTab(tabId: number, windowId?: number): Promise<void> {
  try {
    if (windowId !== undefined) {
      await browser.windows.update(windowId, { focused: true });
    }
    await browser.tabs.update(tabId, { active: true });
  } catch (err) {
    console.error(`[operator] focus-tab ${tabId} failed:`, err);
  }
}

async function run(id: string): Promise<void> {
  const command = commandsById[id];
  if (!command) {
    console.warn(`[operator] unknown command: ${id}`);
    return;
  }
  try {
    await command.run();
  } catch (err) {
    console.error(`[operator] command "${id}" failed:`, err);
  }
}

// Set when the search_tabs shortcut fires so the popup, once it opens, knows to
// start in tab-search mode. The popup consumes and clears it on mount. A plain
// module variable is enough: the event page stays alive across the openPopup ->
// popup-mount handshake that immediately follows.
let pendingTabSearch = false;

// Keyboard shortcuts.
browser.commands.onCommand.addListener((command) => {
  if (command === "search_tabs") {
    // A command press is a user gesture, so action.openPopup() is allowed here.
    pendingTabSearch = true;
    browser.action.openPopup().catch((err) => {
      pendingTabSearch = false;
      console.error("[operator] openPopup failed:", err);
    });
    return;
  }
  void run(command);
});

// Popup requests. Returning the promise lets the popup await completion.
browser.runtime.onMessage.addListener((message) => {
  if (isRunCommandMessage(message)) {
    return run(message.id);
  }
  if (isFocusTabMessage(message)) {
    return focusTab(message.tabId, message.windowId);
  }
  if (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "take-launch-mode"
  ) {
    const tabSearch = pendingTabSearch;
    pendingTabSearch = false;
    return Promise.resolve({ tabSearch });
  }
  return undefined;
});
