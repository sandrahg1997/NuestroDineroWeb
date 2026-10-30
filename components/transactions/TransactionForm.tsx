"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { Category, TransactionType } from "@/lib/types";
import { dateKey } from "@/lib/utils";
import { merchantSuggestions } from "@/lib/receipt";
import MoneyInput from "../MoneyInput";
import { trapFocus } from "../Toast";

export type MerchantRule = { merchant_pattern: string; category_id: string };

export type Form = {
  id?: string;
  concept: string;
  amount: string;
  date: string;
  category_id: string;
  type: TransactionType;
  note: string;
  merchant: string;
  receipt_text: string;
};

export const blankForm = (type: TransactionType = "expense"): Form => ({
  concept: "",
  amount: "",
  date: dateKey(),
  category_id: "",
  type,
  note: "",
  merchant: "",
  receipt_text: "",
});

export default function TransactionForm({
  form,
  setForm,
  categories,
  frequentCategories,
  rules,
  resetKey,
  onSave,
  onClose,
}: {
  form: Form;
  setForm: React.Dispatch<React.SetStateAction<Form | null>>;
  categories: Category[];
  frequentCategories: Category[];
  rules: MerchantRule[];
  /** Cambia tras "Guardar y añadir otro" para volver a poner el foco en Concepto. */
  resetKey: number;
  onSave: (again: boolean) => void;
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLFormElement>(null);
  const conceptRef = useRef<HTMLInputElement>(null);
  const quickCats = frequentCategories.filter((c) => c.type === form.type).slice(0, 5);

  // Cerrar el modal con Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (resetKey) conceptRef.current?.focus();
  }, [resetKey]);

  // Sugerir categoría a partir del comercio: primero las reglas aprendidas,
  // luego el diccionario de comercios habituales.
  function suggestCategory(merchant: string, t: TransactionType): string {
    const m = merchant.trim().toLowerCase();
    if (!m || t !== "expense") return "";
    const rule = rules.find((r) => r.merchant_pattern && m.includes(r.merchant_pattern));
    if (rule && categories.some((c) => c.id === rule.category_id && c.type === "expense")) return rule.category_id;
    const key = Object.keys(merchantSuggestions).find((k) => m.includes(k));
    if (key) {
      const match = categories.find(
        (c) => c.type === "expense" && c.name.toLowerCase() === merchantSuggestions[key].toLowerCase()
      );
      if (match) return match.id;
    }
    return "";
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        className="modal"
        ref={modalRef}
        onSubmit={(e) => {
          e.preventDefault();
          onSave(false);
        }}
        onKeyDown={(e) => trapFocus(e, modalRef.current)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tm-modal-title"
      >
        <div className="modal-head">
          <h2 id="tm-modal-title">{form.id ? "Editar movimiento" : "Nuevo movimiento"}</h2>
          <button type="button" className="btn btn-ghost" aria-label="Cerrar" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="chip-row" style={{ marginBottom: 14 }} role="group" aria-label="Tipo de movimiento">
          <button
            type="button"
            className={`chip ${form.type === "expense" ? "active" : ""}`}
            aria-pressed={form.type === "expense"}
            onClick={() => setForm({ ...form, type: "expense", category_id: "" })}
          >
            Gasto
          </button>
          <button
            type="button"
            className={`chip ${form.type === "income" ? "active" : ""}`}
            aria-pressed={form.type === "income"}
            onClick={() => setForm({ ...form, type: "income", category_id: "" })}
          >
            Ingreso
          </button>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="tm-concept">Concepto</label>
            <input
              id="tm-concept"
              className="input"
              ref={conceptRef}
              autoFocus
              value={form.concept}
              onChange={(e) => setForm({ ...form, concept: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="tm-amount">Importe</label>
            <MoneyInput id="tm-amount" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} required />
          </div>
          <div className="field">
            <label htmlFor="tm-date">Fecha</label>
            <input
              id="tm-date"
              className="input"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="tm-merchant">Comercio</label>
            <input
              id="tm-merchant"
              className="input"
              value={form.merchant}
              onChange={(e) => setForm({ ...form, merchant: e.target.value })}
              onBlur={(e) => {
                const sug = suggestCategory(e.target.value, form.type);
                if (sug) setForm((f) => (f && !f.category_id ? { ...f, category_id: sug } : f));
              }}
            />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="tm-category">Categoría</label>
            {quickCats.length > 0 && (
              <div className="chip-row" style={{ marginBottom: 8 }}>
                {quickCats.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    className={`chip ${form.category_id === c.id ? "active" : ""}`}
                    aria-pressed={form.category_id === c.id}
                    onClick={() => setForm({ ...form, category_id: form.category_id === c.id ? "" : c.id })}
                  >
                    {c.icon} {c.name}
                  </button>
                ))}
              </div>
            )}
            <select
              id="tm-category"
              className="select"
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            >
              <option value="">Sin categoría</option>
              {categories
                .filter((c) => c.type === form.type)
                .map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="tm-note">Nota</label>
            <input
              id="tm-note"
              className="input"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>
        </div>
        <div className="toolbar" style={{ justifyContent: "space-between", marginTop: 20 }}>
          <button type="button" className="btn btn-soft" onClick={onClose}>
            Cancelar
          </button>
          <div className="toolbar" style={{ gap: 8 }}>
            {!form.id && (
              <button
                type="button"
                className="btn btn-soft"
                onClick={() => modalRef.current?.reportValidity() && onSave(true)}
              >
                Guardar y añadir otro
              </button>
            )}
            <button type="submit" className="btn btn-primary">
              Guardar
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
