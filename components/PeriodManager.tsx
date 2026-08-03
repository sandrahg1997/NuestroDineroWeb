"use client";

import { createClient } from "@/lib/supabase/client";
import type { Period } from "@/lib/types";
import { defaultPeriodName, eur, formatDateEs } from "@/lib/utils";
import { CalendarRange, LoaderCircle, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type PeriodRow = Period & { expense: number; income: number };
type EditDraft = { name: string; start: string; end: string };

async function fetchSummary(householdId: string, start: string, end: string) {
  const s = createClient();
  const { data } = await s.from("transactions").select("type,amount").eq("household_id", householdId).gte("date", start).lte("date", end);
  const rows = data ?? [];
  const expense = rows.filter((r) => r.type === "expense").reduce((t, r) => t + Number(r.amount), 0);
  const income = rows.filter((r) => r.type === "income").reduce((t, r) => t + Number(r.amount), 0);
  return { expense, income };
}

export default function PeriodManager({ householdId, initial, activePeriodId }: { householdId: string; initial: PeriodRow[]; activePeriodId: string | null }) {
  const [rows, setRows] = useState(initial);
  const [activeId, setActiveId] = useState(activePeriodId);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft>({ name: "", start: "", end: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [settingActiveId, setSettingActiveId] = useState<string | null>(null);

  async function createPeriod(e: React.FormEvent) {
    e.preventDefault();
    if (!start || !end) return;
    setCreating(true);
    const s = createClient();
    const label = name.trim() || defaultPeriodName(start, end);
    const { data, error } = await s.from("periods").insert({ household_id: householdId, name: label, start_date: start, end_date: end }).select().single();
    if (error) {
      alert(error.message);
      setCreating(false);
      return;
    }
    const summary = await fetchSummary(householdId, start, end);
    setRows((prev) => [{ ...(data as Period), ...summary }, ...prev].sort((a, b) => b.start_date.localeCompare(a.start_date)));
    setName("");
    setStart("");
    setEnd("");
    setCreating(false);
  }

  function startEdit(p: PeriodRow) {
    setEditingId(p.id);
    setDraft({ name: p.name, start: p.start_date, end: p.end_date });
  }

  async function saveEdit(id: string) {
    setSavingEdit(true);
    const s = createClient();
    const { data, error } = await s.from("periods").update({ name: draft.name.trim() || defaultPeriodName(draft.start, draft.end), start_date: draft.start, end_date: draft.end }).eq("id", id).select().single();
    if (error) {
      alert(error.message);
      setSavingEdit(false);
      return;
    }
    const summary = await fetchSummary(householdId, draft.start, draft.end);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...(data as Period), ...summary } : r)).sort((a, b) => b.start_date.localeCompare(a.start_date)));
    setEditingId(null);
    setSavingEdit(false);
  }

  async function setActive(id: string) {
    setSettingActiveId(id);
    const s = createClient();
    const { error } = await s.from("households").update({ active_period_id: id }).eq("id", householdId);
    if (error) alert(error.message);
    else setActiveId(id);
    setSettingActiveId(null);
  }

  async function removePeriod(id: string) {
    if (!confirm("¿Eliminar este periodo? Los movimientos que caían dentro no se borran, solo dejan de verse agrupados en él.")) return;
    setDeletingId(id);
    const s = createClient();
    const { error } = await s.from("periods").delete().eq("id", id);
    if (error) {
      alert(error.message);
      setDeletingId(null);
      return;
    }
    const remaining = rows.filter((r) => r.id !== id);
    setRows(remaining);
    if (activeId === id) {
      const fallback = remaining[0]?.id ?? null;
      await s.from("households").update({ active_period_id: fallback }).eq("id", householdId);
      setActiveId(fallback);
    }
    setDeletingId(null);
  }

  return (
    <>
      <form className="card" onSubmit={createPeriod} style={{ marginBottom: 18 }}>
        <h2><CalendarRange size={20} /> Nuevo periodo</h2>
        <p className="subtitle">Da igual la duración: pueden ser meses naturales, de nómina a nómina, o lo que necesites. Se pueden solapar sin problema.</p>
        <div className="form-grid" style={{ marginTop: 14 }}>
          <div className="field">
            <label>Nombre (opcional)</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Se genera automáticamente" />
          </div>
          <div className="field">
            <label>Desde</label>
            <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
          </div>
          <div className="field">
            <label>Hasta</label>
            <input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </div>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 16 }} disabled={creating}>
          {creating ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}
          {creating ? "Creando…" : "Crear periodo"}
        </button>
      </form>

      <div className="grid">
        {rows.map((p) => {
          const isActive = p.id === activeId;
          const isEditing = editingId === p.id;
          const balance = p.income - p.expense;
          return (
            <div className="card" key={p.id}>
              {isEditing ? (
                <>
                  <div className="form-grid">
                    <div className="field">
                      <label>Nombre</label>
                      <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>Desde</label>
                      <input className="input" type="date" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>Hasta</label>
                      <input className="input" type="date" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
                    </div>
                  </div>
                  <div className="toolbar" style={{ marginTop: 14, justifyContent: "flex-start" }}>
                    <button type="button" className="btn btn-primary" onClick={() => saveEdit(p.id)} disabled={savingEdit}>{savingEdit ? "Guardando…" : "Guardar"}</button>
                    <button type="button" className="btn btn-ghost" onClick={() => setEditingId(null)}><X size={16} />Cancelar</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div className="chip-row" style={{ marginBottom: 4 }}>
                        <strong>{p.name}</strong>
                        {isActive && <span className="pill">Activo</span>}
                      </div>
                      <div className="subtitle">{formatDateEs(p.start_date)} – {formatDateEs(p.end_date)}</div>
                    </div>
                    <div className="chip-row">
                      <button type="button" className="btn btn-ghost" onClick={() => startEdit(p)}><Pencil size={16} /></button>
                      <button type="button" className="btn btn-ghost expense" onClick={() => removePeriod(p.id)} disabled={deletingId === p.id}>
                        {deletingId === p.id ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="toolbar" style={{ marginTop: 14, justifyContent: "space-between" }}>
                    <div className="subtitle">
                      <span className="income" style={{ fontWeight: 750 }}>{eur.format(p.income)}</span> ingresos ·{" "}
                      <span className="expense" style={{ fontWeight: 750 }}>{eur.format(p.expense)}</span> gastos ·{" "}
                      balance {eur.format(balance)}
                    </div>
                  </div>
                  <div className="toolbar" style={{ marginTop: 14, justifyContent: "flex-start" }}>
                    <Link href={`/periods/${p.id}`} className="btn btn-soft">Ver resumen</Link>
                    {!isActive && (
                      <button type="button" className="btn btn-ghost" onClick={() => setActive(p.id)} disabled={settingActiveId === p.id}>
                        {settingActiveId === p.id ? <LoaderCircle size={16} className="spin" /> : <Star size={16} />}
                        Marcar como activo
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
        {!rows.length && <div className="card empty">Todavía no has creado ningún periodo.</div>}
      </div>
    </>
  );
}
