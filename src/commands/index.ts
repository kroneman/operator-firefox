// Single source of truth for every command Operator can run.
//
// Each command has a stable `id` (matched against manifest `commands` names so
// keyboard shortcuts line up), a human `title` shown in the popup, and a `run`
// that does the work with the native `browser.*` promise API.
//
// Commands always execute in the background page — never in the popup — so an
// in-flight async command isn't killed when the popup closes on blur.

type Tab = browser.tabs.Tab;

async function activeTab(): Promise<Tab> {
  const [tab] = await browser.tabs.query({ currentWindow: true, active: true });
  return tab;
}

// The tabs the user means to act on: highlighted (multi-selected) tabs if any,
// otherwise just the active tab.
async function targetTabs(): Promise<Tab[]> {
  const highlighted = await browser.tabs.query({
    currentWindow: true,
    highlighted: true,
  });
  return highlighted.length > 0 ? highlighted : [await activeTab()];
}

async function windowTabs(): Promise<Tab[]> {
  return browser.tabs.query({ currentWindow: true });
}

function tabIds(tabs: Tab[]): number[] {
  return tabs.map((t) => t.id).filter((id): id is number => id !== undefined);
}

export interface Command {
  id: string;
  title: string;
  run: () => Promise<void>;
}

export const commands: Command[] = [
  {
    id: "pin_unpin_tab",
    title: "Pin / unpin the current tab",
    async run() {
      const tab = await activeTab();
      if (tab?.id !== undefined) {
        await browser.tabs.update(tab.id, { pinned: !tab.pinned });
      }
    },
  },
  {
    id: "pin_all_tabs",
    title: "Pin all tabs in this window",
    async run() {
      for (const tab of await windowTabs()) {
        if (tab.id !== undefined && !tab.pinned) {
          await browser.tabs.update(tab.id, { pinned: true });
        }
      }
    },
  },
  {
    id: "unpin_all_tabs",
    title: "Unpin all tabs in this window",
    async run() {
      for (const tab of await windowTabs()) {
        if (tab.id !== undefined && tab.pinned) {
          await browser.tabs.update(tab.id, { pinned: false });
        }
      }
    },
  },
  {
    id: "close_all_unpinned_tabs",
    title: "Close all unpinned tabs",
    async run() {
      const tabs = await windowTabs();
      // Keep the active tab so the window doesn't jump somewhere surprising.
      const toClose = tabs.filter((t) => !t.pinned && !t.active);
      if (toClose.length) await browser.tabs.remove(tabIds(toClose));
    },
  },
  {
    id: "close_tabs_to_the_right",
    title: "Close tabs to the right",
    async run() {
      const current = await activeTab();
      const tabs = await windowTabs();
      const toClose = tabs.filter((t) => !t.pinned && t.index > current.index);
      if (toClose.length) await browser.tabs.remove(tabIds(toClose));
    },
  },
  {
    id: "move_tab_to_new_window",
    title: "Move selected tab(s) to a new window",
    async run() {
      const [first, ...rest] = await targetTabs();
      if (first?.id === undefined) return;
      const win = await browser.windows.create({ tabId: first.id });
      if (rest.length && win.id !== undefined) {
        await browser.tabs.move(tabIds(rest), { windowId: win.id, index: -1 });
      }
    },
  },
  {
    id: "consolidate_tabs",
    title: "Consolidate all windows into this one",
    async run() {
      const current = await browser.windows.getCurrent();
      const all = await browser.windows.getAll({
        populate: true,
        windowTypes: ["normal"],
      });
      for (const win of all) {
        if (win.id === current.id || !win.tabs) continue;
        const ids = tabIds(win.tabs);
        if (ids.length && current.id !== undefined) {
          await browser.tabs.move(ids, { windowId: current.id, index: -1 });
        }
      }
    },
  },
  {
    id: "move_tab_left",
    title: "Move selected tab(s) left",
    async run() {
      // Ascending so earlier tabs settle before later ones move.
      const tabs = (await targetTabs()).sort((a, b) => a.index - b.index);
      for (const tab of tabs) {
        if (tab.id !== undefined) {
          await browser.tabs.move(tab.id, { index: Math.max(0, tab.index - 1) });
        }
      }
    },
  },
  {
    id: "move_tab_right",
    title: "Move selected tab(s) right",
    async run() {
      // Descending so later tabs settle before earlier ones move.
      const tabs = (await targetTabs()).sort((a, b) => b.index - a.index);
      for (const tab of tabs) {
        if (tab.id !== undefined) {
          await browser.tabs.move(tab.id, { index: tab.index + 1 });
        }
      }
    },
  },
  {
    id: "move_tab_to_front",
    title: "Move selected tab(s) to the front",
    async run() {
      await browser.tabs.move(tabIds(await targetTabs()), { index: 0 });
    },
  },
  {
    id: "move_tab_to_end",
    title: "Move selected tab(s) to the end",
    async run() {
      await browser.tabs.move(tabIds(await targetTabs()), { index: -1 });
    },
  },
];

export const commandsById: Record<string, Command> = Object.fromEntries(
  commands.map((c) => [c.id, c]),
);
