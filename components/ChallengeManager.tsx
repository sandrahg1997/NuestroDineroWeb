"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CHALLENGE_TEMPLATES,
  templateDates,
  type Challenge,
  type ChallengeKind,
  type ChallengeProgress,
  type ChallengeTemplate,
} from "@/lib/challenges";
import type { Category } from "@/lib/types";
import { formatDateEs } from "@/lib/utils";
import { Flame, LoaderCircle, Plus, Trash2, Trophy, X } from "lucide-react";
import Money from "./Money";
import MoneyInput from "./MoneyInput";
import { useToast } from "./Toast";

type Item = { challenge: Challenge; progress: ChallengeProgress };

const STATUS_LABEL: Record<ChallengeProgress["status"], { text: string; className: string }> = {
  upcoming: { text: "Empieza pronto", className: "neutral" },
  active: { text: "En marcha", className: "good" },
  broken: { text: "Roto", className: "warn" },
  won: { text: "Superado", className: "good" },
  lost: { text: "No superado", className: "warn" },
};

const blankCustom = (today: string) => ({
  title: "",
  icon: "🎯",
  kind: "no_spend" as ChallengeKind,
  category_id: "",
  keywords: "",
  limit: "",
  start_date: today,
  end_date: templateDates({ days: 7 }, today).end_date,
});

export default function ChallengeManager({
  householdId,
  userId,
  today,
  items,
  categories,
  streak,
  won,
}: {
  householdId: string;
  userId: string;
  today: string;
  items: Item[];
  categories: Category[];
  streak: number;
  won: number;
}) {
  const router = useRouter();
  const { toast, confirm, askText } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [custom, setCustom] = useState<ReturnType<typeof blankCustom> | null>(null);

  const live = items.filter((i) => ["active", "broken", "upcoming"].includes(i.progress.status));
  const history = items.filter((i) => i.progress.status === "won" || i.progress.status === "lost");
  const totalSaved = items
    .filter((i) => i.progress.status !== "broken" && i.progress.status !== "lost")
    .reduce((t, i) => t + i.progress.estimatedSaved, 0);

  const categoryByName = (name?: string) =>
    name ? categories.find((c) => c.name.toLowerCase() === name.toLowerCase()) : undefined;
  // Una plantilla de categoría solo tiene sentido si esa categoría existe en el espacio.
  const templates = CHALLENGE_TEMPLATES.filter((t) => !t.categoryName || categoryByName(t.categoryName));

  async function insert(row: Omit<Challenge, "id" | "household_id" | "created_at">) {
    const s = createClient();
    const { error } = await s.from("challenges").insert({ ...row, household_id: householdId, created_by: userId });
    if (error) {
      toast(error.message, "error");
      return false;
    }
    toast("¡Reto en marcha! 💪", "success");
    router.refresh();
    return true;
  }

  async function startTemplate(t: ChallengeTemplate) {
    let limit: number | null = null;
    if (t.needsLimit) {
      const value = await askText(`¿Cuál es el máximo para "${t.title}"? (en €)`, {
        placeholder: "Ej. 80",
        confirmLabel: "Empezar reto",
      });
      if (value === null) return;
      limit = Number(value.replace(",", "."));
      if (!Number.isFinite(limit) || limit <= 0) return toast("Introduce un importe válido mayor que cero.", "error");
    }
    setBusy(t.key);
    await insert({
      title: t.title,
      icon: t.icon,
      kind: t.kind,
      category_id: categoryByName(t.categoryName)?.id ?? null,
      keywords: t.keywords ?? [],
      limit_amount: limit,
      ...templateDates(t, today),
    });
    setBusy(null);
  }

  async function saveCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!custom) return;
    const keywords = custom.keywords
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    const limit = custom.kind === "limit" ? Number(custom.limit.replace(",", ".")) : null;
    if (custom.kind === "limit" && (!Number.isFinite(limit) || !limit || limit <= 0))
      return toast("Introduce un tope válido mayor que cero.", "error");
    if (custom.end_date < custom.start_date) return toast("La fecha de fin no puede ser anterior al inicio.", "error");
    setBusy("custom");
    const ok = await insert({
      title: custom.title.trim(),
      icon: custom.icon.trim() || "🎯",
      kind: custom.kind,
      category_id: custom.category_id || null,
      keywords,
      limit_amount: limit,
      start_date: custom.start_date,
      end_date: custom.end_date,
    });
    if (ok) setCustom(null);
    setBusy(null);
  }

  async function remove(item: Item) {
    const ended = item.progress.status === "won" || item.progress.status === "lost";
    if (
      !(await confirm(
        ended ? `¿Borrar "${item.challenge.title}" del historial?` : `¿Abandonar "${item.challenge.title}"?`,
        {
          confirmLabel: ended ? "Borrar" : "Abandonar",
          danger: true,
        }
      ))
    )
      return;
    setBusy(item.challenge.id);
    const s = createClient();
    const { error } = await s.from("challenges").delete().eq("id", item.challenge.id);
    if (error) toast(error.message, "error");
    else router.refresh();
    setBusy(null);
  }

  return (
    <>
      <section className="dashboard-metrics">
        <article className="dashboard-metric-card">
          <div className="metric-icon metric-icon-saving">
            <Flame size={20} />
          </div>
          <div>
            <p className="metric-label">Racha</p>
            <p className="dashboard-metric-value">
              {streak} {streak === 1 ? "reto" : "retos"} seguidos
            </p>
          </div>
        </article>
        <article className="dashboard-metric-card">
          <div className="metric-icon metric-icon-income">
            <Trophy size={20} />
          </div>
          <div>
            <p className="metric-label">Superados</p>
            <p className="dashboard-metric-value">{won}</p>
          </div>
        </article>
        <article className="dashboard-metric-card">
          <div className="metric-icon metric-icon-expense">
            <span style={{ fontSize: 20 }}>💰</span>
          </div>
          <div>
            <p className="metric-label">Ahorro estimado con retos</p>
            <p className="dashboard-metric-value">
              <Money value={totalSaved} />
            </p>
          </div>
        </article>
      </section>

      <div className="section-head">
        <h2>En marcha</h2>
      </div>
      {live.length ? (
        <div className="challenge-grid">
          {live.map((item) => (
            <ChallengeCard key={item.challenge.id} item={item} busy={busy === item.challenge.id} onRemove={remove} />
          ))}
        </div>
      ) : (
        <div className="card empty" style={{ marginBottom: 18 }}>
          <span className="empty-icon">
            <Trophy size={22} />
          </span>
          <strong>Ningún reto activo</strong>
          <p>Elegid uno de abajo para empezar hoy mismo.</p>
        </div>
      )}

      <div className="section-head" style={{ marginTop: 26 }}>
        <h2>Elegid un reto</h2>
        {!custom && (
          <button type="button" className="btn btn-soft" onClick={() => setCustom(blankCustom(today))}>
            <Plus size={16} /> Reto personalizado
          </button>
        )}
      </div>

      {custom && (
        <form className="card" style={{ marginBottom: 18 }} onSubmit={saveCustom}>
          <div className="modal-head" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>Reto personalizado</h2>
            <button type="button" className="btn btn-ghost" onClick={() => setCustom(null)} aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Nombre</label>
              <input
                className="input"
                value={custom.title}
                onChange={(e) => setCustom({ ...custom, title: e.target.value })}
                placeholder="Ej. Semana sin Amazon"
                required
              />
            </div>
            <div className="field">
              <label>Emoji</label>
              <input
                className="input"
                value={custom.icon}
                maxLength={4}
                onChange={(e) => setCustom({ ...custom, icon: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Tipo</label>
              <select
                className="select"
                value={custom.kind}
                onChange={(e) => setCustom({ ...custom, kind: e.target.value as ChallengeKind })}
              >
                <option value="no_spend">Gasto cero</option>
                <option value="limit">Con tope máximo</option>
              </select>
            </div>
            {custom.kind === "limit" && (
              <div className="field">
                <label>Tope</label>
                <MoneyInput value={custom.limit} onChange={(v) => setCustom({ ...custom, limit: v })} required />
              </div>
            )}
            <div className="field">
              <label>Categoría (opcional)</label>
              <select
                className="select"
                value={custom.category_id}
                onChange={(e) => setCustom({ ...custom, category_id: e.target.value })}
              >
                <option value="">Cualquiera</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Palabras clave (opcional)</label>
              <input
                className="input"
                value={custom.keywords}
                onChange={(e) => setCustom({ ...custom, keywords: e.target.value })}
                placeholder="amazon, aliexpress"
              />
            </div>
            <div className="field">
              <label>Desde</label>
              <input
                className="input"
                type="date"
                value={custom.start_date}
                onChange={(e) => setCustom({ ...custom, start_date: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Hasta</label>
              <input
                className="input"
                type="date"
                value={custom.end_date}
                onChange={(e) => setCustom({ ...custom, end_date: e.target.value })}
                required
              />
            </div>
          </div>
          <p className="subtitle" style={{ fontSize: 12 }}>
            Cuenta un gasto si es de esa categoría o si su concepto o comercio contiene alguna palabra clave. Sin
            ninguna de las dos, cuenta cualquier gasto que no sea recurrente.
          </p>
          <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={busy === "custom"}>
            {busy === "custom" && <LoaderCircle size={16} className="spin" />}
            Empezar reto
          </button>
        </form>
      )}

      <div className="challenge-grid">
        {templates.map((t) => (
          <article className="card challenge-template" key={t.key}>
            <div className="challenge-icon">{t.icon}</div>
            <h3>{t.title}</h3>
            <p className="subtitle">{t.description}</p>
            <button type="button" className="btn btn-soft" onClick={() => startTemplate(t)} disabled={busy === t.key}>
              {busy === t.key ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}
              Empezar
            </button>
          </article>
        ))}
      </div>

      {history.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: 26 }}>
            <h2>Historial</h2>
          </div>
          <div className="card recent-card">
            {history.map((item) => {
              const status = STATUS_LABEL[item.progress.status];
              return (
                <div className="recent-row" key={item.challenge.id}>
                  <div className="recent-icon challenge-history-icon">{item.challenge.icon}</div>
                  <div className="recent-main">
                    <strong>{item.challenge.title}</strong>
                    <span>
                      {formatDateEs(item.challenge.start_date)} – {formatDateEs(item.challenge.end_date)}
                      {item.progress.status === "won" && item.progress.estimatedSaved > 0 && (
                        <>
                          {" "}
                          · ahorrasteis ~<Money value={item.progress.estimatedSaved} />
                        </>
                      )}
                    </span>
                  </div>
                  <span className={`metric-badge ${status.className}`}>{status.text}</span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => remove(item)}
                    disabled={busy === item.challenge.id}
                    aria-label="Borrar del historial"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function ChallengeCard({ item, busy, onRemove }: { item: Item; busy: boolean; onRemove: (i: Item) => void }) {
  const { challenge: c, progress: p } = item;
  const status = STATUS_LABEL[p.status];
  const limit = c.limit_amount === null ? null : Number(c.limit_amount);
  const pct =
    c.kind === "limit" && limit
      ? Math.min(100, Math.round((p.spent / limit) * 100))
      : Math.round((p.elapsedDays / p.totalDays) * 100);

  return (
    <article className="card challenge-card">
      <div className="challenge-head">
        <div className="challenge-icon">{c.icon}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3>{c.title}</h3>
          <span className="subtitle">
            {formatDateEs(c.start_date)} – {formatDateEs(c.end_date)}
          </span>
        </div>
        <span className={`metric-badge ${status.className}`}>{status.text}</span>
      </div>

      <div className="budget-track" style={{ marginTop: 14 }}>
        <span className={p.status === "broken" ? "over" : ""} style={{ width: `${pct}%` }} />
      </div>

      <p className="budget-caption">
        {p.status === "upcoming" ? (
          "Aún no ha empezado."
        ) : c.kind === "limit" && limit ? (
          <>
            <Money value={p.spent} /> de <Money value={limit} /> ·{" "}
            {p.spent <= limit ? (
              <>
                os quedan <Money value={limit - p.spent} />
              </>
            ) : (
              <>
                pasado en <Money value={p.spent - limit} />
              </>
            )}
          </>
        ) : p.status === "broken" ? (
          <>
            Se rompió con {p.matches} {p.matches === 1 ? "gasto" : "gastos"} (<Money value={p.spent} />
            ). Lleváis {p.cleanStreak} {p.cleanStreak === 1 ? "día" : "días"} limpios desde entonces.
          </>
        ) : (
          <>
            🔥 {p.cleanStreak} {p.cleanStreak === 1 ? "día" : "días"} limpios · quedan {p.daysLeft}{" "}
            {p.daysLeft === 1 ? "día" : "días"}
          </>
        )}
      </p>
      {p.estimatedSaved > 0 && p.status !== "broken" && (
        <p className="budget-caption income">
          Ahorro estimado: ~<Money value={p.estimatedSaved} /> respecto a vuestro ritmo habitual
        </p>
      )}

      <button type="button" className="btn btn-ghost challenge-remove" onClick={() => onRemove(item)} disabled={busy}>
        {busy ? <LoaderCircle size={15} className="spin" /> : <Trash2 size={15} />}
        Abandonar
      </button>
    </article>
  );
}
