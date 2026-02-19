import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import Modal from '../../src/components/common/Modal.jsx';
import { registerKeydownHandler } from '../../src/utils/keyboard.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

const fireKey = (init, target = document) => {
  const e = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(e);
  return e;
};

describe('Modal keyboard isolation', () => {
  afterEach(() => {
    cleanup();
  });

  it('consumes Enter so it does not fall through to app-level handlers', async () => {
    const calls = [];

    const appHandler = vi.fn((e) => {
      if (e.key !== 'Enter') return false;
      calls.push('app');
      return true;
    });

    const unregisterApp = registerKeydownHandler(appHandler, { id: 'app', priority: 0 });

    render(
      <Modal
        isOpen={true}
        onClose={() => calls.push('close')}
        title="Test"
        defaultAction={() => calls.push('default')}
        defaultActionEnabled={true}
      >
        <div>Body</div>
      </Modal>
    );

    // Let Modal's useEffect register its handler.
    await tick();

    const e = fireKey({ key: 'Enter', code: 'Enter' });

    expect(e.defaultPrevented).toBe(true);
    expect(calls).toEqual(['default']);

    unregisterApp();
  });

  it('consumes Escape and triggers onClose (no fall-through)', async () => {
    const calls = [];

    const appHandler = vi.fn((e) => {
      if (e.key !== 'Escape') return false;
      calls.push('app-escape');
      return true;
    });

    const unregisterApp = registerKeydownHandler(appHandler, { id: 'app', priority: 0 });

    render(
      <Modal isOpen={true} onClose={() => calls.push('close')} title="Test">
        <div>Body</div>
      </Modal>
    );

    await tick();

    const e = fireKey({ key: 'Escape', code: 'Escape' });

    expect(e.defaultPrevented).toBe(true);
    expect(calls).toEqual(['close']);

    unregisterApp();
  });

  it('does not steal Enter from input elements inside the modal', async () => {
    const calls = [];

    const appHandler = vi.fn((e) => {
      if (e.key !== 'Enter') return false;
      calls.push('app');
      return true;
    });

    const unregisterApp = registerKeydownHandler(appHandler, { id: 'app', priority: 0 });

    render(
      <Modal
        isOpen={true}
        onClose={() => calls.push('close')}
        title="Test"
        defaultAction={() => calls.push('default')}
        defaultActionEnabled={true}
      >
        <input aria-label="name" />
      </Modal>
    );

    await tick();

    const input = document.querySelector('input');
    input.focus();

    const e = fireKey({ key: 'Enter', code: 'Enter' }, input);

    expect(e.defaultPrevented).toBe(true);
    expect(calls).toEqual(['app']);

    unregisterApp();
  });
});
