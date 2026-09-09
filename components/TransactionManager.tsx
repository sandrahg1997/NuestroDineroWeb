"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Category, Transaction, TransactionType } from "@/lib/types";
import Money from "@/components/Money";
import { dateKey } from "@/lib/utils";
import { merchantSuggestions } from "@/lib/receipt";
import { Inbox, LoaderCircle, MoreVertical, Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useToast } from "./Toast";
import MoneyInput from "./MoneyInput";

type MerchantRule = { merchant_pattern: string; category_id: string };

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

const PAGE_SIZE = 50;

const blank = (type: TransactionType = "expense"): Form => ({
  concept: "",
  amount: "",
  date: dateKey(),
  category_id: "",
  type,
  note: "",
  merchant: "",
  receipt_text: "",
});

export default function TransactionManager({ householdId, userId, initial, initialCategories, rules = [] }: { householdId: string; userId: string; initial: Transaction[]; initialCategories: Category[]; rules?: MerchantRule[] }) {
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuOpenUp, setMenuOpenUp] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const params = useSearchParams();
  const { toast, confirm } = useToast();
  const modalRef = useRef<HTMLFormElement>(null);
  const conceptRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const n = params.get("new");
    if (n === "expense" || n === "income") setForm(blank(n));
  }, [params]);

  useEffect(() => {
    const t = params.get("type");
    const c = params.get("category");
    const from = params.get("from");
    const to = params.get("to");
    if (t === "expense" || t === "income") setType(t);
    if (c) setCategory(c);
    if (from) setDateFrom(from);
    if (to) setDateTo(to);
    if (t || c || from || to) setFiltersOpen(true);
  }, [params]);

  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuFor]);

  // Cerrar el modal con Escape.
  useEffect(() => {
    if (!form) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setForm(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [form]);

  // Volver a la primera página cuando cambian los filtros u ordenación.
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [query, type, category, dateFrom, dateTo, sort]);

  const activeFilterCount = [type !== "all", !!category, !!dateFrom, !!dateTo].filter(Boolean).length;

  function clearFilters() {
    setType("all");
    setCategory("");
    setDateFrom("");
    setDateTo("");
  }

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

  const shown = useMemo(() => filtered.slice(0, visible), [filtered, visible]);
  const hasMore = filtered.length > visible;

  const isFiltering = !!query || activeFilterCount > 0;
  const filteredExpense = useMemo(() => filtered.filter((r) => r.type === "expense").reduce((total, r) => total + Number(r.amount), 0), [filtered]);
  const filteredIncome = useMemo(() => filtered.filter((r) => r.type === "income").reduce((total, r) => total + Number(r.amount), 0), [filtered]);

  // Categorías más usadas, para acceso rápido al crear un movimiento.
  const frequentCategories = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of rows) if (r.category_id) count.set(r.category_id, (count.get(r.category_id) ?? 0) + 1);
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => categories.find((c) => c.id === id))
      .filter((c): c is Category => Boolean(c));
  }, [rows, categories]);

  const dateLabel = (value: string | null | undefined) => {
    if (!value) return "Sin fecha";
    const safe = value.length >= 10 ? value.slice(0, 10) : value;
    return new Date(`${safe}T12:00:00`).toLocaleDateString("es-ES");
  };

  const dayLabel = (value: string | null | undefined) => {
    if (!value) return "Sin fecha";
    const safe = value.length >= 10 ? value.slice(0, 10) : value;
    const d = new Date(`${safe}T12:00:00`);
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Hoy";
    if (d.toDateString() === yesterday.toDateString()) return "Ayer";
    return d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  };

  const isDateSort = sort === "date_desc" || sort === "date_asc";

  const mobileGroups = useMemo(() => {
    if (!isDateSort) return [{ label: null as string | null, items: shown }];
    const groups: { label: string; items: Transaction[] }[] = [];
    for (const r of shown) {
      const label = dayLabel(r.date);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(r);
      else groups.push({ label, items: [r] });
    }
    return groups;
  }, [shown, isDateSort]);

  // Sugerir categoría a partir del comercio: primero las reglas aprendidas,
  // luego el diccionario de comercios habituales.
  function suggestCategory(merchant: string, t: TransactionType): string {
    const m = merchant.trim().toLowerCase();
    if (!m || t !== "expense") return "";
    const rule = rules.find((r) => r.merchant_pattern && m.includes(r.merchant_pattern));
    if (rule && categories.some((c) => c.id === rule.category_id && c.type === "expense")) return rule.category_id;
    const key = Object.keys(merchantSuggestions).find((k) => m.includes(k));
    if (key) {
      const match = categories.find((c) => c.type === "expense" && c.name.toLowerCase() === merchantSuggestions[key].toLowerCase());
      if (match) return match.id;
    }
    return "";
  }

  function trapTab(e: React.KeyboardEvent) {
    if (e.key !== "Tab" || !modalRef.current) return;
    const els = modalRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
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

  async function save(e: React.FormEvent | null, again = false) {
    e?.preventDefault();
    if (!form) return;

    const amount = Number(form.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast("Introduce un importe válido mayor que cero.", "error");
      return;
    }

    setBusy(true);
    const s = createClient();
    const payload = {
      household_id: householdId,
      user_id: userId,
      concept: form.concept.trim(),
      amount,
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
      if (again && !form.id) {
        const nextType = form.type;
        const keepDate = form.date;
        setForm({ ...blank(nextType), date: keepDate });
        toast("Movimiento guardado", "success");
        setTimeout(() => conceptRef.current?.focus(), 0);
      } else {
        setForm(null);
      }
    } else {
      toast(error?.message ?? "No se pudo guardar el movimiento.", "error");
    }
    setBusy(false);
  }

  async function remove(id: string) {
    if (!(await confirm("¿Eliminar este movimiento?", { confirmLabel: "Eliminar", danger: true }))) return;
    setDeletingId(id);
    const s = createClient();
    const { error } = await s.from("transactions").delete().eq("id", id);
    if (!error) setRows(rows.filter((r) => r.id !== id));
    else toast(error.message, "error");
    setDeletingId(null);
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

  const quickCats = form ? frequentCategories.filter((c) => c.type === form.type).slice(0, 5) : [];

  return (
    <>
      <div className="toolbar transaction-toolbar-top" style={{ marginBottom: 12 }}>
        <div className="search-input" style={{ position: "relative" }}>
          <Search size={17} style={{ position: "absolute", left: 12, top: 12, color: "var(--muted)" }} />
          <input className="input" style={{ paddingLeft: 38 }} placeholder="Buscar comercio, concepto, categoría…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button type="button" className="btn btn-soft filters-toggle" onClick={() => setFiltersOpen((o) => !o)}>
          <SlidersHorizontal size={16} />Filtros{activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}
        </button>
        <button className="btn btn-primary" onClick={() => setForm(blank())}>
          <Plus size={17} />Añadir
        </button>
      </div>

      <div className={`transaction-toolbar ${filtersOpen ? "open" : ""}`} style={{ marginBottom: 16 }}>
        <select className="select" style={{ width: "100%" }} value={type} onChange={(e) => setType(e.target.value as any)}>
          <option value="all">Todos</option>
          <option value="expense">Gastos</option>
          <option value="income">Ingresos</option>
        </select>
        <select className="select" style={{ width: "100%" }} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="field">
          <label>Desde</label>
          <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="field">
          <label>Hasta</label>
          <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <select className="select" style={{ width: "100%" }} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="date_desc">Más recientes</option>
          <option value="date_asc">Más antiguos</option>
          <option value="amount_desc">Mayor importe</option>
          <option value="amount_asc">Menor importe</option>
        </select>
        {activeFilterCount > 0 && (
          <button type="button" className="btn btn-ghost" onClick={clearFilters}>Limpiar filtros</button>
        )}
      </div>

      {isFiltering && (
        <div className="filter-summary">
          <span>{filtered.length} movimiento{filtered.length === 1 ? "" : "s"}</span>
          {filteredExpense > 0 && <span className="expense">Gastado <Money value={filteredExpense} /></span>}
          {filteredIncome > 0 && <span className="income">Ingresado <Money value={filteredIncome} /></span>}
        </div>
      )}

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
              {shown.map((r) => (
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
                  <td><Money value={r.amount} /></td>
                  <td>
                    <div className="chip-row" style={{ justifyContent: "flex-end" }}>
                      <button className="btn btn-ghost" aria-label={`Editar ${r.concept}`} onClick={() => edit(r)} disabled={deletingId === r.id}><Pencil size={16} /></button>
                      <button className="btn btn-ghost expense" aria-label={`Eliminar ${r.concept}`} onClick={() => remove(r.id)} disabled={deletingId === r.id}>
                        {deletingId === r.id ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>{filtered.length} movimiento{filtered.length === 1 ? "" : "s"}{hasMore ? ` · mostrando ${shown.length}` : ""}</td>
                <td colSpan={3} style={{ textAlign: "right" }}>
                  {filteredExpense > 0 && <span className="expense">−<Money value={filteredExpense} /></span>}
                  {filteredIncome > 0 && <span className="income" style={{ marginLeft: 12 }}>+<Money value={filteredIncome} /></span>}
                </td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <div className="empty">
            <span className="empty-icon"><Inbox size={22} /></span>
            {isFiltering ? (
              <>
                <strong>Sin resultados</strong>
                <p>Ningún movimiento coincide con los filtros aplicados.</p>
                <button type="button" className="btn btn-soft" onClick={clearFilters}>Limpiar filtros</button>
              </>
            ) : (
              <>
                <strong>Aún no hay movimientos</strong>
                <p>Añade tu primer gasto o ingreso para empezar a ver tus finanzas.</p>
                <button type="button" className="btn btn-primary" onClick={() => setForm(blank())}><Plus size={16} />Añadir movimiento</button>
              </>
            )}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="mobile-list">
            {mobileGroups.map((g, gi) => (
              <div className="mobile-group" key={g.label ?? gi}>
                {g.label && <div className="mobile-group-label">{g.label}</div>}
                {g.items.map((r) => (
                  <div className="mobile-row" key={r.id}>
                    <div className={`recent-icon ${r.type === "expense" ? "expense" : "income"}`}>
                      {r.category?.icon || (r.type === "expense" ? "↓" : "↑")}
                    </div>
                    <div className="left">
                      <strong>{r.concept}</strong>
                      <span className="meta">
                        {!g.label ? `${dateLabel(r.date)} · ` : ""}
                        {r.category?.name ?? "Sin categoría"}
                        {r.merchant ? ` · ${r.merchant}` : ""}
                      </span>
                    </div>
                    <div className="right">
                      <span className={`amount ${r.type === "expense" ? "expense" : "income"}`}>
                        {r.type === "expense" ? "-" : "+"}<Money value={Math.abs(r.amount)} />
                      </span>
                      <div className="row-menu" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          aria-label={`Más opciones de ${r.concept}`}
                          onClick={(e) => {
                            if (menuFor === r.id) {
                              setMenuFor(null);
                              return;
                            }
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMenuOpenUp(window.innerHeight - rect.bottom < 180);
                            setMenuFor(r.id);
                          }}
                        >
                          <MoreVertical size={18} />
                        </button>
                        {menuFor === r.id && (
                          <div className={`row-menu-popup ${menuOpenUp ? "open-up" : ""}`}>
                            <button type="button" onClick={() => { edit(r); setMenuFor(null); }} disabled={deletingId === r.id}><Pencil size={15} />Editar</button>
                            <button type="button" className="expense" onClick={() => remove(r.id)} disabled={deletingId === r.id}>
                              {deletingId === r.id ? <LoaderCircle size={15} className="spin" /> : <Trash2 size={15} />}
                              {deletingId === r.id ? "Eliminando…" : "Eliminar"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {hasMore && (
          <div style={{ textAlign: "center", padding: "16px 0 6px" }}>
            <button type="button" className="btn btn-soft" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
              Ver más · {filtered.length - visible} restantes
            </button>
          </div>
        )}
      </div>

      {form && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setForm(null); }}>
          <form
            className="modal"
            ref={modalRef}
            onSubmit={(e) => save(e)}
            onKeyDown={trapTab}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tm-modal-title"
          >
            <div className="modal-head">
              <h2 id="tm-modal-title">{form.id ? "Editar movimiento" : "Nuevo movimiento"}</h2>
              <button type="button" className="btn btn-ghost" aria-label="Cerrar" onClick={() => setForm(null)}><X /></button>
            </div>
            <div className="chip-row" style={{ marginBottom: 14 }}>
              <button type="button" className={`chip ${form.type === "expense" ? "active" : ""}`} onClick={() => setForm({ ...form, type: "expense", category_id: "" })}>Gasto</button>
              <button type="button" className={`chip ${form.type === "income" ? "active" : ""}`} onClick={() => setForm({ ...form, type: "income", category_id: "" })}>Ingreso</button>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Concepto</label>
                <input className="input" ref={conceptRef} autoFocus value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} required />
              </div>
              <div className="field">
                <label>Importe</label>
                <MoneyInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} required />
              </div>
              <div className="field">
                <label>Fecha</label>
                <input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </div>
              <div className="field">
                <label>Comercio</label>
                <input
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
                <label>Categoría</label>
                {quickCats.length > 0 && (
                  <div className="chip-row" style={{ marginBottom: 8 }}>
                    {quickCats.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        className={`chip ${form.category_id === c.id ? "active" : ""}`}
                        onClick={() => setForm({ ...form, category_id: form.category_id === c.id ? "" : c.id })}
                      >
                        {c.icon} {c.name}
                      </button>
                    ))}
                  </div>
                )}
                <select className="select" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">Sin categoría</option>
                  {categories.filter((c) => c.type === form.type).map((c) => <option value={c.id} key={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Nota</label>
                <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
            <div className="toolbar" style={{ justifyContent: "space-between", marginTop: 20 }}>
              <button type="button" className="btn btn-soft" onClick={() => setForm(null)}>Cancelar</button>
              <div className="toolbar" style={{ gap: 8 }}>
                {!form.id && (
                  <button type="button" className="btn btn-soft" disabled={busy} onClick={() => save(null, true)}>
                    Guardar y añadir otro
                  </button>
                )}
                <button className="btn btn-primary" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
