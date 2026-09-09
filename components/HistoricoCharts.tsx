"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Money from "@/components/Money";
import type { Category } from "@/lib/types";
import { categoryColor, dateKey, transactionsHref } from "@/lib/utils";
import { useChartTheme } from "@/lib/useChartTheme";
import { ArrowDownRight, ArrowUpRight, CalendarRange, Minus, ReceiptText, Sparkles } from "lucide-react";

type Row = { date: string; amount: number; type: "expense" | "income"; category_id: string | null };
type PeriodRow = { id: string; name: string; start_date: string; end_date: string };
type PeriodPoint = { id: string; label: string; expense: number; income: number };
type CmpBasis = "prev" | "avg3" | "year";
type CmpView = "all" | "cuts" | "ups";

const NO_CATEGORY = "__none__";
const TREND_PERIODS = 6;
const FORECAST_SAMPLE = 3;
const MAX_BARS = 12;

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`)) / 86400000);
}
function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function HistoricoCharts({
  transactions,
  categories,
  periods,
  hideAmounts,
}: {
  transactions: Row[];
  categories: Category[];
  periods: PeriodRow[];
  hideAmounts?: boolean;
}) {
  const [categoryId, setCategoryId] = useState("");
  const chart = useChartTheme();

  // Periodos ordenados por fecha de inicio (ascendente).
  const orderedPeriods = useMemo(
    () => [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [periods]
  );

  const filtered = useMemo(
    () => (categoryId ? transactions.filter((t) => t.category_id === categoryId) : transactions),
    [transactions, categoryId]
  );

  // ─── Evolución: una barra por periodo ─────────────────────────────────────
  const { evolution, totalExpense, totalIncome, avgExpense, forecastExpense } = useMemo(() => {
    const actual: PeriodPoint[] = orderedPeriods.map((p) => {
      let expense = 0;
      let income = 0;
      for (const t of filtered) {
        if (t.date >= p.start_date && t.date <= p.end_date) {
          if (t.type === "expense") expense += Number(t.amount);
          else income += Number(t.amount);
        }
      }
      return { id: p.id, label: p.name, expense, income };
    });

    const totalExpense = actual.reduce((s, p) => s + p.expense, 0);
    const totalIncome = actual.reduce((s, p) => s + p.income, 0);
    const avgExpense = actual.length ? totalExpense / actual.length : 0;

    const sample = actual.slice(-FORECAST_SAMPLE);
    const forecastExpense = sample.length ? sample.reduce((s, p) => s + p.expense, 0) / sample.length : 0;

    return { evolution: actual, totalExpense, totalIncome, avgExpense, forecastExpense };
  }, [orderedPeriods, filtered]);

  const periodsTracked = evolution.length;
  const evolutionChart = evolution.slice(-MAX_BARS);

  // ─── Comparativa de gasto por categoría entre periodos ────────────────────
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // periodId -> (categoryId -> total gastado)
  const expenseByPeriod = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const p of orderedPeriods) {
      const inner = new Map<string, number>();
      for (const t of transactions) {
        if (t.type !== "expense") continue;
        if (t.date < p.start_date || t.date > p.end_date) continue;
        const cat = t.category_id ?? NO_CATEGORY;
        inner.set(cat, (inner.get(cat) ?? 0) + Number(t.amount));
      }
      map.set(p.id, inner);
    }
    return map;
  }, [orderedPeriods, transactions]);

  const [cmpPeriodId, setCmpPeriodId] = useState("");
  const [cmpBasis, setCmpBasis] = useState<CmpBasis>("prev");
  const [cmpView, setCmpView] = useState<CmpView>("all");

  // Periodo de referencia: el elegido, o el último con gasto, o el último.
  const defaultRefId = useMemo(() => {
    for (let i = orderedPeriods.length - 1; i >= 0; i--) {
      const m = expenseByPeriod.get(orderedPeriods[i].id);
      if (m && m.size) return orderedPeriods[i].id;
    }
    return orderedPeriods[orderedPeriods.length - 1]?.id ?? "";
  }, [orderedPeriods, expenseByPeriod]);

  const refId = cmpPeriodId || defaultRefId;
  const refIndex = orderedPeriods.findIndex((p) => p.id === refId);
  const refPeriod = refIndex >= 0 ? orderedPeriods[refIndex] : undefined;

  const todayKey = dateKey();
  const periodInProgress = !!refPeriod && todayKey >= refPeriod.start_date && todayKey <= refPeriod.end_date;

  const comparison = useMemo(() => {
    const empty = {
      rows: [] as {
        cat: string;
        name: string;
        icon: string;
        now: number;
        before: number;
        delta: number;
        pct: number;
        trend: number[];
        tag: "new" | "gone" | null;
      }[],
      maxAbsDelta: 1,
      cut: 0,
      up: 0,
      nowTotal: 0,
      beforeTotal: 0,
      cutCount: 0,
      upCount: 0,
      trendCount: 0,
      hasBaseData: false,
      baseLabel: "",
    };
    if (refIndex < 0) return empty;

    const current = expenseByPeriod.get(refId) ?? new Map<string, number>();

    // Periodos que forman la base de comparación.
    let basePeriods: PeriodRow[];
    if (cmpBasis === "prev") {
      basePeriods = refIndex > 0 ? [orderedPeriods[refIndex - 1]] : [];
    } else if (cmpBasis === "avg3") {
      basePeriods = orderedPeriods.slice(Math.max(0, refIndex - 3), refIndex);
    } else {
      // "year": el periodo cuyo inicio cae más cerca de un año antes (±60 días).
      const target = addDays(orderedPeriods[refIndex].start_date, -365);
      let best: PeriodRow | undefined;
      let bestDist = Infinity;
      for (let i = 0; i < refIndex; i++) {
        const dist = Math.abs(daysBetween(target, orderedPeriods[i].start_date));
        if (dist < bestDist) {
          bestDist = dist;
          best = orderedPeriods[i];
        }
      }
      basePeriods = best && bestDist <= 60 ? [best] : [];
    }

    const baseMaps = basePeriods.map((p) => expenseByPeriod.get(p.id)).filter(Boolean) as Map<string, number>[];
    const baseDivisor = cmpBasis === "avg3" ? Math.max(1, basePeriods.length) : 1;
    const baseFor = (cat: string) => baseMaps.reduce((s, mm) => s + (mm.get(cat) ?? 0), 0) / baseDivisor;

    // Periodos para la mini-tendencia (los que terminan en el de referencia).
    const trendPeriods = orderedPeriods.slice(Math.max(0, refIndex - (TREND_PERIODS - 1)), refIndex + 1);

    const catIds = new Set<string>(current.keys());
    for (const mm of baseMaps) for (const c of mm.keys()) catIds.add(c);

    const rows = [...catIds]
      .map((cat) => {
        const name = cat === NO_CATEGORY ? "Sin categoría" : (catMap.get(cat)?.name ?? "Categoría eliminada");
        const icon = cat === NO_CATEGORY ? "•" : (catMap.get(cat)?.icon ?? "•");
        const now = current.get(cat) ?? 0;
        const before = baseFor(cat);
        const delta = now - before;
        const pct = before > 0 ? (delta / before) * 100 : now > 0 ? 100 : 0;
        const trend = trendPeriods.map((p) => expenseByPeriod.get(p.id)?.get(cat) ?? 0);
        const tag: "new" | "gone" | null =
          before > 0 && now < 0.005 ? "gone" : before < 0.005 && now > 0 ? "new" : null;
        return { cat, name, icon, now, before, delta, pct, trend, tag };
      })
      .filter((r) => r.now > 0 || r.before > 0);

    rows.sort((a, b) => a.delta - b.delta); // recortes primero (delta más negativo arriba)

    const maxAbsDelta = rows.reduce((mx, r) => Math.max(mx, Math.abs(r.delta)), 0) || 1;
    const cut = rows.reduce((s, r) => (r.delta < 0 ? s - r.delta : s), 0);
    const up = rows.reduce((s, r) => (r.delta > 0 ? s + r.delta : s), 0);
    const nowTotal = rows.reduce((s, r) => s + r.now, 0);
    const beforeTotal = rows.reduce((s, r) => s + r.before, 0);
    const cutCount = rows.filter((r) => r.delta < -0.005).length;
    const upCount = rows.filter((r) => r.delta > 0.005).length;

    const hasBaseData = baseMaps.length > 0;
    const baseLabel =
      cmpBasis === "avg3"
        ? `media de ${basePeriods.length} periodo${basePeriods.length === 1 ? "" : "s"} previo${basePeriods.length === 1 ? "" : "s"}`
        : (basePeriods[0]?.name ?? "el periodo anterior");

    return {
      rows,
      maxAbsDelta,
      cut,
      up,
      nowTotal,
      beforeTotal,
      cutCount,
      upCount,
      trendCount: trendPeriods.length,
      hasBaseData,
      baseLabel,
    };
  }, [expenseByPeriod, orderedPeriods, refId, refIndex, cmpBasis, catMap]);

  const netDelta = comparison.nowTotal - comparison.beforeTotal;
  const rowHref = (cat: string) =>
    transactionsHref({
      type: "expense",
      category: cat === NO_CATEGORY ? null : cat,
      from: refPeriod?.start_date,
      to: refPeriod?.end_date,
    });

  const visibleRows = comparison.rows.filter((r) =>
    cmpView === "cuts" ? r.delta < -0.005 : cmpView === "ups" ? r.delta > 0.005 : true
  );

  const axisLabel = (v: string) => (v.length > 12 ? `${v.slice(0, 11)}…` : v);

  if (!orderedPeriods.length) {
    return (
      <article className="card chart-card">
        <div className="empty">
          <span className="empty-icon">
            <CalendarRange size={22} />
          </span>
          <strong>Sin periodos todavía</strong>
          <p>El histórico se agrupa por periodos. Crea al menos uno para empezar a ver tu evolución.</p>
          <Link href="/periods" className="btn btn-primary">
            Crear un periodo
          </Link>
        </div>
      </article>
    );
  }

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <select
          className="select"
          style={{ maxWidth: 260 }}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      </div>

      <section className="dashboard-metrics" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <article className="dashboard-metric-card">
          <div className="metric-icon metric-icon-expense">
            <ReceiptText size={20} />
          </div>
          <div>
            <p className="metric-label">Gastado en total</p>
            <p className="dashboard-metric-value">
              <Money value={totalExpense} />
            </p>
          </div>
        </article>
        <article className="dashboard-metric-card">
          <div className="metric-icon metric-icon-income">
            <ArrowUpRight size={20} />
          </div>
          <div>
            <p className="metric-label">Ingresado en total</p>
            <p className="dashboard-metric-value">
              <Money value={totalIncome} />
            </p>
          </div>
        </article>
        <article className="dashboard-metric-card">
          <div className="metric-icon metric-icon-saving">
            <CalendarRange size={20} />
          </div>
          <div>
            <p className="metric-label">Promedio por periodo</p>
            <p className="dashboard-metric-value">
              <Money value={avgExpense} />
            </p>
          </div>
        </article>
        <article className="dashboard-metric-card">
          <div className="metric-icon metric-icon-saving">
            <Sparkles size={20} />
          </div>
          <div>
            <p className="metric-label">Previsión próximo periodo</p>
            <p className="dashboard-metric-value">
              <Money value={forecastExpense} />
            </p>
          </div>
        </article>
      </section>

      <article className="card chart-card">
        <div className="section-head dashboard-section-head">
          <div>
            <span className="eyebrow">
              {periodsTracked} periodo{periodsTracked === 1 ? "" : "s"} registrados
            </span>
            <h2>Evolución por periodo</h2>
          </div>
        </div>
        <div className="area-chart-wrap">
          {evolutionChart.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={evolutionChart} margin={{ top: 10, right: 6, left: -18, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: chart.axis, fontSize: 12 }}
                  tickFormatter={axisLabel}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: chart.axis, fontSize: 12 }} />
                {!hideAmounts && (
                  <Tooltip
                    contentStyle={{
                      background: chart.tooltipBg,
                      border: `1px solid ${chart.tooltipBorder}`,
                      borderRadius: 12,
                      color: chart.tooltipText,
                    }}
                    labelStyle={{ color: chart.tooltipText }}
                    itemStyle={{ color: chart.tooltipText }}
                    formatter={(value: number, name: string) => [`${value.toFixed(2)} €`, name]}
                  />
                )}
                <Bar dataKey="expense" name="Gastos" radius={[6, 6, 0, 0]}>
                  {evolutionChart.map((p) => (
                    <Cell key={`e-${p.id}`} fill="#ec4899" />
                  ))}
                </Bar>
                <Bar dataKey="income" name="Ingresos" radius={[6, 6, 0, 0]}>
                  {evolutionChart.map((p) => (
                    <Cell key={`i-${p.id}`} fill="#10b981" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty">Todavía no hay movimientos en tus periodos.</div>
          )}
        </div>
        <div className="chart-caption">
          <span>
            <i className="chart-key expense-key" /> Gastos
          </span>
          <span>
            <i className="chart-key income-key" /> Ingresos
          </span>
          {periodsTracked > MAX_BARS && (
            <span>
              Mostrando los últimos {MAX_BARS} de {periodsTracked} periodos.
            </span>
          )}
        </div>
      </article>

      <article className="card chart-card" style={{ marginTop: 18 }}>
        <div className="section-head dashboard-section-head">
          <div>
            <span className="eyebrow">Comparativa</span>
            <h2>Gasto por categoría vs. otro periodo</h2>
          </div>
        </div>

        <div className="toolbar" style={{ marginBottom: 12 }}>
          <select
            className="select"
            style={{ maxWidth: 220 }}
            value={refId}
            onChange={(e) => setCmpPeriodId(e.target.value)}
          >
            {[...orderedPeriods].reverse().map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span style={{ color: "var(--muted)", fontSize: 13, fontWeight: 650 }}>comparado con</span>
          <select
            className="select"
            style={{ maxWidth: 240 }}
            value={cmpBasis}
            onChange={(e) => setCmpBasis(e.target.value as CmpBasis)}
          >
            <option value="prev">Periodo anterior</option>
            <option value="avg3">Media de los 3 periodos previos</option>
            <option value="year">Mismo periodo del año pasado</option>
          </select>
        </div>

        {comparison.hasBaseData && comparison.rows.length > 0 && (
          <div className="chip-row" style={{ marginBottom: 14 }}>
            <button className={`chip${cmpView === "all" ? " active" : ""}`} onClick={() => setCmpView("all")}>
              Todo ({comparison.rows.length})
            </button>
            <button className={`chip${cmpView === "cuts" ? " active" : ""}`} onClick={() => setCmpView("cuts")}>
              Solo recortes ({comparison.cutCount})
            </button>
            <button className={`chip${cmpView === "ups" ? " active" : ""}`} onClick={() => setCmpView("ups")}>
              Solo subidas ({comparison.upCount})
            </button>
          </div>
        )}

        {!comparison.hasBaseData ? (
          <div className="empty">No hay un periodo de comparación disponible ({comparison.baseLabel}).</div>
        ) : !comparison.rows.length ? (
          <div className="empty">Sin gastos que comparar en estos periodos.</div>
        ) : (
          <>
            {periodInProgress && (
              <div className="filter-summary" style={{ marginBottom: 12 }}>
                <span>
                  ⚠ {refPeriod?.name} aún está en curso: la comparación es parcial y casi todo aparecerá como recorte.
                </span>
              </div>
            )}

            <div className="filter-summary" style={{ marginBottom: 14 }}>
              <span>
                Recortado: <strong className="income amount-value">−{comparison.cut.toFixed(0)} €</strong>
              </span>
              <span>
                Aumentado: <strong className="expense amount-value">+{comparison.up.toFixed(0)} €</strong>
              </span>
              <span>
                Neto:{" "}
                <strong className={`amount-value ${netDelta <= 0 ? "income" : "expense"}`}>
                  {netDelta > 0 ? "+" : netDelta < 0 ? "−" : ""}
                  {Math.abs(netDelta).toFixed(0)} €
                </strong>
              </span>
            </div>

            {visibleRows.length ? (
              <div className="cmp-list">
                {visibleRows.map((r) => {
                  const dir = r.delta < -0.005 ? "down" : r.delta > 0.005 ? "up" : "flat";
                  const DirIcon = dir === "down" ? ArrowDownRight : dir === "up" ? ArrowUpRight : Minus;
                  const trendMax = Math.max(...r.trend, 1);
                  const barPct = Math.round((Math.abs(r.delta) / comparison.maxAbsDelta) * 100);
                  return (
                    <Link className="cmp-item" key={r.cat} href={rowHref(r.cat)}>
                      <div className="cmp-row-main">
                        <div className="cmp-name">
                          <span className="legend-dot" style={{ background: categoryColor(r.name) }} />
                          <span className="cmp-label">
                            {r.icon} {r.name}
                          </span>
                          {r.tag === "gone" && <span className="cmp-tag gone">ya no gastas</span>}
                          {r.tag === "new" && <span className="cmp-tag new">nuevo</span>}
                        </div>
                        <div className="cmp-spark" aria-hidden>
                          {r.trend.map((v, i) => (
                            <i
                              key={i}
                              className={i === r.trend.length - 1 ? "cur" : undefined}
                              style={{ height: `${Math.round((v / trendMax) * 100)}%` }}
                            />
                          ))}
                        </div>
                        <div className="cmp-values">
                          <Money value={r.before} /> → <Money value={r.now} />
                        </div>
                        <div className={`cmp-delta ${dir}`}>
                          <DirIcon size={14} />
                          <span className="amount-value">
                            {r.delta > 0 ? "+" : r.delta < 0 ? "−" : ""}
                            {Math.abs(r.delta).toFixed(0)} €
                          </span>
                          {r.before > 0 && dir !== "flat" && (
                            <span className="cmp-pct">
                              ({r.pct > 0 ? "+" : ""}
                              {r.pct.toFixed(0)}%)
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="cmp-track">
                        <span className={dir} style={{ width: `${barPct}%` }} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="empty">
                {cmpView === "cuts" ? "No hay recortes en este periodo." : "No hay subidas en este periodo."}
              </div>
            )}

            <div className="chart-caption" style={{ marginTop: 12 }}>
              <span>
                Ordenado por mayor recorte · barra clara = tendencia últimos {comparison.trendCount} periodos · pulsa
                una fila para ver sus movimientos.
              </span>
            </div>
          </>
        )}
      </article>
    </>
  );
}
