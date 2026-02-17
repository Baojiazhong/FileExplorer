import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSftp } from '../providers/SftpProvider';
import { normalizePreviewPayload } from '../utils/previewPayload';

/**
 * Docked preview hook for a Preview pane.
 * - No keyboard bindings.
 * - Fetches preview payload when enabled + selection changes.
 * - Uses a "latest request wins" guard to avoid stale results.
 */
export function usePreviewPane({ enabled, selectedItem, isMultipleSelection }) {
  const { isSftpPath, parseSftpPath } = useSftp();
  const [payload, setPayload] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const requestIdRef = useRef(0);

  const buildPreview = useCallback(
    async (item) => {
      if (!item?.path) {
        // Selection cleared; invalidate any in-flight request so it can't write back stale payload.
        requestIdRef.current += 1;
        setIsLoading(false);
        setPayload(null);
        return;
      }

      const requestId = ++requestIdRef.current;
      setIsLoading(true);

      try {
        let previewPayload;

        if (isSftpPath(item.path)) {
          const parsed = parseSftpPath(item.path);
          if (parsed && parsed.connection) {
            previewPayload = await invoke('build_preview_sftp', {
              host: parsed.connection.host,
              port: parseInt(parsed.connection.port, 10),
              username: parsed.connection.username,
              password: parsed.connection.password,
              filePath: parsed.remotePath,
            });
          } else {
            throw new Error('Invalid SFTP path or connection not found');
          }
        } else {
          previewPayload = await invoke('build_preview', { path: item.path });
        }

        if (requestId === requestIdRef.current) {
          setPayload(normalizePreviewPayload(previewPayload));
        }
      } catch (error) {
        if (requestId === requestIdRef.current) {
          setPayload({
            kind: 'Error',
            name: item?.name || (item?.path ? item.path.split(/[/\\]/).pop() : 'Unknown'),
            message: error instanceof Error ? error.message : 'Failed to generate preview',
          });
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [isSftpPath, parseSftpPath]
  );

  // Reset/refresh when pane is disabled or selection changes.
  useEffect(() => {
    if (!enabled) {
      requestIdRef.current += 1;
      setIsLoading(false);
      setPayload(null);
      return;
    }

    // Windows-like behavior: multiple selection -> show summary, no file preview.
    if (isMultipleSelection) {
      requestIdRef.current += 1;
      setIsLoading(false);
      setPayload(null);
      return;
    }

    buildPreview(selectedItem);
  }, [enabled, selectedItem?.path, isMultipleSelection, buildPreview]);

  const refresh = useCallback(() => {
    if (!enabled || isMultipleSelection) return;
    buildPreview(selectedItem);
  }, [enabled, isMultipleSelection, buildPreview, selectedItem]);

  return { payload, isLoading, refresh };
}

export default usePreviewPane;
