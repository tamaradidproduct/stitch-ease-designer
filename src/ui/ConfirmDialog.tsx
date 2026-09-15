import { useEffect, useRef } from "react";

export type ConfirmDialogProps = {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Stand-in for `window.confirm()`, which some environments this app runs in
 * (e.g. an iPad home-screen/PWA shortcut, an embedded webview) suppress
 * silently - the confirming click then does nothing, with no dialog and no
 * error. Rendering our own means the confirmation always shows up.
 */
export function ConfirmDialog({
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="confirmDialog__overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="confirmDialog" role="alertdialog" aria-modal="true" aria-label={message}>
        <p className="confirmDialog__message">{message}</p>
        <div className="confirmDialog__actions">
          <button type="button" className="btn btn--quiet" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={danger ? "btn confirmDialog__confirm" : "btn btn--primary"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
