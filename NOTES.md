# Design Notes

Repository-level running notes for Obsidian plugin projects.

## Custom Sort

### Architecture

- Single monkey-patch on `getSortedFolderItems`; no rules UI.
- Data model is `Record<folderPath, name[]>` with files/folders interspersed.
- Hidden DOM items are filtered during positional calculations, then merged back.

### Current Behavior

- Reordering currently targets same-parent moves.
- Shift-assisted mode is implemented, but modifier UX is still evolving.
- Auto-expand suppression remains incomplete in some drag paths.

### What Went Wrong / Lessons

- Using full `folder.children` for index math caused visible order mismatches when some items were hidden by CSS or unsupported file type rendering.
- Trying to rely on Shift-at-dragstart conflicted with explorer selection behaviors.
- Direct DOM reordering was unstable; data-first reorder + re-render is more reliable.

### Open Work

- Always-on OneNote-style drag model (plugin-owned move + order) still under investigation.
- Rename/move synchronization should remap order arrays to avoid renamed items dropping to list tail.
- Cross-level insert-between behavior needs careful destination index resolution.
