import { createMemo, createSignal, onMount, For } from "solid-js";
import { commands, type Command } from "src/commands";

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
  let inputRef: HTMLInputElement | undefined;

  onMount(async () => {
    // Firefox popups don't reliably honour autofocus; focus on the next frame.
    requestAnimationFrame(() => inputRef?.focus());
    setShortcuts(await loadShortcuts());
  });

  const filtered = createMemo<Command[]>(() => {
    const q = query().trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.title.toLowerCase().includes(q));
  });

  function clampSelection(next: number, len: number) {
    if (len === 0) return 0;
    return (next + len) % len;
  }

  async function execute(command: Command | undefined) {
    if (!command) return;
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
