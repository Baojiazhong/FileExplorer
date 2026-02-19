import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import Modal from '../../src/components/common/Modal.jsx';
import { usePreview } from '../../src/hooks/usePreview.js';
import { registerKeydownHandler, KEYDOWN_PRIORITIES } from '../../src/utils/keyboard.js';

vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: vi.fn(async () => ({ kind: 'Text', name: 'file.txt', text: 'hi' })),
  };
});

const tick = () => new Promise((r) => setTimeout(r, 0));

const fireKey = (init) => {
  const e = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  document.dispatchEvent(e);
  return e;
};

function PreviewHarness() {
  const getFocusedItem = () => ({ path: '/tmp/file.txt', name: 'file.txt', isDirectory: false });
  const { open } = usePreview(getFocusedItem);
  return <div data-testid="preview-open">{String(open)}</div>;
}

describe('Overlay key priority', () => {
  afterEach(() => {
    cleanup();
  });

  it('Confirm dialog (highest) consumes Escape before Modal and App', async () => {
    const calls = [];

    const unregisterApp = registerKeydownHandler(
      (e) => {
        if (e.key !== 'Escape') return false;
        calls.push('app');
        return true;
      },
      { id: 'app', priority: KEYDOWN_PRIORITIES.APP }
    );

    render(
      <Modal isOpen={true} onClose={() => calls.push('modal-close')} title="Test">
        <div>Body</div>
      </Modal>
    );

    await tick();

    const unregisterConfirm = registerKeydownHandler(
      (e) => {
        if (e.key !== 'Escape') return false;
        calls.push('confirm');
        return true;
      },
      { id: 'confirm', priority: KEYDOWN_PRIORITIES.CONFIRM }
    );

    const e = fireKey({ key: 'Escape', code: 'Escape' });

    expect(e.defaultPrevented).toBe(true);
    expect(calls).toEqual(['confirm']);

    unregisterConfirm();
    unregisterApp();
  });

  it('Menu consumes Escape before Modal', async () => {
    const calls = [];

    render(
      <Modal isOpen={true} onClose={() => calls.push('modal-close')} title="Test">
        <div>Body</div>
      </Modal>
    );

    await tick();

    const unregisterMenu = registerKeydownHandler(
      (e) => {
        if (e.key !== 'Escape') return false;
        calls.push('menu-close');
        return true;
      },
      { id: 'menu', priority: KEYDOWN_PRIORITIES.MENU }
    );

    const e = fireKey({ key: 'Escape', code: 'Escape' });

    expect(e.defaultPrevented).toBe(true);
    expect(calls).toEqual(['menu-close']);

    unregisterMenu();
  });

  it('Preview modal consumes Space before Menu and App', async () => {
    const calls = [];

    const unregisterApp = registerKeydownHandler(
      (e) => {
        if (e.key !== ' ') return false;
        calls.push('app-space');
        return true;
      },
      { id: 'app', priority: KEYDOWN_PRIORITIES.APP }
    );

    const unregisterMenu = registerKeydownHandler(
      (e) => {
        if (e.key !== ' ') return false;
        calls.push('menu-space');
        return true;
      },
      { id: 'menu', priority: KEYDOWN_PRIORITIES.MENU }
    );

    render(<PreviewHarness />);
    await tick();

    const e = fireKey({ key: ' ', code: 'Space' });

    expect(e.defaultPrevented).toBe(true);
    expect(calls).toEqual([]);

    await waitFor(() => {
      expect(screen.getByTestId('preview-open').textContent).toBe('true');
    });

    unregisterMenu();
    unregisterApp();
  });

  it('Confirm consumes Escape so Preview does not close underneath', async () => {
    render(<PreviewHarness />);
    await tick();

    // Open preview.
    fireKey({ key: ' ', code: 'Space' });

    await waitFor(() => {
      expect(screen.getByTestId('preview-open').textContent).toBe('true');
    });

    const unregisterConfirm = registerKeydownHandler(
      (e) => {
        if (e.key !== 'Escape') return false;
        return true;
      },
      { id: 'confirm', priority: KEYDOWN_PRIORITIES.CONFIRM }
    );

    fireKey({ key: 'Escape', code: 'Escape' });

    // Confirm consumed Escape; preview should remain open.
    expect(screen.getByTestId('preview-open').textContent).toBe('true');

    unregisterConfirm();
  });
});
