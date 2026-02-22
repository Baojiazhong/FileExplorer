import React, { useState, useEffect } from 'react';
import { useI18n } from '../../i18n';
import FileIcon from './FileIcon';
import { formatFileSize, formatDate, getFileType } from '../../utils/formatters';
import { replaceFileName } from '../../utils/pathUtils.js';
import { invoke } from '@tauri-apps/api/core';
import { useFileSystem } from '../../providers/FileSystemProvider';
import { useHistory } from '../../providers/HistoryProvider';
import { showError, showConfirm } from '../../utils/NotificationSystem';
import './fileItem.css';

/**
 * Component that displays a single file or directory item
 * @param {Object} props - Component properties
 * @param {Object} props.item - The file or directory object to display
 * @param {string} [props.viewMode='grid'] - The view mode: 'grid', 'list', or 'details'
 * @param {boolean} [props.isSelected=false] - Whether the item is currently selected
 * @param {boolean} [props.isFocused=false] - Whether the item is currently focused for keyboard navigation
 * @param {Function} props.onClick - Click handler function
 * @param {Function} props.onDoubleClick - Double-click handler function
 * @param {Function} props.onContextMenu - Context menu handler function
 * @returns {React.ReactElement} File/directory item component
 */
const FileItem = ({
                      item,
                      viewMode = 'grid',
                      isSelected = false,
                      isFocused = false,
                      isCut = false,
                      onClick,
                      onDoubleClick,
                      onContextMenu
                  }) => {
    const { t } = useI18n();
    const { loadDirectory } = useFileSystem();
    const { currentPath } = useHistory();

    const isDirectory = item.isDirectory || 'sub_file_count' in item;
    const fileType = isDirectory ? t('details.folderType') : getFileType(item.name);
    const size = isDirectory
        ? t('details.sizeSummary', {
            files: item.sub_file_count || 0,
            folders: item.sub_dir_count || 0,
        })
        : formatFileSize(item.size_in_bytes);

    const modified = formatDate(item.last_modified);

    /**
     * Handles the rename operation with robust path handling
     * @param {Object} item - The item to rename
     * @param {string} newName - The new name for the item
     */
    const handleRename = async (item, newName) => {
        if (!newName || newName === item.name) return;

        try {
            // Use the robust path utility to create the new path
            const newPath = replaceFileName(item.path, newName);

            await invoke('rename', {
                oldPath: item.path,
                newPath: newPath
            });

            // Reload current directory
            if (currentPath) {
                await loadDirectory(currentPath);
            }
        } catch (error) {
            console.error('Rename operation failed:', error);
            if (error.message && error.message.includes('already exists')) {
                const shouldCreateCopy = await showConfirm(
                    t('explorer.create.alreadyExists', { name: newName }),
                    {
                        title: t('explorer.rename.fileExistsTitle'),
                        confirmText: t('explorer.rename.createCopyButton'),
                        cancelText: t('common.cancel'),
                    }
                );
                if (shouldCreateCopy) {
                    const extension = newName.includes('.') ? newName.split('.').pop() : '';
                    const baseName = extension ? newName.replace(`.${extension}`, '') : newName;
                    const copyName = extension ? `${baseName} - Copy.${extension}` : `${baseName} - Copy`;
                    handleRename(item, copyName);
                }
            } else {
                showError(t('explorer.rename.failed', { message: error.message || error }));
            }
        }
    };

    /**
     * Handles click events on the file item
     * @param {React.MouseEvent} e - The click event
     */
    const handleClick = (e) => {
        if (onClick) onClick(e);
    };

    /**
     * Handles mouse down events to prevent text selection
     * @param {React.MouseEvent} e - The mouse down event
     */
    const handleMouseDown = (e) => {
        // Prevent text selection on mouse down
        e.preventDefault();
    };

    /**
     * Handles selectstart events to prevent text selection
     * @param {React.SyntheticEvent} e - The selectstart event
     */
    const handleSelectStart = (e) => {
        // Prevent any text selection
        e.preventDefault();
        return false;
    };

    /**
     * Handles double-click events on the file item
     * @param {React.MouseEvent} e - The double-click event
     */
    const handleDoubleClick = (e) => {
        // Prevent text selection on double-click
        e.preventDefault();
        e.stopPropagation();
        
        // Clear any existing text selection
        if (window.getSelection) {
            window.getSelection().removeAllRanges();
        }
        
        if (onDoubleClick) onDoubleClick(e);
    };

    /**
     * Handles right-click context menu events on the file item
     * @param {React.MouseEvent} e - The context menu event
     */
    const handleContextMenu = (e) => {
        if (onContextMenu) onContextMenu(e);
    };

    return (
        <>
            <div
                className={`file-item view-mode-${viewMode.toLowerCase()} ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''} ${isDirectory ? 'directory' : 'file'} ${isCut ? 'cut' : ''}`}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onMouseDown={handleMouseDown}
                onSelectStart={handleSelectStart}
                onContextMenu={handleContextMenu}
                data-path={item.path}
            >
                {viewMode === 'grid' && (
                    <div className="file-item-grid">
                        <div className="file-icon-container">
                            <FileIcon filename={item.name} isDirectory={isDirectory} />
                        </div>

                        <div className="file-name truncate" title={item.name}>
                            {item.name}
                        </div>
                    </div>
                )}

                {viewMode === 'list' && (
                    <div className="file-item-list">
                        <div className="file-icon-container">
                            <FileIcon filename={item.name} isDirectory={isDirectory} />
                        </div>

                        <div className="file-details">
                            <div className="file-name truncate" title={item.name}>
                                {item.name}
                            </div>
                            <div className="file-info truncate">
                                {size} • {modified}
                            </div>
                        </div>
                    </div>
                )}

                {viewMode === 'details' && (
                    <div className="file-item-details">
                        <div className="file-column column-name">
                            <div className="file-icon-container">
                                <FileIcon filename={item.name} isDirectory={isDirectory} />
                            </div>

                            <div className="file-name truncate" title={item.name}>
                                {item.name}
                            </div>
                        </div>

                        <div className="file-column column-size">
                            {size}
                        </div>

                        <div className="file-column column-type">
                            {fileType}
                        </div>

                        <div className="file-column column-modified">
                            {modified}
                        </div>
                    </div>
                )}
            </div>

        </>
    );
};

export default React.memo(FileItem);
