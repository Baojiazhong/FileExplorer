import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

let consoleLogSpy;

vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: vi.fn(async (cmd) => {
      // MainLayout fetches system info early; return a minimal JSON string.
      if (cmd === 'get_meta_data_as_json') {
        return JSON.stringify({ current_running_os: 'linux' });
      }
      return null;
    }),
  };
});

const mocks = {
  settings: {
    keymap_preset: 'linux',
    right_pane_mode: 'none',
    right_pane_width: 300,
    terminal_height: 240,
    default_view: 'grid',
    show_hidden_files_and_folders: false,
    sort_by: 'Name',
    sort_direction: 'Ascending',
  },
  updateSetting: vi.fn(() => Promise.resolve()),
  showProperties: vi.fn(),
  selectedItems: [],
  focusedItem: null,
};

// Providers/hooks used by MainLayout.
vi.mock('../../src/providers/ThemeProvider.jsx', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}));

vi.mock('../../src/providers/FileSystemProvider.jsx', () => ({
  useFileSystem: () => ({
    isLoading: false,
    currentDirData: null,
    selectedItems: mocks.selectedItems,
    focusedItem: mocks.focusedItem,
    setFocusedItem: vi.fn(),
    volumes: [],
    loadDirectory: vi.fn(),
    renameItem: vi.fn(),
    openFile: vi.fn(),
  }),
}));

vi.mock('../../src/providers/ContextMenuProvider.jsx', () => ({
  useContextMenu: () => ({
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    closeContextMenu: vi.fn(),
    clipboard: { items: [] },
    copyToClipboard: vi.fn(),
    cutToClipboard: vi.fn(),
    pasteFromClipboard: vi.fn(),
    deleteItems: vi.fn(),
    showProperties: mocks.showProperties,
  }),
}));

vi.mock('../../src/providers/HistoryProvider.jsx', () => ({
  useHistory: () => ({
    currentPath: null,
    navigateTo: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
  }),
}));

vi.mock('../../src/providers/SettingsProvider.jsx', () => ({
  useSettings: () => ({
    settings: mocks.settings,
    updateSetting: mocks.updateSetting,
  }),
}));

vi.mock('../../src/providers/SftpProvider.jsx', () => ({
  useSftp: () => ({
    isSftpPath: () => false,
    parseSftpPath: () => null,
  }),
}));

// Utilities
vi.mock('../../src/utils/SettingsApplier.js', () => ({
  default: () => null,
}));

vi.mock('../../src/hooks/usePreview.js', () => ({
  usePreview: () => ({
    open: false,
    payload: null,
    isLoading: false,
    closePreview: vi.fn(),
  }),
}));

vi.mock('../../src/hooks/usePreviewPane.js', () => ({
  usePreviewPane: () => ({
    payload: null,
    isLoading: false,
  }),
}));

// Child components: keep them minimal so the test targets keyboard behavior.
vi.mock('../../src/components/sidebar/Sidebar.jsx', () => ({ default: () => null }));
vi.mock('../../src/components/explorer/PathBreadcrumb.jsx', () => ({ default: () => null }));
vi.mock('../../src/components/explorer/NavigationButtons.jsx', () => ({ default: () => null }));
vi.mock('../../src/components/explorer/FileList.jsx', () => ({ default: () => null }));
vi.mock('../../src/components/contextMenu/ContextMenu.jsx', () => ({ default: () => null }));
vi.mock('../../src/components/explorer/ViewModes.jsx', () => ({ default: () => null }));
vi.mock('../../src/components/explorer/CreateFileButton.jsx', () => ({ default: () => null }));
vi.mock('../../src/components/common/RenameModal.jsx', () => ({ default: () => null }));
vi.mock('../../src/components/terminal/Terminal.jsx', () => ({ default: () => null }));
vi.mock('../../src/components/search/GlobalSearch.jsx', () => ({ default: () => null }));
vi.mock('../../src/components/settings/SettingsPanel.jsx', () => ({ default: () => null }));
vi.mock('../../src/components/thisPc/ThisPCView.jsx', () => ({ default: () => null }));
vi.mock('../../src/components/network/NetworkView.jsx', () => ({ default: () => null }));
vi.mock('../../src/components/templates/TemplateList.jsx', () => ({ default: () => null }));
vi.mock('../../src/components/preview/PreviewModal.jsx', () => ({ default: () => null }));
vi.mock('../../src/components/preview/PreviewPane.jsx', () => ({ default: () => null }));
vi.mock('../../src/components/common/HashFileModal.jsx', () => ({ default: () => null }));
vi.mock('../../src/components/common/HashCompareModal.jsx', () => ({ default: () => null }));
vi.mock('../../src/components/common/HashDisplayModal.jsx', () => ({ default: () => null }));

vi.mock('../../src/components/explorer/DetailsPanel.jsx', () => ({
  default: () => <div data-testid="details-panel">DETAILS</div>,
}));

vi.mock('../../src/components/tabs/TabManager.jsx', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

const tick = () => new Promise((r) => setTimeout(r, 0));

const flush = async () => {
  // MainLayout triggers async effects; let them settle without act() warnings.
  await act(async () => {
    await tick();
  });
};

const fireKey = async (init) => {
  let e;
  await act(async () => {
    e = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ...init,
    });
    document.dispatchEvent(e);
  });
  return e;
};

describe('MainLayout OS-native properties shortcut', () => {
  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mocks.updateSetting = vi.fn(() => Promise.resolve());
    mocks.showProperties = vi.fn();
    mocks.settings = {
      ...mocks.settings,
      keymap_preset: 'linux',
      right_pane_mode: 'none',
    };
    mocks.selectedItems = [];
    mocks.focusedItem = null;
  });

  afterEach(() => {
    cleanup();
    consoleLogSpy?.mockRestore();
    consoleLogSpy = undefined;
  });

  it('Linux: Alt+Enter shows properties for single selection and opens details pane', async () => {
    mocks.settings = { ...mocks.settings, keymap_preset: 'linux' };
    mocks.selectedItems = [{ name: 'a.txt', path: '/tmp/a.txt', isDirectory: false }];

    const { default: MainLayout } = await import('../../src/layouts/MainLayout.jsx');

    render(<MainLayout />);
    await flush();

    const e = await fireKey({ key: 'Enter', code: 'Enter', altKey: true });

    expect(e.defaultPrevented).toBe(true);

    await waitFor(() => {
      expect(mocks.showProperties).toHaveBeenCalledTimes(1);
    });

    expect(mocks.showProperties).toHaveBeenCalledWith(mocks.selectedItems[0]);
    expect(mocks.updateSetting).toHaveBeenCalledWith('right_pane_mode', 'details');

    expect(screen.getByTestId('details-panel')).toBeInTheDocument();
  });

  it('Linux: Alt+Enter does nothing for multi-select', async () => {
    mocks.settings = { ...mocks.settings, keymap_preset: 'linux' };
    mocks.selectedItems = [
      { name: 'a.txt', path: '/tmp/a.txt', isDirectory: false },
      { name: 'b.txt', path: '/tmp/b.txt', isDirectory: false },
    ];

    const { default: MainLayout } = await import('../../src/layouts/MainLayout.jsx');

    render(<MainLayout />);
    await flush();

    await fireKey({ key: 'Enter', code: 'Enter', altKey: true });

    expect(mocks.showProperties).not.toHaveBeenCalled();
    expect(mocks.updateSetting).not.toHaveBeenCalledWith('right_pane_mode', 'details');
    expect(screen.queryByTestId('details-panel')).toBeNull();
  });

  it('Windows: Alt+Enter shows properties for single selection', async () => {
    mocks.settings = { ...mocks.settings, keymap_preset: 'windows' };
    mocks.selectedItems = [{ name: 'a.txt', path: 'C:\\tmp\\a.txt', isDirectory: false }];

    const { default: MainLayout } = await import('../../src/layouts/MainLayout.jsx');

    render(<MainLayout />);
    await flush();

    const e = await fireKey({ key: 'Enter', code: 'Enter', altKey: true });

    expect(e.defaultPrevented).toBe(true);

    await waitFor(() => {
      expect(mocks.showProperties).toHaveBeenCalledTimes(1);
    });

    expect(mocks.showProperties).toHaveBeenCalledWith(mocks.selectedItems[0]);
    expect(mocks.updateSetting).toHaveBeenCalledWith('right_pane_mode', 'details');
  });

  it('Windows: Alt+Enter does nothing for multi-select', async () => {
    mocks.settings = { ...mocks.settings, keymap_preset: 'windows' };
    mocks.selectedItems = [
      { name: 'a.txt', path: 'C:\\tmp\\a.txt', isDirectory: false },
      { name: 'b.txt', path: 'C:\\tmp\\b.txt', isDirectory: false },
    ];

    const { default: MainLayout } = await import('../../src/layouts/MainLayout.jsx');

    render(<MainLayout />);
    await flush();

    await fireKey({ key: 'Enter', code: 'Enter', altKey: true });

    expect(mocks.showProperties).not.toHaveBeenCalled();
    expect(mocks.updateSetting).not.toHaveBeenCalledWith('right_pane_mode', 'details');
    expect(screen.queryByTestId('details-panel')).toBeNull();
  });

  it('macOS: Cmd+I shows get info for single selection', async () => {
    mocks.settings = { ...mocks.settings, keymap_preset: 'macos' };
    mocks.selectedItems = [{ name: 'a.txt', path: '/tmp/a.txt', isDirectory: false }];

    const { default: MainLayout } = await import('../../src/layouts/MainLayout.jsx');

    render(<MainLayout />);
    await flush();

    const e = await fireKey({ key: 'i', code: 'KeyI', metaKey: true });

    expect(e.defaultPrevented).toBe(true);

    await waitFor(() => {
      expect(mocks.showProperties).toHaveBeenCalledTimes(1);
    });

    expect(mocks.showProperties).toHaveBeenCalledWith(mocks.selectedItems[0]);
    expect(mocks.updateSetting).toHaveBeenCalledWith('right_pane_mode', 'details');
  });
});
