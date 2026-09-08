import { useEffect, useRef } from 'react';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Small, generic two-button confirmation modal (resign / abandon-and-start-
 * new-game in this slice) - deliberately not board- or chess-specific, so
 * it carries no rule/engine knowledge of its own, only a yes/no prompt.
 * Mirrors `PromotionDialog`'s accessible-modal shape (focus trap, Escape to
 * cancel), except initial focus lands on **Cancel**, not the first option:
 * every current use of this dialog confirms something hard to undo
 * (resigning, abandoning a game in progress), so the safe default must be
 * the one a reflexive Enter/Space press cannot make worse.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;

    // Two-button focus trap, same wrap-around shape as PromotionDialog's
    // own (larger) one.
    const options = [cancelRef.current, confirmRef.current].filter(
      (el): el is HTMLButtonElement => el !== null,
    );
    if (options.length === 0) return;
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);
    const lastIndex = options.length - 1;

    if (event.shiftKey && currentIndex <= 0) {
      event.preventDefault();
      options[lastIndex].focus();
    } else if (!event.shiftKey && currentIndex >= lastIndex) {
      event.preventDefault();
      options[0].focus();
    }
  }

  return (
    <div className={styles.overlay} onClick={onCancel} onKeyDown={handleKeyDown}>
      <div
        className={styles.panel}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby="confirm-dialog-message"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className={styles.title}>{title}</h2>
        <p id="confirm-dialog-message" className={styles.message}>
          {message}
        </p>
        <div className={styles.actions}>
          <button type="button" ref={cancelRef} className={styles.cancel} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" ref={confirmRef} className={styles.confirm} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
