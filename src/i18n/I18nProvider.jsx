import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useSettings } from '../providers/SettingsProvider';
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

export default function I18nProvider({ children }) {
    const { settings, updateSetting } = useSettings();

    const languageSetting = settings?.language || LOCALES.AUTO;
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

    const setLanguage = (value) => updateSetting('language', value);

    const value = useMemo(() => ({ t, locale, languageSetting, setLanguage, LOCALES }), [t, locale, languageSetting]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
