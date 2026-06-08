# Custom Sort

Drag-and-drop reordering for the Obsidian file explorer. Files and folders are freely interspersed — designed for OneNote-style folder notes where a folder is just a file with children.

> **Status:** Alpha (0.11.0). Core reordering works but the modifier key interaction needs refinement. See [Known Issues](#known-issues).

## Features

- **Works everywhere, instantly** — No rules to configure. Enable the plugin and every folder supports custom ordering immediately.
- **Interspersed files & folders** — A folder's file note lives right alongside its child items, like in OneNote. No artificial file/folder separation.
- **Shift+drag to reorder** — Hold Shift while dragging to enter reorder mode. Normal drags pass through to Obsidian's built-in move-into-folder behavior.
- **Only changed folders are saved** — Folders you never reorder keep zero state in `data.json`. Only reordered folders get an entry.
- **New items land at the end** — Items not yet in the saved order appear at the bottom: folders first (alphabetical), then files (alphabetical).

## How to use

1. **Hold Shift**, then drag any file or folder in the file explorer.
2. A blue drop indicator shows where the item will land.
3. Release to commit the new order.
4. Drag **without Shift** for Obsidian's normal move-into-folder behavior.

## Installation

### Manual (for alpha testing)

```bash
# Clone or copy the plugin into your vault
cp dist/main.js manifest.json styles.css \
   .obsidian/plugins/custom-sort/
```

Then enable **Custom Sort** in Settings → Community plugins.

**If you also use the `Folder Sort Rules` plugin, disable it first** — both plugins patch the same explorer method and will conflict.

After deploying a new plugin build to your vault (`main.js`, `manifest.json`, `styles.css`), reload the plugin or restart Obsidian so the new code is actually loaded.

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # production build
```

## Data format

The plugin stores one simple object in `.obsidian/plugins/custom-sort/data.json`:

```json
{
  "orders": {
    "Personal": ["Home", "Career", "Health", "Travel", "Finances"],
    "Personal/Home": ["Furniture.md", "Plants.md", "Kitties.md", "Assets"]
  }
}
```

Only folders you've actually reordered appear in this file. The order array contains item *names* (not full paths), and files and folders are freely mixed together.

## How it works

- Patches `getSortedFolderItems()` on the internal file explorer view.
- Sets `draggable` on every visible tree item.
- When Shift+drag drops: computes the new position relative to visible items, saves to `data.json`, triggers a re-render.
- Visible-item-awareness: items hidden by CSS snippets (e.g. `Assets` folders) or unsupported file types (e.g. `.json`) are tracked internally but excluded from positional calculations so the drop position matches what you see.

## Known Issues

- **Auto-expand on hover still fires** — When Shift+dragging over a collapsed folder, Obsidian may still expand it. `stopPropagation()` is in place but Obsidian's internal drag handling appears to intercept at a different phase. This makes reordering near folders awkward.
- **Ghost image may not display** — In some Obsidian versions the drag ghost image is not visible during Shift+drag.
- **Alpha quality** — This plugin monkey-patches an internal Obsidian API (`getSortedFolderItems`). Behavior may change across Obsidian updates.
- **Only the first file explorer leaf is patched** — Multi-window setups with more than one file explorer are not fully supported.

## Credits

Built from scratch but inspired by the architecture of [obsidian-folder-sort-rules](https://github.com/wepe/obsidian-folder-sort-rules). The monkey-patching approach for `getSortedFolderItems` and the per-item drag handler pattern are adapted from that codebase.

## License

MIT — see [../../LICENSE.md](../../LICENSE.md).