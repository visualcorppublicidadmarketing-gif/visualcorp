import React from 'react';
import { Clock, Eye, History, RotateCcw, Send, Trash2 } from 'lucide-react';
import { useConfirm } from './OperationalKit';
import type { DialogKeyValueItem } from './DialogSystem';
import type { StoredDraftPayload } from '../../lib/usePersistentDraft';
import './publish-confirm-bar.css';

function formatDraftClock(timestamp: number | null) {
  if (!timestamp) return '';
  try {
    return new Date(timestamp).toLocaleTimeString('es-EC', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export type DraftRecoveryBannerProps<T> = {
  pendingRecovery: StoredDraftPayload<T> | null;
  itemLabel?: string;
  onRecover: () => void;
  onDismiss: () => void;
};

export function DraftRecoveryBanner<T>({
  pendingRecovery,
  itemLabel = 'esta sección',
  onRecover,
  onDismiss,
}: DraftRecoveryBannerProps<T>) {
  const confirm = useConfirm();
  if (!pendingRecovery) return null;

  const formattedDate = (() => {
    try {
      return new Date(pendingRecovery.savedAt).toLocaleString('es-EC', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'recientemente';
    }
  })();

  const handleDismiss = async () => {
    const accepted = await confirm({
      eyebrow: 'DESCARTAR BORRADOR LOCAL',
      title: '¿Eliminar el borrador recuperable?',
      description: `Se eliminará el respaldo local de ${itemLabel} guardado el ${formattedDate} y se mantendrá la versión publicada actualmente.`,
      tone: 'danger',
      destructive: true,
      confirmLabel: 'Sí, eliminar borrador',
      cancelLabel: 'Volver',
    });
    if (accepted) onDismiss();
  };

  return (
    <aside className="vc-draft-recovery-banner" role="status" aria-live="polite">
      <div className="vc-recovery-copy-group">
        <span className="vc-recovery-icon" aria-hidden="true">
          <History size={17} />
        </span>
        <div className="vc-recovery-text">
          <b>Borrador local detectado en {itemLabel}</b>
          <small>
            Guardado automáticamente el {formattedDate} antes de recargar. Puedes restaurarlo para seguir editando o descartarlo.
          </small>
        </div>
      </div>
      <div className="vc-recovery-actions">
        <button type="button" className="vc-publish-btn is-recover" onClick={onRecover}>
          <RotateCcw size={14} aria-hidden="true" />
          Recuperar borrador
        </button>
        <button type="button" className="vc-publish-btn is-discard" onClick={() => void handleDismiss()}>
          <Trash2 size={14} aria-hidden="true" />
          Descartar
        </button>
      </div>
    </aside>
  );
}

export type PublishConfirmBarProps = {
  isDirty: boolean;
  isRecovered?: boolean;
  draftSavedAt?: number | null;
  sectionName: string;
  statusNote?: string;
  canPublish?: boolean;
  publishing?: boolean;
  allowPublishWhenClean?: boolean;
  previewLabel?: string;
  publishLabel?: string;
  discardLabel?: string;
  publishConfirmTitle?: string;
  publishConfirmDescription: string;
  publishSummaryItems?: DialogKeyValueItem[];
  publishConsequences?: string[];
  discardConfirmTitle?: string;
  discardConfirmDescription?: string;
  onPreview?: () => void;
  onDiscard: () => void | Promise<void>;
  onPublish: () => void | Promise<void>;
};

export function PublishConfirmBar({
  isDirty,
  isRecovered = false,
  draftSavedAt = null,
  sectionName,
  statusNote,
  canPublish = true,
  publishing = false,
  allowPublishWhenClean = false,
  previewLabel = 'Vista previa',
  publishLabel = 'Publicar en vivo',
  discardLabel = 'Descartar',
  publishConfirmTitle,
  publishConfirmDescription,
  publishSummaryItems,
  publishConsequences,
  discardConfirmTitle = '¿Descartar los cambios sin publicar?',
  discardConfirmDescription,
  onPreview,
  onDiscard,
  onPublish,
}: PublishConfirmBarProps) {
  const confirm = useConfirm();
  const hasLocalChanges = isDirty || isRecovered;
  const savedClock = formatDraftClock(draftSavedAt);

  const handleDiscard = async () => {
    if (!hasLocalChanges || publishing) return;
    const accepted = await confirm({
      eyebrow: 'DESCARTAR CAMBIOS',
      title: discardConfirmTitle,
      description:
        discardConfirmDescription ||
        `Los cambios locales en ${sectionName} se descartarán y el editor volverá a los valores publicados actualmente.`,
      tone: 'danger',
      destructive: true,
      confirmLabel: 'Sí, descartar cambios',
      cancelLabel: 'Seguir editando',
    });
    if (accepted) {
      await onDiscard();
    }
  };

  const handlePublish = async () => {
    if (!canPublish || publishing || (!hasLocalChanges && !allowPublishWhenClean)) return;
    const accepted = await confirm({
      eyebrow: 'CONFIRMAR PUBLICACIÓN EN VIVO',
      title: publishConfirmTitle || `¿Publicar cambios en ${sectionName}?`,
      description: publishConfirmDescription,
      summaryItems: publishSummaryItems,
      consequences: publishConsequences,
      consequencesTitle: publishConsequences?.length ? 'Impacto en el sitio público' : undefined,
      tone: 'brand',
      confirmLabel: publishLabel,
      cancelLabel: 'Revisar antes',
    });
    if (accepted) {
      await onPublish();
    }
  };

  return (
    <section
      className={`vc-publish-confirm-bar${isRecovered ? ' is-recovered' : isDirty ? ' is-dirty' : ''}`}
      aria-label={`Controles de publicación para ${sectionName}`}
    >
      <div className="vc-publish-status-group">
        <div className="vc-publish-meta">
          <div className="vc-publish-title-row">
            <span
              className={`vc-publish-pill ${
                isRecovered ? 'is-recovered' : isDirty ? 'is-dirty' : 'is-synced'
              }`}
              role="status"
            >
              <span className="vc-publish-pill-dot" aria-hidden="true" />
              {isRecovered
                ? 'Borrador recuperado'
                : isDirty
                ? 'Cambios sin guardar'
                : 'Sincronizado en vivo'}
            </span>
            <span className="vc-publish-section-text">{sectionName}</span>
          </div>
          <span className="vc-publish-timestamp">
            {statusNote
              ? statusNote
              : hasLocalChanges
              ? savedClock
                ? `Guardado localmente en este navegador a las ${savedClock}.`
                : 'Tus ediciones permanecen protegidas en este navegador hasta publicar o descartar.'
              : 'Lo que ves en el editor coincide con la versión pública actual.'}
          </span>
        </div>
      </div>

      <div className="vc-publish-actions">
        {onPreview && (
          <button type="button" className="vc-publish-btn" onClick={onPreview}>
            <Eye size={14} aria-hidden="true" />
            {previewLabel}
          </button>
        )}

        <button
          type="button"
          className="vc-publish-btn is-discard"
          disabled={!hasLocalChanges || publishing}
          onClick={() => void handleDiscard()}
        >
          <RotateCcw size={14} aria-hidden="true" />
          {discardLabel}
        </button>

        {canPublish && (
          <button
            type="button"
            className="vc-publish-btn is-primary"
            disabled={publishing || (!hasLocalChanges && !allowPublishWhenClean)}
            onClick={() => void handlePublish()}
          >
            {publishing ? <Clock size={14} aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
            {publishing ? 'Publicando…' : publishLabel}
          </button>
        )}
      </div>
    </section>
  );
}
