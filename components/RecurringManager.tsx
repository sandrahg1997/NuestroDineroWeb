"use client";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Category, Frequency, RecurringTransaction, TransactionType } from "@/lib/types";
import { ArrowUpRight, LoaderCircle, Pencil, Plus, ReceiptText, Repeat2, Trash2, X } from "lucide-react";
import Money from "@/components/Money";
import { dateKey, monthlyEquivalent } from "@/lib/utils";
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
    setSaving(true);
    const s = createClient();
    const payload = {
      household_id: householdId,
      concept: form.concept,
      amount: Number(form.amount.replace(",", ".")),
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
    setRows(form.id ? rows.map((r) => (r.id === form.id ? data : r)) : [...rows, data]);
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
    else setRows(rows.map((x) => (x.id === r.id ? data : x)));
    setTogglingId(null);
  }
  async function remove(id: string) {
    if (!(await confirm("¿Eliminar este movimiento recurrente?", { confirmLabel: "Eliminar", danger: true }))) return;
    setDeletingId(id);
    const s = createClient();
    const { error } = await s.from("recurring_transactions").delete().eq("id", id);
    if (error) toast(error.message, "error");
    else setRows(rows.filter((x) => x.id !== id));
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
          <section
            className="dashboard-metrics"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 4 }}
          >
            <article className="dashboard-metric-card">
              <div className="metric-icon metric-icon-expense">
                <ReceiptText size={20} />
              </div>
              <div>
                <p className="metric-label">Gasto recurrente mensual</p>
                <p className="dashboard-metric-value">
                  <Money value={totals.monthlyExpense} />
                </p>
              </div>
            </article>
            <article className="dashboard-metric-card">
              <div className="metric-icon metric-icon-income">
                <ArrowUpRight size={20} />
              </div>
              <div>
                <p className="metric-label">Ingreso recurrente mensual</p>
                <p className="dashboard-metric-value">
                  <Money value={totals.monthlyIncome} />
                </p>
              </div>
            </article>
            <article className="dashboard-metric-card">
              <div className="metric-icon metric-icon-saving">
                <Repeat2 size={20} />
              </div>
              <div>
                <p className="metric-label">Recurrentes activos</p>
                <p className="dashboard-metric-value">{totals.activeCount}</p>
              </div>
            </article>
          </section>
          <p className="subtitle" style={{ margin: "10px 0 18px" }}>
            Solo cuenta lo <strong>activo</strong> (
            {totals.pausedCount > 0
              ? `${totals.pausedCount} pausado${totals.pausedCount === 1 ? "" : "s"}`
              : "nada pausado"}
            ). Los importes semanales y anuales se normalizan a su equivalente mensual para poder sumarlos.
          </p>
        </>
      )}

      <div className="toolbar" style={{ justifyContent: "flex-end", marginBottom: 14 }}>
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
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.concept}</strong>
                  <div className="subtitle">
                    {r.category?.icon} {r.category?.name}
                  </div>
                </td>
                <td>{r.frequency === "weekly" ? "Semanal" : r.frequency === "monthly" ? "Mensual" : "Anual"}</td>
                <td>{new Date(`${r.next_date}T12:00:00`).toLocaleDateString("es-ES")}</td>
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
