import React, { useEffect, useState, useCallback } from 'react';
import SidebarItem from './SidebarItem';
import { useI18n } from '../../i18n';
import { showConfirm } from '../../utils/NotificationSystem';

/**
 * Favorites component - Displays and manages favorite locations
 *
 * @param {Object} props - Component props
 * @param {boolean} [props.isCollapsed=false] - Whether the sidebar is collapsed
 * @param {Function} props.onItemClick - Callback when an item is clicked
 * @param {Function} props.onRemove - Callback to remove an item from favorites
 * @param {Function} props.onAdd - Callback to add an item to favorites
 * @param {string} props.currentView - Current view being displayed
 * @param {string} props.currentPath - Current path being displayed
 * @returns {React.ReactElement} Favorites component
 */
const Favorites = ({
                       isCollapsed = false,
                       onItemClick,
                       onRemove,
                       onAdd,
                       currentView,
                       currentPath
}) => {
    const { t } = useI18n();
    const [favorites, setFavorites] = useState([]);

    /**
     * Load favorites from localStorage
     * @returns {void}
     */
    const loadFavorites = useCallback(() => {
        try {
            const savedFavorites = JSON.parse(localStorage.getItem('fileExplorerFavorites') || '[]');
            setFavorites(savedFavorites);
        } catch (err) {
            console.error('Failed to load favorites:', err);
            setFavorites([]);
        }
    }, []);

    /**
     * Load favorites on mount
     */
    useEffect(() => {
        loadFavorites();
    }, [loadFavorites]);

    /**
     * Listen for storage events (from other tabs) and custom events (from current tab)
     */
    useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key === 'fileExplorerFavorites') {
                loadFavorites();
            }
        };

        const handleFavoritesUpdate = () => {
            loadFavorites();
        };

        // Listen for storage events from other tabs
        window.addEventListener('storage', handleStorageChange);

        // Listen for custom events from the current tab
        window.addEventListener('favorites-updated', handleFavoritesUpdate);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('favorites-updated', handleFavoritesUpdate);
        };
    }, [loadFavorites]);

    /**
     * Handle context menu for favorites
     * @param {React.MouseEvent} e - Context menu event
     * @param {Object} item - The favorite item
     */
    const handleContextMenu = async (e, item) => {
        e.preventDefault();

        const choice = await showConfirm(t('sidebar.favorites.removeConfirm'), {
            title: t('common.confirm'),
            confirmText: t('common.confirm'),
            cancelText: t('common.cancel'),
        });

        if (choice) {
            onRemove(item.path);
        }
    };

    // If there are no favorites, display a message
    if (favorites.length === 0) {
        if (isCollapsed) return null;

        return (
            <div className="sidebar-empty-state">
                <div className="empty-state-icon">
                    <span className="icon icon-star"></span>
                </div>
                <div className="empty-state-text">
                    <p>{t('sidebar.favorites.emptyTitle')}</p>
                    <span>{t('sidebar.favorites.emptyHint')}</span>
                </div>
            </div>
        );
    }

    return (
        <ul className="sidebar-list">
            {favorites.map((item) => (
                <SidebarItem
                    key={item.path}
                    icon={item.icon || 'star'}
                    name={item.name}
                    path={item.path}
                    isCollapsed={isCollapsed}
                    isActive={currentView === 'explorer' && currentPath === item.path}
                    onClick={() => onItemClick(item.path)}
                    onContextMenu={(e) => handleContextMenu(e, item)}
                    actions={[
                        {
                            icon: 'x',
                            tooltip: t('sidebar.favorites.removeTooltip'),
                            onClick: () => onRemove(item.path),
                        },
                    ]}
                />
            ))}
        </ul>
    );
};

export default Favorites;