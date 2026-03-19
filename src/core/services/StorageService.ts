/**
 * StorageService — single source of truth for chrome.storage access.
 * UI components must use this service instead of calling chrome.storage directly.
 */

type StorageArea = 'sync' | 'local';

class StorageServiceImpl {
  private area: StorageArea = 'local';

  async get<T>(key: string, defaultValue: T): Promise<T> {
    return new Promise((resolve) => {
      chrome.storage[this.area].get({ [key]: defaultValue }, (result) => {
        if (chrome.runtime.lastError) {
          console.warn(
            `[StorageService] get failed for "${key}":`,
            chrome.runtime.lastError.message,
          );
          resolve(defaultValue);
          return;
        }
        resolve(result[key] as T);
      });
    });
  }

  async set(key: string, value: unknown): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage[this.area].set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          console.warn(
            `[StorageService] set failed for "${key}":`,
            chrome.runtime.lastError.message,
          );
        }
        resolve();
      });
    });
  }

  async remove(key: string): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage[this.area].remove(key, () => {
        if (chrome.runtime.lastError) {
          console.warn(
            `[StorageService] remove failed for "${key}":`,
            chrome.runtime.lastError.message,
          );
        }
        resolve();
      });
    });
  }

  onChanged(
    callback: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void,
  ): void {
    chrome.storage.onChanged.addListener(callback);
  }
}

export const StorageService = new StorageServiceImpl();
