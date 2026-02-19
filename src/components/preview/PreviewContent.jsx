import React from 'react';
import Icon from '../common/Icon';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useI18n } from '../../i18n';

export function PreviewContent({ payload }) {
  const { t } = useI18n();

  if (!payload) return null;

  switch (payload.kind) {
    case 'Folder': {
      return (
        <div className="preview-folder-container">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.25rem', minHeight: 140 }}>
            <div style={{ fontSize: '7rem', color: '#4a90e2', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '7.5rem', width: '7.5rem' }}>
              <Icon name="folder" size="xlarge" style={{ fontSize: '7rem', color: '#4a90e2' }} />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: 8, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '1.5rem', color: 'var(--text-primary, #1a1a1a)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {payload.name || t('preview.folderFallbackName')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: 8 }}>
                <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary, #666)' }}>
                  <span style={{ fontWeight: 500 }}>{t('preview.folderSizeLabel')}</span>{' '}
                  {typeof payload.size === 'number' ? formatFileSize(payload.size) : '—'}
                </div>
                <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary, #666)' }}>
                  <span style={{ fontWeight: 500 }}>{t('preview.folderItemsLabel')}</span>{' '}
                  {typeof payload.item_count === 'number' ? payload.item_count : '—'}
                </div>
                <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary, #666)' }}>
                  <span style={{ fontWeight: 500 }}>{t('preview.folderLastModifiedLabel')}</span>{' '}
                  {payload.modified ? new Date(payload.modified).toLocaleString() : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    case 'Image': {
      const src = payload.src || payload.data_uri || '';
      if (!src) {
        return (
          <div className="preview-unknown">
            <p>{t('preview.notAvailable')}</p>
          </div>
        );
      }
      return (
        <div className="preview-image-container">
          <img src={src} alt={payload.name} className="preview-image" />
          <div className="preview-image-info">
            <span className="preview-file-size">{formatFileSize(payload.bytes)}</span>
          </div>
        </div>
      );
    }

    case 'Pdf': {
      const src = payload.src || payload.data_uri || '';
      if (!src) {
        return (
          <div className="preview-unknown">
            <p>{t('preview.notAvailable')}</p>
          </div>
        );
      }
      return (
        <div className="preview-pdf-container" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <iframe title={payload.name} src={src} style={{ flex: 1, width: '100%', height: 0, minHeight: 0, border: 'none' }} />
          <div className="preview-image-info" style={{ alignSelf: 'flex-end', marginTop: 8 }}>
            <span className="preview-file-size">{formatFileSize(payload.bytes)}</span>
          </div>
        </div>
      );
    }

    case 'Video': {
      const url = payload.src || (payload.path ? convertFileSrc(payload.path) : '');
      if (!url) {
        return (
          <div className="preview-unknown">
            <p>{t('preview.notAvailable')}</p>
          </div>
        );
      }
      return (
        <div className="preview-video-container">
          <video src={url} controls className="preview-video" preload="metadata">
            {t('preview.videoNotSupported')}
          </video>
        </div>
      );
    }

    case 'Audio': {
      const url = payload.src || (payload.path ? convertFileSrc(payload.path) : '');
      if (!url) {
        return (
          <div className="preview-unknown">
            <p>{t('preview.notAvailable')}</p>
          </div>
        );
      }
      return (
        <div className="preview-audio-container">
          <div className="preview-audio-player">
            <div className="preview-audio-icon">🎵</div>
            <audio src={url} controls className="preview-audio" preload="metadata">
              {t('preview.audioNotSupported')}
            </audio>
          </div>
        </div>
      );
    }

    case 'Text': {
      const lines = payload.text ? payload.text.split('\n') : [];
      return (
        <div className="preview-text-container">
          <pre className="preview-text with-line-numbers">
            {lines.map((line, idx) => (
              <div key={idx} className="preview-text-line">
                <span className="preview-line-number">{idx + 1}</span>
                <span className="preview-line-content">{line || '\u00A0'}</span>
              </div>
            ))}
          </pre>
          {payload.truncated && (
            <div className="preview-text-truncated">
              <p>{t('preview.textTruncated')}</p>
            </div>
          )}
        </div>
      );
    }

    case 'Unknown':
      return (
        <div className="preview-unknown">
          <div className="preview-unknown-icon">📁</div>
          <p>{t('preview.notAvailable')}</p>
        </div>
      );

    case 'Error':
      return (
        <div className="preview-error">
          <div className="preview-error-icon">⚠️</div>
          <h3>{t('preview.errorTitle')}</h3>
          <p>{payload.message}</p>
        </div>
      );

    default:
      return (
        <div className="preview-unknown">
          <p>{t('preview.unknownType')}</p>
        </div>
      );
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default PreviewContent;

