// Lightweight i18n helpers (no external dependency)

export const LOCALES = {
    AUTO: 'auto',
    EN_US: 'en-US',
    ZH_CN: 'zh-CN',
};

export const normalizeLocale = (locale) => {
    if (!locale || typeof locale !== 'string') return LOCALES.EN_US;
    // Normalize casing of common formats.
    const trimmed = locale.trim();
    if (!trimmed) return LOCALES.EN_US;

    const lower = trimmed.toLowerCase();
    if (lower === 'zh-cn' || lower === 'zh-hans' || lower === 'zh-sg' || lower === 'zh' || lower.startsWith('zh-')) {
        return LOCALES.ZH_CN;
    }

    // Default fallback.
    return LOCALES.EN_US;
};

export const getSystemLocale = () => {
    try {
        const languages = Array.isArray(navigator.languages) ? navigator.languages : [];
        const candidate = languages[0] || navigator.language || LOCALES.EN_US;
        return normalizeLocale(candidate);
    } catch {
        return LOCALES.EN_US;
    }
};

export const resolveEffectiveLocale = (languageSetting) => {
    if (languageSetting === LOCALES.ZH_CN) return LOCALES.ZH_CN;
    if (languageSetting === LOCALES.EN_US) return LOCALES.EN_US;

    // AUTO (or unknown) => system locale.
    return getSystemLocale();
};

const getByPath = (obj, path) => {
    if (!obj) return undefined;
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
        if (!cur || typeof cur !== 'object' || !(p in cur)) return undefined;
        cur = cur[p];
    }
    return cur;
};

const interpolate = (template, vars) => {
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (m, key) => {
        if (vars[key] === undefined || vars[key] === null) return m;
        return String(vars[key]);
    });
};

const warnedMissing = new Set();

export const createTranslator = ({ dictionaries, locale }) => {
    const effective = normalizeLocale(locale);

    return (key, vars) => {
        if (!key) return '';

        const primary = dictionaries[effective];
        const fallback = dictionaries[LOCALES.EN_US];

        let value = getByPath(primary, key);
        if (value === undefined) value = getByPath(fallback, key);

        if (typeof value !== 'string') {
            const warnKey = `${effective}:${key}`;
            if (!warnedMissing.has(warnKey)) {
                warnedMissing.add(warnKey);
                // eslint-disable-next-line no-console
                console.warn(`[i18n] Missing key: ${key} (locale=${effective})`);
            }
            return key;
        }

        return interpolate(value, vars);
    };
};
