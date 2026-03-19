/**
 * Shared types and constants for ChatGPT Navigator
 */

// === Storage Keys ===
export const StorageKeys = {
  TIMELINE_SCROLL_MODE: 'cnTimelineScrollMode',
  TIMELINE_HIDE_CONTAINER: 'cnTimelineHideContainer',
  TIMELINE_BAR_WIDTH: 'cnTimelineBarWidth',
  FOLDER_DATA: 'cnFolderData',
  FOLDER_ENABLED: 'cnFolderEnabled',
} as const;

export type StorageKeyValue = (typeof StorageKeys)[keyof typeof StorageKeys];

// === Timeline Types ===
export type ScrollMode = 'jump' | 'flow';

export interface MarkerData {
  id: string;
  element: HTMLElement;
  summary: string;
  index: number;
  isUser: boolean;
}

// === Folder Types ===
export interface Folder {
  id: string;
  name: string;
  color: string;
  isExpanded: boolean;
  parentId: string | null;
  createdAt: number;
  sortOrder: number;
}

export interface ConversationReference {
  id: string;
  title: string;
  url: string;
  addedAt: number;
}

export interface FolderData {
  folders: Folder[];
  folderContents: Record<string, ConversationReference[]>;
}
