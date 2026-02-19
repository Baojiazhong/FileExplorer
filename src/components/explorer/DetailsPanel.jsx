import React from 'react';
import { useI18n } from '../../i18n';
import FileIcon from './FileIcon';
import { formatFileSize, formatDate, getFileType } from '../../utils/formatters';
import './detailsPanel.css';

/**
 * Component that displays detailed information about a selected item
 * @param {Object} props - Component properties
 * @param {Object} [props.item] - The selected item to display details for
 * @param {boolean} [props.isMultipleSelection=false] - Whether multiple items are selected
 * @returns {React.ReactElement} Details panel component
 */
const DetailsPanel = ({ item, isMultipleSelection = false }) => {
    const { t } = useI18n();
    // If no item selected or multiple items are selected
    if (!item || isMultipleSelection) {
        return (
            <div className="details-panel">
                <div className="details-header">
                    <h3 className="details-title">
                        {isMultipleSelection
                            ? t('details.multipleSelectedTitle')
                            : t('details.noneSelectedTitle')}
                    </h3>
                </div>

                <div className="details-content">
                    {isMultipleSelection ? (
                        <div className="details-summary">
                            {/* In a real implementation, this would show the count of files and folders,
              total size, etc. */}
                            <p>{t('details.multipleSelectedHint')}</p>
                        </div>
                    ) : (
                        <div className="details-empty">
                            <p>{t('details.noneSelectedHint')}</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Determine if item is a directory or file
    const isDirectory = 'sub_file_count' in item;

    // Format size
    const size = isDirectory
        ? t('details.sizeSummary', {
            files: item.sub_file_count || 0,
            folders: item.sub_dir_count || 0,
        })
        : formatFileSize(item.size_in_bytes);

    // Get file type
    const fileType = isDirectory ? t('details.folderType') : getFileType(item.name);

    // Get extension (for files)
    const extension = !isDirectory && item.name.includes('.')
        ? item.name.split('.').pop().toUpperCase()
        : '';

    // Format dates
    const created = formatDate(item.created, true);
    const modified = formatDate(item.last_modified, true);
    const accessed = formatDate(item.accessed, true);

    return (
        <div className="details-panel">
            <div className="details-header">
                <h3 className="details-title">{t('details.propertiesTitle')}</h3>
            </div>

            <div className="details-content">
                <div className="details-preview">
                    <div className="details-icon">
                        <FileIcon
                            filename={item.name}
                            isDirectory={isDirectory}
                            size="large"
                        />
                    </div>

                    <div className="details-name truncate" title={item.name}>
                        {item.name}
                    </div>

                    <div className="details-type">
                        {fileType}{extension ? ` (${extension})` : ''}
                    </div>
                </div>

                <div className="details-section">
                    <h4 className="details-section-title">{t('details.generalTitle')}</h4>

                    <div className="details-row">
                        <span className="details-label">{t('details.locationLabel')}</span>
                        <span className="details-value truncate" title={item.path}>
                          {item.path.replace(`/${item.name}`, '')}
                        </span>
                    </div>

                    <div className="details-row">
                        <span className="details-label">{t('details.sizeLabel')}</span>
                        <span className="details-value">
                          {size}
                            {!isDirectory && item.size_in_bytes != null && (
                                <span className="details-value-secondary"> {t('details.bytesValue', { bytes: item.size_in_bytes.toLocaleString() })}</span>
                            )}
                        </span>
                    </div>

                    {!isDirectory && (
                        <div className="details-row">
                            <span className="details-label">{t('details.typeLabel')}</span>
                            <span className="details-value">{fileType}</span>
                        </div>
                    )}
                </div>

                <div className="details-section">
                    <h4 className="details-section-title">{t('details.datesTitle')}</h4>

                    <div className="details-row">
                        <span className="details-label">{t('details.createdLabel')}</span>
                        <span className="details-value">{created}</span>
                    </div>

                    <div className="details-row">
                        <span className="details-label">{t('details.modifiedLabel')}</span>
                        <span className="details-value">{modified}</span>
                    </div>

                    <div className="details-row">
                        <span className="details-label">{t('details.accessedLabel')}</span>
                        <span className="details-value">{accessed}</span>
                    </div>
                </div>

                <div className="details-section">
                    <h4 className="details-section-title">{t('details.permissionsTitle')}</h4>

                    <div className="details-row">
                        <span className="details-label">{t('details.accessRightsLabel')}</span>
                        <span className="details-value">{item.access_rights_as_string}</span>
                    </div>

                    <div className="details-row">
                        <span className="details-label">{t('details.octalLabel')}</span>
                        <span className="details-value">{item.access_rights_as_number}</span>
                    </div>

                    <div className="details-row">
                        <span className="details-label">{t('details.symlinkLabel')}</span>
                        <span className="details-value">{item.is_symlink ? t('common.yes') : t('common.no')}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DetailsPanel;

