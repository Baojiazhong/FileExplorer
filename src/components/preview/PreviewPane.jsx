import React from 'react';
import { useI18n } from '../../i18n';
import PreviewContent from './PreviewContent';
import './previewPane.css';

export function PreviewPane({ payload, isLoading, selectedCount }) {
  const { t } = useI18n();
  return (
    <div className="preview-pane" aria-label={t('preview.paneAria')}>
      <div className="preview-pane-header">
        <div className="preview-pane-title">{t('preview.title')}</div>
      </div>

      <div className="preview-pane-content">
        {selectedCount > 1 ? (
          <div className="preview-pane-empty">
            <div className="preview-pane-empty-title">{t('preview.multipleSelectedTitle')}</div>
            <div className="preview-pane-empty-subtitle">
              {t('preview.multipleSelectedSubtitle', { count: selectedCount })}
            </div>
          </div>
        ) : isLoading ? (
          <div className="preview-loading">
            <div className="spinner"></div>
            <p>{t('preview.loading')}</p>
          </div>
        ) : payload ? (
          <div className="preview-pane-body">
            <PreviewContent payload={payload} variant="pane" />
          </div>
        ) : (
          <div className="preview-pane-empty">
            <div className="preview-pane-empty-title">{t('preview.selectItemTitle')}</div>
            <div className="preview-pane-empty-subtitle">{t('preview.selectItemSubtitle')}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PreviewPane;
