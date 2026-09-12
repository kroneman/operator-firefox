# Operator (Firefox)

Keyboard-driven tab management for Firefox — a command runner in a popup, plus
bindable keyboard shortcuts. A Firefox-native rebuild of
[operator-extension](https://github.com/rs-lkroneman/operator-extension).

## Stack

- **Manifest V3**, Firefox-only (native `browser.*` promise APIs, no polyfill).
- **Solid + Vite** for a fast-booting popup (the popup remounts every open, so
  low startup cost matters more than render throughput).
- **vite-plugin-web-extension** bundles the background as a self-contained event
  page — Firefox does not support `background.service_worker`.

## Architecture

Commands only ever execute in the **background** event page, reached two ways:

- **Keyboard shortcuts** declared in `manifest.json` → `commands.onCommand`.
- **The popup** → `runtime.sendMessage({ type: "run-command", id })`.

Both resolve to the same function in `src/commands/index.ts`, so a command
behaves identically however it's triggered — and an async command isn't killed
when the popup closes on blur.

```
manifest.json          # MV3 manifest + command shortcut declarations
src/
  background.ts        # onCommand + onMessage -> run(id)
  commands/index.ts    # single source of truth: id, title, run()
  popup/
    index.html
    index.tsx          # Solid entry
    App.tsx            # search + arrow-key list, sends run-command
    styles.css
```

## Develop

```bash
yarn install
yarn build          # emits dist/ (or `yarn watch` to rebuild on change)
yarn start          # launches Firefox with the extension loaded (web-ext)
```

`yarn start` targets **Firefox Developer Edition** (`--firefox=deved`). For the
standard release, run `yarn build && web-ext run -s dist` (default `firefox`),
or pass a path: `web-ext run -s dist --firefox=/path/to/firefox`.

Or load it manually: `about:debugging` → This Firefox → Load Temporary Add-on →
pick `dist/manifest.json`.

## Commands (v0.1)

Pin/unpin current tab · pin/unpin all · close unpinned · close tabs to the right
· move tab(s) left/right/front/end · move tab(s) to a new window · consolidate
all windows into this one · copy the Firefox shortcuts page URL.

> Note: Firefox blocks extensions from opening privileged `about:` pages
> (`about:keyboard`, `about:addons`, …) via `tabs.create`, so the shortcuts
> command copies `about:keyboard` (Firefox 147+'s native shortcut editor) to
> the clipboard instead of navigating there — paste it in the address bar.
> Operator's own extension shortcut is managed in `about:addons` → Manage
> Extension Shortcuts.

Default shortcuts: **Ctrl+Shift+Space** opens the popup. Assign or change any
command's shortcut in `about:addons` → Manage Extension Shortcuts.
