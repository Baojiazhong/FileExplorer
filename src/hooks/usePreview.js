import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useI18n } from '../i18n';
import { useSftp } from '../providers/SftpProvider';
import { normalizePreviewPayload } from '../utils/previewPayload';
import { shouldIgnoreKeyEvent } from '../utils/keymap';
import { registerKeydownHandler, KEYDOWN_PRIORITIES } from '../utils/keyboard';


/**
 * Hook for managing file/folder preview functionality
 * @param {Function} getFocusedItem - Function that returns the currently focused file/folder object
 * @param {Function} navigateUp - Function to navigate up one row
 * @param {Function} navigateDown - Function to navigate down one row  
 * @param {Function} navigateLeft - Function to navigate left one column
 * @param {Function} navigateRight - Function to navigate right one column
 * @returns {Object} Object containing preview state and control functions
 */
export function usePreview(
  getFocusedItem,
  navigateUp = null,
  navigateDown = null,
  navigateLeft = null,
  navigateRight = null,
  options = {}
) {
  const { t } = useI18n();
  const { keyHandlingEnabled = true } = options;

  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const { isSftpPath, parseSftpPath } = useSftp();
  const requestIdRef = useRef(0);
  const openRef = useRef(false);


  /**
   * Opens preview for the specified path
   * @param {string} path - Path to the file/folder to preview
   */
  const openPreview = useCallback(async (path) => {
    if (!path) return;

    // Start a new request; any previous in-flight request becomes stale.
    const requestId = ++requestIdRef.current;

    // Open immediately so user sees loading state.
    openRef.current = true;
    setOpen(true);
    setIsLoading(true);
    setPayload(null);

    try {
      let previewPayload;

      // Check if this is an SFTP path
      if (isSftpPath(path)) {
        const parsed = parseSftpPath(path);
        if (parsed && parsed.connection) {
          // Use SFTP preview command
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
        // Use regular preview command for local files
        previewPayload = await invoke('build_preview', { path });
      }

      if (requestId === requestIdRef.current) {
        setPayload(normalizePreviewPayload(previewPayload));
      }
    } catch (error) {
      console.error('Failed to build preview:', error);
      if (requestId === requestIdRef.current) {
        setPayload({
          kind: 'Error',
           name: path.split(/[/\\]/).pop() || t('common.unknown'),
           message: error instanceof Error ? error.message : t('preview.failedToGenerate'),
        });
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [isSftpPath, parseSftpPath]);


  /**
   * Closes the preview modal
   */
  const closePreview = useCallback(() => {
    openRef.current = false;
    // Invalidate any in-flight request so it can't write back after closing.
    requestIdRef.current += 1;
    setIsLoading(false);
    setOpen(false);
    setPayload(null);
  }, []);


  /**
   * Toggles preview for the currently focused item (files and folders)
   */
   const togglePreview = useCallback(() => {
     if (open) {
       closePreview();
       return;
     }
 
     const focusedItem = getFocusedItem();
     if (focusedItem && focusedItem.path) {
       openPreview(focusedItem.path);
     }
   }, [open, closePreview, openPreview, getFocusedItem]);

  const previewFocusedItem = useCallback(() => {
    const focused = getFocusedItem();
    if (focused && focused.path) {
      openPreview(focused.path);
    } else {
      closePreview();
    }
  }, [getFocusedItem, openPreview, closePreview]);

  // Keyboard event handler
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return;

      // Don't trigger if we're typing in an input
      if (shouldIgnoreKeyEvent(e)) {
        return;
      }

      // Spacebar toggles preview
      if (e.key === ' ') {
        // If preview is closed, only allow Space when no other overlay is active.
        if (!open && !keyHandlingEnabled) return;

        e.preventDefault();
        togglePreview();
      }
      // Escape closes preview
      else if (e.key === 'Escape' && open) {
        e.preventDefault();
        closePreview();
      }
       // Arrow keys navigate when preview is open
       else if (open && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
         e.preventDefault();
         let navigationFunction = null;
         switch (e.key) {
           case 'ArrowUp':
             navigationFunction = navigateUp;
             break;
           case 'ArrowDown':
             navigationFunction = navigateDown;
             break;
           case 'ArrowLeft':
             navigationFunction = navigateLeft;
             break;
           case 'ArrowRight':
             navigationFunction = navigateRight;
             break;
         }
         if (navigationFunction) {
           const nextItem = navigationFunction();

           // Prefer the return value (synchronous) so preview stays in sync with focus.
           if (nextItem && nextItem.path) {
             openPreview(nextItem.path);
           } else {
             // Fallback: focus might update asynchronously; try once on next tick.
             setTimeout(() => {
              if (!openRef.current) return;
              previewFocusedItem();
             }, 0);
           }
         }
       }
    };

    return registerKeydownHandler(
      (e) => {
        onKey(e);
        return e.defaultPrevented;
      },
      {
        id: 'preview-modal-keys',
        name: 'Preview modal keys',
        priority: KEYDOWN_PRIORITIES.PREVIEW_MODAL,
      }
    );
  }, [
    open,
    keyHandlingEnabled,
    togglePreview,
    closePreview,
    navigateUp,
    navigateDown,
    navigateLeft,
    navigateRight,
    getFocusedItem,
    openPreview,
  ]);


  return { 
    open, 
    payload, 
    isLoading,
    openPreview,
    previewFocusedItem,
    closePreview, 
    togglePreview 
  };
}

// Also export as default for compatibility
export default usePreview;
