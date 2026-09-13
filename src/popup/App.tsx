import { createMemo, createSignal, onMount, For, Show } from "solid-js";
import { commands } from "src/commands";

type Mode = "commands" | "tabs";

interface UiCommand {
  id: string;
  title: string;
  // Background commands (no `local`) run in the event page. Local commands run
  // here in the popup — e.g. clipboard access, which needs a focused document
  // and a user gesture. A local command returns a message to show inline.
  local?: () => Promise<string>;
  // Switches the popup into tab-search mode instead of running anything.
  enterTabSearch?: boolean;
}

// A tab flattened to just what the search list needs.
interface TabItem {
  id: number;
  windowId?: number;
  title: string;
  url: string;
  host: string;
  favIconUrl?: string;
}

// Firefox blocks extensions from opening privileged about: pages (about:addons)
// via tabs.create, so we can't navigate to the shortcuts page directly. Next
// best: copy the URL and tell the user exactly where to go.
const localCommands: UiCommand[] = [
  {
    id: "open_keyboard_shortcuts",
    title: "Copy Firefox shortcuts page (about:keyboard)",
    async local() {
      try {
        await navigator.clipboard.writeText("about:keyboard");
        return 'Copied "about:keyboard" — paste it in the address bar to customize keyboard shortcuts (Firefox 147+).';
      } catch {
        return 'Go to "about:keyboard" in the address bar to customize keyboard shortcuts (Firefox 147+).';
      }
    },
  },
];

// "Search tabs…" leads the list so opening the popup and pressing Enter drops
// straight into tab search — the highest-frequency action for a tab manager.
const allCommands: UiCommand[] = [
  { id: "search_tabs", title: "Search tabs…", enterTabSearch: true },
  ...commands.map((c) => ({ id: c.id, title: c.title })),
  ...localCommands,
];

// Pull the user's assigned keyboard shortcut for each command (if any) so we
// can show it beside the command in the list.
async function loadShortcuts(): Promise<Record<string, string>> {
  const all = await browser.commands.getAll();
  const map: Record<string, string> = {};
  for (const c of all) {
    if (c.name && c.shortcut) map[c.name] = c.shortcut;
  }
  return map;
}

// Host for the subtitle; falls back to the raw URL for about:/moz-extension:
// and anything the URL parser can't handle.
function hostOf(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

// Every whitespace-separated token must appear somewhere in title or URL.
function tabMatches(tab: TabItem, tokens: string[]): boolean {
  const hay = `${tab.title} ${tab.url}`.toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

export default function App() {
  const [query, setQuery] = createSignal("");
  const [selected, setSelected] = createSignal(0);
  const [shortcuts, setShortcuts] = createSignal<Record<string, string>>({});
  const [notice, setNotice] = createSignal("");
  const [mode, setMode] = createSignal<Mode>("commands");
  const [tabs, setTabs] = createSignal<TabItem[]>([]);
  let inputRef: HTMLInputElement | undefined;

  onMount(async () => {
    // Firefox popups don't reliably honour autofocus; focus on the next frame.
    requestAnimationFrame(() => inputRef?.focus());
    // If the search_tabs shortcut opened us, jump straight into tab search.
    const launch = await browser.runtime
      .sendMessage({ type: "take-launch-mode" })
      .catch(() => null);
    if (launch?.tabSearch) await enterTabSearch();
    setShortcuts(await loadShortcuts());
  });

  const filteredCommands = createMemo<UiCommand[]>(() => {
    const q = query().trim().toLowerCase();
    if (!q) return allCommands;
    return allCommands.filter((c) => c.title.toLowerCase().includes(q));
  });

  const filteredTabs = createMemo<TabItem[]>(() => {
    const tokens = query().trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return tabs();
    return tabs().filter((t) => tabMatches(t, tokens));
  });

  const resultCount = () =>
    mode() === "tabs" ? filteredTabs().length : filteredCommands().length;

  function clampSelection(next: number, len: number) {
    if (len === 0) return 0;
    return (next + len) % len;
  }

  async function enterTabSearch() {
    // Exclude the current tab and sort most-recently-used first, so the top row
    // is the tab you were last on — open + Enter becomes a quick toggle between
    // your two most recent tabs.
    const [current] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const found = await browser.tabs.query({});
    const items = found
      .filter(
        (t): t is browser.tabs.Tab & { id: number } =>
          t.id !== undefined && t.id !== current?.id,
      )
      .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))
      .map<TabItem>((t) => ({
        id: t.id,
        windowId: t.windowId,
        title: t.title || t.url || "Untitled",
        url: t.url ?? "",
        host: hostOf(t.url ?? ""),
        favIconUrl: t.favIconUrl,
      }));
    setTabs(items);
    setMode("tabs");
    setQuery("");
    setSelected(0);
    setNotice("");
    requestAnimationFrame(() => inputRef?.focus());
  }

  function exitTabSearch() {
    setMode("commands");
    setQuery("");
    setSelected(0);
  }

  async function execute(command: UiCommand | undefined) {
    if (!command) return;
    if (command.enterTabSearch) {
      await enterTabSearch();
      return;
    }
    if (command.local) {
      // Runs in the popup; keep it open so the hint is readable.
      setNotice(await command.local());
      return;
    }
    await browser.runtime.sendMessage({ type: "run-command", id: command.id });
    window.close();
  }

  async function focusTab(tab: TabItem | undefined) {
    if (!tab) return;
    await browser.runtime.sendMessage({
      type: "focus-tab",
      tabId: tab.id,
      windowId: tab.windowId,
    });
    window.close();
  }

  function activateSelected() {
    if (mode() === "tabs") void focusTab(filteredTabs()[selected()]);
    else void execute(filteredCommands()[selected()]);
  }

  function onKeyDown(e: KeyboardEvent) {
    const len = resultCount();
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelected((s) => clampSelection(s + 1, len));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelected((s) => clampSelection(s - 1, len));
        break;
      case "Enter":
        e.preventDefault();
        activateSelected();
        break;
      case "Backspace":
        // Guaranteed way back to the command list from an empty tab search,
        // regardless of how Firefox treats a prevented Escape.
        if (mode() === "tabs" && query() === "") {
          e.preventDefault();
          exitTabSearch();
        }
        break;
      case "Escape":
        e.preventDefault();
        if (mode() === "tabs") exitTabSearch();
        else window.close();
        break;
    }
  }

  function onInput(e: InputEvent & { currentTarget: HTMLInputElement }) {
    setQuery(e.currentTarget.value);
    setSelected(0);
    setNotice("");
  }

  return (
    <div class="operator">
      <input
        ref={inputRef}
        class="search"
        type="text"
        placeholder={mode() === "tabs" ? "Search tabs…" : "Type a command…"}
        autocomplete="off"
        spellcheck={false}
        value={query()}
        onInput={onInput}
        onKeyDown={onKeyDown}
      />
      <Show when={notice()}>
        <div class="notice">{notice()}</div>
      </Show>
      <Show
        when={mode() === "tabs"}
        fallback={
          <ul class="list">
            <For
              each={filteredCommands()}
              fallback={<li class="empty">No matching commands</li>}
            >
              {(command, i) => (
                <li
                  classList={{ item: true, selected: i() === selected() }}
                  onMouseEnter={() => setSelected(i())}
                  onClick={() => void execute(command)}
                >
                  <span class="title">{command.title}</span>
                  {shortcuts()[command.id] && (
                    <kbd class="shortcut">{shortcuts()[command.id]}</kbd>
                  )}
                </li>
              )}
            </For>
          </ul>
        }
      >
        <ul class="list">
          <For
            each={filteredTabs()}
            fallback={<li class="empty">No matching tabs</li>}
          >
            {(tab, i) => (
              <li
                classList={{ item: true, "tab-item": true, selected: i() === selected() }}
                onMouseEnter={() => setSelected(i())}
                onClick={() => void focusTab(tab)}
              >
                <Show when={tab.favIconUrl}>
                  <img
                    class="favicon"
                    src={tab.favIconUrl}
                    alt=""
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </Show>
                <div class="tab-text">
                  <span class="title">{tab.title}</span>
                  <span class="url">{tab.host}</span>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
