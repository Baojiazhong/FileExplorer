import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import Modal from '../../src/components/common/Modal.jsx';
import ContextMenu from '../../src/components/contextMenu/ContextMenu.jsx';
import { showConfirm } from '../../src/utils/NotificationSystem.js';
import { usePreview } from '../../src/hooks/usePreview.js';
import { registerKeydownHandler, KEYDOWN_PRIORITIES } from '../../src/utils/keyboard.js';

vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: vi.fn(async () => ({ kind: 'Text', name: 'file.txt', text: 'hi' })),
  };
});

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

function PreviewHarness() {
  const getFocusedItem = () => ({ path: '/tmp/file.txt', name: 'file.txt', isDirectory: false });
  const { open } = usePreview(getFocusedItem);
  return <div data-testid="preview-open">{String(open)}</div>;
}

function ModalWithContextMenu({ calls }) {
  const [menuOpen, setMenuOpen] = useState(true);

  return (
    <>
      <Modal isOpen={true} onClose={() => calls.push('modal-close')} title="Test">
        <div>Body</div>
      </Modal>

      {menuOpen && (
        <ContextMenu
          position={{ x: 10, y: 10 }}
          items={[{ id: 'x', label: 'X', action: () => {} }]}
          onClose={() => {
            calls.push('menu-close');
            setMenuOpen(false);
          }}
        />
      )}
    </>
  );
}

describe('Overlay key priority (real overlays)', () => {
  afterEach(() => {
    cleanup();

    // Defensive: if a confirm dialog test fails mid-way, remove it.
    document.querySelectorAll('[data-modal="confirm-dialog"]').forEach((el) => el.remove());
  });

  it('Confirm dialog consumes Escape before Modal and App', async () => {
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

    const confirmPromise = showConfirm('Are you sure?', 'Confirm');

    expect(document.querySelector('[data-modal="confirm-dialog"]')).toBeTruthy();

    const e = fireKey({ key: 'Escape', code: 'Escape' });

    expect(e.defaultPrevented).toBe(true);
    await expect(confirmPromise).resolves.toBe(false);

    expect(calls).toEqual([]);
    expect(document.querySelector('[data-modal="confirm-dialog"]')).toBeNull();

    unregisterApp();
  });

  it('ContextMenu consumes Escape before Modal', async () => {
    const calls = [];

    render(<ModalWithContextMenu calls={calls} />);
    await tick();

    const e = fireKey({ key: 'Escape', code: 'Escape' });

    expect(e.defaultPrevented).toBe(true);

    await waitFor(() => {
      expect(document.querySelector('.context-menu')).toBeNull();
    });

    expect(calls).toEqual(['menu-close']);
  });

  it('Preview modal consumes Space before App handler', async () => {
    const calls = [];

    const unregisterApp = registerKeydownHandler(
      (e) => {
        if (e.key !== ' ') return false;
        calls.push('app-space');
        return true;
      },
      { id: 'app', priority: KEYDOWN_PRIORITIES.APP }
    );

    render(<PreviewHarness />);
    await tick();

    const e = fireKey({ key: ' ', code: 'Space' });

    expect(e.defaultPrevented).toBe(true);
    expect(calls).toEqual([]);

    await waitFor(() => {
      expect(screen.getByTestId('preview-open').textContent).toBe('true');
    });

    unregisterApp();
  });

  it('Confirm dialog consumes Escape so Preview does not close underneath', async () => {
    render(<PreviewHarness />);
    await tick();

    // Open preview.
    fireKey({ key: ' ', code: 'Space' });

    await waitFor(() => {
      expect(screen.getByTestId('preview-open').textContent).toBe('true');
    });

    const confirmPromise = showConfirm('Are you sure?', 'Confirm');

    fireKey({ key: 'Escape', code: 'Escape' });

    await expect(confirmPromise).resolves.toBe(false);

    // Confirm consumed Escape; preview should remain open.
    expect(screen.getByTestId('preview-open').textContent).toBe('true');
  });
});
