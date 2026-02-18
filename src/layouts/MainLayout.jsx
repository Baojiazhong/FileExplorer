import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTheme } from '../providers/ThemeProvider';
import { useFileSystem } from '../providers/FileSystemProvider';
import { useContextMenu } from '../providers/ContextMenuProvider';
import { useHistory } from '../providers/HistoryProvider';
import { useSettings } from '../providers/SettingsProvider';
import { useSftp } from '../providers/SftpProvider';
import { invoke } from '@tauri-apps/api/core';
import { showError, showConfirm, showSuccess } from '../utils/NotificationSystem';
import { getFileType } from '../utils/formatters';

// Core Components
import Sidebar from '../components/sidebar/Sidebar';
import PathBreadcrumb from '../components/explorer/PathBreadcrumb';
import NavigationButtons from '../components/explorer/NavigationButtons';
import FileList from '../components/explorer/FileList';
import DetailsPanel from '../components/explorer/DetailsPanel';
import ContextMenu from '../components/contextMenu/ContextMenu';
import ViewModes from '../components/explorer/ViewModes';

// Additional Components
import CreateFileButton from '../components/explorer/CreateFileButton';
import RenameModal from '../components/common/RenameModal';
import Terminal from '../components/terminal/Terminal';
import TabManager from '../components/tabs/TabManager';
import GlobalSearch from '../components/search/GlobalSearch';
import SettingsPanel from '../components/settings/SettingsPanel';
import ThisPCView from '../components/thisPc/ThisPCView';
import NetworkView from '../components/network/NetworkView';
import TemplateList from '../components/templates/TemplateList';
import PreviewModal from '../components/preview/PreviewModal';
import PreviewPane from '../components/preview/PreviewPane';

// Hash Modals
import HashFileModal from '../components/common/HashFileModal.jsx';
import HashCompareModal from '../components/common/HashCompareModal.jsx';
import HashDisplayModal from '../components/common/HashDisplayModal.jsx';

// Settings Applier
import SettingsApplier from '../utils/SettingsApplier.js';

// Hooks
import { usePreview } from '../hooks/usePreview';
import { usePreviewPane } from '../hooks/usePreviewPane';

import '../styles/layouts/mainLayout.css';
import {replaceFileName} from "../utils/pathUtils.js";
import {
    computeParentPath,
    getSystemInfoOnce,
    KEYMAP_PRESETS,
    matchesShortcut,
    resolvePreset,
    shouldIgnoreKeyEvent,
} from '../utils/keymap.js';
import { registerKeydownHandler, KEYDOWN_PRIORITIES } from '../utils/keyboard.js';

/**
 * MainLayout component that serves as the primary layout structure for the application.
 * Manages UI state, event handling, and renders the main application interface.
 *
 * @returns {JSX.Element} The MainLayout component
 */
const MainLayout = () => {
    const { theme, toggleTheme } = useTheme();
    const { isLoading, currentDirData, selectedItems, loadDirectory, volumes, focusedItem, setFocusedItem, renameItem: fsRenameItem, openFile } = useFileSystem();
    const { isSftpPath, parseSftpPath } = useSftp();
    const { 
        isOpen: isContextMenuOpen, 
        position, 
        items, 
        closeContextMenu, 
        clipboard,
        copyToClipboard,
        cutToClipboard,
        pasteFromClipboard,
        deleteItems,
        showProperties
    } = useContextMenu();
    const { currentPath, navigateTo, goBack, goForward } = useHistory();
    const { settings, updateSetting } = useSettings();


    const containerRef = useRef(null);
    const isResizingRef = useRef(false);
    const startXRef = useRef(0);
    const startWidthRef = useRef(0);
    const rightPaneWidthRef = useRef(settings.right_pane_width || 300);
    const updateSettingRef = useRef(updateSetting);

    useEffect(() => {
        updateSettingRef.current = updateSetting;
    }, [updateSetting]);

    // UI State - Initialize from settings
    const [rightPaneMode, setRightPaneMode] = useState(settings.right_pane_mode || 'none');
    const [rightPaneWidth, setRightPaneWidth] = useState(settings.right_pane_width || 300);

    const [isTerminalOpen, setIsTerminalOpen] = useState(false);
    const [viewMode, setViewMode] = useState(settings.default_view || 'grid');
    const [searchValue, setSearchValue] = useState('');
    const [searchResults, setSearchResults] = useState(null);
    const [currentView, setCurrentView] = useState('explorer'); // 'explorer', 'this-pc', 'templates'



    // Modal states
    const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
     const [isSettingsOpen, setIsSettingsOpen] = useState(false);
     const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);

    const [systemInfo, setSystemInfo] = useState(null);

    const [itemToRename, setItemToRename] = useState(null);

    // Text viewer modal state
    const [isTextViewerOpen, setIsTextViewerOpen] = useState(false);
    const [textViewerContent, setTextViewerContent] = useState('');
    const [textViewerFileName, setTextViewerFileName] = useState('');

    // Hash Modal states
    const [isHashFileModalOpen, setIsHashFileModalOpen] = useState(false);
    const [isHashCompareModalOpen, setIsHashCompareModalOpen] = useState(false);
    const [isHashDisplayModalOpen, setIsHashDisplayModalOpen] = useState(false);
    const [hashModalItem, setHashModalItem] = useState(null);
    const [hashDisplayData, setHashDisplayData] = useState({ hash: '', fileName: '' });
    const [columnsPerRow, setColumnsPerRow] = useState(4); // Track columns for preview navigation

    // Get terminal height for padding calculations
    const terminalHeight = settings.terminal_height || 240;

    // Get sorted data the same way FileList does (folders first + default sort from settings)
    const getSortedData = useCallback(() => {
        const data = searchResults || currentDirData;
        if (!data || (!data.directories?.length && !data.files?.length)) {
            return [];
        }

        // Combine directories and files for sorting (same shape as FileList)
        const combinedItems = [
            ...(data.directories || []).map(dir => ({ ...dir, isDirectory: true })),
            ...(data.files || []).map(file => ({ ...file, isDirectory: false }))
        ];

        const sortBy = settings?.sort_by;
        const sortDirection = settings?.sort_direction;
        const direction = sortDirection === 'Descending' ? 'desc' : 'asc';

        const key = (() => {
            switch (sortBy) {
                case 'Size':
                    return 'size_in_bytes';
                case 'Modified':
                case 'Date':
                    return 'last_modified';
                case 'Type':
                    return 'type';
                case 'Name':
                default:
                    return 'name';
            }
        })();

        // Always put directories first.
        return [...combinedItems].sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;

            let aValue;
            let bValue;

            if (key === 'size_in_bytes') {
                aValue = a.isDirectory ? -1 : a.size_in_bytes || 0;
                bValue = b.isDirectory ? -1 : b.size_in_bytes || 0;
            } else if (key === 'type') {
                aValue = a.isDirectory ? 'Folder' : (a.name ? getFileType(a.name) : '');
                bValue = b.isDirectory ? 'Folder' : (b.name ? getFileType(b.name) : '');
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
            } else if (key === 'created' || key === 'last_modified' || key === 'accessed') {
                aValue = new Date(a[key]).getTime();
                bValue = new Date(b[key]).getTime();
            } else {
                aValue = a[key];
                bValue = b[key];
                if (typeof aValue === 'string' && typeof bValue === 'string') {
                    aValue = aValue.toLowerCase();
                    bValue = bValue.toLowerCase();
                }
            }

            if (aValue < bValue) return direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [searchResults, currentDirData, settings?.sort_by, settings?.sort_direction]);

    // Initialize preview functionality
    const getFocusedItem = () => {
        // For search results, use the focused item from search
        if (searchResults && searchResults.length > 0) {
            // This would need to be implemented in search components
            return null; // Placeholder for now
        }
        
        // For regular file list, use the focused item from FileSystemProvider
        return focusedItem;
    };

    const navigateUp = useCallback(() => {
        const sortedItems = getSortedData();
        if (!sortedItems.length) return null;

        const currentIndex = focusedItem ? sortedItems.findIndex(item => item.path === focusedItem.path) : -1;

        // If nothing is focused yet, start at the first item.
        if (currentIndex === -1) {
            setFocusedItem(sortedItems[0]);
            return sortedItems[0];
        }

        const newIndex = currentIndex - columnsPerRow;

        let nextItem;
        if (newIndex >= 0) {
            nextItem = sortedItems[newIndex];
        } else {
            // Wrap to bottom row
            const remainder = currentIndex % columnsPerRow;
            const totalRows = Math.ceil(sortedItems.length / columnsPerRow);
            const lastRowStartIndex = (totalRows - 1) * columnsPerRow;
            const targetIndex = Math.min(lastRowStartIndex + remainder, sortedItems.length - 1);
            nextItem = sortedItems[targetIndex];
        }

        setFocusedItem(nextItem);
        return nextItem;
    }, [getSortedData, focusedItem, setFocusedItem, columnsPerRow]);

    const navigateDown = useCallback(() => {
        const sortedItems = getSortedData();
        if (!sortedItems.length) return null;

        const currentIndex = focusedItem ? sortedItems.findIndex(item => item.path === focusedItem.path) : -1;

        // If nothing is focused yet, start at the first item.
        if (currentIndex === -1) {
            setFocusedItem(sortedItems[0]);
            return sortedItems[0];
        }

        const newIndex = currentIndex + columnsPerRow;

        let nextItem;
        if (newIndex < sortedItems.length) {
            nextItem = sortedItems[newIndex];
        } else {
            // Wrap to top row
            const remainder = currentIndex % columnsPerRow;
            nextItem = sortedItems[remainder];
        }

        setFocusedItem(nextItem);
        return nextItem;
    }, [getSortedData, focusedItem, setFocusedItem, columnsPerRow]);

    const navigateLeft = useCallback(() => {
        const sortedItems = getSortedData();
        if (!sortedItems.length) return null;

        const currentIndex = focusedItem ? sortedItems.findIndex(item => item.path === focusedItem.path) : -1;

        // If nothing is focused yet, start at the first item.
        if (currentIndex === -1) {
            setFocusedItem(sortedItems[0]);
            return sortedItems[0];
        }

        let nextItem;
        if (currentIndex % columnsPerRow === 0) {
            // At leftmost column, wrap to rightmost of same row or previous row
            const currentRow = Math.floor(currentIndex / columnsPerRow);
            const nextRowLastIndex = Math.min((currentRow + 1) * columnsPerRow - 1, sortedItems.length - 1);
            nextItem = sortedItems[nextRowLastIndex];
        } else {
            nextItem = sortedItems[currentIndex - 1];
        }

        setFocusedItem(nextItem);
        return nextItem;
    }, [getSortedData, focusedItem, setFocusedItem, columnsPerRow]);

    const navigateRight = useCallback(() => {
        const sortedItems = getSortedData();
        if (!sortedItems.length) return null;

        const currentIndex = focusedItem ? sortedItems.findIndex(item => item.path === focusedItem.path) : -1;

        // If nothing is focused yet, start at the first item.
        if (currentIndex === -1) {
            setFocusedItem(sortedItems[0]);
            return sortedItems[0];
        }

        let nextItem;
        if ((currentIndex + 1) % columnsPerRow === 0 || currentIndex === sortedItems.length - 1) {
            // At rightmost column or last item, wrap to leftmost of same row
            const currentRow = Math.floor(currentIndex / columnsPerRow);
            const rowStartIndex = currentRow * columnsPerRow;
            nextItem = sortedItems[rowStartIndex];
        } else {
            nextItem = sortedItems[currentIndex + 1];
        }

        setFocusedItem(nextItem);
        return nextItem;
    }, [getSortedData, focusedItem, setFocusedItem, columnsPerRow]);

    const overlayBlocksKeyboard =
        isGlobalSearchOpen ||
        isSettingsOpen ||
        isRenameModalOpen ||
        isTextViewerOpen ||
        isHashFileModalOpen ||
        isHashCompareModalOpen ||
        isHashDisplayModalOpen ||
        isContextMenuOpen;

    const { 
        open: isPreviewOpen, 
        payload: previewPayload, 
        isLoading: isPreviewLoading,
        closePreview 
    } = usePreview(getFocusedItem, navigateUp, navigateDown, navigateLeft, navigateRight, {
        // Allow Space to open Preview Modal only when no other overlay is active.
        keyHandlingEnabled: !overlayBlocksKeyboard,
    });
 
    const {
        payload: previewPanePayload,
        isLoading: isPreviewPaneLoading,
    } = usePreviewPane({
        enabled: rightPaneMode === 'preview' && currentView === 'explorer',
        selectedItem: selectedItems.length === 1 ? selectedItems[0] : null,
        isMultipleSelection: selectedItems.length > 1,
    });


    /**
     * Effect to update UI state when settings change
     */
    useEffect(() => {
        if (settings.right_pane_mode !== undefined) {
            setRightPaneMode(settings.right_pane_mode || 'none');
        }
        if (settings.right_pane_width !== undefined) {
            setRightPaneWidth(settings.right_pane_width || 300);
        }
    }, [settings.right_pane_mode, settings.right_pane_width]);


    /**
     * Effect to update view mode when settings change
     */
    useEffect(() => {
        if (settings.default_view) {
            setViewMode(settings.default_view);
        }
    }, [settings.default_view]);
    /**
     * Load OS/system info once (used for keymap auto preset resolution).
     */
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const info = await getSystemInfoOnce();
            if (!cancelled) setSystemInfo(info);
        })();
        return () => {
            cancelled = true;
        };
    }, []);


    /**
      * Effect to load default location on first render
      */
    useEffect(() => {
        if (volumes.length > 0 && !currentDirData && !currentPath) {
            // Show This PC view by default
            setCurrentView('this-pc');
        }
    }, [volumes, currentDirData, currentPath]);

    /**
     * Effect to auto-start indexing when app loads
     */
    useEffect(() => {
        const initializeSearchEngine = async () => {
            if (volumes.length > 0) {
                try {
                    console.log('MainLayout: Checking search engine status for auto-indexing...');

                    // Check if search engine has indexed files
                    const searchEngineInfo = await invoke('get_search_engine_info');
                    const hasNoIndexedFiles = !searchEngineInfo.stats?.trie_size || searchEngineInfo.stats.trie_size === 0;

                    console.log('MainLayout: Search engine info:', searchEngineInfo);
                    console.log('MainLayout: Has no indexed files:', hasNoIndexedFiles);

                    if (hasNoIndexedFiles) {
                        console.log('MainLayout: Starting auto-indexing of home directory...');

                        // Get system info to get the proper home directory
                        const metaDataJson = await invoke('get_meta_data_as_json');
                        const metaData = JSON.parse(metaDataJson);

                        if (!metaData.user_home_dir) {
                            console.error('MainLayout: User home directory not available');
                            return;
                        }

                        console.log('MainLayout: Using home directory:', metaData.user_home_dir);

                        // Auto-index home directory on app startup
                        const result = await invoke('add_paths_recursive_async', {
                            folder: metaData.user_home_dir
                        });

                        console.log('MainLayout: Auto-indexing initiated:', result);
                        showSuccess('Background indexing finished');
                    } else {
                        console.log('MainLayout: Search engine already has indexed files, skipping auto-indexing');
                    }
                } catch (error) {
                    console.error('MainLayout: Auto-indexing failed:', error);
                    // Don't show error to user as this is background operation
                }
            }
        };

        // Only run once when volumes are first loaded
        if (volumes.length > 0) {
            initializeSearchEngine();
        }
    }, [volumes.length]); // Only depend on volumes.length to avoid re-running


    /**
     * Effect to listen for custom events
     * Improved with debug information
     */
    useEffect(() => {
        /**
         * Handler for opening templates view
         */
        const handleOpenTemplates = () => {
            setCurrentView('templates');
            navigateTo(null); // Clear explorer path
        };


        /**
         * Handler for showing properties panel
         */
        const handleShowProperties = (e) => {
            // Properties should show Details pane.
            setRightPaneMode('details');

            // Persist so it survives restarts.
            updateSetting('right_pane_mode', 'details');
        };

        /**
         * Handler for opening This PC view
         */
        const handleOpenThisPC = () => {
            setCurrentView('this-pc');
            navigateTo(null); // Clear explorer path bug fix
        };

        /**
         * Handler for opening Network view
         */
        const handleOpenNetwork = () => {
            setCurrentView('network');
            navigateTo(null); // Clear explorer path
        };

        /**
         * Handler for opening settings panel
         */
        const handleOpenSettings = () => {
            setIsSettingsOpen(true);
        };

        /**
         * Handler for toggling terminal visibility
         */
        const handleToggleTerminal = () => {
            setIsTerminalOpen(prev => !prev);
        };

        /**
         * Handler for opening rename modal
         * @param {CustomEvent} e - Event with item details
         */
        const handleOpenRenameModal = (e) => {
            if (e.detail && e.detail.item && typeof e.detail.item === 'object') {
                // Close any existing modal first to prevent duplicates
                setIsRenameModalOpen(false);
                setItemToRename(null);
                
                // Small delay to ensure cleanup, then open new modal
                setTimeout(() => {
                    // Double-check the item is still valid before setting it
                    if (e.detail.item && typeof e.detail.item === 'object' && e.detail.item.name) {
                        setItemToRename(e.detail.item);
                        setIsRenameModalOpen(true);
                    }
                }, 10);
            }
        };

        // Improved hash event handlers with debug information
        /**
         * Handler for opening hash file modal
         * @param {CustomEvent} e - Event with item details
         */
        const handleOpenHashFileModal = (e) => {
            console.log('MainLayout: Received open-hash-file-modal event:', e.detail);
            if (e.detail && e.detail.item) {
                console.log('Opening Hash File Modal for:', e.detail.item.name);
                setHashModalItem(e.detail.item);
                setIsHashFileModalOpen(true);
            } else {
                console.log('Invalid event detail:', e.detail);
            }
        };

        /**
         * Handler for opening hash compare modal
         * @param {CustomEvent} e - Event with item details
         */
        const handleOpenHashCompareModal = (e) => {
            console.log('MainLayout: Received open-hash-compare-modal event:', e.detail);
            if (e.detail && e.detail.item) {
                console.log('Opening Hash Compare Modal for:', e.detail.item.name);
                setHashModalItem(e.detail.item);
                setIsHashCompareModalOpen(true);
            } else {
                console.log('Invalid event detail:', e.detail);
            }
        };

        // Hash Display Modal Handler
        const handleOpenHashDisplayModal = (e) => {
            console.log('Opening Hash Display Modal:', e.detail);
            if (e.detail?.hash && e.detail?.fileName) {
                setHashDisplayData({ hash: e.detail.hash, fileName: e.detail.fileName });
                setIsHashDisplayModalOpen(true);
            } else {
                console.log('Invalid hash display event detail:', e.detail);
            }
        };

        // SFTP File Opened Handler
        const handleSftpFileOpened = (e) => {
            console.log('SFTP File Opened:', e.detail);
            if (e.detail?.path && e.detail?.content !== undefined) {
                const fileName = e.detail.path.split('/').pop() || 'Unknown File';
                setTextViewerFileName(fileName);
                setTextViewerContent(e.detail.content);
                setIsTextViewerOpen(true);
            }
        };

        const handleForceExplorerView = () => setCurrentView('explorer');

        // Register event listeners
        document.addEventListener('open-templates', handleOpenTemplates);
        document.addEventListener('show-properties', handleShowProperties);
        document.addEventListener('open-this-pc', handleOpenThisPC);
        document.addEventListener('open-network', handleOpenNetwork);
        document.addEventListener('open-settings', handleOpenSettings);
        document.addEventListener('toggle-terminal', handleToggleTerminal);
        document.addEventListener('open-rename-modal', handleOpenRenameModal);
        document.addEventListener('open-hash-file-modal', handleOpenHashFileModal);
        document.addEventListener('open-hash-compare-modal', handleOpenHashCompareModal);
        document.addEventListener('open-hash-display-modal', handleOpenHashDisplayModal);
        document.addEventListener('sftp-file-opened', handleSftpFileOpened);
        document.addEventListener('force-explorer-view', handleForceExplorerView);

        console.log('MainLayout: All event listeners registered');

        return () => {
            document.removeEventListener('open-templates', handleOpenTemplates);
            document.removeEventListener('show-properties', handleShowProperties);
            document.removeEventListener('open-this-pc', handleOpenThisPC);
            document.removeEventListener('open-network', handleOpenNetwork);
            document.removeEventListener('open-settings', handleOpenSettings);
            document.removeEventListener('toggle-terminal', handleToggleTerminal);
            document.removeEventListener('open-rename-modal', handleOpenRenameModal);
            document.removeEventListener('open-hash-file-modal', handleOpenHashFileModal);
            document.removeEventListener('open-hash-compare-modal', handleOpenHashCompareModal);
            document.removeEventListener('open-hash-display-modal', handleOpenHashDisplayModal);
            document.removeEventListener('sftp-file-opened', handleSftpFileOpened);
            document.removeEventListener('force-explorer-view', handleForceExplorerView);
            console.log('MainLayout: All event listeners removed');
        };
    }, [navigateTo, updateSetting]);


    /**
     * Effect to switch to explorer view when navigating to a directory
     */
    useEffect(() => {
        if (currentPath && currentView !== 'explorer') {
            setCurrentView('explorer');
        }
    }, [currentPath, currentView]);


    /**
     * Handles search functionality
     * @param {string} value - The search query
     */
    const handleSearch = useCallback((value) => {
        setSearchValue(value);

        if (!value.trim()) {
            setSearchResults(null);
            return;
        }

        // Simple local search for now
        if (currentDirData) {
            const filteredFiles = currentDirData.files.filter(file =>
                file.name.toLowerCase().includes(value.toLowerCase())
            );

            const filteredDirs = currentDirData.directories.filter(dir =>
                dir.name.toLowerCase().includes(value.toLowerCase())
            );

            setSearchResults({
                directories: filteredDirs,
                files: filteredFiles
            });
        }
    }, [currentDirData]);

    // Keyboard shortcuts effect is defined later (after pane toggle handlers)
    // so it doesn't reference callbacks before initialization.


    useEffect(() => {
        const onBack = () => {
            goBack();
        };
        const onForward = () => {
            goForward();
        };
        document.addEventListener('history-back', onBack);
        document.addEventListener('history-forward', onForward);
        return () => {
            document.removeEventListener('history-back', onBack);
            document.removeEventListener('history-forward', onForward);
        };
    }, [goBack, goForward]);

    /**
      * Copies current path to clipboard
      * For SFTP paths, copies the standard URL format
      */
    const copyCurrentPath = useCallback(async () => {
        if (!currentPath) return;

        try {
            let pathToCopy = currentPath;
            
            // For SFTP paths, copy the standard URL format instead of internal format
            if (isSftpPath(currentPath)) {
                const parsed = parseSftpPath(currentPath);
                if (parsed && parsed.connection) {
                    const remotePath = parsed.remotePath || '/';
                    // Ensure path starts with forward slash
                    const formattedPath = remotePath.startsWith('/') ? remotePath : `/${remotePath}`;
                    pathToCopy = `sftp://${parsed.connection.username}@${parsed.connection.host}:${parsed.connection.port}${formattedPath}`;
                }
            }
            
            await navigator.clipboard.writeText(pathToCopy);
            // Show temporary notification
            const notification = document.createElement('div');
            notification.textContent = 'Path copied to clipboard';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: var(--accent);
                color: white;
                padding: 12px 20px;
                border-radius: 6px;
                z-index: 10000;
                animation: slideIn 0.3s ease-out;
            `;
            document.body.appendChild(notification);
            setTimeout(() => {
                notification.remove();
            }, 2000);
        } catch (error) {
            console.error('Failed to copy path:', error);
        }
    }, [currentPath, isSftpPath, parseSftpPath]);

    /**
     * Handles renaming a file or directory
     * @param {Object} item - The item to rename
     * @param {string} newName - The new name
     */
    const handleRename = async (item, newName) => {
        console.log('handleRename called with:', { item, newName });
        
        if (!newName || newName === item.name) {
            console.log('handleRename: Early return - newName is empty or same as current name');
            return;
        }

        console.log(`Renaming "${replaceFileName(item.path, newName)}"`);

        try {
            const separator = item.path.includes('\\') ? '\\' : '/';

            console.log("Debug - separator detected:", separator);
            console.log("Debug - original path:", item.path);

            const pathParts = item.path.split(separator);
            pathParts[pathParts.length - 1] = newName;
            const newPath = pathParts.join(separator);

            console.log("Debug - new path:", newPath);

            // Use FileSystemProvider's renameItem which handles both local and SFTP paths
            await fsRenameItem(item.path, newPath);
        } catch (error) {
            console.error('Rename operation failed:', error);
            if (error.message && error.message.includes('already exists')) {
                const shouldCreateCopy = await showConfirm(`A file named "${newName}" already exists. Create a copy instead?`, 'File Exists');
                if (shouldCreateCopy) {
                    const extension = newName.includes('.') ? newName.split('.').pop() : '';
                    const baseName = extension ? newName.replace(`.${extension}`, '') : newName;
                    const copyName = extension ? `${baseName} - Copy.${extension}` : `${baseName} - Copy`;
                    handleRename(item, copyName);
                }
            } else {
                showError(`Failed to rename: ${error.message || error}`);
            }
        }
    };

    /**
     * Handles view mode change with settings persistence
     * @param {string} newMode - The new view mode
     */
    const handleViewModeChange = useCallback(async (newMode) => {
        setViewMode(newMode);

        // Save to settings
        try {
            await updateSetting('default_view', newMode);
        } catch (error) {
            console.error('Failed to save view mode setting:', error);
        }
    }, [updateSetting]);


    /**
     * Handles details panel toggle with settings persistence
     */
    const handleDetailsPanelToggle = useCallback(async () => {
        const newMode = rightPaneMode === 'details' ? 'none' : 'details';
        setRightPaneMode(newMode);

        try {
            await updateSetting('right_pane_mode', newMode);
        } catch (error) {
            console.error('Failed to save right pane mode setting:', error);
        }
    }, [rightPaneMode, updateSetting]);

    const handlePreviewPaneToggle = useCallback(async () => {
        const newMode = rightPaneMode === 'preview' ? 'none' : 'preview';
        setRightPaneMode(newMode);

        try {
            await updateSetting('right_pane_mode', newMode);
        } catch (error) {
            console.error('Failed to save right pane mode setting:', error);
        }
    }, [rightPaneMode, updateSetting]);

    /**
     * Effect to handle keyboard shortcuts (OS-native presets)
     */
    useEffect(() => {
        const resolvedPreset = resolvePreset({
            selectedPreset: settings.keymap_preset,
            runningOs: systemInfo?.current_running_os,
        });

        return registerKeydownHandler(
            (e) => {
                if (e.defaultPrevented) return false;

                // Never steal keystrokes while typing.
                if (shouldIgnoreKeyEvent(e)) return false;

                // Preview modal owns Space/Esc/arrows; avoid triggering actions underneath.
                if (isPreviewOpen) return false;

                // If global search modal is open, avoid conflicting with its internal key handling.
                if (isGlobalSearchOpen) return false;

                // If any modal/overlay is open, don't fire app-level shortcuts underneath it.
                if (
                    isSettingsOpen ||
                    isRenameModalOpen ||
                    isTextViewerOpen ||
                    isHashFileModalOpen ||
                    isHashCompareModalOpen ||
                    isHashDisplayModalOpen ||
                    isContextMenuOpen
                ) {
                    return false;
                }

                // Settings: Ctrl/Cmd+,
                if ((e.ctrlKey || e.metaKey) && e.key === ',') {
                    e.preventDefault();
                    setIsSettingsOpen(true);
                    return true;
                }

                // Global search: Ctrl/Cmd+Shift+F
                if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
                    e.preventDefault();
                    setIsGlobalSearchOpen(true);
                    return true;
                }

                // Local search focus: Ctrl/Cmd+F
                if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'F' || e.key === 'f')) {
                    // Prevent browser find.
                    e.preventDefault();
                    // Let PathBreadcrumb decide how to open/focus its local-search input.
                    document.dispatchEvent(new CustomEvent('open-local-search'));
                    return true;
                }

                // New folder: Ctrl/Cmd+Shift+N
                if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'N' || e.key === 'n')) {
                    e.preventDefault();
                    document.dispatchEvent(new CustomEvent('create-folder'));
                    return true;
                }

                // New file: Ctrl/Cmd+N
                if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'N' || e.key === 'n')) {
                    e.preventDefault();
                    document.dispatchEvent(new CustomEvent('create-file'));
                    return true;
                }

                // Toggle terminal: Ctrl/Cmd+`
                if ((e.ctrlKey || e.metaKey) && e.key === '`') {
                    e.preventDefault();
                    setIsTerminalOpen(prev => !prev);
                    return true;
                }

                // Escape: clear selection
                // Only clear selection when no other overlay is trying to consume Escape.
                if (e.key === 'Escape') {
                    if (e.defaultPrevented) return false;
                    document.dispatchEvent(new CustomEvent('clear-selection'));
                    return true;
                }

                // OS-native: rename
                // - Windows/Linux: F2
                // - macOS Finder: Enter
                if (resolvedPreset !== KEYMAP_PRESETS.MACOS) {
                    if (e.key === 'F2' && selectedItems.length === 1) {
                        e.preventDefault();
                        document.dispatchEvent(new CustomEvent('open-rename-modal', {
                            detail: { item: selectedItems[0] },
                        }));
                        return true;
                    }
                } else {
                    if ((e.key === 'Enter' || e.key === 'NumpadEnter') && selectedItems.length === 1) {
                        e.preventDefault();
                        document.dispatchEvent(new CustomEvent('open-rename-modal', {
                            detail: { item: selectedItems[0] },
                        }));
                        return true;
                    }
                }
 
                // OS-native: properties / get info
                // - Windows Explorer: Alt+Enter
                // - Ubuntu Files (Nautilus): Alt+Enter
                // - macOS Finder: Cmd+I
                if (selectedItems.length === 1) {
                    if (resolvedPreset === KEYMAP_PRESETS.MACOS) {
                        if (matchesShortcut(e, { meta: true, code: 'KeyI' })) {
                            e.preventDefault();
                            setRightPaneMode('details');
                            showProperties(selectedItems[0]);
                            updateSetting('right_pane_mode', 'details').catch((error) => {
                                console.error('Failed to save right pane mode setting:', error);
                            });
                            return true;
                        }
                    } else {
                        if (e.altKey && (e.key === 'Enter' || e.key === 'NumpadEnter')) {
                            e.preventDefault();
                            setRightPaneMode('details');
                            showProperties(selectedItems[0]);
                            updateSetting('right_pane_mode', 'details').catch((error) => {
                                console.error('Failed to save right pane mode setting:', error);
                            });
                            return true;
                        }
                    }
                }

                // OS-native: open (macOS uses Cmd+O)
                if (resolvedPreset === KEYMAP_PRESETS.MACOS) {
                    if (matchesShortcut(e, { meta: true, code: 'KeyO' })) {
                        const targetItem = selectedItems.length === 1 ? selectedItems[0] : focusedItem;
                        if (!targetItem) return false;
 
                        e.preventDefault();
                        if (targetItem.isDirectory) {
                            loadDirectory(targetItem.path);
                        } else {
                            openFile(targetItem.path);
                        }
                        return true;
                    }
                }

                // Trash (no permanent delete shortcut in phase 1)
                // - Windows/Linux: Delete
                // - macOS: Cmd+Backspace
                if (resolvedPreset === KEYMAP_PRESETS.MACOS) {
                    if (matchesShortcut(e, { meta: true, key: 'Backspace' })) {
                        if (selectedItems.length === 0) return false;
                        e.preventDefault();
                        deleteItems(selectedItems);
                        return true;
                    }
                } else {
                    if (e.key === 'Delete') {
                        if (selectedItems.length === 0) return false;
                        e.preventDefault();
                        deleteItems(selectedItems);
                        return true;
                    }
                }

                // Copy/Cut/Paste
                if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'c' || e.key === 'C')) {
                    if (selectedItems.length === 0) return false;
                    e.preventDefault();
                    copyToClipboard(selectedItems);
                    return true;
                }
                if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'x' || e.key === 'X')) {
                    if (selectedItems.length === 0) return false;
                    e.preventDefault();
                    cutToClipboard(selectedItems);
                    return true;
                }
                if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'v' || e.key === 'V')) {
                    if (!clipboard.items || clipboard.items.length === 0) return false;
                    e.preventDefault();
                    pasteFromClipboard();
                    return true;
                }

                // Navigation
                if (resolvedPreset === KEYMAP_PRESETS.MACOS) {
                    if (matchesShortcut(e, { meta: true, code: 'BracketLeft' })) {
                        e.preventDefault();
                        document.dispatchEvent(new CustomEvent('history-back'));
                        return true;
                    }
                    if (matchesShortcut(e, { meta: true, code: 'BracketRight' })) {
                        e.preventDefault();
                        document.dispatchEvent(new CustomEvent('history-forward'));
                        return true;
                    }
                    if (matchesShortcut(e, { meta: true, key: 'ArrowUp' })) {
                        if (!currentPath) return false;
                        e.preventDefault();
                        const parent = computeParentPath(currentPath);
                        if (parent && parent !== currentPath) loadDirectory(parent);
                        return true;
                    }
                } else {
                    if (matchesShortcut(e, { alt: true, key: 'ArrowLeft' })) {
                        e.preventDefault();
                        document.dispatchEvent(new CustomEvent('history-back'));
                        return true;
                    }
                    if (matchesShortcut(e, { alt: true, key: 'ArrowRight' })) {
                        e.preventDefault();
                        document.dispatchEvent(new CustomEvent('history-forward'));
                        return true;
                    }
                    if (matchesShortcut(e, { alt: true, key: 'ArrowUp' })) {
                        if (!currentPath) return false;
                        e.preventDefault();
                        const parent = computeParentPath(currentPath);
                        if (parent && parent !== currentPath) loadDirectory(parent);
                        return true;
                    }
                }

                // Refresh
                if (resolvedPreset === KEYMAP_PRESETS.WINDOWS) {
                    if (e.key === 'F5') {
                        if (!currentPath) return false;
                        e.preventDefault();
                        loadDirectory(currentPath);
                        return true;
                    }
                } else if (resolvedPreset === KEYMAP_PRESETS.LINUX) {
                    if (matchesShortcut(e, { ctrl: true, code: 'KeyR' })) {
                        if (!currentPath) return false;
                        e.preventDefault();
                        loadDirectory(currentPath);
                        return true;
                    }
                } else if (resolvedPreset === KEYMAP_PRESETS.MACOS) {
                    if (matchesShortcut(e, { meta: true, code: 'KeyR' })) {
                        if (!currentPath) return false;
                        e.preventDefault();
                        loadDirectory(currentPath);
                        return true;
                    }
                }

                // Right pane toggles: intentionally not bound for Linux in phase 1.
                if (resolvedPreset === KEYMAP_PRESETS.WINDOWS) {
                    if (matchesShortcut(e, { alt: true, code: 'KeyP' })) {
                        e.preventDefault();
                        handlePreviewPaneToggle();
                        return true;
                    }
                }
                 if (resolvedPreset === KEYMAP_PRESETS.MACOS) {
                     // Finder: Shift+Cmd+P toggles preview pane
                     if (matchesShortcut(e, { meta: true, shift: true, code: 'KeyP' })) {
                         e.preventDefault();
                         handlePreviewPaneToggle();
                         return true;
                     }
                 }


                // Tabs (wired via document events)
                if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 't' || e.key === 'T')) {
                    e.preventDefault();
                    document.dispatchEvent(new CustomEvent('tab-new'));
                    return true;
                }
                if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'w' || e.key === 'W')) {
                    e.preventDefault();
                    document.dispatchEvent(new CustomEvent('tab-close'));
                    return true;
                }

                return false;
            },
            { id: 'mainlayout-keymap', name: 'MainLayout keymap', priority: KEYDOWN_PRIORITIES.APP }
        );
    }, [
        settings.keymap_preset,
        systemInfo?.current_running_os,
        selectedItems,
        focusedItem,
        clipboard.items,
        loadDirectory,
        openFile,
        deleteItems,
        copyToClipboard,
        cutToClipboard,
        pasteFromClipboard,
        currentPath,
        isGlobalSearchOpen,
        isPreviewOpen,
        handlePreviewPaneToggle,
        handleDetailsPanelToggle,
        isSettingsOpen,
        isRenameModalOpen,
        isTextViewerOpen,
        isHashFileModalOpen,
        isHashCompareModalOpen,
        isHashDisplayModalOpen,
        isContextMenuOpen,
    ]);

    const handleRightPaneResizeStart = useCallback((e) => {
        if (rightPaneMode === 'none') return;

        isResizingRef.current = true;
        startXRef.current = e.clientX;
        startWidthRef.current = rightPaneWidth;

        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
    }, [rightPaneMode, rightPaneWidth]);

    // Keep refs in sync so window listeners can read latest values.
    useEffect(() => {
        rightPaneWidthRef.current = rightPaneWidth;
    }, [rightPaneWidth]);

    useEffect(() => {
        const handleResizeMove = (e) => {
            if (!isResizingRef.current) return;

            const containerWidth = containerRef.current?.offsetWidth || 0;
            const deltaX = startXRef.current - e.clientX;

            const newWidth = Math.min(
                Math.max(200, startWidthRef.current + deltaX),
                containerWidth ? Math.max(200, containerWidth - 400) : startWidthRef.current + deltaX
            );

            setRightPaneWidth(newWidth);
        };

        const handleResizeEnd = async () => {
            if (!isResizingRef.current) return;

            isResizingRef.current = false;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';

            const widthToPersist = rightPaneWidthRef.current;
            try {
                await updateSettingRef.current('right_pane_width', widthToPersist);
            } catch (error) {
                console.error('Failed to save pane width setting:', error);
            }
        };

        window.addEventListener('mousemove', handleResizeMove);
        window.addEventListener('mouseup', handleResizeEnd);

        return () => {
            window.removeEventListener('mousemove', handleResizeMove);
            window.removeEventListener('mouseup', handleResizeEnd);
        };
    }, []);


    /**
     * Handles hidden files visibility toggle with settings persistence
     */
    const handleHiddenFilesToggle = useCallback(async () => {
        const newState = !settings.show_hidden_files_and_folders;
        
        try {
            await updateSetting('show_hidden_files_and_folders', newState);
            // Reload the current directory to reflect the change
            if (currentPath) {
                await loadDirectory(currentPath);
            }
        } catch (error) {
            console.error('Failed to toggle hidden files setting:', error);
        }
    }, [settings.show_hidden_files_and_folders, updateSetting, currentPath, loadDirectory]);

    // Hide the right pane outside explorer view (mode is still persisted for restarts).
    const isRightPaneVisible = currentView === 'explorer' && rightPaneMode !== 'none';


    const handleCut = useCallback(() => {
        if (selectedItems.length === 0) return;
        cutToClipboard(selectedItems);
    }, [selectedItems, cutToClipboard]);

    const handleCopy = useCallback(() => {
        if (selectedItems.length === 0) return;
        copyToClipboard(selectedItems);
    }, [selectedItems, copyToClipboard]);

    const handlePaste = useCallback(() => {
        if (!clipboard.items || clipboard.items.length === 0) return;
        pasteFromClipboard();
    }, [clipboard.items, pasteFromClipboard]);

    const handleRenameToolbar = useCallback(() => {
        if (selectedItems.length !== 1) return;
        // Directly dispatch the event instead of calling renameItem to avoid conflicts
        document.dispatchEvent(new CustomEvent('open-rename-modal', {
            detail: { item: selectedItems[0] }
        }));
    }, [selectedItems]);

    const handleDelete = useCallback(() => {
        if (selectedItems.length === 0) return;
        deleteItems(selectedItems);
    }, [selectedItems, deleteItems]);

    const handleProperties = useCallback(async () => {
        if (selectedItems.length === 0) return;

        // Windows Explorer-like: Properties opens Details pane.
        showProperties(selectedItems[0]);
        setRightPaneMode('details');

        try {
            await updateSetting('right_pane_mode', 'details');
        } catch (error) {
            console.error('Failed to save right pane mode setting:', error);
        }
    }, [selectedItems, showProperties, updateSetting]);


    /**
     * Effect to clear search when changing directory
     */
    useEffect(() => {
        setSearchValue('');
        setSearchResults(null);
    }, [currentDirData]);

    // Get the data to display
    const displayData = searchResults || currentDirData;

    /**
     * Renders the main content based on current view
     * @returns {JSX.Element} The main content component
     */
    const renderMainContent = () => {
        switch (currentView) {
            case 'this-pc':
                return <ThisPCView />;
            case 'network':
                return <NetworkView />;
            case 'templates':
                return <TemplateList onClose={() => {
                    setCurrentView('explorer');
                }} />;

            default:
                return (
                    <div className="files-container">
                        <div className="action-bar">
                            <div className="action-bar-left">
                                <CreateFileButton />
                                
                                <div className="action-divider"></div>
                                
                                <button
                                    className="icon-button"
                                    onClick={handleCut}
                                    disabled={selectedItems.length === 0}
                                    title="Cut (Ctrl+X)"
                                    aria-label="Cut selected items"
                                >
                                    <span className="icon icon-cut"></span>
                                </button>
                                
                                <button
                                    className="icon-button"
                                    onClick={handleCopy}
                                    disabled={selectedItems.length === 0}
                                    title="Copy (Ctrl+C)"
                                    aria-label="Copy selected items"
                                >
                                    <span className="icon icon-copy"></span>
                                </button>
                                
                                <button
                                    className="icon-button"
                                    onClick={handlePaste}
                                    disabled={!clipboard.items || clipboard.items.length === 0}
                                    title="Paste (Ctrl+V)"
                                    aria-label="Paste items"
                                >
                                    <span className="icon icon-paste"></span>
                                </button>
                                
                                <button
                                    className="icon-button"
                                    onClick={handleRenameToolbar}
                                    disabled={selectedItems.length !== 1}
                                    title="Rename (F2)"
                                    aria-label="Rename selected item"
                                >
                                    <span className="icon icon-rename"></span>
                                </button>
                                
                                <button
                                    className="icon-button"
                                    onClick={handleDelete}
                                    disabled={selectedItems.length === 0}
                                    title="Delete (Del)"
                                    aria-label="Delete selected items"
                                >
                                    <span className="icon icon-trash"></span>
                                </button>
                                
                                <button
                                    className="icon-button"
                                    onClick={handleProperties}
                                    disabled={selectedItems.length === 0}
                                    title="Properties (Alt+Enter)"
                                    aria-label="Show properties"
                                >
                                    <span className="icon icon-properties"></span>
                                </button>
                            </div>

                            <div className="action-bar-right">
                                {currentView === 'explorer' && (
                                    <ViewModes
                                        currentMode={viewMode}
                                        onChange={handleViewModeChange}
                                    />
                                )}
                                
                                <button
                                    className="icon-button"
                                    onClick={toggleTheme}
                                    title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
                                    aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                                >
                                    <span className={`icon ${theme === 'light' ? 'icon-moon' : 'icon-sun'}`}></span>
                                </button>
                                
                                <button
                                    className="icon-button toggle-hidden-files"
                                    onClick={handleHiddenFilesToggle}
                                    title={`${settings.show_hidden_files_and_folders ? 'Hide' : 'Show'} hidden files and folders`}
                                    aria-label="Toggle hidden files visibility"
                                >
                                    <span className={`icon ${settings.show_hidden_files_and_folders ? 'icon-eye' : 'icon-eye-off'}`}></span>
                                </button>
                                
                                <button
                                    className={`icon-button ${rightPaneMode === 'preview' ? 'active' : ''}`}
                                    onClick={handlePreviewPaneToggle}
                                    title="Preview Pane"
                                    aria-label="Toggle preview pane"
                                >
                                    <span className="icon icon-preview-pane"></span>
                                </button>

                                <button
                                    className={`icon-button ${rightPaneMode === 'details' ? 'active' : ''}`}
                                    onClick={handleDetailsPanelToggle}
                                    title="Details Panel"
                                    aria-label="Toggle details panel"
                                >
                                    <span className="icon icon-panel-right"></span>
                                </button>
                            </div>
                        </div>

                        <FileList
                            data={displayData}
                            isLoading={isLoading}
                            viewMode={viewMode}
                            isSearching={!!searchValue}
                            searchTerm={searchValue}
                            disableArrowKeys={
                                isPreviewOpen ||
                                isGlobalSearchOpen ||
                                isSettingsOpen ||
                                isRenameModalOpen ||
                                isTextViewerOpen ||
                                isHashFileModalOpen ||
                                isHashCompareModalOpen ||
                                isHashDisplayModalOpen ||
                                isContextMenuOpen
                            }
                            onColumnsChange={setColumnsPerRow}
                        />
                    </div>
                );
        }
    };

    // Removed SFTP event listener - now handled by SftpProvider

    // Removed renderSftpFileList - now handled seamlessly by the regular explorer view

    return (
        <div className={`main-layout ${isTerminalOpen ? 'with-terminal' : ''}`}>
            {/* Settings Applier - applies settings to DOM */}
            <SettingsApplier />

            {/* Full-width tabs at the top */}
            <TabManager>
                {/* Full-width toolbar */}
                <div className="toolbar">
                        <div className="toolbar-left">
                            <NavigationButtons />
                            <PathBreadcrumb
                                onCopyPath={copyCurrentPath}
                                isVisible={currentView === 'explorer'}
                                onSearch={handleSearch}
                            />
                        </div>
                        <div className="toolbar-center">
                        </div>
                        <div className="toolbar-right">
                            <button
                                className="icon-button"
                                onClick={() => setIsGlobalSearchOpen(true)}
                                title="Global Search (Ctrl+Shift+F)"
                                aria-label="Global Search"
                            >
                                <span className="icon icon-search-global"></span>
                            </button>
                        </div>
                </div>

                <div className="layout-content">
                    {/* Sidebar */}
                    <Sidebar
                        onTerminalToggle={() => setIsTerminalOpen(!isTerminalOpen)}
                        isTerminalOpen={isTerminalOpen}
                        currentView={currentView}
                    />

                    {/* Main content area */}
                    <div className="content-area">
                        {/* Main content with file list and optional details panel */}
                         <div
                             className="main-content"
                             ref={containerRef}
                             style={{
                                 ...(isTerminalOpen ? { paddingBottom: `${terminalHeight}px` } : {}),
                                 '--details-panel-width': `${rightPaneWidth}px`,
                             }}
                         >

                            {renderMainContent()}

                             {/* Right pane: Preview or Details (mutually exclusive) */}
                             {isRightPaneVisible && (
                                 <div
                                     className="panel-resize-handle"
                                     onMouseDown={handleRightPaneResizeStart}
                                     role="separator"
                                     aria-orientation="vertical"
                                     aria-label="Resize right pane"
                                 ></div>
                             )}

                             {isRightPaneVisible && rightPaneMode === 'preview' && (
                                 <PreviewPane
                                     payload={previewPanePayload}
                                     isLoading={isPreviewPaneLoading}
                                     selectedCount={selectedItems.length}
                                 />
                             )}

                             {isRightPaneVisible && rightPaneMode === 'details' && (
                                 <DetailsPanel
                                     item={selectedItems[0] || null}
                                     isMultipleSelection={selectedItems.length > 1}
                                 />
                             )}

                        </div>

                        {/* Terminal positioned absolutely at the bottom */}
                        <div 
                            className="terminal-wrapper"
                            style={{
                                position: isTerminalOpen ? 'absolute' : 'static',
                                bottom: isTerminalOpen ? 0 : 'auto',
                                left: isTerminalOpen ? 0 : 'auto',
                                right: isTerminalOpen ? 0 : 'auto',
                                height: isTerminalOpen ? `${terminalHeight}px` : 0,
                                overflow: isTerminalOpen ? 'visible' : 'hidden'
                            }}
                        >
                            {isTerminalOpen && (
                                <Terminal
                                    isOpen={isTerminalOpen}
                                    onToggle={() => setIsTerminalOpen(!isTerminalOpen)}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </TabManager>

            {/* Context menu */}
            {isContextMenuOpen && (
                <ContextMenu
                    position={position}
                    items={items}
                    onClose={closeContextMenu}
                />
            )}

            {/* Modals */}
            <GlobalSearch
                isOpen={isGlobalSearchOpen}
                onClose={() => setIsGlobalSearchOpen(false)}
            />

            <SettingsPanel
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />

            <RenameModal
                isOpen={isRenameModalOpen}
                onClose={() => setIsRenameModalOpen(false)}
                item={itemToRename}
                onRename={handleRename}
            />

            {/* Hash Modals - with debug info */}
            <HashFileModal
                isOpen={isHashFileModalOpen}
                onClose={() => {
                    console.log('Closing Hash File Modal');
                    setIsHashFileModalOpen(false);
                    setHashModalItem(null);
                }}
                item={hashModalItem}
            />

            <HashCompareModal
                isOpen={isHashCompareModalOpen}
                onClose={() => {
                    console.log('Closing Hash Compare Modal');
                    setIsHashCompareModalOpen(false);
                    setHashModalItem(null);
                }}
                item={hashModalItem}
            />

            <HashDisplayModal
                isOpen={isHashDisplayModalOpen}
                onClose={() => {
                    console.log('Closing Hash Display Modal');
                    setIsHashDisplayModalOpen(false);
                    setHashDisplayData({ hash: '', fileName: '' });
                }}
                hash={hashDisplayData.hash}
                fileName={hashDisplayData.fileName}
            />

            {/* Preview Modal */}
            {(isPreviewOpen || isPreviewLoading) && (
                <PreviewModal
                    payload={previewPayload}
                    onClose={closePreview}
                    isLoading={isPreviewLoading}
                />
            )}
        </div>
    );
};

export default MainLayout;