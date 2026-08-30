"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

type ToastKind = "info" | "error" | "success";
type ToastItem = { id: number; message: string; kind: ToastKind };
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
  | { kind: "text"; message: string; opts: Required<Omit<AskTextOptions, "requireExact">> & { requireExact: string | null }; resolve: (value: string | null) => void }
  | null;

type ToastApi = {
  toast: (message: string, kind?: ToastKind) => void;
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
  askText: (message: string, options?: AskTextOptions) => Promise<string | null>;
};

const ToastContext = createContext<ToastApi | null>(null);

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

  const dismiss = useCallback((id: number) => setItems((prev) => prev.filter((t) => t.id !== id)), []);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { id, message, kind }]);
    // Los errores se quedan hasta que el usuario los cierra; el resto se van solos.
    if (kind !== "error") setTimeout(() => dismiss(id), 4200);
  }, [dismiss]);

  const confirm = useCallback(
    (message: string, options?: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
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
    [],
  );

  const askText = useCallback(
    (message: string, options?: AskTextOptions) =>
      new Promise<string | null>((resolve) => {
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
    [],
  );

  const api = useMemo(() => ({ toast, confirm, askText }), [toast, confirm, askText]);

  const close = useCallback(
    (value: boolean | string | null) => {
      setDialog((current) => {
        if (!current) return null;
        if (current.kind === "confirm") current.resolve(value === true);
        else current.resolve(typeof value === "string" ? value : null);
        return null;
      });
    },
    [],
  );

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(dialog.kind === "confirm" ? false : null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, close]);

  const textOk = dialog?.kind === "text" && (!dialog.opts.requireExact || textValue === dialog.opts.requireExact);

  return (
    <ToastContext.Provider value={api}>
      {children}

      {items.length > 0 && (
        <div className="toast-stack" role="region" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className={`toast-item ${t.kind}`}>
              <span>{t.message}</span>
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
            onClick={(e) => e.stopPropagation()}
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
              <button type="button" className="btn btn-ghost" onClick={() => close(dialog.kind === "confirm" ? false : null)}>
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
