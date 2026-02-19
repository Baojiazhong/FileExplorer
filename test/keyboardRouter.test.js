import test from 'node:test';
import assert from 'node:assert/strict';

import './setup-dom.js';

import { registerKeydownHandler } from '../src/utils/keyboard.js';

test('keyboard router: higher priority consumes first', () => {
  const calls = [];

  const unregisterLow = registerKeydownHandler(
    (e) => {
      if (e.key !== 'Escape') return false;
      calls.push('low');
      return true;
    },
    { id: 'low', priority: 0 }
  );

  const unregisterHigh = registerKeydownHandler(
    (e) => {
      if (e.key !== 'Escape') return false;
      calls.push('high');
      e.preventDefault();
      return true;
    },
    { id: 'high', priority: 100 }
  );

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

  assert.deepEqual(calls, ['high']);

  unregisterHigh();
  unregisterLow();
});

test('keyboard router: when() gate prevents handler from running', () => {
  const calls = [];

  const unregister = registerKeydownHandler(
    (e) => {
      if (e.key !== 'Escape') return false;
      calls.push('ran');
      return true;
    },
    { id: 'gated', priority: 50, when: () => false }
  );

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

  assert.deepEqual(calls, []);

  unregister();
});

test('keyboard router: later registration wins within same priority', () => {
  const calls = [];

  const unregisterFirst = registerKeydownHandler(
    (e) => {
      if (e.key !== 'Escape') return false;
      calls.push('first');
      return true;
    },
    { id: 'first', priority: 10 }
  );

  const unregisterSecond = registerKeydownHandler(
    (e) => {
      if (e.key !== 'Escape') return false;
      calls.push('second');
      return true;
    },
    { id: 'second', priority: 10 }
  );

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

  assert.deepEqual(calls, ['second']);

  unregisterSecond();
  unregisterFirst();
});
