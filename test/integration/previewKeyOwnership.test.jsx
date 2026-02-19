import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import { usePreview } from '../../src/hooks/usePreview.js';
import { registerKeydownHandler } from '../../src/utils/keyboard.js';

vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: vi.fn(async () => ({ kind: 'Text', name: 'file.txt', text: 'hi' })),
  };
});

const tick = () => new Promise((r) => setTimeout(r, 0));

const fireKey = async (init, target = document) => {
  let e;
  await act(async () => {
    e = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ...init,
    });
    target.dispatchEvent(e);
  });
  return e;
};

function PreviewHarness({ keyHandlingEnabled = true }) {
  const getFocusedItem = () => ({ path: '/tmp/file.txt', name: 'file.txt', isDirectory: false });

  const { open } = usePreview(getFocusedItem, null, null, null, null, {
    keyHandlingEnabled,
  });

  return <div data-testid="open">{String(open)}</div>;
}

describe('Preview modal key ownership', () => {
  afterEach(() => {
    cleanup();
  });

  it('Space toggles preview and prevents app-level Space shortcut from firing', async () => {
    const calls = [];

    const unregisterApp = registerKeydownHandler(
      (e) => {
        if (e.key !== ' ') return false;
        calls.push('app-space');
        return true;
      },
      { id: 'app', priority: 0 }
    );

    render(<PreviewHarness keyHandlingEnabled={true} />);

    await tick();

    const e = await fireKey({ key: ' ', code: 'Space' });

    expect(e.defaultPrevented).toBe(true);
    expect(calls).toEqual([]);

    await waitFor(() => {
      expect(screen.getByTestId('open').textContent).toBe('true');
    });

    unregisterApp();
  });

  it('When keyHandlingEnabled=false and preview closed, Space does not open preview and app handler may run', async () => {
    const calls = [];

    const unregisterApp = registerKeydownHandler(
      (e) => {
        if (e.key !== ' ') return false;
        calls.push('app-space');
        return true;
      },
      { id: 'app', priority: 0 }
    );

    render(<PreviewHarness keyHandlingEnabled={false} />);

    await tick();

    const e = await fireKey({ key: ' ', code: 'Space' });

    expect(e.defaultPrevented).toBe(true);
    expect(calls).toEqual(['app-space']);
    expect(screen.getByTestId('open').textContent).toBe('false');

    unregisterApp();
  });

  it('does not steal Space while typing in an input element', async () => {
    const calls = [];

    const unregisterApp = registerKeydownHandler(
      (e) => {
        if (e.key !== ' ') return false;
        calls.push('app-space');
        return true;
      },
      { id: 'app', priority: 0 }
    );

    render(
      <div>
        <input aria-label="search" />
        <PreviewHarness keyHandlingEnabled={true} />
      </div>
    );

    await tick();

    const input = document.querySelector('input');
    input.focus();

    await fireKey({ key: ' ', code: 'Space' }, input);

    expect(calls).toEqual(['app-space']);
    expect(screen.getByTestId('open').textContent).toBe('false');

    unregisterApp();
  });
});
