/**
 * Popup script — reads and writes settings to chrome.storage.
 */

import { StorageKeys } from '@/core/types/common';

function setupToggle(elementId: string, storageKey: string, defaultValue: boolean): void {
  const checkbox = document.getElementById(elementId) as HTMLInputElement | null;
  if (!checkbox) return;

  // Load saved value
  chrome.storage.local.get({ [storageKey]: defaultValue }, (result) => {
    checkbox.checked = !!result[storageKey];
  });

  // Save on change
  checkbox.addEventListener('change', () => {
    chrome.storage.local.set({ [storageKey]: checkbox.checked });
  });
}

// Initialize toggles
setupToggle('timeline-toggle', StorageKeys.TIMELINE_HIDE_CONTAINER, true);
setupToggle('scroll-mode', StorageKeys.TIMELINE_SCROLL_MODE, true);
setupToggle('folder-toggle', StorageKeys.FOLDER_ENABLED, true);
