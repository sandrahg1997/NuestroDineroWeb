"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, LoaderCircle, Minus, Pencil, Plus, Target, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ExportButton from "./ExportButton";
import { goalSheets } from "@/lib/export-sheets";
import { daysLeftLabel, goalProgress, totalSaved, type Contribution, type Goal } from "@/lib/goals";
import { dateKey } from "@/lib/utils";
import Money from "./Money";
import MoneyInput from "./MoneyInput";
import { trapFocus, useToast } from "./Toast";

const ICONS = ["🎯", "✈️", "🏠", "🚗", "💍", "👶", "🎓", "🛟", "🎁", "💻", "🏖️", "🛠️"];

type GoalForm = { id?: string; title: string; icon: string; target: string; hasDate: boolean; date: string };
type ContribForm = { goal: Goal; mode: "add" | "remove"; amount: string; date: string; note: string };

const toNumber = (v: string) => Number(v.replace(",", "."));
const fmtDate = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("es-ES");

export default function GoalManager({
  householdId,
  userId,
  today,
  unavailable,
  initialGoals,
  initialContributions,
}: {
  householdId: string;
  userId: string;
  today: string;
  unavailable: boolean;
  initialGoals: Goal[];
  initialContributions: Contribution[];
}) {
  const { toast, confirm } = useToast();
  const router = useRouter();
  const [goals, setGoals] = useState(initialGoals);
  const [contributions, setContributions] = useState(initialContributions);
  const [goalForm, setGoalForm] = useState<GoalForm | null>(null);
  const [contribForm, setContribForm] = useState<ContribForm | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const params = useSearchParams();
  const goalRef = useRef<HTMLFormElement>(null);
  const contribRef = useRef<HTMLFormElement>(null);
  // Datos nuevos del servidor (tiempo real o tirar para recargar): sustituyen a los locales.
  useEffect(() => setGoals(initialGoals), [initialGoals]);
  useEffect(() => setContributions(initialContributions), [initialContributions]);

  // Un enlace con ?contribute=<id> (desde la Reunión del mes) abre la aportación de ese objetivo.
  const requested = params.get("contribute");
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!requested || handled.current === requested) return;
    const goal = initialGoals.find((g) => g.id === requested);
    if (!goal) return;
    handled.current = requested;
    setContribForm({ goal, mode: "add", amount: "", date: dateKey(), note: "" });
  }, [requested, initialGoals]);

  const open = goalForm !== null || contribForm !== null;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setGoalForm(null);
      setContribForm(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const byGoal = useMemo(() => {
    const map = new Map<string, Contribution[]>();
    for (const c of contributions) map.set(c.goal_id, [...(map.get(c.goal_id) ?? []), c]);
    return map;
  }, [contributions]);

  if (unavailable)
    return (
      <div className="card">
        <h2>Aún no está activado</h2>
        <p className="subtitle">
          Falta aplicar la migración <code>2026-11-26-savings-goals.sql</code> en Supabase (SQL Editor). Después recarga
          esta página.
        </p>
      </div>
    );

  async function saveGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!goalForm) return;
    const target = toNumber(goalForm.target);
    if (!goalForm.title.trim()) return toast("Ponle un nombre al objetivo.", "error");
    if (!Number.isFinite(target) || target <= 0) return toast("La cantidad a ahorrar debe ser mayor que 0.", "error");
    if (goalForm.hasDate && !goalForm.date) return toast("Elige la fecha o quita «Fecha límite».", "error");
    setSaving(true);
    const s = createClient();
    const values = {
      title: goalForm.title.trim(),
      icon: goalForm.icon,
      target_amount: target,
      target_date: goalForm.hasDate ? goalForm.date : null,
    };
    const { error } = goalForm.id
      ? await s.from("savings_goals").update(values).eq("id", goalForm.id)
      : await s.from("savings_goals").insert({ ...values, household_id: householdId, created_by: userId });
    setSaving(false);
    if (error) return toast(error.message, "error");
    setGoalForm(null);
    toast(goalForm.id ? "Objetivo actualizado" : "Objetivo creado", "success");
    router.refresh();
  }

  async function deleteGoal(goal: Goal) {
    const n = byGoal.get(goal.id)?.length ?? 0;
    const ok = await confirm(
      `¿Eliminar «${goal.title}»?${n ? ` Se borrarán también sus ${n} ${n === 1 ? "aportación" : "aportaciones"}.` : ""}`,
      { confirmLabel: "Eliminar", danger: true }
    );
    if (!ok) return;
    const { error } = await createClient().from("savings_goals").delete().eq("id", goal.id);
    if (error) return toast(error.message, "error");
    setGoals((g) => g.filter((x) => x.id !== goal.id));
    router.refresh();
  }

  async function saveContribution(e: React.FormEvent) {
    e.preventDefault();
    if (!contribForm) return;
    const amount = toNumber(contribForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) return toast("Escribe una cantidad mayor que 0.", "error");
    const signed = contribForm.mode === "add" ? amount : -amount;
    const saved = totalSaved(byGoal.get(contribForm.goal.id) ?? []);
    if (signed < 0 && -signed > saved)
      return toast("No puedes retirar más de lo que hay apartado en este objetivo.", "error");
    setSaving(true);
    const { error } = await createClient().from("savings_contributions").insert({
      goal_id: contribForm.goal.id,
      household_id: householdId,
      user_id: userId,
      amount: signed,
      date: contribForm.date,
      note: contribForm.note.trim(),
    });
    setSaving(false);
    if (error) return toast(error.message, "error");
    const goal = contribForm.goal;
    setContribForm(null);
    setOpenId(goal.id);
    toast(signed > 0 ? "Aportación guardada" : "Retirada guardada", "success");
    router.refresh();
  }

  async function deleteContribution(c: Contribution) {
    const { error } = await createClient().from("savings_contributions").delete().eq("id", c.id);
    if (error) return toast(error.message, "error");
    setContributions((list) => list.filter((x) => x.id !== c.id));
    router.refresh();
  }

  const newGoal = () => setGoalForm({ title: "", icon: ICONS[0], target: "", hasDate: false, date: "" });
  const editGoal = (g: Goal) =>
    setGoalForm({
      id: g.id,
      title: g.title,
      icon: g.icon,
      target: Number(g.target_amount).toFixed(2).replace(".", ","),
      hasDate: Boolean(g.target_date),
      date: g.target_date ?? "",
    });
  const contribute = (goal: Goal, mode: "add" | "remove") =>
    setContribForm({ goal, mode, amount: "", date: dateKey(), note: "" });

  const total = totalSaved(contributions.filter((c) => goals.some((g) => g.id === c.goal_id)));

  return (
    <>
      <div className="section-head">
        <div>
          <span className="eyebrow">Total apartado</span>
          <p className="dashboard-metric-value" style={{ margin: "2px 0 0" }}>
            <Money value={total} />
          </p>
        </div>
        <div className="toolbar" style={{ gap: 8 }}>
          {goals.length > 0 && (
            <ExportButton
              getSheets={() =>
                goalSheets(
                  goals.map((goal) => ({ goal, progress: goalProgress(goal, byGoal.get(goal.id) ?? [], today) })),
                  contributions
                )
              }
              fileName={`ourmoney-objetivos-${today}.xlsx`}
            />
          )}
          <button type="button" className="btn btn-primary" onClick={newGoal}>
            <Plus size={17} /> Nuevo objetivo
          </button>
        </div>
      </div>

      {!goals.length ? (
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <Target size={36} />
          <h2>Todavía no tenéis objetivos</h2>
          <p className="subtitle">
            Crea el primero (un viaje, un colchón para imprevistos…) y ve apuntando lo que apartáis cada mes.
          </p>
        </div>
      ) : (
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", alignItems: "start" }}
        >
          {goals.map((goal) => {
            const list = byGoal.get(goal.id) ?? [];
            const p = goalProgress(goal, list, today);
            const expanded = openId === goal.id;
            return (
              <article className="card goal-card" key={goal.id}>
                <div className="goal-head">
                  <span className="goal-icon" aria-hidden="true">
                    {goal.icon}
                  </span>
                  <div className="recent-main">
                    <strong>{goal.title}</strong>
                    <span>
                      {goal.target_date
                        ? `Hasta el ${fmtDate(goal.target_date)} · ${daysLeftLabel(p.daysLeft)}`
                        : "Sin fecha límite"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    aria-label={`Editar ${goal.title}`}
                    onClick={() => editGoal(goal)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    aria-label={`Eliminar ${goal.title}`}
                    onClick={() => deleteGoal(goal)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="goal-amounts">
                  <strong className={p.done ? "income" : undefined}>
                    <Money value={p.saved} />
                  </strong>
                  <span className="subtitle">
                    de <Money value={Number(goal.target_amount)} /> · {p.pct}%
                  </span>
                </div>
                <div
                  className="progress"
                  role="progressbar"
                  aria-label={`Progreso de ${goal.title}`}
                  aria-valuenow={p.pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${p.pct}%` }} />
                </div>

                <p className={`goal-hint ${p.status}`}>
                  {p.status === "done" && "🎉 ¡Objetivo cumplido!"}
                  {p.status === "no-date" && (
                    <>
                      Faltan <Money value={p.remaining} />.
                    </>
                  )}
                  {p.status === "late" && (
                    <>
                      La fecha ya pasó y faltan <Money value={p.remaining} />. Podéis moverla al editar el objetivo.
                    </>
                  )}
                  {(p.status === "on-track" || p.status === "behind") && p.monthlyNeeded != null && (
                    <>
                      {p.status === "on-track" ? "Vais a buen ritmo. " : "Vais algo por detrás. "}
                      Para llegar a tiempo, apartad <Money value={p.monthlyNeeded} /> al mes.
                    </>
                  )}
                </p>

                <div className="toolbar" style={{ justifyContent: "flex-start", marginTop: 12 }}>
                  <button type="button" className="btn btn-primary" onClick={() => contribute(goal, "add")}>
                    <Plus size={16} /> Aportar
                  </button>
                  <button
                    type="button"
                    className="btn btn-soft"
                    onClick={() => contribute(goal, "remove")}
                    disabled={p.saved <= 0}
                  >
                    <Minus size={16} /> Retirar
                  </button>
                  {list.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-expanded={expanded}
                      onClick={() => setOpenId(expanded ? null : goal.id)}
                    >
                      Historial ({list.length}){" "}
                      <ChevronDown size={15} className={expanded ? "goal-chevron open" : "goal-chevron"} />
                    </button>
                  )}
                </div>

                {expanded && (
                  <ul className="goal-history">
                    {list.map((c) => (
                      <li key={c.id}>
                        <span>
                          <strong className={Number(c.amount) > 0 ? "income" : "expense"}>
                            {Number(c.amount) > 0 ? "+" : "−"}
                            <Money value={Math.abs(Number(c.amount))} />
                          </strong>
                          <span className="subtitle" style={{ display: "block", fontSize: 12 }}>
                            {fmtDate(c.date)}
                            {c.note ? ` · ${c.note}` : ""}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          aria-label="Borrar este apunte"
                          onClick={() => deleteContribution(c)}
                        >
                          <X size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      )}

      <p className="subtitle" style={{ marginTop: 16 }}>
        Lo que apartáis aquí es un apunte aparte: no se suma a los gastos ni a los ingresos de Movimientos.
      </p>

      {goalForm && (
        <div className="modal-backdrop">
          <form
            className="modal"
            ref={goalRef}
            onSubmit={saveGoal}
            onKeyDown={(e) => trapFocus(e, goalRef.current)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="goal-modal-title"
          >
            <div className="modal-head">
              <h2 id="goal-modal-title">{goalForm.id ? "Editar objetivo" : "Nuevo objetivo"}</h2>
              <button aria-label="Cerrar" type="button" className="btn btn-ghost" onClick={() => setGoalForm(null)}>
                <X />
              </button>
            </div>
            <div className="form-grid">
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="goal-title">Nombre</label>
                <input
                  id="goal-title"
                  className="input"
                  value={goalForm.title}
                  maxLength={60}
                  placeholder="Viaje de verano"
                  autoFocus
                  onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="goal-target">Cantidad a ahorrar</label>
                <MoneyInput
                  id="goal-target"
                  value={goalForm.target}
                  onChange={(v) => setGoalForm({ ...goalForm, target: v })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="goal-date">Fecha límite</label>
                <div className="toolbar" style={{ justifyContent: "flex-start", flexWrap: "nowrap" }}>
                  <input
                    id="goal-hasdate"
                    type="checkbox"
                    aria-label="Tiene fecha límite"
                    checked={goalForm.hasDate}
                    onChange={(e) => setGoalForm({ ...goalForm, hasDate: e.target.checked })}
                  />
                  <input
                    id="goal-date"
                    className="input"
                    type="date"
                    disabled={!goalForm.hasDate}
                    value={goalForm.date}
                    min={goalForm.id ? undefined : today}
                    onChange={(e) => setGoalForm({ ...goalForm, date: e.target.value })}
                  />
                </div>
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Icono</label>
                <div className="chip-row">
                  {ICONS.map((icon) => (
                    <button
                      type="button"
                      key={icon}
                      className={`chip${goalForm.icon === icon ? " active" : ""}`}
                      aria-pressed={goalForm.icon === icon}
                      onClick={() => setGoalForm({ ...goalForm, icon })}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="toolbar" style={{ marginTop: 18 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setGoalForm(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <LoaderCircle size={16} className="spin" /> : null}
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {contribForm && (
        <div className="modal-backdrop">
          <form
            className="modal"
            ref={contribRef}
            onSubmit={saveContribution}
            onKeyDown={(e) => trapFocus(e, contribRef.current)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="contrib-modal-title"
          >
            <div className="modal-head">
              <h2 id="contrib-modal-title">
                {contribForm.mode === "add" ? "Aportar a" : "Retirar de"} «{contribForm.goal.title}»
              </h2>
              <button aria-label="Cerrar" type="button" className="btn btn-ghost" onClick={() => setContribForm(null)}>
                <X />
              </button>
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="contrib-amount">Cantidad</label>
                <MoneyInput
                  id="contrib-amount"
                  value={contribForm.amount}
                  onChange={(v) => setContribForm({ ...contribForm, amount: v })}
                  autoFocus
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="contrib-date">Fecha</label>
                <input
                  id="contrib-date"
                  className="input"
                  type="date"
                  value={contribForm.date}
                  onChange={(e) => setContribForm({ ...contribForm, date: e.target.value })}
                  required
                />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="contrib-note">Nota (opcional)</label>
                <input
                  id="contrib-note"
                  className="input"
                  value={contribForm.note}
                  maxLength={120}
                  onChange={(e) => setContribForm({ ...contribForm, note: e.target.value })}
                />
              </div>
            </div>
            <div className="toolbar" style={{ marginTop: 18 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setContribForm(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <LoaderCircle size={16} className="spin" /> : null}
                {saving ? "Guardando…" : contribForm.mode === "add" ? "Aportar" : "Retirar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
