import React, { createContext, useContext, useEffect, useMemo, useCallback } from 'react';
import enUS from './locales/en-US';
import zhCN from './locales/zh-CN';
import { createTranslator, LOCALES, resolveEffectiveLocale } from './core';

const I18nContext = createContext({
    t: (key) => key,
    locale: LOCALES.EN_US,
    languageSetting: LOCALES.AUTO,
    setLanguage: () => {},
    LOCALES,
});

const dictionaries = {
    [LOCALES.EN_US]: enUS,
    [LOCALES.ZH_CN]: zhCN,
};

/**
 * Pure i18n provider.
 *
 * IMPORTANT: This module intentionally does not import SettingsProvider to avoid
 * circular-dependency risks (i18n is used widely across the app).
 */
export default function I18nProvider({
    children,
    languageSetting = LOCALES.AUTO,
    setLanguageSetting,
}) {
    const locale = resolveEffectiveLocale(languageSetting);

    const t = useMemo(() => {
        return createTranslator({ dictionaries, locale });
    }, [locale]);

    useEffect(() => {
        try {
            document.documentElement.lang = locale;
        } catch {
            // ignore
        }
    }, [locale]);

    const setLanguage = useCallback(
        (value) => {
            if (typeof setLanguageSetting === 'function') {
                setLanguageSetting(value);
            }
        },
        [setLanguageSetting]
    );

    const value = useMemo(
        () => ({ t, locale, languageSetting, setLanguage, LOCALES }),
        [t, locale, languageSetting, setLanguage]
    );

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
