import React from 'react';
import PreviewContent from './PreviewContent';
import './PreviewModal.css';

/**
 * PreviewModal component - Displays file/folder previews in a modal
 * @param {Object} props - Component props
 * @param {Object} props.payload - The preview payload data
 * @param {Function} props.onClose - Function to call when closing the modal
 * @param {boolean} props.isLoading - Whether the preview is loading
 * @returns {React.ReactElement|null} PreviewModal component or null
 */
export function PreviewModal({ payload, onClose, isLoading }) {
  if (!payload && !isLoading) return null;

  return (
    <div className="preview-modal-backdrop" onClick={onClose}>
      <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
        <header
          className="preview-modal-header"
          style={{
            minHeight: 32,
            height: 32,
            padding: '0 0.5rem',
            background: 'var(--surface, #f8f9fa)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <button
            onClick={onClose}
            className="preview-modal-close"
            aria-label="Close preview"
            style={{ marginRight: 0 }}
          >
            <span className="icon icon-x"></span>
          </button>
          {payload?.name && payload?.kind !== 'Folder' && (
            <div
              style={{
                marginLeft: 12,
                fontSize: '1rem',
                color: 'var(--text-secondary, #666)',
                opacity: 0.35,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '60vw',
              }}
            >
              {payload.name}
            </div>
          )}
          <div style={{ flex: 1 }}></div>
        </header>
        <div className="preview-modal-content">
          {isLoading ? (
            <div className="preview-loading">
              <div className="spinner"></div>
              <p>Loading preview...</p>
            </div>
          ) : (
            <PreviewContent payload={payload} variant="modal" />
          )}
        </div>
      </div>
    </div>
  );
}

export default PreviewModal;

