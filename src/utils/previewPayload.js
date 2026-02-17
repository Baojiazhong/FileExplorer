import { convertFileSrc } from '@tauri-apps/api/core';

/**
 * Normalize preview payloads coming from the backend into a consistent shape.
 *
 * We expose a single field (`src`) for the webview to render media.
 * - Local files: `src` is convertFileSrc(localPath)
 * - Remote/SFTP embeds: `src` is a data: URI
 */
export const normalizePreviewPayload = (rawPayload) => {
  if (!rawPayload || typeof rawPayload !== 'object') return rawPayload;

  const convertFileSrcSafe = (p) => {
    const fn = globalThis?.__TAURI__?.core?.convertFileSrc || convertFileSrc;
    return fn(p);
  };

  const toMediaSrc = (rawPath) => {
    if (typeof rawPath !== 'string' || !rawPath) return '';
    if (rawPath.startsWith('data:')) return rawPath;
    try {
      return convertFileSrcSafe(rawPath);
    } catch {
      return rawPath;
    }
  };

  const dataUri = typeof rawPayload.data_uri === 'string' ? rawPayload.data_uri : '';

  switch (rawPayload.kind) {
    case 'Image':
    case 'Pdf': {
      const path = typeof rawPayload.path === 'string' ? rawPayload.path : '';
      const src = dataUri || toMediaSrc(path);
      return src ? { ...rawPayload, src } : rawPayload;
    }
    case 'Video':
    case 'Audio': {
      const path = typeof rawPayload.path === 'string' ? rawPayload.path : '';
      const src = dataUri || toMediaSrc(path);
      return src ? { ...rawPayload, src } : rawPayload;
    }
    default:
      return rawPayload;
  }
};
