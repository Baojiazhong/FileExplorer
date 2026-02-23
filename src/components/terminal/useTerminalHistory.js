import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'terminal-command-history';
const MAX_HISTORY = 50;

const useTerminalHistory = () => {
    const [persistentHistory, setPersistentHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) setPersistentHistory(JSON.parse(saved).slice(-MAX_HISTORY));
        } catch {}
    }, []);

    useEffect(() => {
        try {
            if (persistentHistory.length > 0) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(persistentHistory));
            }
        } catch {}
    }, [persistentHistory]);

    const addToHistory = useCallback((command) => {
        setPersistentHistory(prev => {
            const filtered = prev.filter(cmd => cmd !== command);
            return [...filtered, command].slice(-MAX_HISTORY);
        });
        setHistoryIndex(-1);
    }, []);

    const clearHistory = useCallback(() => {
        setPersistentHistory([]);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    const navigateUp = useCallback(() => {
        if (persistentHistory.length === 0) return null;
        const newIndex = historyIndex < persistentHistory.length - 1 ? historyIndex + 1 : historyIndex;
        if (newIndex >= 0 && newIndex < persistentHistory.length) {
            setHistoryIndex(newIndex);
            return persistentHistory[persistentHistory.length - 1 - newIndex];
        }
        return null;
    }, [persistentHistory, historyIndex]);

    const navigateDown = useCallback(() => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            return persistentHistory[persistentHistory.length - 1 - newIndex];
        } else if (historyIndex === 0) {
            setHistoryIndex(-1);
            return '';
        }
        return null;
    }, [persistentHistory, historyIndex]);

    const resetIndex = useCallback(() => setHistoryIndex(-1), []);

    const searchHistory = useCallback((query) => {
        if (!query.trim()) return [];
        return persistentHistory.filter(cmd =>
            cmd.toLowerCase().includes(query.toLowerCase())
        ).slice(-10);
    }, [persistentHistory]);

    return {
        persistentHistory,
        historyIndex,
        addToHistory,
        clearHistory,
        navigateUp,
        navigateDown,
        resetIndex,
        searchHistory,
    };
};

export default useTerminalHistory;
