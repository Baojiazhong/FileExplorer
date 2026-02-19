import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useI18n } from '../../i18n';
import Modal from './Modal';
import Button from './Button';
import { showSuccess, showError } from '../../utils/NotificationSystem';

/**
 * PermissionHelper - Component to help users grant necessary permissions or browse to folder
 */
const PermissionHelper = ({
	isOpen,
	onClose,
	directoryPath,
	directoryName,
	onDirectorySelected,
}) => {
	const { t } = useI18n();
	const [isChecking, setIsChecking] = useState(false);
	const [hasAccess, setHasAccess] = useState(false);
	const [isBrowsing, setIsBrowsing] = useState(false);

	// Check if we have access to the directory
	const checkAccess = async () => {
		if (!directoryPath) return;

		setIsChecking(true);
		try {
			const access = await invoke('check_directory_access', { path: directoryPath });
			setHasAccess(access);
			if (access) {
				showSuccess(t('permission.accessGrantedToast', { name: directoryName }));
				setTimeout(onClose, 1000); // Close modal after success
			}
		} catch (error) {
			setHasAccess(false);
			console.log('Access check failed:', error);
		} finally {
			setIsChecking(false);
		}
	};

	// Auto-check when modal opens
	useEffect(() => {
		if (isOpen && directoryPath) {
			checkAccess();
		}
	}, [isOpen, directoryPath]);

	const handleGrantAccess = async () => {
		try {
			await invoke('request_full_disk_access');
		} catch (error) {
			console.error('Failed to open System Preferences:', error);
			showError(t('permission.systemPrefsFailed'));
		}
	};

	const handleTryAgain = () => {
		checkAccess();
	};

	const handleBrowseToFolder = async () => {
		setIsBrowsing(true);
		try {
			// Try to open folder picker starting from the parent directory.
			const lastSlashIndex = directoryPath
				? Math.max(directoryPath.lastIndexOf('/'), directoryPath.lastIndexOf('\\'))
				: -1;
			const parentPath = directoryPath && lastSlashIndex > 0 ? directoryPath.substring(0, lastSlashIndex) : null;

			const selectedPath = await open({
				directory: true,
				title: t('permission.browseTitle', { name: directoryName }),
				defaultPath: parentPath || undefined,
			});

			if (selectedPath) {
				showSuccess(t('permission.selectedFolder', { name: directoryName, path: selectedPath }));
				onDirectorySelected && onDirectorySelected(selectedPath);
				onClose();
			}
		} catch (error) {
			console.error('Failed to open folder picker:', error);
			showError(t('permission.pickerFailed'));
		} finally {
			setIsBrowsing(false);
		}
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={t('permission.modalTitle', { name: directoryName })}
			size="md"
			footer={
				<div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
					<Button variant="ghost" onClick={onClose}>
						{t('common.cancel')}
					</Button>
					{hasAccess ? (
						<Button variant="success" onClick={onClose}>
							<span className="icon icon-check"></span>
							{t('permission.footer.accessGranted')}
						</Button>
					) : (
						<>
							<Button variant="ghost" onClick={handleBrowseToFolder} disabled={isBrowsing}>
								{isBrowsing ? t('common.opening') : t('permission.footer.browse')}
							</Button>
							<Button variant="secondary" onClick={handleTryAgain} disabled={isChecking}>
								{isChecking ? t('common.checking') : t('common.tryAgain')}
							</Button>
							<Button variant="primary" onClick={handleGrantAccess}>
								{t('permission.footer.grant')}
							</Button>
						</>
					)}
				</div>
			}
		>
			<div className="permission-helper">
				<div className="permission-icon">
					{hasAccess ? (
						<span
							className="icon icon-check"
							style={{ color: 'var(--success)', fontSize: '48px' }}
						></span>
					) : (
						<span
							className="icon icon-lock"
							style={{ color: 'var(--warning)', fontSize: '48px' }}
						></span>
					)}
				</div>

				<div className="permission-content">
					{hasAccess ? (
						<div className="success-message">
							<h3>{t('permission.content.grantedTitle')}</h3>
							<p>{t('permission.content.grantedBody', { name: directoryName })}</p>
						</div>
					) : (
						<div className="permission-request">
							<h3>{t('permission.content.requiredTitle')}</h3>
							<p>{t('permission.content.requiredBody', { name: directoryName })}</p>

							<div className="instructions">
								<h4>{t('permission.content.optionsTitle', { name: directoryName })}</h4>
								<div className="option-section">
									<h5>{t('permission.content.option1Title')}</h5>
									<p>{t('permission.content.option1Body', { name: directoryName })}</p>
								</div>
								<div className="option-section">
									<h5>{t('permission.content.option2Title')}</h5>
									<ol>
										<li>{t('permission.content.option2Steps.s1')}</li>
										<li>{t('permission.content.option2Steps.s2')}</li>
										<li>{t('permission.content.option2Steps.s3', { name: directoryName })}</li>
										<li>{t('permission.content.option2Steps.s4')}</li>
									</ol>
								</div>
							</div>

							<div className="help-note">
								<p>
									<strong>{t('permission.content.note')}</strong> {t('permission.content.noteBody', { name: directoryName })}
								</p>
							</div>
						</div>
					)}
				</div>
			</div>

			<style>{`
                .permission-helper {
                    text-align: center;
                    padding: 20px 0;
                }
                
                .permission-icon {
                    margin-bottom: 24px;
                }
                
                .permission-content {
                    text-align: left;
                }
                
                .permission-content h3 {
                    color: var(--text-primary);
                    margin: 0 0 16px 0;
                    font-size: 1.4rem;
                    font-weight: 600;
                }
                
                .permission-content p {
                    color: var(--text-secondary);
                    line-height: 1.6;
                    margin: 0 0 16px 0;
                }
                
                .instructions {
                    background: var(--surface);
                    border: 1px solid var(--border);
                    border-radius: 8px;
                    padding: 20px;
                    margin: 20px 0;
                }
                
                .instructions h4 {
                    color: var(--text-primary);
                    margin: 0 0 12px 0;
                    font-size: 1.1rem;
                    font-weight: 600;
                }
                
                .instructions ol {
                    margin: 0;
                    padding-left: 20px;
                    color: var(--text-primary);
                }
                
                .instructions li {
                    margin: 8px 0;
                    line-height: 1.5;
                }
                
                .option-section {
                    margin: 16px 0;
                    padding: 16px;
                    background: var(--background);
                    border-radius: 6px;
                    border: 1px solid var(--border);
                }
                
                .option-section h5 {
                    color: var(--text-primary);
                    margin: 0 0 8px 0;
                    font-size: 1rem;
                    font-weight: 600;
                }
                
                .option-section p {
                    color: var(--text-secondary);
                    margin: 0 0 8px 0;
                    font-size: 0.9rem;
                }
                
                .help-note {
                    background: var(--info-bg, #e3f2fd);
                    border: 1px solid var(--info-border, #90caf9);
                    border-radius: 6px;
                    padding: 16px;
                    margin-top: 20px;
                }
                
                .help-note p {
                    margin: 0;
                    color: var(--info, #1565c0);
                    font-size: 0.9rem;
                }
                
                .success-message {
                    text-align: center;
                }
                
                .success-message h3 {
                    color: var(--success);
                }
            `}</style>
		</Modal>
	);
};

export default PermissionHelper;
