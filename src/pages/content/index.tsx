/**
 * Content script entry point.
 * Bootstraps the Timeline and Folder modules on chatgpt.com pages.
 */

import { LoggerService } from '@/core/services/LoggerService';

import { FolderManager } from './folder/FolderManager';
import { TimelineManager } from './timeline/TimelineManager';

const TAG = 'ContentScript';

let timelineManager: TimelineManager | null = null;
let folderManager: FolderManager | null = null;
let lastUrl = location.href;

/**
 * Initialize all content-script modules.
 */
async function initModules(): Promise<void> {
  LoggerService.info(TAG, 'Initializing ChatGPT Navigator on', location.href);

  // Only initialize if we're on a ChatGPT page
  if (!location.hostname.includes('chatgpt.com')) {
    LoggerService.warn(TAG, 'Not on chatgpt.com, skipping init');
    return;
  }

  // Cleanup any previous instances (SPA navigation)
  cleanup();

  // Initialize Timeline (right-side navigation bar)
  timelineManager = new TimelineManager();
  await timelineManager.init();

  // Initialize Folder Manager (sidebar organization)
  folderManager = new FolderManager();
  await folderManager.init();

  LoggerService.info(TAG, 'All modules initialized');
}

/**
 * Tear down all managers (for SPA navigation or page unload).
 */
function cleanup(): void {
  timelineManager?.destroy();
  timelineManager = null;
  folderManager?.destroy();
  folderManager = null;
}

/**
 * ChatGPT is a SPA — watch for URL changes and re-initialize
 * when the user navigates to a different conversation.
 */
function setupSPANavigationWatcher(): void {
  // Method 1: popstate event
  window.addEventListener('popstate', () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      LoggerService.debug(TAG, 'URL changed (popstate):', lastUrl);
      initModules();
    }
  });

  // Method 2: Poll for URL changes (catches pushState without popstate)
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      LoggerService.debug(TAG, 'URL changed (poll):', lastUrl);
      initModules();
    }
  }, 1000);
}

// ── Entry point ──
setupSPANavigationWatcher();
initModules();
