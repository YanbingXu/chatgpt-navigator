/**
 * FolderManager — manages session folders for ChatGPT sidebar.
 * Injects a custom folder tree UI into the native left sidebar,
 * allowing users to organize conversations into folders.
 *
 * Supports:
 * - "Add current chat" button on each folder
 * - Making native sidebar conversations draggable into folders
 * - Right-click context menu to move conversations to folders
 */

import { LoggerService } from '@/core/services/LoggerService';
import { StorageService } from '@/core/services/StorageService';
import { StorageKeys } from '@/core/types/common';
import type { ConversationReference, Folder, FolderData } from '@/core/types/common';

const TAG = 'Folder';
const CLS = 'cn-folder';

function generateId(): string {
  return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Extract conversation ID from a ChatGPT URL path like /c/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
function extractConversationId(url: string): string | null {
  const match = url.match(/\/c\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? null;
}

/**
 * Get the current conversation info from the page URL and title.
 */
function getCurrentConversation(): ConversationReference | null {
  const id = extractConversationId(location.pathname);
  if (!id) return null;

  // Try to get the title from the page or sidebar
  let title = document.title?.replace(/ \| ChatGPT$/, '')?.replace(/^ChatGPT$/, '')?.trim();
  if (!title || title === 'ChatGPT') {
    // Fallback: try to find the active conversation in sidebar
    const activeSidebarItem = document.querySelector('nav li a[class*="bg-"]') as HTMLAnchorElement;
    title = activeSidebarItem?.textContent?.trim() ?? 'Untitled';
  }

  return {
    id,
    title,
    url: `/c/${id}`,
    addedAt: Date.now(),
  };
}

export class FolderManager {
  private data: FolderData = { folders: [], folderContents: {} };
  private containerElement: HTMLElement | null = null;
  private sidebarContainer: HTMLElement | null = null;
  private mutationObserver: MutationObserver | null = null;
  private isDestroyed = false;
  private contextMenu: HTMLElement | null = null;

  async init(): Promise<void> {
    LoggerService.info(TAG, 'Initializing folder manager');

    // Load persisted data
    await this.loadData();

    // Wait for sidebar
    const sidebar = await this.waitForSidebar(8000);
    if (!sidebar) {
      LoggerService.warn(TAG, 'Could not find ChatGPT sidebar, aborting folder init');
      return;
    }
    this.sidebarContainer = sidebar;

    // Create and inject folder UI
    this.createFolderUI();

    // Make existing native conversations draggable
    this.makeNativeConversationsDraggable();

    // Watch for sidebar DOM changes (ChatGPT may re-render)
    this.setupMutationObserver();

    // Close context menu on outside click
    document.addEventListener('click', this.handleDocumentClick);

    LoggerService.info(TAG, 'Folder manager initialized');
  }

  destroy(): void {
    this.isDestroyed = true;
    this.mutationObserver?.disconnect();
    this.containerElement?.remove();
    this.contextMenu?.remove();
    document.removeEventListener('click', this.handleDocumentClick);
    LoggerService.info(TAG, 'Folder manager destroyed');
  }

  private handleDocumentClick = (): void => {
    if (this.contextMenu) {
      this.contextMenu.remove();
      this.contextMenu = null;
    }
  };

  // ────────────────────────────────────────────
  // Data persistence
  // ────────────────────────────────────────────

  private async loadData(): Promise<void> {
    const stored = await StorageService.get<FolderData | null>(StorageKeys.FOLDER_DATA, null);
    if (stored && Array.isArray(stored.folders)) {
      this.data = stored;
      LoggerService.debug(TAG, `Loaded ${this.data.folders.length} folders`);
    }
  }

  private async saveData(): Promise<void> {
    await StorageService.set(StorageKeys.FOLDER_DATA, this.data);
  }

  // ────────────────────────────────────────────
  // Sidebar detection
  // ────────────────────────────────────────────

  private waitForSidebar(timeoutMs: number): Promise<HTMLElement | null> {
    return new Promise((resolve) => {
      const selectors = ['nav[aria-label="Chat history"]', 'nav'];

      const check = (): HTMLElement | null => {
        for (const sel of selectors) {
          const el = document.querySelector(sel) as HTMLElement | null;
          if (el) return el;
        }
        return null;
      };

      const found = check();
      if (found) return resolve(found);

      const observer = new MutationObserver(() => {
        const el = check();
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        resolve(check());
      }, timeoutMs);
    });
  }

  // ────────────────────────────────────────────
  // UI creation
  // ────────────────────────────────────────────

  private createFolderUI(): void {
    if (!this.sidebarContainer) return;

    this.containerElement = document.createElement('div');
    this.containerElement.className = `${CLS}-container`;

    // Header
    const header = document.createElement('div');
    header.className = `${CLS}-header`;

    const title = document.createElement('span');
    title.className = `${CLS}-title`;
    title.textContent = '📁 Folders';

    const addBtn = document.createElement('button');
    addBtn.className = `${CLS}-add-btn`;
    addBtn.textContent = '+';
    addBtn.title = 'Create new folder';
    addBtn.addEventListener('click', () => this.createFolder());

    header.appendChild(title);
    header.appendChild(addBtn);
    this.containerElement.appendChild(header);

    // Folder list
    const list = this.renderFolderList();
    this.containerElement.appendChild(list);

    // Insert at the top of sidebar
    this.sidebarContainer.insertBefore(this.containerElement, this.sidebarContainer.firstChild);
  }

  private renderFolderList(): HTMLElement {
    const list = document.createElement('div');
    list.className = `${CLS}-list`;

    if (this.data.folders.length === 0) {
      const empty = document.createElement('div');
      empty.className = `${CLS}-empty`;
      empty.textContent = 'No folders yet. Click + to create one.';
      list.appendChild(empty);
      return list;
    }

    // Render root-level folders
    const rootFolders = this.data.folders
      .filter((f) => f.parentId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    for (const folder of rootFolders) {
      list.appendChild(this.renderFolderElement(folder));
    }

    return list;
  }

  private renderFolderElement(folder: Folder): HTMLElement {
    const el = document.createElement('div');
    el.className = `${CLS}-item`;
    el.dataset.folderId = folder.id;

    // Folder header row
    const headerRow = document.createElement('div');
    headerRow.className = `${CLS}-item-header`;

    const expandIcon = document.createElement('span');
    expandIcon.className = `${CLS}-expand-icon`;
    expandIcon.textContent = folder.isExpanded ? '▾' : '▸';
    expandIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFolder(folder.id);
    });

    const icon = document.createElement('span');
    icon.className = `${CLS}-icon`;
    icon.textContent = '📁';

    const name = document.createElement('span');
    name.className = `${CLS}-name`;
    name.textContent = folder.name;
    name.addEventListener('dblclick', () => this.renameFolder(folder.id));

    // Actions container (visible on hover)
    const actions = document.createElement('div');
    actions.className = `${CLS}-item-actions`;

    // Add current chat button
    const addCurrentBtn = document.createElement('button');
    addCurrentBtn.className = `${CLS}-action-btn`;
    addCurrentBtn.textContent = '➕';
    addCurrentBtn.title = 'Add current chat to this folder';
    addCurrentBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.addCurrentChatToFolder(folder.id);
    });

    // Delete folder button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = `${CLS}-action-btn ${CLS}-delete-btn`;
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Delete folder';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteFolder(folder.id);
    });

    actions.appendChild(addCurrentBtn);
    actions.appendChild(deleteBtn);

    headerRow.appendChild(expandIcon);
    headerRow.appendChild(icon);
    headerRow.appendChild(name);
    headerRow.appendChild(actions);
    el.appendChild(headerRow);

    // Render conversations inside if expanded
    if (folder.isExpanded) {
      const conversations = this.data.folderContents[folder.id] ?? [];
      const convContainer = document.createElement('div');
      convContainer.className = `${CLS}-conversations`;

      for (const conv of conversations) {
        const convRow = document.createElement('div');
        convRow.className = `${CLS}-conversation-row`;

        const convLink = document.createElement('a');
        convLink.className = `${CLS}-conversation`;
        convLink.href = conv.url;
        convLink.textContent = conv.title || 'Untitled';
        convLink.title = conv.title;
        convLink.addEventListener('click', (e) => {
          e.preventDefault();
          // Use SPA navigation
          window.history.pushState({}, '', conv.url);
          window.dispatchEvent(new PopStateEvent('popstate'));
        });

        // Remove from folder button
        const removeBtn = document.createElement('button');
        removeBtn.className = `${CLS}-remove-btn`;
        removeBtn.textContent = '×';
        removeBtn.title = 'Remove from folder';
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.removeConversationFromFolder(folder.id, conv.id);
        });

        convRow.appendChild(convLink);
        convRow.appendChild(removeBtn);
        convContainer.appendChild(convRow);
      }

      if (conversations.length === 0) {
        const emptyConv = document.createElement('div');
        emptyConv.className = `${CLS}-empty-conv`;
        emptyConv.textContent = 'Click ➕ to add current chat';
        convContainer.appendChild(emptyConv);
      }

      el.appendChild(convContainer);
    }

    // Setup drag-and-drop target
    this.setupFolderDropZone(el, folder.id);

    return el;
  }

  // ────────────────────────────────────────────
  // Native conversation draggable support
  // ────────────────────────────────────────────

  private makeNativeConversationsDraggable(): void {
    if (!this.sidebarContainer) return;

    // ChatGPT sidebar conversation links are typically `a` tags inside `li` or `nav` elements
    // Common selectors for ChatGPT's conversation list:
    const conversationLinks = this.sidebarContainer.querySelectorAll(
      'a[href^="/c/"]',
    ) as NodeListOf<HTMLAnchorElement>;

    conversationLinks.forEach((link) => {
      if (link.dataset.cnDraggable === 'true') return; // Already processed
      link.setAttribute('draggable', 'true');
      link.dataset.cnDraggable = 'true';

      link.addEventListener('dragstart', (e) => {
        const convId = extractConversationId(link.href);
        if (!convId || !e.dataTransfer) return;

        const conv: ConversationReference = {
          id: convId,
          title: link.textContent?.trim() || 'Untitled',
          url: `/c/${convId}`,
          addedAt: Date.now(),
        };

        e.dataTransfer.setData('text/plain', JSON.stringify(conv));
        e.dataTransfer.effectAllowed = 'move';

        // Visual feedback
        link.style.opacity = '0.5';
      });

      link.addEventListener('dragend', () => {
        link.style.opacity = '';
      });

      // Right-click context menu
      link.addEventListener('contextmenu', (e) => {
        if (this.data.folders.length === 0) return; // No folders to show
        e.preventDefault();
        this.showMoveToFolderMenu(e, link);
      });
    });

    LoggerService.debug(TAG, `Made ${conversationLinks.length} conversations draggable`);
  }

  // ────────────────────────────────────────────
  // Context menu: "Move to folder"
  // ────────────────────────────────────────────

  private showMoveToFolderMenu(e: MouseEvent, link: HTMLAnchorElement): void {
    // Remove existing menu
    this.contextMenu?.remove();

    const convId = extractConversationId(link.href);
    if (!convId) return;

    const menu = document.createElement('div');
    menu.className = `${CLS}-context-menu`;
    menu.style.position = 'fixed';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    menu.style.zIndex = '10002';

    const menuTitle = document.createElement('div');
    menuTitle.className = `${CLS}-context-menu-title`;
    menuTitle.textContent = 'Move to folder';
    menu.appendChild(menuTitle);

    for (const folder of this.data.folders) {
      const item = document.createElement('div');
      item.className = `${CLS}-context-menu-item`;
      item.textContent = `📁 ${folder.name}`;
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const conv: ConversationReference = {
          id: convId,
          title: link.textContent?.trim() || 'Untitled',
          url: `/c/${convId}`,
          addedAt: Date.now(),
        };
        this.addConversationToFolder(folder.id, conv);
        menu.remove();
        this.contextMenu = null;
      });
      menu.appendChild(item);
    }

    document.body.appendChild(menu);
    this.contextMenu = menu;
  }

  // ────────────────────────────────────────────
  // Folder operations
  // ────────────────────────────────────────────

  private async addCurrentChatToFolder(folderId: string): Promise<void> {
    const conv = getCurrentConversation();
    if (!conv) {
      LoggerService.warn(TAG, 'Cannot determine current conversation (not in /c/ URL)');
      return;
    }
    await this.addConversationToFolder(folderId, conv);
  }

  private async createFolder(): Promise<void> {
    const name = prompt('Folder name:');
    if (!name?.trim()) return;

    const folder: Folder = {
      id: generateId(),
      name: name.trim(),
      color: 'default',
      isExpanded: true,
      parentId: null,
      createdAt: Date.now(),
      sortOrder: this.data.folders.length,
    };

    this.data.folders.push(folder);
    this.data.folderContents[folder.id] = [];
    await this.saveData();
    this.refreshUI();
    LoggerService.info(TAG, `Created folder: ${folder.name}`);
  }

  private async deleteFolder(folderId: string): Promise<void> {
    if (!confirm('Delete this folder? Conversations will not be deleted.')) return;

    this.data.folders = this.data.folders.filter((f) => f.id !== folderId);
    delete this.data.folderContents[folderId];
    await this.saveData();
    this.refreshUI();
    LoggerService.info(TAG, `Deleted folder: ${folderId}`);
  }

  private async toggleFolder(folderId: string): Promise<void> {
    const folder = this.data.folders.find((f) => f.id === folderId);
    if (!folder) return;
    folder.isExpanded = !folder.isExpanded;
    await this.saveData();
    this.refreshUI();
  }

  private async renameFolder(folderId: string): Promise<void> {
    const folder = this.data.folders.find((f) => f.id === folderId);
    if (!folder) return;
    const newName = prompt('Rename folder:', folder.name);
    if (!newName?.trim()) return;
    folder.name = newName.trim();
    await this.saveData();
    this.refreshUI();
  }

  private async addConversationToFolder(
    folderId: string,
    conv: ConversationReference,
  ): Promise<void> {
    if (!this.data.folderContents[folderId]) {
      this.data.folderContents[folderId] = [];
    }

    // Avoid duplicates
    const existing = this.data.folderContents[folderId]!.find((c) => c.id === conv.id);
    if (existing) {
      LoggerService.debug(TAG, `Conversation already in folder`);
      return;
    }

    this.data.folderContents[folderId]!.push(conv);
    await this.saveData();
    this.refreshUI();
    LoggerService.info(TAG, `Added "${conv.title}" to folder ${folderId}`);
  }

  private async removeConversationFromFolder(folderId: string, convId: string): Promise<void> {
    if (!this.data.folderContents[folderId]) return;
    this.data.folderContents[folderId] = this.data.folderContents[folderId]!.filter(
      (c) => c.id !== convId,
    );
    await this.saveData();
    this.refreshUI();
    LoggerService.info(TAG, `Removed conversation ${convId} from folder ${folderId}`);
  }

  private refreshUI(): void {
    if (!this.containerElement) return;
    const oldList = this.containerElement.querySelector(`.${CLS}-list`);
    const newList = this.renderFolderList();
    if (oldList) {
      this.containerElement.replaceChild(newList, oldList);
    } else {
      this.containerElement.appendChild(newList);
    }
    // Re-scan for new conversations that may have appeared
    this.makeNativeConversationsDraggable();
  }

  // ────────────────────────────────────────────
  // Drag and drop
  // ────────────────────────────────────────────

  private setupFolderDropZone(element: HTMLElement, folderId: string): void {
    element.addEventListener('dragover', (e) => {
      e.preventDefault();
      element.classList.add(`${CLS}-drop-active`);
    });

    element.addEventListener('dragleave', () => {
      element.classList.remove(`${CLS}-drop-active`);
    });

    element.addEventListener('drop', (e) => {
      e.preventDefault();
      element.classList.remove(`${CLS}-drop-active`);

      const convData = e.dataTransfer?.getData('text/plain');
      if (!convData) return;

      try {
        const conv = JSON.parse(convData) as ConversationReference;
        this.addConversationToFolder(folderId, conv);
      } catch {
        LoggerService.warn(TAG, 'Failed to parse dropped conversation data');
      }
    });
  }

  // ────────────────────────────────────────────
  // Mutation observer for sidebar re-renders
  // ────────────────────────────────────────────

  private setupMutationObserver(): void {
    if (!this.sidebarContainer) return;

    this.mutationObserver = new MutationObserver(() => {
      if (this.isDestroyed) return;

      // Re-inject if our container was removed
      if (this.containerElement && !document.body.contains(this.containerElement)) {
        LoggerService.debug(TAG, 'Folder container lost from DOM, re-injecting');
        this.sidebarContainer?.insertBefore(
          this.containerElement,
          this.sidebarContainer?.firstChild ?? null,
        );
      }

      // Re-scan for new conversations
      this.makeNativeConversationsDraggable();
    });

    this.mutationObserver.observe(this.sidebarContainer, {
      childList: true,
      subtree: true,
    });
  }
}
