import { Menu, Notice, Plugin, setIcon, TFolder, WorkspaceLeaf } from "obsidian";

interface FileExplorerFilterSettings {
	scope: string | null;
	hideDone: boolean;
}

interface FileExplorerView {
	containerEl: HTMLElement;
}

const DEFAULT_SETTINGS: FileExplorerFilterSettings = {
	scope: null,
	hideDone: false,
};

const HIDDEN_CLASS = "file-explorer-filter-hidden";
const BUTTON_CLASS = "file-explorer-filter-button";

export default class FileExplorerFilterPlugin extends Plugin {
	private filterSettings: FileExplorerFilterSettings = DEFAULT_SETTINGS;
	private observers = new Map<HTMLElement, MutationObserver>();
	private buttons = new Map<HTMLElement, HTMLElement>();
	private refreshTimer: number | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.app.workspace.onLayoutReady(() => this.setupExplorerViewsSafely());

		this.registerEvent(
			this.app.workspace.on("layout-change", () => this.setupExplorerViewsSafely()),
		);
		this.registerEvent(this.app.vault.on("create", () => this.scheduleRefresh()));
		this.registerEvent(this.app.vault.on("delete", () => this.scheduleRefresh()));
		this.registerEvent(this.app.vault.on("rename", () => this.scheduleRefresh()));

		this.addCommand({
			id: "show-file-explorer-filter-menu",
			name: "Show file explorer filter menu",
			callback: () => this.showFilterMenu(),
		});
		this.addCommand({
			id: "toggle-hide-done",
			name: "Toggle files and folders ending in [DONE]",
			callback: () => void this.setHideDone(!this.filterSettings.hideDone),
		});
	}

	onunload(): void {
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
		}

		for (const observer of this.observers.values()) {
			observer.disconnect();
		}
		this.observers.clear();

		for (const button of this.buttons.values()) {
			button.remove();
		}
		this.buttons.clear();

		document
			.querySelectorAll(`.${HIDDEN_CLASS}`)
			.forEach((element) => element.classList.remove(HIDDEN_CLASS));
	}

	private async loadSettings(): Promise<void> {
		this.filterSettings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	private async saveSettings(): Promise<void> {
		await this.saveData(this.filterSettings);
	}

	private getExplorerLeaves(): WorkspaceLeaf[] {
		return this.app.workspace.getLeavesOfType("file-explorer");
	}

	private setupExplorerViewsSafely(): void {
		try {
			this.setupExplorerViews();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error("File Explorer Filter failed to set up the explorer:", error);
			new Notice(`File Explorer Filter: ${message}`, 10000);
		}
	}

	private setupExplorerViews(): void {
		const activeContainers = new Set<HTMLElement>();

		for (const leaf of this.getExplorerLeaves()) {
			const view = leaf.view as unknown as FileExplorerView;
			const container = view.containerEl;
			if (!container) {
				throw new Error("The current file explorer does not expose its container.");
			}
			activeContainers.add(container);

			if (!this.buttons.has(container)) {
				const toolbar = container.querySelector<HTMLElement>(
					".nav-header .nav-buttons-container",
				);
				if (!toolbar) {
					throw new Error("Could not find the file explorer toolbar.");
				}

				const button = document.createElement("div");
				button.addClass("clickable-icon", "nav-action-button");
				button.addClass(BUTTON_CLASS);
				button.setAttribute("aria-label", "Filter file explorer");
				button.setAttribute("role", "button");
				button.tabIndex = 0;
				setIcon(button, "list-filter");
				this.registerDomEvent(button, "click", (event) =>
					this.showFilterMenu(event),
				);
				this.registerDomEvent(button, "keydown", (event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						this.showFilterMenu();
					}
				});
				toolbar.appendChild(button);
				this.buttons.set(container, button);
			}

			if (!this.observers.has(container)) {
				const observer = new MutationObserver(() => this.scheduleRefresh());
				observer.observe(container, { childList: true, subtree: true });
				this.observers.set(container, observer);
			}
		}

		for (const [container, observer] of this.observers) {
			if (!activeContainers.has(container)) {
				observer.disconnect();
				this.observers.delete(container);
				this.buttons.get(container)?.remove();
				this.buttons.delete(container);
			}
		}

		this.refresh();
	}

	private showFilterMenu(event?: MouseEvent): void {
		const menu = new Menu();
		const rootFolders = this.app.vault
			.getRoot()
			.children.filter((item): item is TFolder => item instanceof TFolder)
			.sort((left, right) => left.name.localeCompare(right.name));

		menu.addItem((item) =>
			item
				.setTitle("All folders")
				.setIcon(this.filterSettings.scope === null ? "check" : "folder-tree")
				.onClick(() => void this.setScope(null)),
		);

		for (const folder of rootFolders) {
			menu.addItem((item) =>
				item
					.setTitle(folder.name)
					.setIcon(this.filterSettings.scope === folder.path ? "check" : "folder")
					.onClick(() => void this.setScope(folder.path)),
			);
		}

		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle("Hide names ending in [DONE]")
				.setIcon(this.filterSettings.hideDone ? "check-square" : "square")
				.onClick(() => void this.setHideDone(!this.filterSettings.hideDone)),
		);

		if (event) {
			menu.showAtMouseEvent(event);
		} else {
			const button = this.buttons.values().next().value as HTMLElement | undefined;
			if (button) {
				const rect = button.getBoundingClientRect();
				menu.showAtPosition({ x: rect.left, y: rect.bottom });
			}
		}
	}

	private async setScope(scope: string | null): Promise<void> {
		this.filterSettings.scope = scope;
		await this.saveSettings();
		this.refresh();
	}

	private async setHideDone(hideDone: boolean): Promise<void> {
		this.filterSettings.hideDone = hideDone;
		await this.saveSettings();
		this.refresh();
	}

	private scheduleRefresh(): void {
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
		}

		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = null;
			this.refresh();
		}, 50);
	}

	private refresh(): void {
		for (const leaf of this.getExplorerLeaves()) {
			const view = leaf.view as unknown as FileExplorerView;
			this.filterExplorer(view.containerEl);
		}

		for (const button of this.buttons.values()) {
			const scopeLabel = this.filterSettings.scope ?? "All folders";
			const doneLabel = this.filterSettings.hideDone ? ", [DONE] hidden" : "";
			button.setAttribute("aria-label", `File explorer filter: ${scopeLabel}${doneLabel}`);
			button.toggleClass(
				"is-active",
				this.filterSettings.scope !== null || this.filterSettings.hideDone,
			);
		}
	}

	private filterExplorer(container: HTMLElement): void {
		const titles = container.querySelectorAll<HTMLElement>(
			".nav-file-title[data-path], .nav-folder-title[data-path]",
		);

		for (const title of Array.from(titles)) {
			const path = title.dataset.path;
			const treeItem = title.closest<HTMLElement>(".tree-item");
			if (!path || !treeItem) {
				continue;
			}

			const hiddenByScope = !this.isPathInScope(path);
			const hiddenByDone = this.filterSettings.hideDone && this.pathEndsInDone(path);
			treeItem.toggleClass(HIDDEN_CLASS, hiddenByScope || hiddenByDone);
		}
	}

	private isPathInScope(path: string): boolean {
		const scope = this.filterSettings.scope;
		if (scope === null) {
			return true;
		}

		return (
			path === scope ||
			path.startsWith(`${scope}/`) ||
			scope.startsWith(`${path}/`)
		);
	}

	private pathEndsInDone(path: string): boolean {
		const name = path.split("/").pop() ?? path;
		const stem = name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
		return stem.trimEnd().toUpperCase().endsWith("[DONE]");
	}
}
