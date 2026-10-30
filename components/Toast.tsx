"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

type ToastKind = "info" | "error" | "success";
type ToastAction = { label: string; onClick: () => void };
type ToastOptions = { action?: ToastAction; duration?: number };
type ToastItem = { id: number; message: string; kind: ToastKind; action?: ToastAction };
type ConfirmOptions = { confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type AskTextOptions = {
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** El botón de confirmar queda deshabilitado hasta que el texto sea exactamente este valor. */
  requireExact?: string;
};
type ConfirmState =
  | { kind: "confirm"; message: string; opts: Required<ConfirmOptions>; resolve: (value: boolean) => void }
  | {
      kind: "text";
      message: string;
      opts: Required<Omit<AskTextOptions, "requireExact">> & { requireExact: string | null };
      resolve: (value: string | null) => void;
    }
  | null;

type ToastApi = {
  toast: (message: string, kind?: ToastKind, options?: ToastOptions) => void;
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
  askText: (message: string, options?: AskTextOptions) => Promise<string | null>;
};

const ToastContext = createContext<ToastApi | null>(null);

// Mantiene el Tab dentro de un diálogo modal (de último a primero y al revés).
export function trapFocus(e: React.KeyboardEvent, container: HTMLElement | null) {
  if (e.key !== "Tab" || !container) return;
  const els = container.querySelectorAll<HTMLElement>(
    "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])"
  );
  if (!els.length) return;
  const first = els[0];
  const last = els[els.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<ConfirmState>(null);
  const [textValue, setTextValue] = useState("");
  const idRef = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Elemento con el foco antes de abrir el diálogo, para devolvérselo al cerrar.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const dismiss = useCallback((id: number) => setItems((prev) => prev.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "info", options?: ToastOptions) => {
      const id = ++idRef.current;
      setItems((prev) => [...prev, { id, message, kind, action: options?.action }]);
      // Los errores se quedan hasta que el usuario los cierra; el resto se van solos.
      if (kind !== "error") setTimeout(() => dismiss(id), options?.duration ?? 4200);
    },
    [dismiss]
  );

  const confirm = useCallback(
    (message: string, options?: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        returnFocusRef.current = document.activeElement as HTMLElement | null;
        setDialog({
          kind: "confirm",
          message,
          opts: {
            confirmLabel: options?.confirmLabel ?? "Aceptar",
            cancelLabel: options?.cancelLabel ?? "Cancelar",
            danger: options?.danger ?? false,
          },
          resolve,
        });
      }),
    []
  );

  const askText = useCallback(
    (message: string, options?: AskTextOptions) =>
      new Promise<string | null>((resolve) => {
        returnFocusRef.current = document.activeElement as HTMLElement | null;
        setTextValue(options?.defaultValue ?? "");
        setDialog({
          kind: "text",
          message,
          opts: {
            placeholder: options?.placeholder ?? "",
            defaultValue: options?.defaultValue ?? "",
            confirmLabel: options?.confirmLabel ?? "Aceptar",
            cancelLabel: options?.cancelLabel ?? "Cancelar",
            danger: options?.danger ?? false,
            requireExact: options?.requireExact ?? null,
          },
          resolve,
        });
      }),
    []
  );

  const api = useMemo(() => ({ toast, confirm, askText }), [toast, confirm, askText]);

  const close = useCallback((value: boolean | string | null) => {
    setDialog((current) => {
      if (!current) return null;
      if (current.kind === "confirm") current.resolve(value === true);
      else current.resolve(typeof value === "string" ? value : null);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(dialog.kind === "confirm" ? false : null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, close]);

  // Al cerrar el diálogo devolvemos el foco a donde estaba al abrirlo, para que
  // teclado y lector de pantalla no "pierdan el sitio".
  const isOpen = dialog !== null;
  useEffect(() => {
    if (isOpen) return;
    returnFocusRef.current?.focus?.();
    returnFocusRef.current = null;
  }, [isOpen]);

  const textOk = dialog?.kind === "text" && (!dialog.opts.requireExact || textValue === dialog.opts.requireExact);

  return (
    <ToastContext.Provider value={api}>
      {children}

      {items.length > 0 && (
        <div className="toast-stack" role="region" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className={`toast-item ${t.kind}`} role={t.kind === "error" ? "alert" : undefined}>
              <span>{t.message}</span>
              {t.action && (
                <button
                  type="button"
                  className="toast-action"
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button type="button" className="toast-close" aria-label="Cerrar aviso" onClick={() => dismiss(t.id)}>
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {dialog && (
        <div className="modal-backdrop" onClick={() => close(dialog.kind === "confirm" ? false : null)}>
          <div
            className="modal confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-label={dialog.message}
            ref={dialogRef}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => trapFocus(e, dialogRef.current)}
          >
            <p className="confirm-message">{dialog.message}</p>

            {dialog.kind === "text" && (
              <input
                className="input"
                style={{ marginTop: 14 }}
                autoFocus
                value={textValue}
                placeholder={dialog.opts.placeholder}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && textOk) close(textValue);
                }}
              />
            )}

            <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 18 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => close(dialog.kind === "confirm" ? false : null)}
              >
                {dialog.opts.cancelLabel}
              </button>
              <button
                type="button"
                className={`btn ${dialog.opts.danger ? "btn-danger" : "btn-primary"}`}
                autoFocus={dialog.kind === "confirm"}
                disabled={dialog.kind === "text" && !textOk}
                onClick={() => close(dialog.kind === "confirm" ? true : textValue)}
              >
                {dialog.opts.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
