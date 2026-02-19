import test from 'node:test';
import assert from 'node:assert/strict';

import './setup-dom.js';

import { KEYMAP_PRESETS, matchesShortcut, resolvePreset, shouldIgnoreKeyEvent } from '../src/utils/keymap.js';

test('resolvePreset: selected preset overrides auto', () => {
  assert.equal(resolvePreset({ selectedPreset: KEYMAP_PRESETS.WINDOWS, runningOs: 'macos' }), KEYMAP_PRESETS.WINDOWS);
  assert.equal(resolvePreset({ selectedPreset: KEYMAP_PRESETS.MACOS, runningOs: 'windows' }), KEYMAP_PRESETS.MACOS);
});

test('resolvePreset: auto prefers backend runningOs', () => {
  assert.equal(resolvePreset({ selectedPreset: KEYMAP_PRESETS.AUTO, runningOs: 'windows' }), KEYMAP_PRESETS.WINDOWS);
  assert.equal(resolvePreset({ selectedPreset: KEYMAP_PRESETS.AUTO, runningOs: 'darwin' }), KEYMAP_PRESETS.MACOS);
  assert.equal(resolvePreset({ selectedPreset: KEYMAP_PRESETS.AUTO, runningOs: 'linux' }), KEYMAP_PRESETS.LINUX);
});

test('resolvePreset: auto falls back to navigator.platform', () => {
  const originalPlatform = globalThis.navigator.platform;

  // jsdom sets platform to empty string by default; override via defineProperty.
  Object.defineProperty(globalThis.navigator, 'platform', {
    value: 'MacIntel',
    configurable: true,
  });

  assert.equal(resolvePreset({ selectedPreset: KEYMAP_PRESETS.AUTO, runningOs: null }), KEYMAP_PRESETS.MACOS);

  Object.defineProperty(globalThis.navigator, 'platform', {
    value: originalPlatform,
    configurable: true,
  });
});

test('matchesShortcut: matches modifiers + code', () => {
  const e = new KeyboardEvent('keydown', {
    code: 'KeyO',
    key: 'o',
    metaKey: true,
  });

  assert.equal(matchesShortcut(e, { meta: true, code: 'KeyO' }), true);
  assert.equal(matchesShortcut(e, { ctrl: true, code: 'KeyO' }), false);
  assert.equal(matchesShortcut(e, { meta: true, code: 'KeyI' }), false);
});

test('matchesShortcut: matches modifiers + key', () => {
  const e = new KeyboardEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    altKey: true,
  });

  assert.equal(matchesShortcut(e, { alt: true, key: 'Enter' }), true);
  assert.equal(matchesShortcut(e, { alt: false, key: 'Enter' }), false);
});

test('shouldIgnoreKeyEvent: ignores input/textarea/select', () => {
  const input = document.createElement('input');
  document.body.appendChild(input);

  const textarea = document.createElement('textarea');
  document.body.appendChild(textarea);

  const select = document.createElement('select');
  document.body.appendChild(select);

  assert.equal(shouldIgnoreKeyEvent({ target: input }), true);
  assert.equal(shouldIgnoreKeyEvent({ target: textarea }), true);
  assert.equal(shouldIgnoreKeyEvent({ target: select }), true);
});

test('shouldIgnoreKeyEvent: ignores contenteditable via closest', () => {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('contenteditable', 'true');

  const child = document.createElement('span');
  wrapper.appendChild(child);
  document.body.appendChild(wrapper);

  assert.equal(shouldIgnoreKeyEvent({ target: child }), true);
});
