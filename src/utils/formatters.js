import enUS from '../i18n/locales/en-US';
import zhCN from '../i18n/locales/zh-CN';
import { createTranslator } from '../i18n/core';

const dictionaries = {
    'en-US': enUS,
    'zh-CN': zhCN,
};

/**
 * Format a file size in bytes to a human-readable string.
 * @param {number} bytes - The file size in bytes.
 * @param {number} decimals - The number of decimal places to show.
 * @returns {string} The formatted file size.
 */
export const formatFileSize = (bytes, decimals = 1) => {
    const t = getTranslator();

    if (bytes === null || bytes === undefined) return t('common.notAvailableShort');
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return t('common.notAvailableShort');

    // Keep byte values as integers; apply decimals only to KB+.
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const unitKeys = ['bytes', 'kb', 'mb', 'gb', 'tb', 'pb', 'eb', 'zb', 'yb'];

    if (bytes === 0) {
        return t('fileSize.format', {
            value: '0',
            unit: t('fileSize.units.bytes'),
        });
    }

    let i = Math.floor(Math.log(bytes) / Math.log(k));
    if (!Number.isFinite(i) || i < 0) i = 0;
    if (i >= unitKeys.length) i = unitKeys.length - 1;

    const usedDecimals = i === 0 ? 0 : dm;
    const rawValue = bytes / Math.pow(k, i);
    const roundedValue = parseFloat(rawValue.toFixed(usedDecimals));

    let unit;
    if (i === 0) {
        unit = bytes === 1 ? t('fileSize.units.byte') : t('fileSize.units.bytes');
    } else {
        unit = t(`fileSize.units.${unitKeys[i]}`);
    }

    const value = new Intl.NumberFormat(getPreferredLocale(), {
        minimumFractionDigits: usedDecimals,
        maximumFractionDigits: usedDecimals,
    }).format(roundedValue);

    return t('fileSize.format', { value, unit });
};

const getPreferredLocale = () => {
    try {
        // I18nProvider sets document.documentElement.lang to the current locale.
        const fromDom = document?.documentElement?.lang;
        if (fromDom && typeof fromDom === 'string') {
            const trimmed = fromDom.trim();
            if (trimmed) return trimmed;
        }
    } catch {
        // ignore
    }

    try {
        // Fallback for non-DOM contexts (or if lang wasn't set yet).
        return (Array.isArray(navigator.languages) ? navigator.languages[0] : navigator.language) || 'en-US';
    } catch {
        return 'en-US';
    }
};

let cachedTranslatorLocale = null;
let cachedTranslator = null;

const getTranslator = () => {
    const locale = getPreferredLocale();
    if (cachedTranslator && cachedTranslatorLocale === locale) {
        return cachedTranslator;
    }

    cachedTranslatorLocale = locale;
    cachedTranslator = createTranslator({ dictionaries, locale });
    return cachedTranslator;
};

/**
 * Format a date string to a human-readable format.
 * @param {string} dateString - The date string to format.
 * @param {boolean} includeTime - Whether to include the time.
 * @returns {string} The formatted date.
 */
export const formatDate = (dateString, includeTime = false) => {
    const t = getTranslator();

    if (!dateString) return t('common.unknownDate');

    try {
        const date = new Date(dateString);

        // Check if the date is valid
        if (isNaN(date.getTime())) {
            return t('common.invalidDate');
        }

        const options = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        };

        if (includeTime) {
            options.hour = '2-digit';
            options.minute = '2-digit';
        }

        return new Intl.DateTimeFormat(getPreferredLocale(), options).format(date);
    } catch (error) {
        console.error('Error formatting date:', error);
        return t('common.invalidDate');
    }
};

/**
 * Get a human-readable file type based on the file extension.
 * @param {string} filename - The filename to extract the extension from.
 * @returns {string} The human-readable file type.
 */
export const getFileType = (filename) => {
    const t = getTranslator();

    if (!filename || typeof filename !== 'string' || !filename.includes('.')) {
        return t('fileTypes.file');
    }

    const extension = filename.split('.').pop().toLowerCase();

    const fileTypes = {
        // Documents
        'pdf': 'fileTypes.documents.pdf',
        'doc': 'fileTypes.documents.word',
        'docx': 'fileTypes.documents.word',
        'xls': 'fileTypes.documents.excel',
        'xlsx': 'fileTypes.documents.excel',
        'ppt': 'fileTypes.documents.powerpoint',
        'pptx': 'fileTypes.documents.powerpoint',
        'txt': 'fileTypes.documents.text',
        'rtf': 'fileTypes.documents.richText',
        'odt': 'fileTypes.documents.openDocumentText',
        'ods': 'fileTypes.documents.openDocumentSpreadsheet',
        'odp': 'fileTypes.documents.openDocumentPresentation',
        'csv': 'fileTypes.documents.csv',
        'md': 'fileTypes.documents.markdown',

        // Images
        'jpg': 'fileTypes.images.jpeg',
        'jpeg': 'fileTypes.images.jpeg',
        'png': 'fileTypes.images.png',
        'gif': 'fileTypes.images.gif',
        'bmp': 'fileTypes.images.bmp',
        'svg': 'fileTypes.images.svg',
        'webp': 'fileTypes.images.webp',
        'tiff': 'fileTypes.images.tiff',
        'ico': 'fileTypes.images.ico',

        // Audio
        'mp3': 'fileTypes.audio.mp3',
        'wav': 'fileTypes.audio.wav',
        'ogg': 'fileTypes.audio.ogg',
        'flac': 'fileTypes.audio.flac',
        'm4a': 'fileTypes.audio.m4a',
        'aac': 'fileTypes.audio.aac',

        // Video
        'mp4': 'fileTypes.video.mp4',
        'avi': 'fileTypes.video.avi',
        'mov': 'fileTypes.video.mov',
        'wmv': 'fileTypes.video.wmv',
        'mkv': 'fileTypes.video.mkv',
        'webm': 'fileTypes.video.webm',

        // Archives
        'zip': 'fileTypes.archives.zip',
        'rar': 'fileTypes.archives.rar',
        '7z': 'fileTypes.archives.sevenZip',
        'tar': 'fileTypes.archives.tar',
        'gz': 'fileTypes.archives.gz',
        'bz2': 'fileTypes.archives.bz2',

        // Programming
        'html': 'fileTypes.code.html',
        'css': 'fileTypes.code.css',
        'js': 'fileTypes.code.js',
        'jsx': 'fileTypes.code.jsx',
        'ts': 'fileTypes.code.ts',
        'tsx': 'fileTypes.code.tsx',
        'json': 'fileTypes.code.json',
        'xml': 'fileTypes.code.xml',
        'yaml': 'fileTypes.code.yaml',
        'yml': 'fileTypes.code.yaml',
        'toml': 'fileTypes.code.toml',
        'py': 'fileTypes.code.py',
        'java': 'fileTypes.code.java',
        'c': 'fileTypes.code.c',
        'cpp': 'fileTypes.code.cpp',
        'h': 'fileTypes.code.h',
        'cs': 'fileTypes.code.cs',
        'php': 'fileTypes.code.php',
        'rb': 'fileTypes.code.rb',
        'go': 'fileTypes.code.go',
        'rs': 'fileTypes.code.rs',
        'swift': 'fileTypes.code.swift',
        'kt': 'fileTypes.code.kt',
        'sql': 'fileTypes.code.sql',

        // Executables
        'exe': 'fileTypes.executables.exe',
        'msi': 'fileTypes.executables.msi',
        'app': 'fileTypes.executables.app',
        'dmg': 'fileTypes.executables.dmg',
        'deb': 'fileTypes.executables.deb',
        'rpm': 'fileTypes.executables.rpm',
        'apk': 'fileTypes.executables.apk',

        // Other
        'iso': 'fileTypes.other.iso',
        'torrent': 'fileTypes.other.torrent',
    };

    const key = fileTypes[extension];
    if (key) return t(key, { ext: extension.toUpperCase() });

    return t('fileTypes.byExtension', { ext: extension.toUpperCase() });
};

/**
 * Calculate the time elapsed since a specific date.
 * @param {string} dateString - The date string to calculate from.
 * @returns {string} The elapsed time as a human-readable string.
 */
export const calculateTimeElapsed = (dateString) => {
    const t = getTranslator();

    if (!dateString) return t('common.unknownDate');

    try {
        const date = new Date(dateString);
        const now = new Date();

        // Check if the date is valid
        if (isNaN(date.getTime())) {
            return t('common.invalidDate');
        }

        const seconds = Math.floor((now - date) / 1000);

        if (seconds < 60) {
            return t('common.relativeTime.justNow');
        }

        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) {
            if (minutes === 1) return t('common.relativeTime.minuteAgo', { count: minutes });
            return t('common.relativeTime.minutesAgo', { count: minutes });
        }

        const hours = Math.floor(minutes / 60);
        if (hours < 24) {
            if (hours === 1) return t('common.relativeTime.hourAgo', { count: hours });
            return t('common.relativeTime.hoursAgo', { count: hours });
        }

        const days = Math.floor(hours / 24);
        if (days < 30) {
            if (days === 1) return t('common.relativeTime.dayAgo', { count: days });
            return t('common.relativeTime.daysAgo', { count: days });
        }

        const months = Math.floor(days / 30);
        if (months < 12) {
            if (months === 1) return t('common.relativeTime.monthAgo', { count: months });
            return t('common.relativeTime.monthsAgo', { count: months });
        }

        const years = Math.floor(months / 12);
        if (years === 1) return t('common.relativeTime.yearAgo', { count: years });
        return t('common.relativeTime.yearsAgo', { count: years });
    } catch (error) {
        console.error('Error calculating time elapsed:', error);
        return t('common.invalidDate');
    }
};
