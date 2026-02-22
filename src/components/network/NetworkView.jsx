import React, { useState, useEffect } from 'react';
import { useSftp } from '../../providers/SftpProvider';
import { useFileSystem } from '../../providers/FileSystemProvider';
import { useHistory } from '../../providers/HistoryProvider';
import { useI18n } from '../../i18n';
import { showSuccess, showError } from '../../utils/NotificationSystem';
import AddSftpConnectionView from '../sidebar/AddSftpConnectionView';
import './networkView.css';

/**
 * NetworkView component that displays available network connections
 * and provides management for SFTP connections
 */
const NetworkView = () => {
    const { t } = useI18n();
    const { sftpConnections, navigateToSftpConnection, createSftpUrl } = useSftp();
    const { loadDirectory } = useFileSystem();
    const { navigateTo } = useHistory();
    const [isAddSftpModalOpen, setIsAddSftpModalOpen] = useState(false);
    const [localSftpConnections, setLocalSftpConnections] = useState([]);

    // Load SFTP connections
    useEffect(() => {
        const loadConnections = () => {
            try {
                const saved = JSON.parse(localStorage.getItem('fileExplorerSftpConnections') || '[]');
                setLocalSftpConnections(saved);
            } catch (err) {
                setLocalSftpConnections([]);
            }
        };

        loadConnections();
        
        const handler = () => loadConnections();
        const storageHandler = (e) => {
            if (e.key === 'fileExplorerSftpConnections') loadConnections();
        };
        window.addEventListener('sftp-connections-updated', handler);
        window.addEventListener('storage', storageHandler);
        
        return () => {
            window.removeEventListener('sftp-connections-updated', handler);
            window.removeEventListener('storage', storageHandler);
        };
    }, []);

    // Add SFTP connection
    const addSftpConnection = (conn) => {
        try {
            const existing = JSON.parse(localStorage.getItem('fileExplorerSftpConnections') || '[]');
            const newConnections = [...existing, conn];
            localStorage.setItem('fileExplorerSftpConnections', JSON.stringify(newConnections));
            window.dispatchEvent(new CustomEvent('sftp-connections-updated'));
            window.dispatchEvent(new StorageEvent('storage', {
                key: 'fileExplorerSftpConnections',
                newValue: JSON.stringify(newConnections)
            }));
            showSuccess(t('networkView.sftp.addSuccess', { name: conn.name }));
        } catch (err) {
            showError(t('networkView.sftp.addFailed'));
        }
        setIsAddSftpModalOpen(false);
    };

    // Connect to SFTP server
    const handleConnectToSftp = async (connection) => {
        try {
            const sftpData = await navigateToSftpConnection(connection);
            if (sftpData) {
                const sftpPath = createSftpUrl(connection, '.');
                await loadDirectory(sftpPath);
                navigateTo(sftpPath);
                showSuccess(t('networkView.sftp.connected', { name: connection.name }));
            }
        } catch (error) {
            console.error('Failed to connect to SFTP:', error);
            showError(
                t('networkView.sftp.connectFailed', {
                    name: connection.name,
                    message: error.message || error,
                })
            );
        }
    };

    return (
        <div className="network-view">
            <div className="network-view-header">
                <h2 className="network-view-title">{t('networkView.title')}</h2>
                <p className="network-view-subtitle">{t('networkView.subtitle')}</p>
            </div>

            <div className="network-connections-section">
                <div className="section-header">
                    <h3 className="section-title">{t('networkView.sftpConnectionsTitle')}</h3>
                    <button
                        className="add-connection-button"
                        onClick={() => setIsAddSftpModalOpen(true)}
                        title={t('networkView.addConnectionTitle')}
                        aria-label={t('networkView.addConnectionAria')}
                    >
                        <span className="icon icon-plus"></span>
                        <span>{t('networkView.addConnection')}</span>
                    </button>
                </div>

                <div className="connections-grid">
                    {localSftpConnections.length === 0 ? (
                        <div className="empty-connections">
                            <div className="empty-connections-icon">
                                <span className="icon icon-network"></span>
                            </div>
                            <h4>{t('sidebar.network.emptyTitle')}</h4>
                            <p>{t('networkView.emptyHint')}</p>
                            <button
                                className="add-first-connection-button"
                                onClick={() => setIsAddSftpModalOpen(true)}
                                aria-label={t('networkView.addFirstConnectionAria')}
                            >
                                <span className="icon icon-plus"></span>
                                {t('networkView.addFirstConnection')}
                            </button>
                        </div>
                    ) : (
                        localSftpConnections.map((connection) => (
                            <div key={connection.name} className="connection-card">
                                <div className="connection-icon">
                                    <span className="icon icon-network"></span>
                                </div>
                                <div className="connection-details">
                                    <h4 className="connection-name">{connection.name}</h4>
                                    <p className="connection-address">
                                        {connection.username}@{connection.host}:{connection.port}
                                    </p>
                                </div>
                                <div className="connection-actions">
                                    <button
                                        className="connect-button"
                                        onClick={() => handleConnectToSftp(connection)}
                                        title={t('networkView.connectTitle')}
                                        aria-label={t('networkView.connectAria', { name: connection.name })}
                                    >
                                        <span className="icon icon-play"></span>
                                        {t('networkView.connect')}
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="network-info-section">
                <h3 className="section-title">{t('networkView.aboutTitle')}</h3>
                <div className="info-cards">
                    <div className="info-card">
                        <div className="info-icon">
                            <span className="icon icon-shield"></span>
                        </div>
                        <div className="info-content">
                            <h4>{t('networkView.about.secure.title')}</h4>
                            <p>{t('networkView.about.secure.body')}</p>
                        </div>
                    </div>
                    <div className="info-card">
                        <div className="info-icon">
                            <span className="icon icon-folder"></span>
                        </div>
                        <div className="info-content">
                            <h4>{t('networkView.about.operations.title')}</h4>
                            <p>{t('networkView.about.operations.body')}</p>
                        </div>
                    </div>
                    <div className="info-card">
                        <div className="info-icon">
                            <span className="icon icon-sync"></span>
                        </div>
                        <div className="info-content">
                            <h4>{t('networkView.about.integration.title')}</h4>
                            <p>{t('networkView.about.integration.body')}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Add SFTP Connection Modal */}
            <AddSftpConnectionView
                isOpen={isAddSftpModalOpen}
                onClose={() => setIsAddSftpModalOpen(false)}
                onAdd={addSftpConnection}
            />
        </div>
    );
};

export default NetworkView;