import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettings } from '../../providers/SettingsProvider';
import { useI18n, LOCALES } from '../../i18n';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { showConfirm, showSuccess } from '../../utils/NotificationSystem';
import './settings.css';
/**
 * SettingsPanel component - Provides a comprehensive settings interface
 * @param {Object} props - Component props
 * @param {boolean} props.isOpen - Whether the settings panel is open
 * @param {Function} props.onClose - Callback function when panel is closed
 * @returns {React.ReactElement} Settings panel modal component
 */
const SettingsPanel = ({ isOpen, onClose }) => {
    const { t } = useI18n();
    const { settings, error, updateSetting, resetSettings, reloadSettings } = useSettings();

    const [isResetting, setIsResetting] = useState(false);
    const [activeTab, setActiveTab] = useState('appearance');
    const [localError, setLocalError] = useState(null);

    const tabs = useMemo(
        () => [
            { id: 'appearance', label: t('settings.tabs.appearance'), icon: 'palette' },
            { id: 'behavior', label: t('settings.tabs.behavior'), icon: 'settings' },
            { id: 'search', label: t('settings.tabs.search'), icon: 'search' },
            { id: 'advanced', label: t('settings.tabs.advanced'), icon: 'cog' },
        ],
        [t]
    );

    const keymapPresets = [
        { id: 'auto', label: t('settings.advanced.keyboard.presets.auto') },
        { id: 'windows', label: t('settings.advanced.keyboard.presets.windows') },
        { id: 'macos', label: t('settings.advanced.keyboard.presets.macos') },
        { id: 'linux', label: t('settings.advanced.keyboard.presets.linux') },
    ];

    /**
     * Theme options configuration
     * @type {Array<{id: boolean, label: string}>}
     */
    const themes = [
        { id: false, label: t('settings.appearance.theme.light') },
        { id: true, label: t('settings.appearance.theme.dark') }
    ];

    /**
     * View mode options configuration
     * @type {Array<{id: string, label: string}>}
     */
    const viewModes = [
        { id: 'grid', label: t('settings.appearance.defaultView.grid') },
        { id: 'list', label: t('settings.appearance.defaultView.list') },
        { id: 'details', label: t('settings.appearance.defaultView.details') }
    ];

    /**
     * Font size options configuration
     * @type {Array<{id: string, label: string}>}
     */
    const fontSizes = [
        { id: 'Small', label: t('settings.appearance.fontSize.small') },
        { id: 'Medium', label: t('settings.appearance.fontSize.medium') },
        { id: 'Large', label: t('settings.appearance.fontSize.large') }
    ];

    /**
     * Sort options configuration
     * @type {Array<{id: string, label: string}>}
     */
    const sortOptions = [
        { id: 'Name', label: t('settings.behavior.defaultSort.name') },
        { id: 'Size', label: t('settings.behavior.defaultSort.size') },
        { id: 'Modified', label: t('settings.behavior.defaultSort.dateModified') },
        { id: 'Type', label: t('settings.behavior.defaultSort.type') }
    ];

    /**
     * Sort direction options configuration
     * @type {Array<{id: string, label: string}>}
     */
    const sortDirections = [
        { id: 'Ascending', label: t('settings.behavior.defaultSort.ascending') },
        { id: 'Descending', label: t('settings.behavior.defaultSort.descending') }
    ];

    /**
     * Double-click behavior options configuration
     * @type {Array<{id: string, label: string}>}
     */
    const doubleClickOptions = [
        { id: 'OpenFilesAndFolders', label: t('settings.behavior.doubleClick.open') },
        { id: 'SelectFilesAndFolders', label: t('settings.behavior.doubleClick.select') }
    ];

    /**
     * Hash algorithm options configuration
     * @type {Array<{id: string, label: string}>}
     */
    const hashAlgorithms = [
        { id: 'MD5', label: 'MD5' },
        { id: 'SHA256', label: 'SHA-256' },
        { id: 'SHA384', label: 'SHA-384' },
        { id: 'SHA512', label: 'SHA-512' },
        { id: 'CRC32', label: 'CRC32' }
    ];

    /**
     * Effect to clear local error after timeout
     */
    useEffect(() => {
        if (localError) {
            const timer = setTimeout(() => setLocalError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [localError]);

    /**
     * Handles resetting all settings to default values
     * Confirms with user before proceeding
     * @async
     */
    const handleReset = async () => {
        const confirmed = await showConfirm(t('settings.advanced.dangerZone.resetConfirm'), {
            title: t('settings.advanced.dangerZone.title'),
            confirmText: t('common.confirm'),
            cancelText: t('common.cancel'),
        });

        if (!confirmed) {
            return;
        }

        setIsResetting(true);
        try {
            await resetSettings();
            setLocalError(null);
            showSuccess(t('settings.advanced.dangerZone.resetDone'));
        } catch (error) {
            console.error('Failed to reset settings:', error);
            setLocalError(t('settings.advanced.dangerZone.resetFailed'));
        } finally {
            setIsResetting(false);
        }
    };

    /**
     * Handles clearing the search index
     * @async
     */
    const handleClearSearchIndex = async () => {
        try {
            await invoke('clear_search_engine');
            showSuccess(t('settings.search.index.cleared'));
        } catch (error) {
            console.error('Failed to clear search index:', error);
            setLocalError(t('settings.search.index.clearFailed'));
        }
    };

    /**
     * Renders the appearance settings tab content
     * @returns {React.ReactElement} Appearance tab content
     */
    const renderAppearanceTab = () => (
        <div className="settings-tab-content">
            <div className="settings-section">
                <h3>{t('settings.appearance.theme.title')}</h3>
                <div className="radio-group">
                    {themes.map(theme => (
                        <label key={theme.id.toString()} className="radio-option">
                            <input
                                type="radio"
                                name="darkmode"
                                value={theme.id}
                                checked={settings.darkmode === theme.id}
                                onChange={(e) => updateSetting('darkmode', e.target.value === 'true')}
                            />
                            <span>{theme.label}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className="settings-section">
                <h3>{t('settings.appearance.defaultView.title')}</h3>
                <div className="radio-group">
                    {viewModes.map(mode => (
                        <label key={mode.id} className="radio-option">
                            <input
                                type="radio"
                                name="default_view"
                                value={mode.id}
                                checked={settings.default_view === mode.id}
                                onChange={(e) => updateSetting('default_view', e.target.value)}
                            />
                            <span>{mode.label}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className="settings-section">
                <h3>{t('settings.appearance.fontSize.title')}</h3>
                <select
                    value={settings.font_size || 'Medium'}
                    onChange={(e) => updateSetting('font_size', e.target.value)}
                    className="settings-select"
                >
                    {fontSizes.map(size => (
                        <option key={size.id} value={size.id}>{size.label}</option>
                    ))}
                </select>
            </div>

            <div className="settings-section">
                <h3>{t('settings.appearance.accentColor.title')}</h3>
                <div className="form-group">
                    <input
                        type="color"
                        value={settings.accent_color || '#0672ef'}
                        onChange={(e) => updateSetting('accent_color', e.target.value)}
                        className="color-picker"
                    />
                    <div className="input-hint">
                        {t('settings.appearance.accentColor.hint')}
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <h3>{t('language.label')}</h3>
                <div className="form-group">
                    <select
                        value={settings.language || LOCALES.AUTO}
                        onChange={(e) => updateSetting('language', e.target.value)}
                        className="settings-select"
                    >
                        <option value={LOCALES.AUTO}>{t('common.auto')}</option>
                        <option value={LOCALES.EN_US}>{t('language.english')}</option>
                        <option value={LOCALES.ZH_CN}>{t('language.simplifiedChinese')}</option>
                    </select>
                </div>
            </div>

            <div className="settings-section">
                <label className="checkbox-option">
                    <input
                        type="checkbox"
                        checked={settings.show_file_extensions !== false}
                        onChange={(e) => updateSetting('show_file_extensions', e.target.checked)}
                    />
                    <span>{t('settings.appearance.showFileExtensions')}</span>
                </label>
            </div>

        </div>
    );

    /**
     * Renders the behavior settings tab content
     * @returns {React.ReactElement} Behavior tab content
     */
    const renderBehaviorTab = () => (
        <div className="settings-tab-content">
            <div className="settings-section">
                <h3>{t('settings.behavior.fileOperations.title')}</h3>
                <label className="checkbox-option">
                    <input
                        type="checkbox"
                        checked={settings.confirm_delete !== false}
                        onChange={(e) => updateSetting('confirm_delete', e.target.checked)}
                    />
                    <span>{t('settings.behavior.fileOperations.confirmDelete')}</span>
                </label>

                <label className="checkbox-option">
                    <input
                        type="checkbox"
                        checked={settings.show_hidden_files_and_folders || false}
                        onChange={(e) => updateSetting('show_hidden_files_and_folders', e.target.checked)}
                    />
                    <span>{t('settings.behavior.fileOperations.showHidden')}</span>
                </label>

                <label className="checkbox-option">
                    <input
                        type="checkbox"
                        checked={settings.auto_refresh_dir !== false}
                        onChange={(e) => updateSetting('auto_refresh_dir', e.target.checked)}
                    />
                    <span>{t('settings.behavior.fileOperations.autoRefresh')}</span>
                </label>
            </div>

            <div className="settings-section">
                <h3>{t('settings.behavior.defaultSort.title')}</h3>
                <div className="form-row">
                    <div className="form-group">
                        <label>{t('settings.behavior.defaultSort.sortBy')}</label>
                        <select
                            value={settings.sort_by || 'Name'}
                            onChange={(e) => updateSetting('sort_by', e.target.value)}
                            className="settings-select"
                        >
                            {sortOptions.map(option => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>{t('settings.behavior.defaultSort.direction')}</label>
                        <select
                            value={settings.sort_direction || 'Ascending'}
                            onChange={(e) => updateSetting('sort_direction', e.target.value)}
                            className="settings-select"
                        >
                            {sortDirections.map(option => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <h3>{t('settings.behavior.doubleClick.title')}</h3>
                <div className="radio-group">
                    {doubleClickOptions.map(option => (
                        <label key={option.id} className="radio-option">
                            <input
                                type="radio"
                                name="double_click"
                                value={option.id}
                                checked={settings.double_click === option.id}
                                onChange={(e) => updateSetting('double_click', e.target.value)}
                            />
                            <span>{option.label}</span>
                        </label>
                    ))}
                </div>
            </div>
        </div>
    );

    /**
     * Renders the search settings tab content
     * @returns {React.ReactElement} Search tab content
     */
    const renderSearchTab = () => (
        <div className="settings-tab-content">
            <div className="settings-section">
                <h3>{t('settings.search.behavior.title')}</h3>
                <label className="checkbox-option">
                    <input
                        type="checkbox"
                        checked={settings.case_sensitive_search || false}
                        onChange={(e) => updateSetting('case_sensitive_search', e.target.checked)}
                    />
                    <span>{t('settings.search.behavior.caseSensitive')}</span>
                </label>

                <label className="checkbox-option">
                    <input
                        type="checkbox"
                        checked={settings.index_hidden_files || false}
                        onChange={(e) => updateSetting('index_hidden_files', e.target.checked)}
                    />
                    <span>{t('settings.search.behavior.includeHidden')}</span>
                </label>

                <label className="checkbox-option">
                    <input
                        type="checkbox"
                        checked={settings.fuzzy_search_enabled !== false}
                        onChange={(e) => updateSetting('fuzzy_search_enabled', e.target.checked)}
                    />
                    <span>{t('settings.search.behavior.fuzzy')}</span>
                </label>

                <label className="checkbox-option">
                    <input
                        type="checkbox"
                        checked={settings.enable_suggestions !== false}
                        onChange={(e) => updateSetting('enable_suggestions', e.target.checked)}
                    />
                    <span>{t('settings.search.behavior.suggestions')}</span>
                </label>

                <label className="checkbox-option">
                    <input
                        type="checkbox"
                        checked={settings.highlight_matches !== false}
                        onChange={(e) => updateSetting('highlight_matches', e.target.checked)}
                    />
                    <span>{t('settings.search.behavior.highlight')}</span>
                </label>
            </div>

            <div className="settings-section">
                <h3>{t('settings.search.index.title')}</h3>
                <p>{t('settings.search.index.description')}</p>

                <label className="checkbox-option">
                    <input
                        type="checkbox"
                        checked={settings.search_engine_enabled !== false}
                        onChange={(e) => updateSetting('search_engine_enabled', e.target.checked)}
                    />
                    <span>{t('settings.search.index.enable')}</span>
                </label>

                <Button
                    variant="secondary"
                    onClick={handleClearSearchIndex}
                >
                    {t('settings.search.index.clear')}
                </Button>
            </div>
        </div>
    );

    /**
     * Renders the advanced settings tab content
     * @returns {React.ReactElement} Advanced tab content
     */
    const renderAdvancedTab = () => (
        <div className="settings-tab-content">
            <div className="settings-section">
                <h3>{t('settings.advanced.keyboard.title')}</h3>
                <div className="form-group">
                    <label>{t('settings.advanced.keyboard.shortcutPreset')}</label>
                    <select
                        value={settings.keymap_preset || 'auto'}
                        onChange={(e) => updateSetting('keymap_preset', e.target.value)}
                        className="settings-select"
                    >
                        {keymapPresets.map(preset => (
                            <option key={preset.id} value={preset.id}>{preset.label}</option>
                        ))}
                    </select>
                    <div className="input-hint">
                        {t('settings.advanced.keyboard.autoHint')}
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <h3>{t('settings.advanced.performance.title')}</h3>
                <div className="form-group">
                    <label>{t('settings.advanced.performance.terminalHeight')}</label>
                    <input
                        type="number"
                        min="200"
                        max="600"
                        value={settings.terminal_height || 240}
                        onChange={(e) => updateSetting('terminal_height', parseInt(e.target.value))}
                        className="settings-input"
                    />
                </div>

                <label className="checkbox-option">
                    <input
                        type="checkbox"
                        checked={settings.enable_animations_and_transitions !== false}
                        onChange={(e) => updateSetting('enable_animations_and_transitions', e.target.checked)}
                    />
                    <span>{t('settings.advanced.performance.animations')}</span>
                </label>

                <label className="checkbox-option">
                    <input
                        type="checkbox"
                        checked={settings.enable_virtual_scroll_for_large_directories || false}
                        onChange={(e) => updateSetting('enable_virtual_scroll_for_large_directories', e.target.checked)}
                    />
                    <span>{t('settings.advanced.performance.virtualScroll')}</span>
                </label>
            </div>

            <div className="settings-section">
                <h3>{t('settings.advanced.hash.title')}</h3>
                <div className="form-group">
                    <label>{t('settings.advanced.hash.defaultAlgo')}</label>
                    <select
                        value={settings.default_checksum_hash || 'SHA256'}
                        onChange={(e) => updateSetting('default_checksum_hash', e.target.value)}
                        className="settings-select"
                    >
                        {hashAlgorithms.map(algo => (
                            <option key={algo.id} value={algo.id}>{algo.label}</option>
                        ))}
                    </select>
                    <div className="input-hint">
                        {t('settings.advanced.hash.hint')}
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <h3>{t('settings.advanced.defaultPaths.title')}</h3>
                <div className="form-group">
                    <label>{t('settings.advanced.defaultPaths.defaultFolderOnOpening')}</label>
                    <input
                        type="text"
                        value={settings.default_folder_path_on_opening || ''}
                        onChange={(e) => updateSetting('default_folder_path_on_opening', e.target.value)}
                        className="settings-input"
                        placeholder={t('settings.advanced.defaultPaths.placeholder')}
                    />
                    <div className="input-hint">
                        {t('settings.advanced.defaultPaths.hint')}
                    </div>
                </div>
            </div>

            <div className="settings-section danger-zone">
                <h3>{t('settings.advanced.dangerZone.title')}</h3>
                <p>{t('settings.advanced.dangerZone.description')}</p>
                <Button
                    variant="danger"
                    onClick={handleReset}
                    disabled={isResetting}
                >
                    {isResetting ? t('settings.advanced.dangerZone.resetting') : t('settings.advanced.dangerZone.resetAll')}
                </Button>
            </div>
        </div>
    );

    /**
     * Renders the appropriate tab content based on activeTab state
     * @returns {React.ReactElement} The content for the active tab
     */
    const renderTabContent = () => {
        switch (activeTab) {
            case 'appearance': return renderAppearanceTab();
            case 'behavior': return renderBehaviorTab();
            case 'search': return renderSearchTab();
            case 'advanced': return renderAdvancedTab();
            default: return renderAppearanceTab();
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('settings.title')}
            size="lg"
            footer={
                <div className="settings-footer">
                    {(error || localError) && (
                        <div className="settings-error">
                            <span className="icon-alert-triangle"></span>
                            <span>{error || localError}</span>
                        </div>
                    )}
                    <div className="settings-footer-buttons">
                        <Button variant="primary" onClick={reloadSettings}>
                            {t('settings.footer.saveApply')}
                        </Button>
                        <Button variant="ghost" onClick={onClose}>
                            {t('common.close')}
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="settings-panel">
                <div className="settings-sidebar">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <span className={`icon icon-${tab.icon}`}></span>
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </div>

                <div className="settings-content">
                    {renderTabContent()}
                </div>
            </div>
        </Modal>
    );
};

export default SettingsPanel;

