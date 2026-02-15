import React from 'react';
import PreviewContent from './PreviewContent';
import './previewPane.css';

export function PreviewPane({ payload, isLoading, selectedCount }) {
  return (
    <div className="preview-pane" aria-label="Preview pane">
      <div className="preview-pane-header">
        <div className="preview-pane-title">Preview</div>
      </div>

      <div className="preview-pane-content">
        {selectedCount > 1 ? (
          <div className="preview-pane-empty">
            <div className="preview-pane-empty-title">Multiple items selected</div>
            <div className="preview-pane-empty-subtitle">{selectedCount} items selected. Select a single item to preview.</div>
          </div>
        ) : isLoading ? (
          <div className="preview-loading">
            <div className="spinner"></div>
            <p>Loading preview...</p>
          </div>
        ) : payload ? (
          <div className="preview-pane-body">
            <PreviewContent payload={payload} variant="pane" />
          </div>
        ) : (
          <div className="preview-pane-empty">
            <div className="preview-pane-empty-title">Select an item</div>
            <div className="preview-pane-empty-subtitle">Select a file or folder to preview it here.</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PreviewPane;
