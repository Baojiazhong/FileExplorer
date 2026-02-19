
import React, { useState } from 'react';
import { useI18n } from '../../i18n';
import Modal from '../common/Modal';
import Button from '../common/Button';

/**
 * AddSftpConnectionView - Modal for adding a new SFTP connection
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {Function} props.onClose - Function to close the modal
 * @param {Function} props.onAdd - Function to add the SFTP connection
 */
const AddSftpConnectionView = ({ isOpen, onClose, onAdd }) => {
	const { t } = useI18n();
	const [name, setName] = useState('');
	const [host, setHost] = useState('localhost');
	const [port, setPort] = useState('22');
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState(null);
	const [error, setError] = useState(null);

	const canTest = !!host.trim() && !!port.trim() && !!username.trim();
	const canAdd = !!name.trim() && canTest;

	const handleTestConnection = async () => {
		setTesting(true);
		setTestResult(null);
		setError(null);
		try {
			// Use Tauri invoke to test SFTP connection by calling load_dir on "."
			const { invoke } = await import('@tauri-apps/api/core');
			await invoke('load_dir', {
				host,
				port: parseInt(port, 10),
				username,
				password,
				directory: ".",
			});
			setTestResult(t('sidebar.network.testSuccess'));
		} catch (e) {
			setTestResult(null);
			setError(e?.toString() || t('sidebar.network.testFailed'));
		} finally {
			setTesting(false);
		}
	};

	const handleAdd = () => {
		if (!canAdd) return;
		onAdd({ name, host, port, username, password });
		setName('');
		setHost('localhost');
		setPort('22');
		setUsername('');
		setPassword('');
		setTestResult(null);
		setError(null);
	};

	const handleClose = () => {
		setName('');
		setHost('localhost');
		setPort('22');
		setUsername('');
		setPassword('');
		setTestResult(null);
		setError(null);
		onClose();
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={handleClose}
			title={t('sidebar.network.addConnection')}
			size="sm"
			defaultAction={handleAdd}
			defaultActionEnabled={canAdd}
			footer={
				<>
					<Button variant="ghost" onClick={handleClose}>
						{t('common.cancel')}
					</Button>
					<Button
						variant="secondary"
						onClick={handleTestConnection}
						disabled={testing || !canTest}
					>
						{testing ? t('common.testing') : t('sidebar.network.testConnection')}
					</Button>
					<Button variant="primary" onClick={handleAdd} disabled={!canAdd}>
						{t('common.add')}
					</Button>
				</>
			}
		>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					handleAdd();
				}}
			>
				<div className="form-group">
					<label htmlFor="sftp-name">{t('sidebar.network.fields.name')}</label>
					<input
						type="text"
						id="sftp-name"
						className="input"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder={t('sidebar.network.placeholders.name')}
						autoFocus
					/>
				</div>
				<div className="form-group">
					<label htmlFor="sftp-host">{t('sidebar.network.fields.host')}</label>
					<input
						type="text"
						id="sftp-host"
						className="input"
						value={host}
						onChange={(e) => setHost(e.target.value)}
						placeholder={t('sidebar.network.placeholders.host')}
					/>
				</div>
				<div className="form-group">
					<label htmlFor="sftp-port">{t('sidebar.network.fields.port')}</label>
					<input
						type="number"
						id="sftp-port"
						className="input"
						value={port}
						onChange={(e) => setPort(e.target.value)}
						min="1"
						max="65535"
					/>
				</div>
				<div className="form-group">
					<label htmlFor="sftp-username">{t('sidebar.network.fields.username')}</label>
					<input
						type="text"
						id="sftp-username"
						className="input"
						value={username}
						onChange={(e) => setUsername(e.target.value)}
						placeholder={t('sidebar.network.placeholders.username')}
					/>
				</div>
				<div className="form-group">
					<label htmlFor="sftp-password">{t('sidebar.network.fields.password')}</label>
					<input
						type="password"
						id="sftp-password"
						className="input"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						placeholder={t('sidebar.network.placeholders.password')}
					/>
				</div>
				{testResult && (
					<div className="input-hint" style={{ color: 'var(--success)' }}>
						{testResult}
					</div>
				)}
				{error && (
					<div className="input-hint" style={{ color: 'var(--danger)' }}>
						{error}
					</div>
				)}
			</form>
		</Modal>
	);
};

export default AddSftpConnectionView;

