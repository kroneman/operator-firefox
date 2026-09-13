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

## Release

Releases are automated. Publishing a GitHub Release triggers
[`.github/workflows/release.yml`](.github/workflows/release.yml), which reads the
release tag as the version, injects it into `manifest.json` and `package.json`
(via `scripts/set-version.mjs`), builds, lints, signs the extension on
[AMO](https://addons.mozilla.org) (`--channel unlisted`), and attaches the
signed `.xpi` back to the release's assets.

Tags are semver (`0.2.0` — a leading `v` is accepted and stripped). Publishing a
_draft_ does not fire the workflow; only a published (non-draft) release does, so
draft-then-review-then-publish works.

**One-time setup** — add two repository secrets
(Settings → Secrets and variables → Actions) from an
[AMO API key](https://addons.mozilla.org/developers/addon/api/key/):

- `AMO_JWT_ISSUER` — the JWT issuer (e.g. `user:12345:67`)
- `AMO_JWT_SECRET` — the JWT secret

To sign locally instead: `WEB_EXT_API_KEY=… WEB_EXT_API_SECRET=… yarn sign`.

## Commands

Open the popup and type to fuzzy-find any command, or trigger the ones with a
shortcut directly. Shortcuts are declared with `Ctrl`, which Firefox maps to
`Cmd` on macOS.

| Command | Default shortcut | What it does |
| --- | --- | --- |
| Open Operator | `Ctrl+Shift+Space` | Open the command popup |
| Search tabs | `Ctrl+Shift+E` | Open the popup in tab-search mode — filter tabs across all windows (most-recently-used first, current tab excluded) and jump to one |
| Pin / unpin current tab | `Ctrl+Shift+X` | Toggle the active tab's pinned state |
| Move tab(s) left | `Ctrl+Shift+Left` | Shift the selected tab(s) one position left |
| Move tab(s) right | `Ctrl+Shift+Right` | Shift the selected tab(s) one position right |
| Move tab(s) to the front | — | Move the selected tab(s) to the start |
| Move tab(s) to the end | — | Move the selected tab(s) to the end |
| Move tab(s) to a new window | — | Pull the selected tab(s) into a fresh window |
| Pin all tabs | — | Pin every tab in the window |
| Unpin all tabs | — | Unpin every tab in the window |
| Close all unpinned tabs | — | Close unpinned tabs, keeping the active one |
| Close tabs to the right | — | Close unpinned tabs after the active one |
| Close other tabs on this domain | — | Close other unpinned tabs sharing the active tab's hostname |
| Consolidate all windows into this one | — | Gather tabs from every other window here, preserving pinned state |
| Copy shortcuts page URL | — | Copy `about:keyboard` to the clipboard (popup only) |

"Selected tab(s)" means the highlighted tabs when you've multi-selected,
otherwise just the active tab. Commands without a default shortcut still run from
the popup, and any command's shortcut can be (re)assigned in
`about:addons` → Manage Extension Shortcuts.

> Firefox blocks extensions from opening privileged `about:` pages via
> `tabs.create`, so "Copy shortcuts page URL" copies `about:keyboard` (Firefox
> 147+'s native shortcut editor) instead of navigating there — paste it in the
> address bar.

### Heads up: unbind Firefox's "switch text direction"

Firefox binds `Ctrl+Shift+X` (`Cmd+Shift+X` on macOS) to **switch text
direction**, which collides with Operator's pin/unpin shortcut — so pin/unpin
may not fire. Open **`about:keyboard`** (Firefox 147+) and unbind "switch text
direction" to free the shortcut for Operator. Note the two live in different
places: Firefox's own shortcuts are edited in `about:keyboard`, Operator's in
`about:addons` → Manage Extension Shortcuts.
