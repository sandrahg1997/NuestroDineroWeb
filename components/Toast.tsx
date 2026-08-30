"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type ToastKind = "info" | "error" | "success";
type ToastItem = { id: number; message: string; kind: ToastKind };
type ConfirmOptions = { confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type ConfirmState = (Required<ConfirmOptions> & { message: string; resolve: (value: boolean) => void }) | null;

type ToastApi = {
  toast: (message: string, kind?: ToastKind) => void;
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const idRef = useRef(0);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  const confirm = useCallback(
    (message: string, options?: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setConfirmState({
          message,
          confirmLabel: options?.confirmLabel ?? "Aceptar",
          cancelLabel: options?.cancelLabel ?? "Cancelar",
          danger: options?.danger ?? false,
          resolve,
        });
      }),
    [],
  );

  const api = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  const closeConfirm = (value: boolean) => {
    setConfirmState((current) => {
      current?.resolve(value);
      return null;
    });
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {items.length > 0 && (
        <div className="toast-stack" role="region" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className={`toast-item ${t.kind}`}>{t.message}</div>
          ))}
        </div>
      )}
      {confirmState && (
        <div className="modal-backdrop" onClick={() => closeConfirm(false)}>
          <div
            className="modal confirm-modal"
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="confirm-message">{confirmState.message}</p>
            <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 18 }}>
              <button type="button" className="btn btn-ghost" onClick={() => closeConfirm(false)}>
                {confirmState.cancelLabel}
              </button>
              <button
                type="button"
                className={`btn ${confirmState.danger ? "btn-danger" : "btn-primary"}`}
                onClick={() => closeConfirm(true)}
                autoFocus
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
