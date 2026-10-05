import { useEffect, useRef } from "react";
import { useDismissOnOutsideOrEscape } from "./useDismissOnOutsideOrEscape";
import { Button } from "./Button";

export type ConfirmDialogProps = {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Further choices shown between Cancel and the confirm button (e.g. "Detach copies"). */
  extraActions?: { label: string; onClick: () => void }[];
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
  extraActions = [],
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  useDismissOnOutsideOrEscape({
    onDismiss: onCancel,
    // No document-level outside-pointerdown handling here - the overlay's
    // own onPointerDown below already closes the dialog on a backdrop click
    // (and, being a full-viewport backdrop, is never missed by a click that
    // isn't also on the dialog itself).
    dismissOnOutsidePointerdown: false,
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        const dialog = dialogRef.current;
        const focusable = dialog?.querySelectorAll("button");
        if (!dialog || !focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        // Focus can land outside the dialog (e.g. a click on the
        // non-focusable message text, or the overlay); redirect it back in
        // rather than letting Tab escape to the page behind the dialog.
        if (!dialog.contains(document.activeElement)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
          return;
        }
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="confirmDialog__overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div ref={dialogRef} className="confirmDialog" role="alertdialog" aria-modal="true" aria-label={message}>
        <p className="confirmDialog__message">{message}</p>
        <div className="confirmDialog__actions">
          <Button variant="quiet" onClick={onCancel}>
            {cancelLabel}
          </Button>
          {extraActions.map((action) => (
            <Button key={action.label} onClick={action.onClick}>
              {action.label}
            </Button>
          ))}
          <Button
            ref={confirmRef}
            variant={danger ? "default" : "primary"}
            className={danger ? "confirmDialog__confirm" : undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
