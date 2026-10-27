"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Category, Frequency, RecurringTransaction, TransactionType } from "@/lib/types";
import { LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import Money from "@/components/Money";
import { dateKey, monthlyEquivalent } from "@/lib/utils";
import { daysUntil, dueLabel, frequencyLabel, parseAmount, sortRecurring } from "@/lib/recurring";
import { useToast } from "./Toast";
import MoneyInput from "./MoneyInput";

type F = {
  id?: string;
  concept: string;
  amount: string;
  category_id: string;
  type: TransactionType;
  note: string;
  frequency: Frequency;
  next_date: string;
  is_active: boolean;
};
const blank: F = {
  concept: "",
  amount: "",
  category_id: "",
  type: "expense",
  note: "",
  frequency: "monthly",
  next_date: dateKey(),
  is_active: true,
};
const nextDateLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-ES");
// Cobros en los próximos 7 días: se resaltan.
const isDueSoon = (r: RecurringTransaction, today: string) => r.is_active && daysUntil(r.next_date, today) <= 7;
export default function RecurringManager({
  householdId,
  initial,
  categories,
}: {
  householdId: string;
  initial: RecurringTransaction[];
  categories: Category[];
}) {
  const { toast, confirm } = useToast();
  const [rows, setRows] = useState(initial);
  const [form, setForm] = useState<F | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  const today = dateKey();
  const sorted = useMemo(() => sortRecurring(rows), [rows]);
  const groups = [
    { label: "Activos", items: sorted.filter((r) => r.is_active) },
    { label: "Pausados", items: sorted.filter((r) => !r.is_active) },
  ].filter((g) => g.items.length);

  // El botón + del móvil abre el formulario con ?new=1; se quita el parámetro
  // para que volver a pulsarlo lo abra de nuevo.
  useEffect(() => {
    if (params.get("new") !== "1") return;
    setForm({ ...blank, next_date: dateKey() });
    router.replace("/recurring", { scroll: false });
  }, [params, router]);

  const totals = useMemo(() => {
    const active = rows.filter((r) => r.is_active);
    const monthlyOf = (list: RecurringTransaction[]) =>
      list.reduce((sum, r) => sum + monthlyEquivalent(Number(r.amount), r.frequency), 0);
    return {
      monthlyExpense: monthlyOf(active.filter((r) => r.type === "expense")),
      monthlyIncome: monthlyOf(active.filter((r) => r.type === "income")),
      activeCount: active.length,
      pausedCount: rows.length - active.length,
    };
  }, [rows]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const amount = parseAmount(form.amount);
    if (!(amount > 0)) {
      toast("Escribe un importe válido mayor que 0.", "error");
      return;
    }
    setSaving(true);
    const s = createClient();
    const payload = {
      household_id: householdId,
      concept: form.concept,
      amount,
      category_id: form.category_id || null,
      type: form.type,
      note: form.note,
      frequency: form.frequency,
      next_date: form.next_date,
      is_active: form.is_active,
    };
    const q = form.id
      ? s.from("recurring_transactions").update(payload).eq("id", form.id)
      : s.from("recurring_transactions").insert(payload);
    const { data, error } = await q.select("*,category:categories(*)").single();
    if (error) {
      toast(error.message, "error");
      setSaving(false);
      return;
    }
    const id = form.id;
    setRows((prev) => (id ? prev.map((r) => (r.id === id ? data : r)) : [...prev, data]));
    setForm(null);
    setSaving(false);
  }
  async function toggle(r: RecurringTransaction) {
    setTogglingId(r.id);
    const s = createClient();
    const { data, error } = await s
      .from("recurring_transactions")
      .update({ is_active: !r.is_active })
      .eq("id", r.id)
      .select("*,category:categories(*)")
      .single();
    if (error) toast(error.message, "error");
    else setRows((prev) => prev.map((x) => (x.id === r.id ? data : x)));
    setTogglingId(null);
  }
  async function remove(id: string) {
    if (!(await confirm("¿Eliminar este movimiento recurrente?", { confirmLabel: "Eliminar", danger: true }))) return;
    setDeletingId(id);
    const s = createClient();
    const { error } = await s.from("recurring_transactions").delete().eq("id", id);
    if (error) toast(error.message, "error");
    else setRows((prev) => prev.filter((x) => x.id !== id));
    setDeletingId(null);
  }
  function edit(r: RecurringTransaction) {
    setForm({
      id: r.id,
      concept: r.concept,
      amount: String(r.amount),
      category_id: r.category_id ?? "",
      type: r.type,
      note: r.note,
      frequency: r.frequency,
      next_date: r.next_date,
      is_active: r.is_active,
    });
  }
  return (
    <>
      {rows.length > 0 && (
        <>
          <section className="card recurring-summary">
            <div>
              <p className="metric-label">Gasto / mes</p>
              <p className="recurring-summary-value expense">
                <Money value={totals.monthlyExpense} />
              </p>
            </div>
            <div>
              <p className="metric-label">Ingreso / mes</p>
              <p className="recurring-summary-value income">
                <Money value={totals.monthlyIncome} />
              </p>
            </div>
            <div>
              <p className="metric-label">Activos</p>
              <p className="recurring-summary-value">{totals.activeCount}</p>
            </div>
          </section>
          <p className="subtitle recurring-note">
            Solo cuenta lo <strong>activo</strong> (
            {totals.pausedCount > 0
              ? `${totals.pausedCount} pausado${totals.pausedCount === 1 ? "" : "s"}`
              : "nada pausado"}
            ). Los importes semanales y anuales se normalizan a su equivalente mensual para poder sumarlos.
          </p>
        </>
      )}

      <div className="toolbar desktop-only" style={{ justifyContent: "flex-end", marginBottom: 14 }}>
        <button className="btn btn-primary" onClick={() => setForm({ ...blank })}>
          <Plus size={16} />
          Nuevo recurrente
        </button>
      </div>
      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Concepto</th>
              <th>Frecuencia</th>
              <th>Próxima fecha</th>
              <th>Importe</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className={r.is_active ? "" : "recurring-paused"}>
                <td>
                  <strong>{r.concept}</strong>
                  <div className="subtitle">
                    {r.category?.icon} {r.category?.name}
                  </div>
                </td>
                <td>{frequencyLabel(r.frequency)}</td>
                <td>
                  {nextDateLabel(r.next_date)}
                  {r.is_active && (
                    <div className={`subtitle${isDueSoon(r, today) ? " due-soon" : ""}`}>
                      {dueLabel(r.next_date, today)}
                    </div>
                  )}
                </td>
                <td className={r.type === "expense" ? "expense" : "income"}>
                  <strong>
                    <Money value={r.amount} />
                  </strong>
                </td>
                <td>
                  <button
                    className={`btn ${r.is_active ? "btn-soft" : "btn-ghost"}`}
                    onClick={() => toggle(r)}
                    disabled={togglingId === r.id}
                  >
                    {togglingId === r.id ? (
                      <LoaderCircle size={14} className="spin" />
                    ) : r.is_active ? (
                      "Activo"
                    ) : (
                      "Pausado"
                    )}
                  </button>
                </td>
                <td>
                  <div className="toolbar">
                    <button className="btn btn-ghost" onClick={() => edit(r)} disabled={deletingId === r.id}>
                      <Pencil size={16} />
                    </button>
                    <button
                      className="btn btn-ghost expense"
                      onClick={() => remove(r.id)}
                      disabled={deletingId === r.id}
                    >
                      {deletingId === r.id ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 0 && (
          <div className="mobile-list">
            {groups.map((g) => (
              <div className="mobile-group" key={g.label}>
                {groups.length > 1 && <div className="mobile-group-label">{g.label}</div>}
                {g.items.map((r) => (
                  <div className={`mobile-row recurring-row${r.is_active ? "" : " paused"}`} key={r.id}>
                    <div className={`recent-icon ${r.type === "expense" ? "expense" : "income"}`}>
                      {r.category?.icon || (r.type === "expense" ? "↓" : "↑")}
                    </div>
                    <div className="left">
                      <strong>{r.concept}</strong>
                      <span className="meta">
                        {r.is_active && (
                          <>
                            <span className={isDueSoon(r, today) ? "due-soon" : ""}>
                              {dueLabel(r.next_date, today)}
                            </span>
                            {" · "}
                          </>
                        )}
                        {frequencyLabel(r.frequency)}
                        {r.category?.name ? ` · ${r.category.name}` : ""}
                      </span>
                    </div>
                    <div className="right">
                      <div className="recurring-right">
                        <span className={`amount ${r.type === "expense" ? "expense" : "income"}`}>
                          <Money value={r.amount} />
                        </span>
                        <button
                          type="button"
                          className={`btn recurring-status ${r.is_active ? "btn-soft" : "btn-ghost"}`}
                          onClick={() => toggle(r)}
                          disabled={togglingId === r.id}
                        >
                          {togglingId === r.id ? (
                            <LoaderCircle size={12} className="spin" />
                          ) : r.is_active ? (
                            "Activo"
                          ) : (
                            "Pausado"
                          )}
                        </button>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        aria-label={`Editar ${r.concept}`}
                        onClick={() => edit(r)}
                        disabled={deletingId === r.id}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost expense"
                        aria-label={`Eliminar ${r.concept}`}
                        onClick={() => remove(r.id)}
                        disabled={deletingId === r.id}
                      >
                        {deletingId === r.id ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {!rows.length && (
          <div className="empty">
            <span className="empty-icon">
              <Plus size={22} />
            </span>
            <strong>Sin movimientos recurrentes</strong>
            <p>Añade hipoteca, nómina, suscripciones… y se registrarán solos cuando llegue su fecha.</p>
            <button className="btn btn-primary" onClick={() => setForm({ ...blank })}>
              <Plus size={16} />
              Nuevo recurrente
            </button>
          </div>
        )}
      </div>
      {form && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={save}>
            <div className="modal-head">
              <h2>{form.id ? "Editar recurrente" : "Nuevo recurrente"}</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>
                <X />
              </button>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Concepto</label>
                <input
                  className="input"
                  value={form.concept}
                  onChange={(e) => setForm({ ...form, concept: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Importe</label>
                <MoneyInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} required />
              </div>
              <div className="field">
                <label>Tipo</label>
                <select
                  className="select"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as TransactionType, category_id: "" })}
                >
                  <option value="expense">Gasto</option>
                  <option value="income">Ingreso</option>
                </select>
              </div>
              <div className="field">
                <label>Categoría</label>
                <select
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
              <div className="field">
                <label>Frecuencia</label>
                <select
                  className="select"
                  value={form.frequency}
                  onChange={(e) => setForm({ ...form, frequency: e.target.value as Frequency })}
                >
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensual</option>
                  <option value="yearly">Anual</option>
                </select>
              </div>
              <div className="field">
                <label>Próxima fecha</label>
                <input
                  className="input"
                  type="date"
                  value={form.next_date}
                  onChange={(e) => setForm({ ...form, next_date: e.target.value })}
                />
              </div>
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label>Nota</label>
              <textarea
                className="textarea"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>
            <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 20 }}>
              <button type="button" className="btn btn-soft" onClick={() => setForm(null)}>
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
