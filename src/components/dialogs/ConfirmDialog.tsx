import type { ReactNode } from 'react';
import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  zoom: number;
  onConfirm: () => void;
  onClose: () => void;
}

/** A small Yes/No message box with the classic question icon. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  zoom,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      zoom={zoom}
      className="message-box"
      footer={
        <>
          <button type="button" className="btn btn--default" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {cancelLabel}
          </button>
        </>
      }
    >
      <div className="message-box__content">
        <svg className="message-box__icon" width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="16" cy="16" r="14" fill="#fff" stroke="#000080" strokeWidth="2" />
          <text x="16" y="23" textAnchor="middle" fontSize="20" fontWeight="bold" fill="#000080" fontFamily="Times New Roman, serif">
            ?
          </text>
        </svg>
        <div className="message-box__text">{message}</div>
      </div>
    </Dialog>
  );
}
