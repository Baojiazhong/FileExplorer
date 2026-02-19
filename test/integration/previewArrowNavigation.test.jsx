import React, { useRef, act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { usePreview } from '../../src/hooks/usePreview.js';

const coreMock = vi.hoisted(() => {
  const pendingBuildPreview = [];

  const invokeMock = vi.fn((cmd, args) => {
    if (cmd !== 'build_preview') {
      return Promise.resolve(null);
    }

    const path = args?.path;
    let resolve;
    const promise = new Promise((res) => {
      resolve = res;
    });

    pendingBuildPreview.push({ path, resolve });
    return promise;
  });

  return { pendingBuildPreview, invokeMock };
});

vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: coreMock.invokeMock,
  };
});

const flushMicrotasks = async () => {
  // Ensure any promise continuations + React state updates settle.
  await act(async () => {
    await Promise.resolve();
  });
};

const resolveBuildPreview = async (path, payload) => {
  const idx = coreMock.pendingBuildPreview.findIndex((p) => p.path === path);
  if (idx === -1) {
    throw new Error(`No pending build_preview for path: ${path}`);
  }

  const entry = coreMock.pendingBuildPreview.splice(idx, 1)[0];
  entry.resolve(payload);
  await flushMicrotasks();
};

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

const makeItem = (path) => ({
  path,
  name: path.split(/[/\\]/).pop() || path,
  isDirectory: false,
});

function PreviewNavHarness({
  initialPath = '/tmp/a.txt',
  navigateRightImpl = null,
  navigateLeftImpl = null,
  navigateUpImpl = null,
  navigateDownImpl = null,
}) {
  const focusedRef = useRef(makeItem(initialPath));

  const getFocusedItem = () => focusedRef.current;

  const navigateRight =
    typeof navigateRightImpl === 'function' ? () => navigateRightImpl(focusedRef) : null;
  const navigateLeft = typeof navigateLeftImpl === 'function' ? () => navigateLeftImpl(focusedRef) : null;
  const navigateUp = typeof navigateUpImpl === 'function' ? () => navigateUpImpl(focusedRef) : null;
  const navigateDown =
    typeof navigateDownImpl === 'function' ? () => navigateDownImpl(focusedRef) : null;

  const { open, payload, isLoading } = usePreview(
    getFocusedItem,
    navigateUp,
    navigateDown,
    navigateLeft,
    navigateRight,
    { keyHandlingEnabled: true }
  );

  return (
    <div>
      <div data-testid="open">{String(open)}</div>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="name">{payload?.name || ''}</div>
    </div>
  );
}

describe('usePreview arrow navigation', () => {
  beforeEach(() => {
    coreMock.pendingBuildPreview.length = 0;
    coreMock.invokeMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Avoid leaking timers/overlays across tests.
    vi.runOnlyPendingTimers();
    vi.useRealTimers();

    cleanup();
  });

  it('ArrowRight previews returned next item and latest request wins (requestIdRef)', async () => {
    render(
      <PreviewNavHarness
        initialPath="/tmp/a.txt"
        navigateRightImpl={() => makeItem('/tmp/b.txt')}
      />
    );

    const openEvent = await fireKey({ key: ' ', code: 'Space' });
    expect(openEvent.defaultPrevented).toBe(true);
    expect(screen.getByTestId('open').textContent).toBe('true');

    expect(coreMock.invokeMock).toHaveBeenCalledTimes(1);
    expect(coreMock.invokeMock).toHaveBeenLastCalledWith('build_preview', { path: '/tmp/a.txt' });

    const navEvent = await fireKey({ key: 'ArrowRight', code: 'ArrowRight' });
    expect(navEvent.defaultPrevented).toBe(true);

    expect(coreMock.invokeMock).toHaveBeenCalledTimes(2);
    expect(coreMock.invokeMock).toHaveBeenLastCalledWith('build_preview', { path: '/tmp/b.txt' });

    // Resolve B first, then resolve A (out-of-order). Payload should remain B.
    await resolveBuildPreview('/tmp/b.txt', { kind: 'Text', name: 'b.txt', text: 'B' });
    expect(screen.getByTestId('name').textContent).toBe('b.txt');

    await resolveBuildPreview('/tmp/a.txt', { kind: 'Text', name: 'a.txt', text: 'A' });
    expect(screen.getByTestId('name').textContent).toBe('b.txt');
  });

  it('ArrowRight falls back to getFocusedItem on next tick when navigateRight returns null', async () => {
    render(
      <PreviewNavHarness
        initialPath="/tmp/a.txt"
        navigateRightImpl={(focusedRef) => {
          focusedRef.current = makeItem('/tmp/b.txt');
          return null;
        }}
      />
    );

    await fireKey({ key: ' ', code: 'Space' });
    expect(screen.getByTestId('open').textContent).toBe('true');

    // Let the first preview resolve so we're in a stable state.
    await resolveBuildPreview('/tmp/a.txt', { kind: 'Text', name: 'a.txt', text: 'A' });
    expect(screen.getByTestId('name').textContent).toBe('a.txt');

    await fireKey({ key: 'ArrowRight', code: 'ArrowRight' });

    // The fallback uses setTimeout(0). Flush timers so previewFocusedItem runs.
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(coreMock.invokeMock).toHaveBeenLastCalledWith('build_preview', { path: '/tmp/b.txt' });

    await resolveBuildPreview('/tmp/b.txt', { kind: 'Text', name: 'b.txt', text: 'B' });
    expect(screen.getByTestId('name').textContent).toBe('b.txt');
  });

  it('Arrow navigation fallback does not run after preview closes (openRef)', async () => {
    render(
      <PreviewNavHarness
        initialPath="/tmp/a.txt"
        navigateRightImpl={(focusedRef) => {
          focusedRef.current = makeItem('/tmp/b.txt');
          return null;
        }}
      />
    );

    await fireKey({ key: ' ', code: 'Space' });
    expect(screen.getByTestId('open').textContent).toBe('true');

    // Schedule fallback.
    await fireKey({ key: 'ArrowRight', code: 'ArrowRight' });

    // Close before the fallback timer runs.
    await fireKey({ key: 'Escape', code: 'Escape' });
    expect(screen.getByTestId('open').textContent).toBe('false');

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Should not have tried to build preview for /tmp/b.txt.
    const calls = coreMock.invokeMock.mock.calls
      .filter((c) => c[0] === 'build_preview')
      .map((c) => c[1]?.path);
    expect(calls).not.toContain('/tmp/b.txt');
  });

  it('Closing preview invalidates in-flight requests (requestIdRef)', async () => {
    render(<PreviewNavHarness initialPath="/tmp/a.txt" />);

    await fireKey({ key: ' ', code: 'Space' });
    expect(screen.getByTestId('open').textContent).toBe('true');

    await fireKey({ key: 'Escape', code: 'Escape' });
    expect(screen.getByTestId('open').textContent).toBe('false');

    // Resolve the original build_preview after close; it should be ignored.
    await resolveBuildPreview('/tmp/a.txt', { kind: 'Text', name: 'a.txt', text: 'A' });

    expect(screen.getByTestId('open').textContent).toBe('false');
    expect(screen.getByTestId('name').textContent).toBe('');
  });
});
