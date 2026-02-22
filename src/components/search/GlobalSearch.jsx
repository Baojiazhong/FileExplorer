import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useHistory } from '../../providers/HistoryProvider';
import { useFileSystem } from '../../providers/FileSystemProvider';
import SearchBar from '../search/SearchBar';
import EmptyState from '../explorer/EmptyState';
import FileIcon from '../explorer/FileIcon';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { showError, showSuccess, showConfirm } from '../../utils/NotificationSystem';
import { useI18n } from '../../i18n';
import { registerKeydownHandler, KEYDOWN_PRIORITIES } from '../../utils/keyboard';
import './search.css';

const GlobalSearch = ({ isOpen, onClose }) => {
    const { t } = useI18n();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchEngineInfo, setSearchEngineInfo] = useState(null);
    const [selectedExtensions, setSelectedExtensions] = useState([]);
    const [isIndexing, setIsIndexing] = useState(false);
    const [indexingProgress, setIndexingProgress] = useState({
        files_indexed: 0,
        files_discovered: 0,
        percentage_complete: 0.0,
        current_path: null,
        estimated_time_remaining: null,
        start_time: null
    });
    const progressIntervalRef = useRef(null);
    const searchInputRef = useRef(null);
    const [filtersExpanded, setFiltersExpanded] = useState(false);
    const [statsExpanded, setStatsExpanded] = useState(false);
    const [recentSearches, setRecentSearches] = useState([]);
    const [mostAccessedPaths, setMostAccessedPaths] = useState([]);
    const [searchMetrics, setSearchMetrics] = useState({
        total_searches: 0,
        average_search_time_ms: 0,
        cache_hit_rate: 0,
        cache_hits: 0
    });
    const [currentDirectory, setCurrentDirectory] = useState(null);
    const [sortBy, setSortBy] = useState('relevance'); // relevance, name, date, path
    const [showDirectoriesOnly, setShowDirectoriesOnly] = useState(false);
    const [showHiddenFiles, setShowHiddenFiles] = useState(false);
    const [systemInfo, setSystemInfo] = useState(null);
    const [isLoadingStatus, setIsLoadingStatus] = useState(false);
    
    // Autocompletion states
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(true); // Initially true to show suggestions when ready
    const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [suppressSuggestions, setSuppressSuggestions] = useState(false);
    const [isInputFocused, setIsInputFocused] = useState(false); // Start as false, will be set to true when input is actually focused
    const [hasSearched, setHasSearched] = useState(false); // Track if a search has been performed
    const suggestionsRef = useRef(null);

    const { navigateTo, currentPath } = useHistory();
    const { loadDirectory, volumes } = useFileSystem();

    // Common file extensions for filtering
    const commonExtensions = [
        { value: 'txt', label: `${t('fileTypes.documents.text')} (.txt)` },
        { value: 'pdf', label: `${t('fileTypes.documents.pdf')} (.pdf)` },
        { value: 'doc', label: `${t('fileTypes.documents.word')} (.doc)` },
        { value: 'docx', label: `${t('fileTypes.documents.word')} (.docx)` },
        { value: 'jpg', label: `${t('fileTypes.images.jpeg')} (.jpg)` },
        { value: 'png', label: `${t('fileTypes.images.png')} (.png)` },
        { value: 'mp3', label: `${t('fileTypes.audio.mp3')} (.mp3)` },
        { value: 'mp4', label: `${t('fileTypes.video.mp4')} (.mp4)` },
        { value: 'zip', label: `${t('fileTypes.archives.zip')} (.zip)` },
        { value: 'js', label: `${t('fileTypes.code.js')} (.js)` },
        { value: 'css', label: `${t('fileTypes.code.css')} (.css)` },
        { value: 'html', label: `${t('fileTypes.code.html')} (.html)` }
    ];

    // Load search engine info when modal opens
    useEffect(() => {
        if (isOpen) {
            loadSearchEngineInfo();
            loadSystemInfo();
            checkIndexingStatus(); // Check if indexing is already in progress
            // Set current directory context from history
            if (currentPath) {
                setCurrentDirectory(currentPath);
            }
            setIsInputFocused(true);
            setShowSuggestions(true);
            setSuggestions([]);
            setSelectedSuggestionIndex(-1);
            setSuppressSuggestions(false);
            setHasSearched(false); // Reset search state when modal opens
            // Focus the search input when modal opens (with blur/focus workaround) Bugfix lol
            setTimeout(() => {
                if (searchInputRef.current) {
                    searchInputRef.current.blur();
                    setTimeout(() => {
                        searchInputRef.current.focus();
                    }, 50);
                }
            }, 100);
        }
    }, [isOpen, currentPath]);

    // Update current directory when user navigates
    useEffect(() => {
        if (currentPath && currentPath !== currentDirectory) {
            setCurrentDirectory(currentPath);
        }
    }, [currentPath]);

    // Re-sort results when sort criteria changes
    useEffect(() => {
        if (results.length > 0) {
            setResults(prevResults => sortResults(prevResults));
        }
    }, [sortBy, showDirectoriesOnly, showHiddenFiles]);

    // Clear results when query is empty (don't auto-search on typing)
    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            setHasSearched(false);
        }
    }, [query]);

    // Debounced autocompletion - load suggestions as user types
    useEffect(() => {
        const timeoutId = setTimeout(async () => {
if (query.trim().length >= 2 && !suppressSuggestions && !isSearching && isInputFocused && searchEngineInfo) {
                await loadSuggestions(query.trim());
            } else {
                setSuggestions([]);
                setSelectedSuggestionIndex(-1);
            }
        }, 150);

        return () => clearTimeout(timeoutId);
    }, [query, searchEngineInfo, suppressSuggestions, isSearching, isInputFocused]); // Added isInputFocused dependency

    // Auto-index on app start if search engine is empty
    useEffect(() => {
        const initializeSearchEngine = async () => {
            if (volumes.length > 0 && searchEngineInfo) {
                // Check if search engine has no indexed files
                const hasNoIndexedFiles = !searchEngineInfo.stats?.trie_size || searchEngineInfo.stats.trie_size === 0;
                const AUTO_INDEX_ENABLED = false;

                if (hasNoIndexedFiles && !isIndexing && AUTO_INDEX_ENABLED) {
                    // Auto-index just the home directory to test the increased file limits
                    const autoIndexDirectories = [
                        '/Users/daniel'  // Home directory - will test the 150,000 file limit
                    ];
                    // Filter to only existing directories
                    const validDirectories = [];
                    for (const dir of autoIndexDirectories) {
                        try {
                            // Check if directory exists by attempting to invoke a simple command
                            validDirectories.push(dir);
                        } catch (error) {
                        }
                    }

                    if (validDirectories.length > 0) {
                        await startAutoIndexing(validDirectories.map(dir => ({ mount_point: dir })));
                    } else {
                    }
                } else {
                }
            } else {
            }
        };

        initializeSearchEngine();
    }, [volumes, searchEngineInfo, isIndexing]);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            stopProgressPolling();
        };
    }, []);

    // Close dropdown when clicking outside (only while modal is open)
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (event) => {
            if (filtersExpanded && !event.target.closest('.search-input-wrapper') && !event.target.closest('.search-controls-dropdown')) {
                setFiltersExpanded(false);
            }
        };

        const unregisterKeydown = registerKeydownHandler(
            (event) => {
                // Let higher-priority overlays (confirm dialogs, etc.) claim keys first.
                if (event.defaultPrevented) return false;

                if (event.key === 'Escape' && filtersExpanded) {
                    event.preventDefault();
                    setFiltersExpanded(false);
                    // Refocus the search input after closing dropdown
                    if (searchInputRef.current) {
                        searchInputRef.current.focus();
                    }
                    return true;
                }

                // Handle suggestion navigation
                if (showSuggestions && suggestions.length > 0) {
                    switch (event.key) {
                        case 'ArrowDown':
                            event.preventDefault();
                            setSelectedSuggestionIndex((prev) =>
                                prev < suggestions.length - 1 ? prev + 1 : prev
                            );
                            return true;
                        case 'ArrowUp':
                            event.preventDefault();
                            setSelectedSuggestionIndex((prev) => (prev > -1 ? prev - 1 : -1));
                            return true;
                        case 'Enter':
                            if (selectedSuggestionIndex >= 0) {
                                event.preventDefault();
                                selectSuggestion(suggestions[selectedSuggestionIndex]);
                                return true;
                            }
                            break;
                        case 'Tab':
                            if (selectedSuggestionIndex >= 0) {
                                event.preventDefault();
                                selectSuggestion(suggestions[selectedSuggestionIndex]);
                                return true;
                            } else if (suggestions.length > 0) {
                                event.preventDefault();
                                selectSuggestion(suggestions[0]); // Select first suggestion on Tab
                                return true;
                            }
                            break;
                        case 'Escape':
                            // If suggestions are visible, close them first without closing the whole modal.
                            event.preventDefault();
                            setSelectedSuggestionIndex(-1);
                            setShowSuggestions(false);
                            if (searchInputRef.current) {
                                searchInputRef.current.focus();
                            }
                            return true;
                    }
                }

                return false;
            },
            {
                id: 'globalsearch-keys',
                name: 'GlobalSearch keys',
                // High priority since this is a modal overlay.
                // Keep below Dropdown/ContextMenu so those close first.
                priority: KEYDOWN_PRIORITIES.SEARCH_MODAL,
                when: () => isOpen,
            }
        );

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            unregisterKeydown();
        };
    }, [isOpen, filtersExpanded, showSuggestions, suggestions, selectedSuggestionIndex]);


    // Start polling for progress when indexing begins
    const startProgressPolling = () => {
        if (progressIntervalRef.current) return; // Already polling
        progressIntervalRef.current = setInterval(async () => {
            try {
                // Primary method: Use documented get_search_engine_info
                const info = await invoke('get_search_engine_info');
                
                // Check status from documented API
                const isStillIndexing = info.status && (info.status === 'Indexing' || info.status === '"Indexing"');
                
                // Update progress if available
                if (info.progress) {
                    setIndexingProgress({
                        files_indexed: info.progress.files_indexed || 0,
                        files_discovered: info.progress.files_discovered || 0,
                        percentage_complete: info.progress.percentage_complete || 0.0,
                        current_path: info.progress.current_path || null,
                        estimated_time_remaining: info.progress.estimated_time_remaining || null,
                        start_time: info.progress.start_time || Date.now()
                    });
                }
// Check if indexing is complete
                if (!isStillIndexing) {
                    setIsIndexing(false);
                    setIsLoadingStatus(false); // Reset loading status when polling detects completion
                    stopProgressPolling();
                    // Update search engine info to reflect new state
                    setSearchEngineInfo(info);
                }
                
            } catch (error) {
                console.error('Error polling progress:', error);
                
                // Fallback: Try using undocumented commands if they exist
                try {
                    const [status, progress] = await Promise.all([
                        invoke('get_indexing_status'),
                        invoke('get_indexing_progress')
                    ]);
                    
                    setIndexingProgress(progress);
                    
                    if (status !== 'Indexing' && status !== '"Indexing"') {
                        setIsIndexing(false);
                        setIsLoadingStatus(false); // Reset loading status in fallback case too
                        stopProgressPolling();
                        await loadSearchEngineInfo();
                    }
                } catch (fallbackError) {
                    console.error('Fallback polling also failed:', fallbackError);
                    // On consecutive errors, stop polling to prevent infinite error loops
                    if (!window.progressErrorCount) window.progressErrorCount = 0;
                    window.progressErrorCount++;
                    if (window.progressErrorCount > 10) {
                        console.error('Too many polling errors, stopping progress polling');
                        setIsIndexing(false);
                        setIsLoadingStatus(false); // Reset loading status on error
                        stopProgressPolling();
                    }
                }
            }
        }, 100); // Slightly longer interval for better performance
    };

    const stopProgressPolling = () => {
        if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
        }
        // Reset error counter
        window.progressErrorCount = 0;
    };

    // Format time remaining
    const formatTimeRemaining = (ms) => {
        if (!ms) return t('search.calculating');

        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    };

    // Check if indexing is currently in progress
    const checkIndexingStatus = async () => {
        setIsLoadingStatus(true);
        try {
            // Use documented get_search_engine_info command
            const info = await invoke('get_search_engine_info');
            // Check if indexing is in progress based on engine status
            const isCurrentlyIndexing = info.status && (info.status === 'Indexing' || info.status === '"Indexing"');

            if (isCurrentlyIndexing) {
                setIsIndexing(true);
                
                // Set progress from search engine info if available
                if (info.progress) {
                    setIndexingProgress({
                        files_indexed: info.progress.files_indexed || 0,
                        files_discovered: info.progress.files_discovered || 0,
                        percentage_complete: info.progress.percentage_complete || 0.0,
                        current_path: info.progress.current_path || null,
                        estimated_time_remaining: info.progress.estimated_time_remaining || null,
                        start_time: info.progress.start_time || Date.now()
                    });
                }
                
                startProgressPolling();
            } else {
                setIsIndexing(false);
            }
            
            // Update search engine info
            setSearchEngineInfo(info);
            
        } catch (error) {
            console.error('Failed to check indexing status:', error);
            
            // Fallback to undocumented commands if documented API fails
            try {
                const [status, progress] = await Promise.all([
                    invoke('get_indexing_status'),
                    invoke('get_indexing_progress')
                ]);
                if (status === 'Indexing' || status === '"Indexing"') {
                    setIsIndexing(true);
                    setIndexingProgress(progress);
                    startProgressPolling();
                } else {
                    setIsIndexing(false);
                }
            } catch (fallbackError) {
                console.error('Fallback status check also failed:', fallbackError);
                setIsIndexing(false);
            }
        } finally {
            setIsLoadingStatus(false);
        }
    };

    // Load system information
    const loadSystemInfo = async () => {
        try {
            const metaDataJson = await invoke('get_meta_data_as_json');
            const metaData = JSON.parse(metaDataJson);
            setSystemInfo(metaData);
        } catch (error) {
            console.error('Failed to load system info:', error);
            setSystemInfo(null);
        }
    };

    // Load search engine information
    const loadSearchEngineInfo = async () => {
        try {
            const info = await invoke('get_search_engine_info');
            setSearchEngineInfo(info);
            
            // Check if indexing is in progress based on engine status and progress
            const isCurrentlyIndexing = info.status && (info.status === 'Indexing' || info.status === '"Indexing"');
            // Update indexing state based on search engine info
            if (isCurrentlyIndexing && !isIndexing) {
                setIsIndexing(true);
                // Set progress from search engine info if available
                if (info.progress) {
                    setIndexingProgress({
                        files_indexed: info.progress.files_indexed || 0,
                        files_discovered: info.progress.files_discovered || 0,
                        percentage_complete: info.progress.percentage_complete || 0.0,
                        current_path: info.progress.current_path || null,
                        estimated_time_remaining: info.progress.estimated_time_remaining || null,
                        start_time: info.progress.start_time || Date.now()
                    });
                }
                startProgressPolling();
            } else if (!isCurrentlyIndexing && isIndexing) {
                setIsIndexing(false);
                setIsLoadingStatus(false); // Reset loading status when indexing completes
                stopProgressPolling();
            }
            
            // Extract additional data from the comprehensive info
            if (info.recent_activity) {
                setRecentSearches(info.recent_activity.recent_searches || []);
                setMostAccessedPaths(info.recent_activity.most_accessed_paths || []);
            }
            
            if (info.metrics) {
                setSearchMetrics(info.metrics);
            }
        } catch (error) {
            console.error('Failed to load search engine info:', error);
            setSearchEngineInfo(null);
            // If we can't get search engine info, assume no indexing
            if (isIndexing) {
                setIsIndexing(false);
                setIsLoadingStatus(false); // Reset loading status on error
                stopProgressPolling();
            }
        }
    };

    // Perform search using the real API
    const performSearch = async (isAutomatic = false) => {
        if (!query.trim()) {
            setResults([]);
            return;
        }

        // Check if search engine is ready based on documented status
        if (!searchEngineInfo || searchEngineInfo.status === 'Indexing' || searchEngineInfo.status === '"Indexing"') {
            return;
        }

        // Check if there are indexed files to search
        if (!searchEngineInfo.stats?.trie_size || searchEngineInfo.stats.trie_size === 0) {
            setResults([]);
            return;
        }

        // Store current focus state for automatic searches
        const wasInputFocused = isAutomatic && document.activeElement === searchInputRef.current;

        setIsSearching(true);
        setResults([]);
        setHasSearched(true);

        try {
            const searchStartTime = performance.now();
            let searchResults;

            // Use extension filtering if extensions are selected
            if (selectedExtensions.length > 0) {
                searchResults = await invoke('search_with_extension', {
                    query: query.trim(),
                    extensions: selectedExtensions
                });
            } else {
                // Use basic search
                searchResults = await invoke('search', {
                    query: query.trim()
                });
            }

            const searchEndTime = performance.now();
            const searchTime = searchEndTime - searchStartTime;
            // Convert API results to our format and apply frontend filtering
            let formattedResults = searchResults.map(([path, score]) => {
                const fileName = path.split(/[/\\]/).pop() || path;
                const directory = path.substring(0, path.lastIndexOf(fileName) - 1) || '/';
                const isDirectory = !fileName.includes('.') || path.endsWith('/');

                return {
                    path,
                    name: fileName,
                    directory,
                    score,
                    isDirectory,
                    extension: isDirectory ? null : fileName.split('.').pop()?.toLowerCase()
                };
            });

            // Apply frontend filters
            if (showDirectoriesOnly) {
                formattedResults = formattedResults.filter(result => result.isDirectory);
            }

            if (!showHiddenFiles) {
                formattedResults = formattedResults.filter(result => !result.name.startsWith('.'));
            }

            // Apply sorting
            formattedResults = sortResults(formattedResults);

            setResults(formattedResults);
            
            // Update recent searches (keep last 10) - only for queries with 3+ characters
            if (query.trim().length >= 3) {
                setRecentSearches(prev => {
                    const updated = [query.trim(), ...prev.filter(q => q !== query.trim())];
                    return updated.slice(0, 10);
                });
            }

            // Update search engine stats after successful search
            await loadSearchEngineInfo();

        } catch (error) {
            console.error('Search failed:', error);
            // Show user-friendly error message only for manual searches
            if (query.trim().length >= 3) {
                const errorMessage = error.message || error;
                if (errorMessage.includes('No search engine available')) {
                } else {
                    console.error('Search error:', errorMessage);
                }
            }
        } finally {
            setIsSearching(false);
            
            // Restore focus to input if it was focused before automatic search
            if (wasInputFocused && searchInputRef.current) {
                setTimeout(() => {
                    searchInputRef.current.focus();
                }, 0);
            }
        }
    };

    // Clear search
    const clearSearch = () => {
        setQuery('');
        setResults([]);
        setHasSearched(false);
        setSuggestions([]);
        setSelectedSuggestionIndex(-1);
    };

    const loadSuggestions = async (prefix) => {
        if (!searchEngineInfo || searchEngineInfo.status === 'Indexing' || searchEngineInfo.status === '"Indexing"') {
return;
        }

        if (!searchEngineInfo.stats?.trie_size || searchEngineInfo.stats.trie_size === 0) {
setShowSuggestions(false);
            setSuggestions([]);
            return;
        }
        setIsLoadingSuggestions(true);
        try {
            const suggestionResults = await invoke('get_suggestions', {
                prefix: prefix,
                limit: 8
            });
            const uniqueSuggestions = [...new Set(suggestionResults)]
                .filter(suggestion => suggestion.toLowerCase() !== prefix.toLowerCase())
                .slice(0, 8);
            setSuggestions(uniqueSuggestions);
            setSelectedSuggestionIndex(-1);
            setShowSuggestions(uniqueSuggestions.length > 0);
} catch (error) {
            console.error('Failed to load suggestions:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });

            setShowSuggestions(false);
            setSuggestions([]);
        } finally {
            setIsLoadingSuggestions(false);
        }
    };

    const selectSuggestion = (suggestion) => {
        setQuery(suggestion);
        setShowSuggestions(false);
        setSuggestions([]);
        setSelectedSuggestionIndex(-1);

        setTimeout(() => {
            performSearch(false);
        }, 100);
    };

    // Sort results based on selected criteria
    const sortResults = (results) => {
        return [...results].sort((a, b) => {
            switch (sortBy) {
                case 'name':
                    return a.name.localeCompare(b.name);
                case 'path':
                    return a.path.localeCompare(b.path);
                case 'extension':
                    if (!a.extension && !b.extension) return 0;
                    if (!a.extension) return 1;
                    if (!b.extension) return -1;
                    return a.extension.localeCompare(b.extension);
                case 'relevance':
                default:
                    return b.score - a.score; // Higher score first
            }
        });
    };

    // Handle extension selection
    const handleExtensionChange = (extension) => {
        setSelectedExtensions(prev => {
            if (prev.includes(extension)) {
                return prev.filter(ext => ext !== extension);
            } else {
                return [...prev, extension];
            }
        });
    };

    // Open file/folder location
    const openItemLocation = async (result) => {
        try {
            // Record path usage for ranking improvement
            await recordPathUsage(result.path);
            
            // Update most accessed paths
            setMostAccessedPaths(prev => {
                const updated = [result.path, ...prev.filter(p => p !== result.path)];
                return updated.slice(0, 10);
            });

            await loadDirectory(result.directory);
            navigateTo(result.directory);
            onClose();
        } catch (error) {
            console.error('Failed to open item location:', error);
            showError(t('search.failedOpenLocation', { message: error.message || error }));
        }
    };

    // Record path usage to improve future search ranking
    const recordPathUsage = async (path) => {
        try {
            // Note: This would be a new backend command we'd need to implement
            // For now, we'll just track it in the frontend
            // await invoke('record_path_usage', { path });
        } catch (error) {
            console.error('Failed to record path usage:', error);
        }
    };

    // Quick search from recent searches
    const searchFromRecent = (recentQuery) => {
        setQuery(recentQuery);
        // Automatically trigger search
        setTimeout(() => {
            performSearch(false); // This is a user-initiated search, so don't preserve focus
        }, 100);
    };

    // Quick navigate to most accessed path
    const navigateToAccessedPath = async (path) => {
        try {
            const directory = path.substring(0, path.lastIndexOf('/')) || '/';
            await loadDirectory(directory);
            navigateTo(directory);
            onClose();
        } catch (error) {
            console.error('Failed to navigate to path:', error);
            showError(t('search.failedNavigate', { message: error.message || error }));
        }
    };

    // Auto-start indexing for volumes
    const startAutoIndexing = async (volumesToIndex = volumes) => {
        if (volumesToIndex.length === 0 || isIndexing) {
            return;
        }
        setIsIndexing(true);
        setIndexingProgress({
            files_indexed: 0,
            files_discovered: 0,
            percentage_complete: 0.0,
            current_path: null,
            estimated_time_remaining: null,
            start_time: Date.now()
        });

        // Start polling before starting indexing
        startProgressPolling();

        try {
            // Index all volumes in background
            for (const volume of volumesToIndex) {
                // Check if the volume path exists and is accessible
                try {
                    const result = await invoke('add_paths_recursive_async', {
                        folder: volume.mount_point
                    });
                } catch (volumeError) {
                    console.error(`Failed to index volume ${volume.mount_point}:`, volumeError);
                    // Continue with other volumes even if one fails
                }
            }
        } catch (error) {
            console.error('Auto-indexing failed:', error);
            setIsIndexing(false);
            stopProgressPolling();

            // Show error to user
            showError(t('search.failedStartIndexing', { message: error.message || error }));
        }
    };

    // Manual indexing trigger
    const startManualIndexing = async () => {
        if (!systemInfo?.user_home_dir) {
            showError(t('search.homeDirUnavailable'));
            return;
        }

        setIsIndexing(true);
        setIndexingProgress({
            files_indexed: 0,
            files_discovered: 0,
            percentage_complete: 0.0,
            current_path: null,
            estimated_time_remaining: null,
            start_time: Date.now()
        });

        // Start polling before starting indexing
        startProgressPolling();

        try {
            // Try async version first, fallback to sync version
            let result;
            try {
                result = await invoke('add_paths_recursive_async', {
                    folder: systemInfo.user_home_dir
                });
            } catch (asyncError) {
                result = await invoke('add_paths_recursive', {
                    folder: systemInfo.user_home_dir
                });
            }
            // Don't show alert immediately - let polling handle completion notification
        } catch (error) {
            console.error('Manual indexing failed:', error);
            showError(t('search.failedStartIndexing', { message: error.message || error }));
            setIsIndexing(false);
            stopProgressPolling();
        }
    };

    // Clear search engine index
    const clearSearchEngine = async () => {
        const ok = await showConfirm(t('search.confirmClearIndex'), {
            title: t('search.clearIndexTitle'),
            confirmText: t('common.confirm'),
            cancelText: t('common.cancel'),
        });
        if (!ok) {
            return;
        }

        try {
            await invoke('clear_search_engine');
            // Update UI state
            setResults([]);
            setQuery('');
            await loadSearchEngineInfo();
            
            showSuccess(t('search.indexCleared'));

        } catch (error) {
            console.error('Failed to clear search engine:', error);
            showError(t('search.failedClearIndex', { message: error.message || error }));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (query.trim()) {
            performSearch(false);
            setShowSuggestions(false);
            setSuggestions([]);
            setSelectedSuggestionIndex(-1);
            // Suppress suggestions for a short period to prevent them from reappearing
            setSuppressSuggestions(true);
            setTimeout(() => setSuppressSuggestions(false), 1000); // Allow suggestions again after 1 second
            if (searchInputRef.current) {
                searchInputRef.current.blur();
            }
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('search.globalTitle')}
            size="lg"
        >
            <div className="global-search-content">
                <form onSubmit={handleSubmit} className="search-form-container" style={{
                    padding: '8px',
                    margin: '0',
                    backgroundColor: 'var(--surface)',
                    marginBottom: '16px'
                }}>
                    <div className="search-input-row" style={{ position: 'relative' }}>
                        <div className="search-input-wrapper" style={{ position: 'relative' }}>
                            <input
                                ref={searchInputRef}
                                type="text"
                                className="search-input-field"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onFocus={() => {
setIsInputFocused(true);
                                    // Trigger suggestions if there's existing text when input is focused
                                    if (query.trim().length >= 2 && searchEngineInfo && !suppressSuggestions && !isSearching) {
                                        setTimeout(() => loadSuggestions(query.trim()), 50);
                                    }
                                }}
                                onBlur={() => {
                                    // Delay hiding suggestions to allow clicking on them
                                    setTimeout(() => setIsInputFocused(false), 150);
                                }}
                                placeholder={t('search.placeholder')}

                                autoFocus
                                style={{
                                    paddingRight: query.trim() ? '110px' : '75px' // Extra space for both search and filter buttons
                                }}
                            />
                            {isSearching && (
                                    <div className="search-loading-indicator" style={{ 
                                        position: 'absolute', 
                                        right: query.trim() ? '110px' : '75px', 
                                        top: '50%', 
                                        transform: 'translateY(-50%)',
                                        fontSize: '12px',
                                        color: '#666',
                                        pointerEvents: 'none', // Prevent interference with input
                                        zIndex: 1
                                    }}>
                                        {t('search.searching')}
                                    </div>
                            )}
                            {query.trim() && (
                                    <button
                                        type="button"
                                        className="clear-search-btn"
                                        onClick={clearSearch}
                                        title={t('search.clearSearch')}
                                        style={{
                                        position: 'absolute',
                                        right: '75px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'transparent',
                                        border: 'none',
                                        outline: 'none',
                                        cursor: 'pointer',
                                        padding: '0',
                                        margin: '0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        zIndex: 2
                                    }}
                                    onMouseEnter={(e) => {
                                        const span = e.target.querySelector('span');
                                        if (span) {
                                            span.style.backgroundImage = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='18' y1='6' x2='6' y2='18'%3E%3C/line%3E%3Cline x1='6' y1='6' x2='18' y2='18'%3E%3C/line%3E%3C/svg%3E")`;
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        const span = e.target.querySelector('span');
                                        if (span) {
                                            span.style.backgroundImage = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='18' y1='6' x2='6' y2='18'%3E%3C/line%3E%3Cline x1='6' y1='6' x2='18' y2='18'%3E%3C/line%3E%3C/svg%3E")`;
                                        }
                                    }}
                                >
                                    <span style={{
                                        width: '14px',
                                        height: '14px',
                                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='18' y1='6' x2='6' y2='18'%3E%3C/line%3E%3Cline x1='6' y1='6' x2='18' y2='18'%3E%3C/line%3E%3C/svg%3E")`,
                                        backgroundPosition: 'center',
                                        backgroundRepeat: 'no-repeat',
                                        backgroundSize: 'contain',
                                        display: 'block'
                                    }}></span>
                                </button>
                            )}
                                <button
                                    type="submit"
                                    className="search-btn"
                                    title={t('search.searchEnter')}
                                    onClick={() => {
                                    // Hide suggestions immediately when search button is clicked
                                    setShowSuggestions(false);
                                    setSuggestions([]);
                                    setSelectedSuggestionIndex(-1);
                                    // Suppress suggestions for a short period
                                    setSuppressSuggestions(true);
                                    setTimeout(() => setSuppressSuggestions(false), 1000);
                                }}
                                style={{
                                    position: 'absolute',
                                    right: '43px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'transparent',
                                    border: 'none',
                                    outline: 'none',
                                    cursor: 'pointer',
                                    padding: '0',
                                    margin: '0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    zIndex: 2,
                                    borderRadius: '4px',
                                    transition: 'background-color var(--transition-fast)'
                                }}
                                onMouseEnter={(e) => {
                                    e.target.style.backgroundColor = 'var(--surface-hover)';
                                }}
                                onMouseLeave={(e) => {
                                    e.target.style.backgroundColor = 'transparent';
                                }}
                            >
                                <span style={{
                                    width: '16px',
                                    height: '16px',
                                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'%3E%3C/circle%3E%3Cpath d='m21 21-4.35-4.35'%3E%3C/path%3E%3C/svg%3E")`,
                                    backgroundPosition: 'center',
                                    backgroundRepeat: 'no-repeat',
                                    backgroundSize: 'contain',
                                    display: 'block'
                                }}></span>
                            </button>
                            <button
                                type="button"
                                className="filter-toggle-btn"
                                onClick={() => {
                                    setFiltersExpanded(!filtersExpanded);
                                }}
                                title={t('search.filtersToggleTitle')}
                                style={{
                                    position: 'absolute',
                                    right: '8px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: filtersExpanded ? 'var(--accent)' : 'var(--text-secondary)',
                                    transition: 'color var(--transition-fast), background-color var(--transition-fast)'
                                }}
                                onMouseEnter={(e) => {
                                    if (!filtersExpanded) {
                                        e.target.style.backgroundColor = 'var(--surface-hover)';
                                        e.target.style.color = 'var(--text-primary)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!filtersExpanded) {
                                        e.target.style.backgroundColor = 'transparent';
                                        e.target.style.color = 'var(--text-secondary)';
                                    }
                                }}
                            >
                                <span className="icon icon-filter" style={{
                                    width: '16px',
                                    height: '16px',
                                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolygon points='22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3'%3E%3C/polygon%3E%3C/svg%3E")`,
                                    backgroundPosition: 'center',
                                    backgroundRepeat: 'no-repeat',
                                    backgroundSize: 'contain'
                                }}></span>
                                {(selectedExtensions.length > 0 || showDirectoriesOnly || showHiddenFiles || sortBy !== 'relevance') && (
                                    <span style={{
                                        position: 'absolute',
                                        top: '-2px',
                                        right: '-2px',
                                        width: '8px',
                                        height: '8px',
                                        backgroundColor: 'var(--accent)',
                                        borderRadius: '50%',
                                        border: '1px solid var(--background)'
                                    }}></span>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Autocompletion Suggestions Dropdown */}
                    {showSuggestions && suggestions.length > 0 && !isSearching && isInputFocused && (
                        <div 
                            ref={suggestionsRef}
                            className="suggestions-dropdown" 
                            style={{
                                position: 'absolute',
                                top: '100%',
                                left: '0',
                                right: '0',
                                backgroundColor: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-md)',
                                boxShadow: 'var(--shadow-lg)',
                                zIndex: 999, // Below filters dropdown
                                marginTop: '2px',
                                maxHeight: '200px',
                                overflowY: 'auto'
                            }}
                        >
                            <div style={{ 
                                padding: '8px 12px', 
                                fontSize: '11px', 
                                color: 'var(--text-secondary)',
                                borderBottom: '1px solid var(--border)',
                                fontWeight: '500'
                            }}>
                                {t('search.suggestions.title')}
                                {isLoadingSuggestions && (
                                    <span style={{ marginLeft: '8px', fontStyle: 'italic' }}>{t('common.loading')}</span>
                                )}
                            </div>
                            {suggestions.map((suggestion, index) => (
                                <div
                                    key={index}
                                    className="suggestion-item"
                                    style={{
                                        padding: '8px 12px',
                                        cursor: 'pointer',
                                        backgroundColor: selectedSuggestionIndex === index ? 'var(--surface-hover)' : 'transparent',
                                        borderLeft: selectedSuggestionIndex === index ? '3px solid var(--accent)' : '3px solid transparent',
                                        fontSize: '14px',
                                        transition: 'background-color var(--transition-fast)'
                                    }}
                                    onClick={() => selectSuggestion(suggestion)}
                                    onMouseEnter={() => setSelectedSuggestionIndex(index)}
                                    onMouseLeave={() => setSelectedSuggestionIndex(-1)}
                                >
                                    <span style={{ fontWeight: '500' }}>{suggestion}</span>
                                    <span style={{ 
                                        fontSize: '11px', 
                                        color: 'var(--text-secondary)', 
                                        marginLeft: '8px' 
                                    }}>
                                        {t('search.suggestions.useHint')}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Search Controls Dropdown */}
                    {filtersExpanded && (
                        <div className="search-controls-dropdown" style={{
                            position: 'absolute',
                            top: '100%',
                            left: '0',
                            right: '0',
                            backgroundColor: 'var(--surface)',
                            border: '1px solid var(--accent)', // Thicker border for debugging
                            borderRadius: 'var(--radius-md)',
                            boxShadow: 'var(--shadow-lg)',
                            zIndex: 1000,
                            marginTop: '4px',
                            maxHeight: '400px',
                            overflowY: 'auto',
                            padding: 'var(--space-md)',
                            minHeight: '200px' // Ensure minimum height for debugging
                        }}>
                            {/* Current Directory Context */}
                            {currentDirectory && (
                                <div className="search-control-section">
                                    <h4 style={{ margin: '0 0 var(--space-sm) 0', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)' }}>{t('search.currentContext.title')}</h4>
                                    <div className="current-directory-info">
                                        <span className="directory-label">{t('search.currentContext.currentDirectory')}</span>
                                        <span className="directory-path" title={currentDirectory}>
                                            {currentDirectory}
                                        </span>
                                        <small>{t('search.currentContext.rankingHint')}</small>
                                    </div>
                                </div>
                            )}

                            {/* Sort Controls */}
                            <div className="search-control-section">
                                <h4 style={{ margin: 'var(--space-md) 0 var(--space-sm) 0', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)' }}>{t('search.sort.title')}</h4>
                                <div className="sort-controls">
                                    {[
                                        { value: 'relevance', label: t('search.sort.option.relevance') },
                                        { value: 'name', label: t('search.sort.option.name') },
                                        { value: 'path', label: t('search.sort.option.path') },
                                        { value: 'extension', label: t('search.sort.option.extension') }
                                    ].map(option => (
                                        <label key={option.value} className="radio-option">
                                            <input
                                                type="radio"
                                                name="sortBy"
                                                value={option.value}
                                                checked={sortBy === option.value}
                                                onChange={(e) => setSortBy(e.target.value)}
                                                disabled={isSearching}
                                            />
                                            <span>{option.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Filter Controls */}
                            <div className="search-control-section">
                                <h4 style={{ margin: 'var(--space-md) 0 var(--space-sm) 0', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)' }}>{t('search.filterOptionsTitle')}</h4>
                                <div className="filter-controls">
                                    <label className="checkbox-option">
                                        <input
                                            type="checkbox"
                                            checked={showDirectoriesOnly}
                                            onChange={(e) => setShowDirectoriesOnly(e.target.checked)}
                                            disabled={isSearching}
                                        />
                                        <span>{t('search.filterDirectoriesOnly')}</span>
                                    </label>
                                    <label className="checkbox-option">
                                        <input
                                            type="checkbox"
                                            checked={showHiddenFiles}
                                            onChange={(e) => setShowHiddenFiles(e.target.checked)}
                                            disabled={isSearching}
                                        />
                                        <span>{t('search.filterShowHidden')}</span>
                                    </label>
                                </div>
                            </div>

                            {/* Extension Filters */}
                            <div className="search-control-section">
                                <h4 style={{ margin: 'var(--space-md) 0 var(--space-sm) 0', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)' }}>{t('search.fileTypeFiltersTitle')}</h4>
                                <div className="extension-filters">
                                    <div className="extension-checkboxes">
                                        {commonExtensions.map(ext => (
                                            <label key={ext.value} className="checkbox-option">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedExtensions.includes(ext.value)}
                                                    onChange={() => handleExtensionChange(ext.value)}
                                                    disabled={isSearching}
                                                />
                                                <span>{ext.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                    {selectedExtensions.length > 0 && (
                                        <div className="selected-extensions">
                                            {t('search.selectedExtensions', { list: selectedExtensions.join(', ') })}
                                            <button
                                                type="button"
                                                onClick={() => setSelectedExtensions([])}
                                                className="clear-extensions"
                                                disabled={isSearching}
                                            >
                                                {t('search.clear')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Recent Searches */}
                            {recentSearches.length > 0 && (
                                <div className="search-control-section">
                                    <h4 style={{ margin: 'var(--space-md) 0 var(--space-sm) 0', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)' }}>{t('search.recentSearchesTitle')}</h4>
                                    <div className="recent-searches">
                                        {recentSearches.slice(0, 5).map((recentQuery, index) => (
                                            <button
                                                key={index}
                                                className="recent-search-item"
                                                onClick={() => {
                                                    searchFromRecent(recentQuery);
                                                    setFiltersExpanded(false);
                                                }}
                                                disabled={isSearching}
                                                title={t('search.searchForTitle', { query: recentQuery })}
                                            >
                                                "{recentQuery}"
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Most Accessed Paths */}
                            {mostAccessedPaths.length > 0 && (
                                <div className="search-control-section">
                                    <h4 style={{ margin: 'var(--space-md) 0 var(--space-sm) 0', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)' }}>{t('search.mostAccessedPathsTitle')}</h4>
                                    <div className="most-accessed-paths">
                                        {mostAccessedPaths.slice(0, 5).map((path, index) => (
                                            <button
                                                key={index}
                                                className="accessed-path-item"
                                                onClick={() => {
                                                    navigateToAccessedPath(path);
                                                    setFiltersExpanded(false);
                                                }}
                                                title={t('search.navigateToTitle', { path })}
                                            >
                                                <span className="path-name">
                                                    {path.split('/').pop() || path}
                                                </span>
                                                <span className="path-location">
                                                    {path}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Engine Statistics & Performance */}
                            {searchEngineInfo && (
                                <div className="search-control-section">
                                    <h4 style={{ margin: 'var(--space-md) 0 var(--space-sm) 0', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)' }}>{t('search.engineStatsTitle')}</h4>
                                    <div className="search-engine-info-compact">
                                            <div className="info-grid">
                                                <div className="info-item">
                                                    <span className="info-label">{t('search.engineStats.engineStatus')}</span>
                                                    <span className="info-value">{searchEngineInfo.status || t('common.unknown')}</span>
                                                </div>
                                                <div className="info-item">
                                                    <span className="info-label">{t('search.engineStats.indexedFiles')}</span>
                                                    <span className="info-value">{searchEngineInfo.stats?.trie_size || 0}</span>
                                                </div>
                                                <div className="info-item">
                                                    <span className="info-label">{t('search.engineStats.cacheSize')}</span>
                                                    <span className="info-value">{searchEngineInfo.stats?.cache_size || 0}</span>
                                                </div>
                                                <div className="info-item">
                                                    <span className="info-label">{t('search.engineStats.totalSearches')}</span>
                                                    <span className="info-value">{searchMetrics.total_searches || 0}</span>
                                                </div>
                                                <div className="info-item">
                                                    <span className="info-label">{t('search.engineStats.avgSearchTime')}</span>
                                                    <span className="info-value">{searchMetrics.average_search_time_ms || 0}ms</span>
                                                </div>
                                                <div className="info-item">
                                                    <span className="info-label">{t('search.engineStats.cacheHitRate')}</span>
                                                    <span className="info-value">
                                                        {searchMetrics.cache_hit_rate ? 
                                                            `${(searchMetrics.cache_hit_rate * 100).toFixed(1)}%` :
                                                            t('common.notAvailableShort')
                                                        }
                                                    </span>
                                                </div>
                                                {searchEngineInfo.last_updated && (
                                                    <div className="info-item">
                                                        <span className="info-label">{t('search.engineStats.lastUpdated')}</span>
                                                        <span className="info-value">
                                                            {new Date(searchEngineInfo.last_updated).toLocaleString()}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                        {/* Manual Indexing Control */}
                                        <div className="index-management" style={{ marginTop: 'var(--space-md)' }}>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                    startManualIndexing();
                                                    setFiltersExpanded(false);
                                                }}
                                                disabled={isSearching || isIndexing || !systemInfo?.user_home_dir}
                                            >
                                                {isIndexing ? t('search.indexing') : t('search.indexHomeDirectory')}
                                            </Button>
                                            
                                            {/* Test indexing with a smaller directory */}
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={async () => {
                                                    if (!systemInfo?.user_home_dir) {
                                                        showError(t('search.systemInfoUnavailable'));
                                                        return;
                                                    }

                                                    setIsIndexing(true);
                                                    setIndexingProgress({
                                                        files_indexed: 0,
                                                        files_discovered: 0,
                                                        percentage_complete: 0.0,
                                                        current_path: null,
                                                        estimated_time_remaining: null,
                                                        start_time: Date.now()
                                                    });
                                                    startProgressPolling();
                                                    
                                                    try {
                                                        // Test with user's Documents directory
                                                        const documentsPath = systemInfo.current_running_os === 'windows' 
                                                            ? `${systemInfo.user_home_dir}\\Documents`
                                                            : `${systemInfo.user_home_dir}/Documents`;
                                                        const result = await invoke('add_paths_recursive_async', {
                                                            folder: documentsPath
                                                        });
                                                    } catch (error) {
                                                        console.error('Test indexing failed:', error);
                                                        showError(t('search.testIndexingFailed', { message: error.message || error }));
                                                        setIsIndexing(false);
                                                        stopProgressPolling();
                                                    }
                                                    
                                                    setFiltersExpanded(false);
                                                }}
                                                disabled={isSearching || isIndexing || !systemInfo?.user_home_dir}
                                                style={{ marginLeft: '8px' }}
                                            >
                                                {t('search.testIndexDocuments')}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Search hint for instant search */}
                    {query.length > 0 && query.length < 3 && (
                        <div style={{ 
                            fontSize: '12px', 
                            color: '#666', 
                            marginBottom: '8px',
                            padding: '4px 8px',
                            backgroundColor: '#f0f0f0',
                            borderRadius: '4px'
                        }}>
                            {t('search.typeMoreToSearch')}
                        </div>
                    )}

                    {/* Indexing Progress UI */}
                    {(isIndexing || isLoadingStatus) && (
                        <div className="indexing-progress">
                            {isLoadingStatus && !isIndexing && (
                                <div className="progress-header">
                                    <h3>{t('search.indexing')}</h3>
                                    <span className="progress-percentage">{t('common.loading')}</span>
                                </div>
                            )}
                            
                            {isIndexing && (
                                <>
                                    <div className="progress-header">
                                    <h3>
                                        {indexingProgress.files_discovered === 0 ?
                                            t('search.status.startingDiscovery') :
                                            indexingProgress.files_indexed === 0 ? t('search.status.discoveringFiles') :
                                            indexingProgress.files_indexed < indexingProgress.files_discovered ? t('search.status.indexingFiles') :
                                            t('search.status.finalizing')
                                        }
                                    </h3>
                                        <span className="progress-percentage">
                                            {indexingProgress.files_discovered === 0 ?
                                                t('search.searching') :
                                                indexingProgress.files_indexed === 0 ? t('search.foundCount', { count: indexingProgress.files_discovered }) :
                                                `${indexingProgress.percentage_complete.toFixed(1)}%`
                                            }
                                        </span>
                                    </div>

                                    <div className="progress-bar">
                                        <div
                                            className="progress-fill"
                                            style={{ 
                                                width: indexingProgress.files_discovered === 0 ? 
                                                    '2%' : // Show a small progress to indicate activity
                                                    indexingProgress.files_indexed === 0 ? '5%' : // Show more when discovering
                                                    `${Math.max(5, indexingProgress.percentage_complete)}%` // Ensure minimum 5% when indexing
                                            }}
                                        />
                                    </div>

                                    <div className="progress-details">
                                        <div className="progress-stats">
                                            <span>
                                                {t('search.indexingProgress.stats', {
                                                    indexed: indexingProgress.files_indexed,
                                                    discovered: indexingProgress.files_discovered
                                                })}
                                                {indexingProgress.files_discovered === 0 && ` ${t('search.indexingProgress.startingHint')}`}
                                                {indexingProgress.files_discovered > 0 && indexingProgress.files_indexed === 0 && ` ${t('search.indexingProgress.discoveringAndIndexingHint')}`}
                                            </span>
                                            {indexingProgress.estimated_time_remaining && indexingProgress.files_indexed > 0 && (
                                                <span>
                                                    {formatTimeRemaining(indexingProgress.estimated_time_remaining)} {t('search.timeRemaining')}

                                                </span>
                                            )}
                                        </div>

                                        {indexingProgress.current_path && (
                                            <div className="current-file">
                                                <span className="current-file-label">
                                                    {indexingProgress.files_discovered === 0 ? t('search.status.startingDiscovery') :
                                                     indexingProgress.files_indexed === 0 ? t('search.status.discoveringFiles') : t('search.status.indexingFiles')}

                                                </span>
                                                <span className="current-file-path" title={indexingProgress.current_path}>
                                                    {indexingProgress.current_path.split('/').pop() || indexingProgress.current_path}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await invoke('stop_indexing');
                                                        setIsIndexing(false);
                                                        stopProgressPolling();
                                                        loadSearchEngineInfo(); // Refresh info after stopping
                                                    } catch (error) {
                                                        console.error('Failed to stop indexing:', error);
                                                    }
                                                }}
                                                className="stop-indexing-btn"
                                            >
                                                {t('search.stopIndexing')}
                                            </button>
                                </>
                            )}

                            {isLoadingStatus && !isIndexing && (
                                <div className="status-checking-indicator" style={{
                                    textAlign: 'center',
                                    padding: '20px',
                                    color: '#666',
                                    fontSize: '14px'
                                }}>
                                    <div style={{ marginBottom: '10px' }}>
                                        <span className="icon icon-search" style={{ 
                                            width: '24px', 
                                            height: '24px',
                                            display: 'inline-block'
                                        }}></span>
                                    </div>
                                    {t('search.backgroundIndexingStarted')}
                                </div>
                            )}
                        </div>
                    )}
                </form>

                <div className="search-results-container">
                    {isSearching && (
                        <div className="search-progress-container">
                            <div className="progress-spinner"></div>
                            <span>{t('search.searchingIndexedFiles')}</span>
                        </div>
                    )}

                    {!isSearching && results.length === 0 && query && hasSearched && (
                        <div className="no-results-container">
                            <EmptyState
                                type="no-results"
                                searchTerm={query}
                            />
                            <div className="no-results-help">
                                <p>{t('search.noResults.tipsTitle')}</p>
                                <ul>
                                    <li>{t('search.noResults.tipIndexed')}</li>
                                    <li>{t('search.noResults.tipKeywords')}</li>
                                    <li>{t('search.noResults.tipSpelling')}</li>
                                    <li>{t('search.noResults.tipSpecific')}</li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {!isSearching && results.length > 0 && (
                        <div className="results-list-container">
                            <div className="results-items-container">
                                {/* Results count - inside scrollable area */}
                                <div style={{ 
                                    fontSize: '12px', 
                                    color: '#999', 
                                    marginTop: '0px',
                                    marginBottom: '12px',
                                    paddingLeft: '15px',
                                    paddingRight: '12px'
                                }}>
                                    {t('search.resultsSummary', {
                                        count: results.length,
                                        sort:
                                            sortBy === 'relevance' ? t('search.sort.label.relevance') :
                                            sortBy === 'name' ? t('search.sort.label.name') :
                                            sortBy === 'path' ? t('search.sort.label.path') :
                                            sortBy === 'extension' ? t('search.sort.label.extension') :
                                            t('search.sort.label.relevance')
                                    })}
                                </div>
                                {results.map((result, index) => (
                                    <div key={index} className="result-item-container">
                                        <div className="result-icon-container">
                                            <FileIcon 
                                                filename={result.name} 
                                                isDirectory={result.isDirectory} 
                                                size="small"
                                            />
                                        </div>

                                        <div className="result-details-container">
                                            <div
                                                className="result-name-container"
                                                onClick={() => openItemLocation(result)}
                                                title={t('search.openLocationTitle', { directory: result.directory })}
                                            >
                                                <span className="result-name">{result.name}</span>
                                                {result.isDirectory && (
                                                    <span className="result-type-indicator">({t('search.directoryIndicator')})</span>
                                                )}
                                            </div>
                                            <div
                                                className="result-path-container"
                                                onClick={() => openItemLocation(result)}
                                                title={result.path}
                                            >
                                                {result.path}
                                            </div>
                                            {currentDirectory && result.path.startsWith(currentDirectory) && (
                                                <div className="result-context-indicator">
                                                    <span className="context-dot">•</span> {t('search.inCurrentDirectory')}
                                                </div>
                                            )}
                                        </div>

                                        <div className="result-actions-container">
                                            <button
                                                className="action-button-container"
                                                onClick={() => openItemLocation(result)}
                                                title={t('search.openContainingFolder')}
                                            >
                                                <span className="icon icon-folder"></span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default GlobalSearch;
