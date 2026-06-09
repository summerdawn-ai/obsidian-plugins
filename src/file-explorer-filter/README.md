# File Explorer Filter

Adds a filter button to Obsidian's file explorer without patching the explorer's
sorting implementation.

## Features

- Switch between all files and any top-level vault folder.
- Optionally hide files and folders whose names end in `[DONE]`.
- Combine folder scope and `[DONE]` filtering.
- Remember the selected filter across Obsidian restarts.
- Keep hidden items available through search, links, backlinks, and the quick
  switcher.
- Coexist with plugins that patch explorer sorting, including Custom Sort.

## Usage

1. Select the filter icon in the file explorer toolbar.
2. Choose **All folders** or a top-level folder such as **Career**.
3. Toggle **Hide names ending in [DONE]** independently.

The active filter icon uses the vault's accent color.

Two command-palette commands are also available:

- **File Explorer Filter: Show file explorer filter menu**
- **File Explorer Filter: Toggle files and folders ending in [DONE]**

## Installation

Copy these files into `.obsidian/plugins/file-explorer-filter/`:

```text
dist/main.js
manifest.json
styles.css
```

Then enable **File Explorer Filter** under **Settings > Community plugins**.

## Development

```bash
npm install
npm run dev
npm run build
```

## Implementation

The plugin observes the rendered file explorer and applies a CSS class to
filtered tree rows. It does not patch `getSortedFolderItems()` or alter vault
files, so the filtering remains independent from explorer sorting plugins.

## License

MIT
