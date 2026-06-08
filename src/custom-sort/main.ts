import { Plugin, TFolder, WorkspaceLeaf } from 'obsidian';
import { CustomSortSettings, DEFAULT_SETTINGS } from './types';
import { sortItems } from './sorter';
import { DragHandler } from './drag-handler';

/**
 * Monkey-patch a method on an object's prototype.
 * Returns an uninstaller function.
 */
function patchPrototype(
	obj: any,
	methodName: string,
	factory: (original: (...args: any[]) => any) => (...args: any[]) => any
): () => void {
	const proto = obj.constructor.prototype;
	const original = proto[methodName];
	proto[methodName] = factory(original);
	return () => {
		proto[methodName] = original;
	};
}

export default class CustomSortPlugin extends Plugin {
	settings: CustomSortSettings = DEFAULT_SETTINGS;
	private uninstallPatch: (() => void) | null = null;
	private dragHandler: DragHandler;
	private dragSetupTimer: number | null = null;
	private patched = false;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.dragHandler = new DragHandler(this);

		this.app.workspace.onLayoutReady(() => {
			this.patchFileExplorer();
		});

		// Re-sort / re-setup drag when vault changes
		this.registerEvent(
			this.app.vault.on('create', () => this.requestSort())
		);
		this.registerEvent(
			this.app.vault.on('delete', () => this.requestSort())
		);
		this.registerEvent(
			this.app.vault.on('rename', () => this.requestSort())
		);

		// Re-patch if layout changes (e.g. file explorer re-opened)
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				if (!this.patched) {
					this.patchFileExplorer();
				}
			})
		);
	}

	onunload(): void {
		if (this.uninstallPatch) {
			this.uninstallPatch();
			this.uninstallPatch = null;
		}
		if (this.dragSetupTimer !== null) {
			window.clearTimeout(this.dragSetupTimer);
		}
		this.dragHandler.cleanup();
		this.patched = false;

		// Trigger re-sort to restore default order
		const leaf = this.getFileExplorerLeaf();
		if (leaf) {
			(leaf.view as any).requestSort?.();
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.requestSort();
	}

	/** Get the file explorer leaf (public for DragHandler). */
	getFileExplorerLeaf(): WorkspaceLeaf | null {
		const leaves = this.app.workspace.getLeavesOfType('file-explorer');
		return leaves.length > 0 ? leaves[0] : null;
	}

	/** Request a re-sort of the file explorer and re-setup drag handlers. */
	requestSort(): void {
		const leaf = this.getFileExplorerLeaf();
		if (leaf) {
			(leaf.view as any).requestSort?.();
		}
		this.scheduleDragSetup();
	}

	// ─── Patching ────────────────────────────────────────────

	private patchFileExplorer(): void {
		const leaf = this.getFileExplorerLeaf();
		if (!leaf) return;

		const view = leaf.view as any;
		if (!view || typeof view.getSortedFolderItems !== 'function') {
			return;
		}

		if (this.patched) return;

		const plugin = this;

		this.uninstallPatch = patchPrototype(
			view,
			'getSortedFolderItems',
			(original) =>
				function (this: any, folder: TFolder) {
					const items = original.call(this, folder);

					const order = plugin.settings.orders[folder.path];
					if (!order || order.length === 0) return items;

					return plugin.sortExplorerItems(items, folder.path, order);
				}
		);

		this.patched = true;

		this.register(() => {
			if (this.uninstallPatch) {
				this.uninstallPatch();
				this.uninstallPatch = null;
				this.patched = false;
			}
		});

		// Trigger initial sort
		view.requestSort();
		this.scheduleDragSetup();
	}

	private scheduleDragSetup(): void {
		if (this.dragSetupTimer !== null) {
			window.clearTimeout(this.dragSetupTimer);
		}
		this.dragSetupTimer = window.setTimeout(() => {
			this.dragSetupTimer = null;
			const leaf = this.getFileExplorerLeaf();
			if (leaf) {
				this.dragHandler.setup(leaf.view as any);
			}
		}, 100);
	}

	/** Sort items using custom order — interspersed files & folders. */
	sortExplorerItems(items: any[], folderPath: string, order: string[]): any[] {
		return sortItems(items, folderPath, order);
	}
}
