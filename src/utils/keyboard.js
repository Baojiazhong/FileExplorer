/**
 * Keyboard utility functions for the file explorer.
 *
 * This module also provides a centralized keydown router so we can avoid stacking
 * multiple global `document.addEventListener('keydown', ...)` listeners across
 * components. Overlays can register higher-priority handlers to "claim" keys.
 */

/**
 * Check if multiple selection is enabled based on the key event.
 * @param {KeyboardEvent} event - The keyboard event.
 * @returns {boolean} - Whether multiple selection is enabled.
 */
export const isMultiSelectKey = (event) => {
    return event.ctrlKey || event.metaKey;
};

/**
 * Check if range selection is enabled based on the key event.
 * @param {KeyboardEvent} event - The keyboard event.
 * @returns {boolean} - Whether range selection is enabled.
 */
export const isRangeSelectKey = (event) => {
    return event.shiftKey;
};

/**
 * Common keyboard shortcuts for the file explorer.
 */
export const SHORTCUTS = {
    COPY: 'Control+c',
    CUT: 'Control+x',
    PASTE: 'Control+v',
    SELECT_ALL: 'Control+a',
    DELETE: 'Delete',
    RENAME: 'F2',
    SEARCH: 'Control+f',
    NEW_FOLDER: 'Control+Shift+n',
    NEW_FILE: 'Control+n',
    REFRESH: 'F5',
    BACK: 'Alt+ArrowLeft',
    FORWARD: 'Alt+ArrowRight',
    UP_DIRECTORY: 'Alt+ArrowUp',
    HOME: 'Home',
    END: 'End',
};

/**
 * Format a shortcut for display.
 * @param {string} shortcut - The shortcut string.
 * @returns {string} - Formatted shortcut for display.
 */
export const formatShortcut = (shortcut) => {
    return shortcut
        .replace('Control+', 'Ctrl+')
        .replace('Meta+', '⌘')
        .replace('Alt+', 'Alt+')
        .replace('Shift+', 'Shift+')
        .replace('ArrowLeft', '←')
        .replace('ArrowRight', '→')
        .replace('ArrowUp', '↑')
        .replace('ArrowDown', '↓');
};

/**
 * Get the native modifier key based on the platform.
 * @returns {string} - 'Control' for Windows/Linux, 'Meta' for macOS.
 */
export const getPrimaryModifier = () => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    return isMac ? 'Meta' : 'Control';
};

/**
 * Handle keyboard navigation in a list or grid.
 * @param {Event} event - The keyboard event.
 * @param {Array} items - The list of items.
 * @param {number} currentIndex - The current selected index.
 * @param {Object} options - Additional options for navigation.
 * @returns {number} - The new selected index.
 */
export const handleNavigation = (event, items, currentIndex, options = {}) => {
    const {
        columnsPerRow = 4, // Default for grid view
        isGrid = false,
        wraparound = false,
    } = options;

    const itemsLength = items.length;

    if (itemsLength === 0) return -1;

    let newIndex = currentIndex;

    switch (event.key) {
        case 'ArrowUp':
            if (isGrid) {
                newIndex = currentIndex - columnsPerRow;
            } else {
                newIndex = currentIndex - 1;
            }
            break;

        case 'ArrowDown':
            if (isGrid) {
                newIndex = currentIndex + columnsPerRow;
            } else {
                newIndex = currentIndex + 1;
            }
            break;

        case 'ArrowLeft':
            newIndex = currentIndex - 1;
            break;

        case 'ArrowRight':
            newIndex = currentIndex + 1;
            break;

        case 'Home':
            newIndex = 0;
            break;

        case 'End':
            newIndex = itemsLength - 1;
            break;

        default:
            return currentIndex;
    }

    // Apply wraparound if enabled
    if (wraparound) {
        if (newIndex < 0) {
            newIndex = itemsLength - 1;
        } else if (newIndex >= itemsLength) {
            newIndex = 0;
        }
    } else {
        // Clamp to valid range
        newIndex = Math.max(0, Math.min(itemsLength - 1, newIndex));
    }

    return newIndex;
};

// ---------------------------------------------------------------------------
// Centralized keydown routing
// ---------------------------------------------------------------------------

/**
 * Priority bands (higher runs first).
 *
 * Guidelines:
 * - Overlay UIs (confirm dialogs, preview modal, dropdowns, context menus, modals) should be
 *   higher priority than app-level shortcuts.
 * - App-level shortcuts should be higher priority than list navigation.
 * - If a handler "owns" a key for its current state, it should either `return true` or call
 *   `event.preventDefault()` to claim it (the router will stop dispatching).
 */
export const KEYDOWN_PRIORITIES = {
    CONFIRM: 900,
    PREVIEW_MODAL: 700,
    MENU: 650, // dropdown/context menu
    SEARCH_MODAL: 640,
    MODAL: 620,
    APP: 0,
    LIST_NAV: -10,
    LEGACY_SHORTCUTS: -100,
};

let keydownListenerAttached = false;
let nextHandlerId = 1;
let nextHandlerOrder = 1;

/** @type {Array<{id: string, name: string, priority: number, order: number, when: Function | null, handler: Function}>} */
const keydownHandlers = [];

const sortKeydownHandlers = () => {
    keydownHandlers.sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return b.order - a.order; // later registrations win within same priority
    });
};

const dispatchKeydown = (event) => {
    for (const entry of keydownHandlers) {
        if (event.defaultPrevented) return;

        if (entry.when) {
            let ok = false;
            try {
                ok = !!entry.when(event);
            } catch (err) {
                console.error('keyboard: when() threw', entry.name || entry.id, err);
                ok = false;
            }
            if (!ok) continue;
        }

        let consumed = false;
        try {
            consumed = entry.handler(event) === true;
        } catch (err) {
            console.error('keyboard: handler threw', entry.name || entry.id, err);
            consumed = false;
        }

        if (consumed || event.defaultPrevented) {
            if (!event.defaultPrevented) event.preventDefault();
            return;
        }
    }
};

const ensureKeydownListener = () => {
    if (keydownListenerAttached) return;
    document.addEventListener('keydown', dispatchKeydown);
    keydownListenerAttached = true;
};

const maybeDetachKeydownListener = () => {
    if (!keydownListenerAttached) return;
    if (keydownHandlers.length > 0) return;
    document.removeEventListener('keydown', dispatchKeydown);
    keydownListenerAttached = false;
};

export const registerKeydownHandler = (handler, options = {}) => {
    const id = options.id || `kd_${nextHandlerId++}`;
    const entry = {
        id,
        name: options.name || '',
        priority: typeof options.priority === 'number' ? options.priority : 0,
        order: nextHandlerOrder++,
        when: typeof options.when === 'function' ? options.when : null,
        handler,
    };

    keydownHandlers.push(entry);
    sortKeydownHandlers();
    ensureKeydownListener();

    return () => {
        // Prefer removing by object identity so duplicate ids can't remove the wrong handler.
        let idx = keydownHandlers.indexOf(entry);
        if (idx === -1) {
            idx = keydownHandlers.findIndex((h) => h.id === id);
        }

        if (idx !== -1) {
            keydownHandlers.splice(idx, 1);
            maybeDetachKeydownListener();
        }
    };
};

/**
 * Register global keyboard shortcuts.
 * @param {Object} handlers - An object mapping key combinations to handler functions.
 * @returns {Function} - A cleanup function to remove the handler.
 *
 * @example
 * const cleanup = registerShortcuts({
 *   'Control+f': () => console.log('Search'),
 *   'Control+c': () => console.log('Copy'),
 *   'Delete': () => console.log('Delete'),
 * });
 * cleanup();
 */
export const registerShortcuts = (handlers) => {
    return registerKeydownHandler(
        (event) => {
            // Build the key combination string
            let combo = '';

            if (event.ctrlKey) combo += 'Control+';
            if (event.metaKey) combo += 'Meta+';
            if (event.altKey) combo += 'Alt+';
            if (event.shiftKey) combo += 'Shift+';

            // Add the key itself
            combo += event.key;

            // Check if we have a handler for this combination
            if (handlers[combo]) {
                handlers[combo](event);
                return true;
            }

            return false;
        },
        {
            name: 'registerShortcuts',
            priority: KEYDOWN_PRIORITIES.LEGACY_SHORTCUTS,
        }
    );
};
