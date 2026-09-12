import { createMemo, createSignal, onMount, For, Show } from "solid-js";
import { commands } from "src/commands";

interface UiCommand {
  id: string;
  title: string;
  // Background commands (no `local`) run in the event page. Local commands run
  // here in the popup — e.g. clipboard access, which needs a focused document
  // and a user gesture. A local command returns a message to show inline.
  local?: () => Promise<string>;
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

const allCommands: UiCommand[] = [
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

export default function App() {
  const [query, setQuery] = createSignal("");
  const [selected, setSelected] = createSignal(0);
  const [shortcuts, setShortcuts] = createSignal<Record<string, string>>({});
  const [notice, setNotice] = createSignal("");
  let inputRef: HTMLInputElement | undefined;

  onMount(async () => {
    // Firefox popups don't reliably honour autofocus; focus on the next frame.
    requestAnimationFrame(() => inputRef?.focus());
    setShortcuts(await loadShortcuts());
  });

  const filtered = createMemo<UiCommand[]>(() => {
    const q = query().trim().toLowerCase();
    if (!q) return allCommands;
    return allCommands.filter((c) => c.title.toLowerCase().includes(q));
  });

  function clampSelection(next: number, len: number) {
    if (len === 0) return 0;
    return (next + len) % len;
  }

  async function execute(command: UiCommand | undefined) {
    if (!command) return;
    if (command.local) {
      // Runs in the popup; keep it open so the hint is readable.
      setNotice(await command.local());
      return;
    }
    await browser.runtime.sendMessage({ type: "run-command", id: command.id });
    window.close();
  }

  function onKeyDown(e: KeyboardEvent) {
    const list = filtered();
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelected((s) => clampSelection(s + 1, list.length));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelected((s) => clampSelection(s - 1, list.length));
        break;
      case "Enter":
        e.preventDefault();
        void execute(list[selected()]);
        break;
      case "Escape":
        e.preventDefault();
        window.close();
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
        placeholder="Type a command…"
        autocomplete="off"
        spellcheck={false}
        onInput={onInput}
        onKeyDown={onKeyDown}
      />
      <Show when={notice()}>
        <div class="notice">{notice()}</div>
      </Show>
      <ul class="list">
        <For each={filtered()} fallback={<li class="empty">No matching commands</li>}>
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
    </div>
  );
}
