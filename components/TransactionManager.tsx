"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Category, Transaction, TransactionType } from "@/lib/types";
import { eur } from "@/lib/utils";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useSearchParams } from "next/navigation";

type Form = {
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

const blank = (type: TransactionType = "expense"): Form => ({
  concept: "",
  amount: "",
  date: new Date().toISOString().slice(0, 10),
  category_id: "",
  type,
  note: "",
  merchant: "",
  receipt_text: "",
});

export default function TransactionManager({ householdId, userId, initial, initialCategories }: { householdId: string; userId: string; initial: Transaction[]; initialCategories: Category[] }) {
  const [rows, setRows] = useState(initial);
  const [categories] = useState(initialCategories);
  const [form, setForm] = useState<Form | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | TransactionType>("all");
  const [category, setCategory] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState("date_desc");
  const [busy, setBusy] = useState(false);
  const params = useSearchParams();

  useEffect(() => {
    const n = params.get("new");
    if (n === "expense" || n === "income") setForm(blank(n));
  }, [params]);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => {
        const dateValue = typeof r.date === "string" ? r.date : "";
        const text = `${r.concept} ${r.merchant} ${r.note} ${r.category?.name ?? ""}`.toLowerCase();
        return (
          (!query || text.includes(query.toLowerCase())) &&
          (type === "all" || r.type === type) &&
          (!category || r.category_id === category) &&
          (!dateFrom || dateValue >= dateFrom) &&
          (!dateTo || dateValue <= dateTo)
        );
      })
      .sort((a, b) => {
        const aDate = typeof a.date === "string" ? a.date : "";
        const bDate = typeof b.date === "string" ? b.date : "";
        if (sort === "date_asc") return aDate.localeCompare(bDate);
        if (sort === "amount_desc") return b.amount - a.amount;
        if (sort === "amount_asc") return a.amount - b.amount;
        return bDate.localeCompare(aDate);
      });
  }, [rows, query, type, category, dateFrom, dateTo, sort]);

  const dateLabel = (value: string | null | undefined) => {
    if (!value) return "Sin fecha";
    const safe = value.length >= 10 ? value.slice(0, 10) : value;
    return new Date(`${safe}T12:00:00`).toLocaleDateString("es-ES");
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    const s = createClient();
    const payload = {
      household_id: householdId,
      user_id: userId,
      concept: form.concept.trim(),
      amount: Number(form.amount.replace(",", ".")),
      date: form.date,
      category_id: form.category_id || null,
      type: form.type,
      note: form.note.trim(),
      merchant: form.merchant.trim(),
      receipt_text: form.receipt_text,
    };

    let data: Transaction | null = null;
    let error: any;

    if (form.id) {
      ({ data, error } = await s.from("transactions").update(payload).eq("id", form.id).select("*,category:categories(*)").single());
    } else {
      ({ data, error } = await s.from("transactions").insert(payload).select("*,category:categories(*)").single());
    }

    if (!error && data) {
      if (form.merchant.trim() && form.category_id) {
        await s.from("merchant_category_rules").upsert(
          { household_id: householdId, merchant_pattern: form.merchant.trim().toLowerCase(), category_id: form.category_id },
          { onConflict: "household_id,merchant_pattern" }
        );
      }
      setRows(form.id ? rows.map((r) => (r.id === form.id ? data : r)) : [data, ...rows]);
      setForm(null);
    } else {
      alert(error?.message);
    }
    setBusy(false);
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este movimiento?")) return;
    const s = createClient();
    const { error } = await s.from("transactions").delete().eq("id", id);
    if (!error) setRows(rows.filter((r) => r.id !== id));
    else alert(error.message);
  }

  function edit(r: Transaction) {
    setForm({
      id: r.id,
      concept: r.concept,
      amount: String(r.amount),
      date: typeof r.date === "string" ? r.date.slice(0, 10) : "",
      category_id: r.category_id ?? "",
      type: r.type,
      note: r.note ?? "",
      merchant: r.merchant ?? "",
      receipt_text: r.receipt_text ?? "",
    });
  }

  return (
    <>
      <div className="toolbar transaction-toolbar" style={{ marginBottom: 16 }}>
        <div className="search-input" style={{ position: "relative", flex: "1 1 240px" }}>
          <Search size={17} style={{ position: "absolute", left: 12, top: 12, color: "#817a89" }} />
          <input className="input" style={{ paddingLeft: 38 }} placeholder="Buscar comercio, concepto, categoría…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="select" style={{ width: "100%" }} value={type} onChange={(e) => setType(e.target.value as any)}>
          <option value="all">Todos</option>
          <option value="expense">Gastos</option>
          <option value="income">Ingresos</option>
        </select>
        <select className="select" style={{ width: "100%" }} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <select className="select" style={{ width: "100%" }} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="date_desc">Más recientes</option>
          <option value="date_asc">Más antiguos</option>
          <option value="amount_desc">Mayor importe</option>
          <option value="amount_asc">Menor importe</option>
        </select>
        <button className="btn btn-primary" onClick={() => setForm(blank())}>
          <Plus size={17} />Añadir
        </button>
      </div>

      <div className="card table-wrap">
        {filtered.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Concepto</th>
                <th>Categoría</th>
                <th>Tipo</th>
                <th>Importe</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{dateLabel(r.date)}</td>
                  <td>
                    <strong>{r.concept}</strong>
                    {r.merchant && <div className="subtitle">{r.merchant}</div>}
                  </td>
                  <td>
                    <span className="pill">{r.category?.icon} {r.category?.name ?? "Sin categoría"}</span>
                  </td>
                  <td className={r.type === "expense" ? "expense" : "income"}>{r.type === "expense" ? "Gasto" : "Ingreso"}</td>
                  <td>{eur.format(r.amount)}</td>
                  <td>
                    <div className="chip-row" style={{ justifyContent: "flex-end" }}>
                      <button className="btn btn-ghost" onClick={() => edit(r)}><Pencil size={16} /></button>
                      <button className="btn btn-ghost expense" onClick={() => remove(r.id)}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">No hay movimientos que encajen con los filtros.</div>
        )}

        {filtered.length > 0 && (
          <div className="mobile-list">
            {filtered.map((r) => (
              <div className="mobile-row" key={r.id}>
                <div className="left">
                  <strong>{r.concept}</strong>
                  <span className="meta">
                    {dateLabel(r.date)} · {r.category?.icon} {r.category?.name ?? "Sin categoría"}
                  </span>
                  {r.merchant && <span className="meta">{r.merchant}</span>}
                </div>
                <div className="chip-row" style={{ alignItems: "center", gap: 10 }}>
                  <span className={`amount ${r.type === "expense" ? "expense" : "income"}`}>{eur.format(r.amount)}</span>
                  <button className="btn btn-ghost" onClick={() => edit(r)}><Pencil size={16} /></button>
                  <button className="btn btn-ghost expense" onClick={() => remove(r.id)}><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {form && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={save}>
            <div className="modal-head">
              <h2>{form.id ? "Editar movimiento" : "Nuevo movimiento"}</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}><X /></button>
            </div>
            <div className="chip-row" style={{ marginBottom: 14 }}>
              <button type="button" className={`chip ${form.type === "expense" ? "active" : ""}`} onClick={() => setForm({ ...form, type: "expense", category_id: "" })}>Gasto</button>
              <button type="button" className={`chip ${form.type === "income" ? "active" : ""}`} onClick={() => setForm({ ...form, type: "income", category_id: "" })}>Ingreso</button>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Concepto</label>
                <input className="input" value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} required />
              </div>
              <div className="field">
                <label>Importe</label>
                <input className="input" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
              </div>
              <div className="field">
                <label>Fecha</label>
                <input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </div>
              <div className="field">
                <label>Categoría</label>
                <select className="select" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">Sin categoría</option>
                  {categories.filter((c) => c.type === form.type).map((c) => <option value={c.id} key={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Comercio</label>
                <input className="input" value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} />
              </div>
              <div className="field">
                <label>Nota</label>
                <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
            <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 20 }}>
              <button type="button" className="btn btn-soft" onClick={() => setForm(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
