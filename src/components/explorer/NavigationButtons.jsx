import React from 'react';
import { useHistory } from '../../providers/HistoryProvider';
import { useFileSystem } from '../../providers/FileSystemProvider';
import { useI18n } from '../../i18n';
import { showError, showSuccess } from '../../utils/NotificationSystem';
import './navigationButtons.css';

/**
 * NavigationButtons component - Provides back, forward, and refresh navigation controls
 * @returns {React.ReactElement} NavigationButtons component
 */
const NavigationButtons = () => {
    const { t } = useI18n();
    const { canGoBack, canGoForward, goBack, goForward, currentPath } = useHistory();
    const { loadDirectory, loadVolumes } = useFileSystem();

    /**
     * Handles directory refresh action
     * Reloads the current directory and displays notification feedback
     * @async
     */
    const handleRefresh = async () => {
        const hasCurrentPath = !!currentPath;

        try {
            // Refresh volumes (disks, space, etc.)
            await loadVolumes();

            if (hasCurrentPath) {
                await loadDirectory(currentPath);
                showSuccess(t('navigation.refreshedDirectoryAndDisks'));
            } else {
                showSuccess(t('navigation.refreshedVolumes'));
            }
        } catch (error) {
            console.error('Failed to refresh directory or disks:', error);
            showError(t(hasCurrentPath ? 'navigation.refreshDirectoryAndDisksFailed' : 'navigation.refreshVolumesFailed'));
        }
    };

    return (
        <div className="navigation-buttons">
            <button
                className="nav-button"
                onClick={goBack}
                disabled={!canGoBack}
                aria-label={t('navigation.backAria')}
                title={t('navigation.backTitle')}
            >
                <span className="icon icon-arrow-left"></span>
            </button>

            <button
                className="nav-button"
                onClick={goForward}
                disabled={!canGoForward}
                aria-label={t('navigation.forwardAria')}
                title={t('navigation.forwardTitle')}
            >
                <span className="icon icon-arrow-right"></span>
            </button>

            <button
                className="nav-button"
                onClick={handleRefresh}
                aria-label={t('navigation.refreshAria')}
                title={t('navigation.refreshTitle')}
            >
                <span className="icon icon-refresh"></span>
            </button>
        </div>
    );
};

export default NavigationButtons;