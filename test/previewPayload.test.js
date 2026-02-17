import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizePreviewPayload } from '../src/utils/previewPayload.js';

// convertFileSrc comes from Tauri and isn't available in node tests.
// Mock it as a predictable transformer.
const withMockedConvertFileSrc = async (fn) => {
  const original = globalThis.__TAURI__;
  globalThis.__TAURI__ = {
    core: {
      convertFileSrc: (p) => `tauri://${p}`,
    },
  };

  try {
    await fn();
  } finally {
    globalThis.__TAURI__ = original;
  }
};

test('normalizePreviewPayload: Image prefers data_uri', async () => {
  await withMockedConvertFileSrc(() => {
    const input = { kind: 'Image', name: 'x.png', path: 'C:/x.png', data_uri: 'data:image/png;base64,abc' };
    const out = normalizePreviewPayload(input);
    assert.equal(out.src, 'data:image/png;base64,abc');
  });
});

test('normalizePreviewPayload: Image uses convertFileSrc for local path', async () => {
  await withMockedConvertFileSrc(() => {
    const input = { kind: 'Image', name: 'x.png', path: 'C:/x.png', data_uri: null };
    const out = normalizePreviewPayload(input);
    assert.equal(out.src, 'tauri://C:/x.png');
  });
});

test('normalizePreviewPayload: Pdf uses convertFileSrc for local path', async () => {
  await withMockedConvertFileSrc(() => {
    const input = { kind: 'Pdf', name: 'x.pdf', path: '/tmp/x.pdf' };
    const out = normalizePreviewPayload(input);
    assert.equal(out.src, 'tauri:///tmp/x.pdf');
  });
});

test('normalizePreviewPayload: Audio/Video accept data_uri too', async () => {
  await withMockedConvertFileSrc(() => {
    const inputAudio = { kind: 'Audio', name: 'x.mp3', data_uri: 'data:audio/mpeg;base64,abc' };
    const outAudio = normalizePreviewPayload(inputAudio);
    assert.equal(outAudio.src, 'data:audio/mpeg;base64,abc');

    const inputVideo = { kind: 'Video', name: 'x.mp4', path: '/tmp/x.mp4' };
    const outVideo = normalizePreviewPayload(inputVideo);
    assert.equal(outVideo.src, 'tauri:///tmp/x.mp4');
  });
});
