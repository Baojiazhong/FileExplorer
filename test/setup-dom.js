import { JSDOM } from 'jsdom';

// Minimal DOM for keyboard router / keymap tests.
// Some globals (like navigator) can be read-only on Node; define them explicitly.
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
});

Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

Object.defineProperty(globalThis, 'HTMLElement', { value: dom.window.HTMLElement, configurable: true });
Object.defineProperty(globalThis, 'HTMLInputElement', { value: dom.window.HTMLInputElement, configurable: true });
Object.defineProperty(globalThis, 'HTMLTextAreaElement', { value: dom.window.HTMLTextAreaElement, configurable: true });
Object.defineProperty(globalThis, 'HTMLSelectElement', { value: dom.window.HTMLSelectElement, configurable: true });
Object.defineProperty(globalThis, 'KeyboardEvent', { value: dom.window.KeyboardEvent, configurable: true });
