import React from 'react';
import { useI18n } from '../../i18n';
import './emptyState.css';

/**
 * Component for displaying various empty state messages
 * @param {Object} props - Component properties
 * @param {string} [props.type='empty-folder'] - Type of empty state to display
 * @param {string} [props.searchTerm=null] - Search term to display in 'no-results' state
 * @param {string} [props.title=null] - Custom title to override default
 * @param {string} [props.message=null] - Custom message to override default
 * @returns {React.ReactElement} Empty state component
 */
const EmptyState = ({ type = 'empty-folder', searchTerm = null, title = null, message = null }) => {
    const { t } = useI18n();

    const noResultsTitle = searchTerm
        ? t('explorer.emptyState.noResults.titleWithQuery', { query: searchTerm })
        : t('explorer.emptyState.noResults.title');

    // Different empty states
    const emptyStates = {
        'empty-folder': {
            icon: 'folder-empty',
            title: t('explorer.emptyState.emptyFolder.title'),
            message: t('explorer.emptyState.emptyFolder.message'),
        },
        'no-results': {
            icon: 'search-empty',
            title: noResultsTitle,
            message: t('explorer.emptyState.noResults.message'),
        },
        'no-favorites': {
            icon: 'star-empty',
            title: t('explorer.emptyState.noFavorites.title'),
            message: t('explorer.emptyState.noFavorites.message'),
        },
        'no-templates': {
            icon: 'template-empty',
            title: t('explorer.emptyState.noTemplates.title'),
            message: t('explorer.emptyState.noTemplates.message'),
        },
        error: {
            icon: 'error',
            title: t('explorer.emptyState.error.title'),
            message: t('explorer.emptyState.error.message'),
        },
    };

    const emptyState = emptyStates[type] || emptyStates['empty-folder'];

    // Allow overriding title and message via props
    const finalTitle = title || emptyState.title;
    const finalMessage = message || emptyState.message;

    return (
        <div className="empty-state">
            <div className={`empty-state-icon icon-${emptyState.icon}`}></div>
            <h3 className="empty-state-title">{finalTitle}</h3>
            <p className="empty-state-message">{finalMessage}</p>
        </div>
    );
};

export default EmptyState;