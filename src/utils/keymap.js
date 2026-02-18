// Centralized keymap logic (OS-native presets)
// Phase 1: preset switching (auto/windows/macos/linux) without per-command customization.

import { invoke } from '@tauri-apps/api/core';
import { getDirectoryPath, isRootPath } from './pathUtils';

export const KEYMAP_PRESETS = {
  AUTO: 'auto',
  WINDOWS: 'windows',
  MACOS: 'macos',
  LINUX: 'linux',
};

const normalizeOs = (os) => {
  if (!os || typeof os !== 'string') return null;
  const value = os.toLowerCase();
  if (value.includes('win')) return KEYMAP_PRESETS.WINDOWS;
  if (value.includes('mac') || value.includes('darwin')) return KEYMAP_PRESETS.MACOS;
  if (value.includes('linux')) return KEYMAP_PRESETS.LINUX;
  return null;
};

export const resolvePreset = ({ selectedPreset, runningOs }) => {
  if (selectedPreset && selectedPreset !== KEYMAP_PRESETS.AUTO) return selectedPreset;

  // Prefer the backend-provided OS string.
  const fromBackend = normalizeOs(runningOs);
  if (fromBackend) return fromBackend;

  // Fallback to the browser/runtime platform (covers early startup before systemInfo loads).
  try {
    // eslint-disable-next-line no-undef
    const fromPlatform = normalizeOs(navigator?.platform);
    if (fromPlatform) return fromPlatform;
  } catch {
    // ignore
  }

  return KEYMAP_PRESETS.WINDOWS;
};

export const shouldIgnoreKeyEvent = (e) => {
  const target = e.target;
  if (!target) return false;

  // Never steal keystrokes while typing.
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;

  // contenteditable elements
  if (typeof target.closest === 'function') {
    const editable = target.closest('[contenteditable="true"]');
    if (editable) return true;
  }

  return false;
};

const hasModifiers = (e, { ctrl = false, meta = false, alt = false, shift = false }) => {
  if (!!e.ctrlKey !== !!ctrl) return false;
  if (!!e.metaKey !== !!meta) return false;
  if (!!e.altKey !== !!alt) return false;
  if (!!e.shiftKey !== !!shift) return false;
  return true;
};

// Prefer `code` for letters (layout-safe), allow `key` for special keys.
export const matchesShortcut = (e, spec) => {
  if (!spec) return false;
  const { code, key } = spec;
  if (!hasModifiers(e, spec)) return false;
  if (code && e.code !== code) return false;
  if (key && e.key !== key) return false;
  return true;
};

export const getSystemInfoOnce = async () => {
  try {
    const metaDataJson = await invoke('get_meta_data_as_json');
    const metaData = JSON.parse(metaDataJson);
    return metaData;
  } catch (err) {
    console.error('Failed to load system info for keymap:', err);
    return null;
  }
};

export const computeParentPath = (path) => {
  if (!path) return null;
  if (isRootPath(path)) return path;
  const parent = getDirectoryPath(path);
  return parent || path;
};
