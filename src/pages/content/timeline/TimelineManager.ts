/**
 * TimelineManager — builds and manages the right-side navigation timeline bar
 * for long ChatGPT conversations. Observes DOM changes to detect user/assistant
 * turns, maps them to visual dots, and provides click-to-scroll navigation.
 */

import { LoggerService } from '@/core/services/LoggerService';
import type { MarkerData, ScrollMode } from '@/core/types/common';

const TAG = 'Timeline';

// ChatGPT DOM selectors — these may change as ChatGPT updates its UI.
// Priority order: most stable first.
const USER_TURN_SELECTORS = [
  '[data-message-author-role="user"]',
  'article[data-testid^="conversation-turn-"] [data-message-author-role="user"]',
];

const ASSISTANT_TURN_SELECTORS = [
  '[data-message-author-role="assistant"]',
];

/** CSS class prefix to avoid collisions with ChatGPT's styles */
const CLS = 'cn-timeline';

/**
 * Extracts a short preview from a user message element.
 */
function extractPreview(el: HTMLElement, maxLen = 60): string {
  const text = el.textContent?.trim() ?? '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '…';
}

/**
 * Finds the closest scrollable ancestor element.
 */
function findScrollContainer(startEl: HTMLElement): HTMLElement {
  let el: HTMLElement | null = startEl;
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
      return el;
    }
    el = el.parentElement;
  }
  return (document.scrollingElement as HTMLElement) || document.documentElement;
}

export class TimelineManager {
  private scrollContainer: HTMLElement | null = null;
  private conversationContainer: HTMLElement | null = null;
  private markers: MarkerData[] = [];
  private activeTurnId: string | null = null;

  // UI elements
  private timelineBar: HTMLElement | null = null;
  private tooltip: HTMLElement | null = null;

  // Observers
  private mutationObserver: MutationObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private visibleTurns: Set<Element> = new Set();

  // Event handlers (stored for cleanup)
  private onScroll: (() => void) | null = null;
  private scrollRafId: number | null = null;

  // Settings
  private scrollMode: ScrollMode = 'flow';
  private userTurnSelector = '';

  async init(): Promise<void> {
    LoggerService.info(TAG, 'Initializing timeline');
    const ok = await this.findCriticalElements();
    if (!ok) {
      LoggerService.warn(TAG, 'Could not find conversation container, aborting init');
      return;
    }
    this.injectTimelineUI();
    this.setupObservers();
    this.setupScrollListener();
    // Initial render
    this.recalculateMarkers();
    LoggerService.info(TAG, 'Timeline initialized successfully');
  }

  destroy(): void {
    this.mutationObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    if (this.onScroll && this.scrollContainer) {
      this.scrollContainer.removeEventListener('scroll', this.onScroll);
    }
    if (this.scrollRafId !== null) cancelAnimationFrame(this.scrollRafId);
    this.timelineBar?.remove();
    this.tooltip?.remove();
    this.markers = [];
    LoggerService.info(TAG, 'Timeline destroyed');
  }

  // ────────────────────────────────────────────
  // Phase 1: Find critical DOM elements
  // ────────────────────────────────────────────

  private async findCriticalElements(): Promise<boolean> {
    // Try each selector until we find user turns
    for (const selector of USER_TURN_SELECTORS) {
      const firstTurn = await this.waitForElement(selector, 5000);
      if (firstTurn) {
        this.userTurnSelector = selector;
        LoggerService.debug(TAG, `Matched user turn selector: ${selector}`);
        break;
      }
    }

    if (!this.userTurnSelector) {
      // Fallback: use a combined selector
      this.userTurnSelector = USER_TURN_SELECTORS.join(',');
    }

    // Find the conversation container — ChatGPT typically uses a <main> element
    this.conversationContainer =
      (document.querySelector('main') as HTMLElement) ?? document.body;

    // Find scroll container
    const firstTurn = this.conversationContainer.querySelector(this.userTurnSelector);
    if (firstTurn) {
      this.scrollContainer = findScrollContainer(firstTurn as HTMLElement);
    } else {
      this.scrollContainer = findScrollContainer(this.conversationContainer);
    }

    return true;
  }

  private waitForElement(selector: string, timeoutMs: number): Promise<Element | null> {
    return new Promise((resolve) => {
      const found = document.querySelector(selector);
      if (found) return resolve(found);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeoutMs);
    });
  }

  // ────────────────────────────────────────────
  // Phase 2: Inject the timeline UI
  // ────────────────────────────────────────────

  private injectTimelineUI(): void {
    // Create the main bar container
    this.timelineBar = document.createElement('div');
    this.timelineBar.className = `${CLS}-bar`;
    this.timelineBar.setAttribute('role', 'navigation');
    this.timelineBar.setAttribute('aria-label', 'Conversation Timeline');

    // Create tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.className = `${CLS}-tooltip`;

    document.body.appendChild(this.timelineBar);
    document.body.appendChild(this.tooltip);

    // Add click handler on the bar (event delegation)
    this.timelineBar.addEventListener('click', (e) => {
      const dot = (e.target as HTMLElement).closest(`.${CLS}-dot`) as HTMLElement | null;
      if (!dot) return;
      const markerId = dot.dataset.markerId;
      if (markerId) this.scrollToMarker(markerId);
    });

    // Add hover handlers for tooltip
    this.timelineBar.addEventListener('mouseover', (e) => {
      const dot = (e.target as HTMLElement).closest(`.${CLS}-dot`) as HTMLElement | null;
      if (dot) this.showTooltip(dot);
    });

    this.timelineBar.addEventListener('mouseout', (e) => {
      const dot = (e.target as HTMLElement).closest(`.${CLS}-dot`) as HTMLElement | null;
      if (dot) this.hideTooltip();
    });
  }

  // ────────────────────────────────────────────
  // Phase 3: Observers
  // ────────────────────────────────────────────

  private setupObservers(): void {
    if (!this.conversationContainer) return;

    // MutationObserver: watch for new turns added to the DOM
    this.mutationObserver = new MutationObserver(() => {
      this.recalculateMarkers();
    });

    this.mutationObserver.observe(this.conversationContainer, {
      childList: true,
      subtree: true,
    });

    // IntersectionObserver: track which turns are visible
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.visibleTurns.add(entry.target);
          } else {
            this.visibleTurns.delete(entry.target);
          }
        }
        this.updateActiveDot();
      },
      {
        root: this.scrollContainer,
        threshold: 0.3,
      },
    );
  }

  private setupScrollListener(): void {
    if (!this.scrollContainer) return;

    this.onScroll = () => {
      if (this.scrollRafId !== null) return;
      this.scrollRafId = requestAnimationFrame(() => {
        this.scrollRafId = null;
        this.updateActiveDot();
      });
    };

    this.scrollContainer.addEventListener('scroll', this.onScroll, { passive: true });
  }

  // ────────────────────────────────────────────
  // Phase 4: Marker calculation & rendering
  // ────────────────────────────────────────────

  private recalculateMarkers(): void {
    if (!this.conversationContainer || !this.timelineBar) return;

    const userTurns = Array.from(
      this.conversationContainer.querySelectorAll(this.userTurnSelector),
    ) as HTMLElement[];

    // Rebuild markers
    const newMarkers: MarkerData[] = userTurns.map((el, i) => ({
      id: `turn-${i}`,
      element: el,
      summary: extractPreview(el),
      index: i,
      isUser: true,
    }));

    // Only re-render if marker count changed
    if (newMarkers.length !== this.markers.length) {
      this.markers = newMarkers;
      this.renderDots();
      this.updateIntersectionTargets();
    }
  }

  private renderDots(): void {
    if (!this.timelineBar) return;

    // Clear existing dots
    this.timelineBar.innerHTML = '';

    this.markers.forEach((marker) => {
      const dot = document.createElement('button');
      dot.className = `${CLS}-dot`;
      dot.dataset.markerId = marker.id;
      dot.setAttribute('aria-label', `Jump to turn ${marker.index + 1}: ${marker.summary}`);
      dot.title = marker.summary;

      // Add turn number label
      const label = document.createElement('span');
      label.className = `${CLS}-dot-label`;
      label.textContent = `${marker.index + 1}`;
      dot.appendChild(label);

      this.timelineBar!.appendChild(dot);
    });
  }

  private updateIntersectionTargets(): void {
    if (!this.intersectionObserver) return;
    this.intersectionObserver.disconnect();
    this.markers.forEach((m) => this.intersectionObserver!.observe(m.element));
  }

  private updateActiveDot(): void {
    if (!this.timelineBar) return;

    // Find the first visible user turn (topmost in viewport)
    let activeMarker: MarkerData | null = null;
    for (const marker of this.markers) {
      if (this.visibleTurns.has(marker.element)) {
        activeMarker = marker;
        break;
      }
    }

    if (activeMarker && activeMarker.id !== this.activeTurnId) {
      // Remove old active
      const oldDot = this.timelineBar.querySelector(`.${CLS}-dot--active`);
      oldDot?.classList.remove(`${CLS}-dot--active`);

      // Set new active
      const newDot = this.timelineBar.querySelector(`[data-marker-id="${activeMarker.id}"]`);
      newDot?.classList.add(`${CLS}-dot--active`);

      this.activeTurnId = activeMarker.id;
    }
  }

  // ────────────────────────────────────────────
  // Phase 5: Scroll navigation
  // ────────────────────────────────────────────

  private scrollToMarker(markerId: string): void {
    const marker = this.markers.find((m) => m.id === markerId);
    if (!marker) return;

    if (this.scrollMode === 'jump') {
      marker.element.scrollIntoView({ block: 'start' });
    } else {
      marker.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ────────────────────────────────────────────
  // Phase 6: Tooltip
  // ────────────────────────────────────────────

  private showTooltip(dotEl: HTMLElement): void {
    if (!this.tooltip) return;
    const markerId = dotEl.dataset.markerId;
    const marker = this.markers.find((m) => m.id === markerId);
    if (!marker) return;

    this.tooltip.textContent = marker.summary;
    this.tooltip.classList.add(`${CLS}-tooltip--visible`);

    // Position tooltip to the left of the dot
    const rect = dotEl.getBoundingClientRect();
    this.tooltip.style.top = `${rect.top + rect.height / 2}px`;
    this.tooltip.style.right = `${window.innerWidth - rect.left + 8}px`;
  }

  private hideTooltip(): void {
    this.tooltip?.classList.remove(`${CLS}-tooltip--visible`);
  }
}
