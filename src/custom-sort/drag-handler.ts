import { TAbstractFile } from 'obsidian';
import type CustomSortPlugin from './main';

interface DragState {
	draggedEl: HTMLElement | null;
	draggedFile: TAbstractFile | null;
	placeholder: HTMLElement | null;
}

/** Modifier key that enables custom reorder (vs Obsidian's native move). */
const REORDER_MODIFIER: string = 'shift';

/**
 * Handles drag-and-drop reordering in the file explorer.
 *
 * Normal drag (no modifier): Obsidian's built-in move-into-folder behavior.
 * Shift+drag: Custom reorder within the same folder (no auto-expand, no move).
 */
export class DragHandler {
	private plugin: CustomSortPlugin;
	private state: DragState = {
		draggedEl: null,
		draggedFile: null,
		placeholder: null,
	};
	private cleanupFns: (() => void)[] = [];
	/** Map of parentPath → set of visible child names (from DOM). */
	private visibleByParent: Map<string, Set<string>> = new Map();

	constructor(plugin: CustomSortPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Set up drag-and-drop on all items in the file explorer.
	 */
	setup(explorerView: any): void {
		this.cleanup();

		const fileItems: Record<string, any> = explorerView.fileItems;
		if (!fileItems) return;

		// Build visible-items map: which items actually have DOM elements.
		// Hidden files (e.g. .json) and CSS-hidden folders (e.g. Assets)
		// are excluded so position calculations match what the user sees.
		this.visibleByParent.clear();
		for (const item of Object.values(fileItems)) {
			if (!item || !item.file || !item.selfEl) continue;
			if (item.file.isRoot?.()) continue;

			const parentPath: string = item.file.parent?.path ?? '';
			if (!this.visibleByParent.has(parentPath)) {
				this.visibleByParent.set(parentPath, new Set());
			}
			this.visibleByParent.get(parentPath)!.add(item.file.name);
		}

		const childrenByParent = new Map<string, { item: any; el: HTMLElement }[]>();

		for (const item of Object.values(fileItems)) {
			if (!item || !item.file || !item.selfEl) continue;
			if (item.file.isRoot?.()) continue;

			const parentPath: string = item.file.parent?.path ?? '';

			if (!childrenByParent.has(parentPath)) {
				childrenByParent.set(parentPath, []);
			}
			childrenByParent.get(parentPath)!.push({
				item,
				el: item.selfEl as HTMLElement,
			});
		}

		for (const [, children] of childrenByParent) {
			for (const { item, el } of children) {
				this.setupItemDrag(el, item);
			}
		}
	}

	private setupItemDrag(el: HTMLElement, item: any): void {
		el.addClass('custom-sort-draggable');

		const file: TAbstractFile = item.file;
		const parentPath: string = file.parent?.path ?? '';

		const onDragStart = (e: DragEvent) => {
			// Always capture the drag state — we decide behavior in dragover/drop
			// based on whether Shift is *currently* held, not just at dragstart.
			this.state.draggedEl = el;
			this.state.draggedFile = file;
			el.addClass('custom-sort-dragging');
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('text/plain', file.path);
			}
		};

		const onDragEnd = () => {
			el.removeClass('custom-sort-dragging');
			this.removePlaceholder();
			this.state.draggedEl = null;
			this.state.draggedFile = null;
		};

		const onDragOver = (e: DragEvent) => {
			if (!this.state.draggedFile) return;
			if (this.state.draggedFile === file) return;

			// Only reorder within same parent folder
			const draggedParent = this.state.draggedFile.parent?.path ?? '';
			if (draggedParent !== parentPath) return;

			// If Shift is NOT held, let Obsidian handle natively
			if (!this.isReorderKey(e)) return;

			// Shift IS held — kill native expand/move behavior
			e.preventDefault();
			e.stopPropagation();

			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}

			const rect = el.getBoundingClientRect();
			const midY = rect.top + rect.height / 2;

			this.removePlaceholder();
			this.state.placeholder = createDiv({
				cls: 'custom-sort-drop-indicator',
			});

			if (e.clientY < midY) {
				el.parentElement?.insertBefore(this.state.placeholder, el);
			} else {
				el.parentElement?.insertBefore(this.state.placeholder, el.nextSibling);
			}
		};

		const onDrop = async (e: DragEvent) => {
			if (!this.state.draggedFile) return;
			if (this.state.draggedFile === file) return;

			const draggedParent = this.state.draggedFile.parent?.path ?? '';
			if (draggedParent !== parentPath) return;

			// If Shift is NOT held, let Obsidian handle the drop natively
			if (!this.isReorderKey(e)) return;

			e.preventDefault();
			e.stopPropagation();
			this.removePlaceholder();

			const draggedName = this.state.draggedFile.name;

			// Build order from VISIBLE items only, so positions match what user sees
			let order = this.plugin.settings.orders[parentPath];
			if (!order || order.length === 0) {
				order = this.buildInitialOrder(parentPath);
			}
			// Filter to only visible items
			order = this.filterVisible(parentPath, order);

			// Remove dragged item
			const withoutDragged = order.filter((n) => n !== draggedName);

			const rect = el.getBoundingClientRect();
			const midY = rect.top + rect.height / 2;
			const targetIdx = withoutDragged.indexOf(file.name);

			if (targetIdx === -1) {
				withoutDragged.push(draggedName);
			} else if (e.clientY < midY) {
				withoutDragged.splice(targetIdx, 0, draggedName);
			} else {
				withoutDragged.splice(targetIdx + 1, 0, draggedName);
			}

			// Merge back hidden items at their original positions
			this.plugin.settings.orders[parentPath] =
				this.mergeHiddenBack(parentPath, withoutDragged);
			await this.plugin.saveSettings();
			this.cleanupStaleOrders();
		};

		el.addEventListener('dragstart', onDragStart);
		el.addEventListener('dragend', onDragEnd);
		el.addEventListener('dragover', onDragOver);
		el.addEventListener('drop', onDrop);

		this.cleanupFns.push(() => {
			el.removeEventListener('dragstart', onDragStart);
			el.removeEventListener('dragend', onDragEnd);
			el.removeEventListener('dragover', onDragOver);
			el.removeEventListener('drop', onDrop);
			el.removeClass('custom-sort-draggable');
		});
	}

	// ── helpers ──────────────────────────────────────────────

	private isReorderKey(e: DragEvent | MouseEvent): boolean {
		switch (REORDER_MODIFIER) {
			case 'shift': return e.shiftKey;
			case 'ctrl': return e.ctrlKey;
			case 'alt': return e.altKey;
			default: return e.shiftKey;
		}
	}

	/** Build initial order from folder children, filtered to visible items only. */
	private buildInitialOrder(parentPath: string): string[] {
		const folder = this.plugin.app.vault.getFolderByPath(parentPath);
		if (!folder) return [];
		// Only include children that have DOM elements (visible)
		return folder.children
			.map((c) => c.name)
			.filter((name) => this.isVisible(parentPath, name));
	}

	private isVisible(parentPath: string, name: string): boolean {
		return this.visibleByParent.get(parentPath)?.has(name) ?? true;
	}

	/** Keep only items that are visible. */
	private filterVisible(parentPath: string, order: string[]): string[] {
		return order.filter((name) => this.isVisible(parentPath, name));
	}

	/**
	 * After reordering visible items, merge hidden items back at their
	 * original relative positions so they don't get lost.
	 */
	private mergeHiddenBack(
		parentPath: string,
		visibleOrder: string[]
	): string[] {
		const folder = this.plugin.app.vault.getFolderByPath(parentPath);
		if (!folder) return visibleOrder;

		const result = [...visibleOrder];
		const visibleSet = new Set(visibleOrder);

		// Walk original folder.children order; for each hidden item,
		// insert it at the correct logical position.
		let insertOffset = 0;
		for (const child of folder.children) {
			if (!visibleSet.has(child.name)) {
				// Hidden item — insert it at its natural position, but
				// relative to the visible items. Use insertOffset which
				// tracks how many hidden items we've already inserted.
				const idx = Math.min(result.length, insertOffset++);
				result.splice(idx, 0, child.name);
			} else {
				// Track where the next hidden item would go
				insertOffset = result.indexOf(child.name) + 1;
			}
		}

		return result;
	}

	/** Remove order entries for deleted/moved items. */
	private cleanupStaleOrders(): void {
		for (const [path, order] of Object.entries(this.plugin.settings.orders)) {
			const folder = this.plugin.app.vault.getFolderByPath(path);
			if (!folder) {
				delete this.plugin.settings.orders[path];
				continue;
			}
			const names = new Set(folder.children.map((c) => c.name));
			const cleaned = order.filter((n) => names.has(n));
			if (cleaned.length !== order.length) {
				if (cleaned.length === 0) {
					delete this.plugin.settings.orders[path];
				} else {
					this.plugin.settings.orders[path] = cleaned;
				}
			}
		}
	}

	private removePlaceholder(): void {
		if (this.state.placeholder) {
			this.state.placeholder.remove();
			this.state.placeholder = null;
		}
	}

	cleanup(): void {
		for (const fn of this.cleanupFns) {
			fn();
		}
		this.cleanupFns = [];
		this.visibleByParent.clear();
	}
}
