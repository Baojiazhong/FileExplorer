import React from 'react';
import I18nProvider from './i18n/I18nProvider.jsx';
import { LOCALES, normalizeLocale, resolveEffectiveLocale, createTranslator } from './i18n';
import { useI18n } from './i18n';
import enUS from './i18n/locales/en-US';
import zhCN from './i18n/locales/zh-CN';
import SettingsProvider, { useSettings } from './providers/SettingsProvider';
import ThemeProvider from './providers/ThemeProvider';
import AppStateProvider from './providers/AppStateProvider';
import HistoryProvider from './providers/HistoryProvider';
import SftpProvider from './providers/SftpProvider';
import FileSystemProvider from './providers/FileSystemProvider';
import ContextMenuProvider from './providers/ContextMenuProvider';
import MainLayout from './layouts/MainLayout';

const LANGUAGE_STORAGE_KEY = 'fileExplorerLanguage';

const readStoredLanguageSetting = () => {
    try {
        const raw = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (!raw) return LOCALES.AUTO;
        if (raw === LOCALES.AUTO) return LOCALES.AUTO;
        return normalizeLocale(raw);
    } catch {
        return LOCALES.AUTO;
    }
};

function I18nSettingsSync() {
    const { settings } = useSettings();
    const { languageSetting, setLanguage } = useI18n();

    const settingsLanguage = settings?.language;

    React.useEffect(() => {
        if (!settingsLanguage) return;
        if (settingsLanguage === languageSetting) return;

        // Keep i18n in sync with persisted settings.language.
        setLanguage(settingsLanguage);
    }, [settingsLanguage, languageSetting, setLanguage]);

    return null;
}

function AppProviders() {
    const [languageSetting, setLanguageSetting] = React.useState(() => readStoredLanguageSetting());

    const setLanguageSettingPersisted = React.useCallback((value) => {
        const next = value === LOCALES.AUTO ? LOCALES.AUTO : normalizeLocale(value);
        setLanguageSetting(next);

        try {
            localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
        } catch {
            // ignore
        }
    }, []);

    return (
        <I18nProvider languageSetting={languageSetting} setLanguageSetting={setLanguageSettingPersisted}>
            <SettingsProvider>
                <I18nSettingsSync />
                <ThemeProvider>
                    <AppStateProvider>
                        <HistoryProvider>
                            <SftpProvider>
                                <FileSystemProvider>
                                    <ContextMenuProvider>
                                        <MainLayout />
                                    </ContextMenuProvider>
                                </FileSystemProvider>
                            </SftpProvider>
                        </HistoryProvider>
                    </AppStateProvider>
                </ThemeProvider>
            </SettingsProvider>
        </I18nProvider>
    );
}

// Simple fallback for error cases
function ErrorFallback() {
    const dictionaries = { [LOCALES.EN_US]: enUS, [LOCALES.ZH_CN]: zhCN };
    const t = createTranslator({ dictionaries, locale: resolveEffectiveLocale(LOCALES.AUTO) });
    return (
        <div style={{
            padding: '20px',
            color: '#333',
            backgroundColor: '#f8f8f8',
            fontFamily: 'system-ui, sans-serif',
            maxWidth: '800px',
            margin: '40px auto',
            border: '1px solid #ddd',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
            <h1 style={{ color: '#d32f2f' }}>{t('errorFallback.title')}</h1>
            <p>{t('errorFallback.message')}</p>
            <p>{t('errorFallback.helpMessage')}</p>
            <button
                onClick={() => window.location.reload()}
                style={{
                    padding: '8px 16px',
                    backgroundColor: '#0078d4',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    marginTop: '15px'
                }}
            >
                {t('errorFallback.reloadButton')}
            </button>
        </div>
    );
}

// App component with error boundary
class App extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    // Error Boundary
    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Application error:", error, errorInfo);
    }

    render() {
        // Show fallback in case of error
        if (this.state.hasError) {
            return <ErrorFallback />;
        }

        // Render normal application with all providers
        // IMPORTANT: Provider order matters for proper initialization:
        // 1. SettingsProvider should be first as other providers may depend on settings
        // 2. I18nProvider depends on settings (language)
        // 3. ThemeProvider depends on settings and should come next
        // 4. AppStateProvider provides general app state
        // 5. HistoryProvider should come before FileSystemProvider since navigation depends on history
        // 6. SftpProvider should come before FileSystemProvider to provide SFTP operations
        // 7. FileSystemProvider provides file system operations
        // 8. ContextMenuProvider should come after FileSystemProvider to access selected items
        return (
            <div className="app-container">
                <AppProviders />
            </div>
        );
    }
}

export default App;
