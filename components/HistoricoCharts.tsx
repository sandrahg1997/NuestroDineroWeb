"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Money from "@/components/Money";
import type { Category } from "@/lib/types";
import { categoryColor, dateKey, monthLabel, monthRange, nextMonthKey, prevMonthKey, transactionsHref } from "@/lib/utils";
import { useChartTheme } from "@/lib/useChartTheme";
import { ArrowDownRight, ArrowUpRight, CalendarRange, Minus, ReceiptText, Sparkles } from "lucide-react";

type Row = { date: string; amount: number; type: "expense" | "income"; category_id: string | null };
type MonthPoint = { month: string; label: string; expense: number; income: number; forecast: boolean };
type CmpBasis = "prev" | "avg3" | "year";
type CmpView = "all" | "cuts" | "ups";

const FORECAST_MONTHS = 3;
const FORECAST_SAMPLE = 3;
const NO_CATEGORY = "__none__";
const TREND_MONTHS = 6;

function lastDayOfMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export default function HistoricoCharts({
  transactions,
  categories,
  hideAmounts,
}: {
  transactions: Row[];
  categories: Category[];
  hideAmounts?: boolean;
}) {
  const [categoryId, setCategoryId] = useState("");
  const chart = useChartTheme();

  const filtered = useMemo(
    () => (categoryId ? transactions.filter((t) => t.category_id === categoryId) : transactions),
    [transactions, categoryId]
  );

  const { monthly, totalExpense, totalIncome, avgExpense, monthsTracked, forecastExpense, forecastIncome } = useMemo(() => {
    if (!filtered.length) {
      return { monthly: [] as MonthPoint[], totalExpense: 0, totalIncome: 0, avgExpense: 0, monthsTracked: 0, forecastExpense: 0, forecastIncome: 0 };
    }
    const byMonth = new Map<string, { expense: number; income: number }>();
    let minMonth = filtered[0].date.slice(0, 7);
    let maxMonth = minMonth;
    for (const t of filtered) {
      const key = t.date.slice(0, 7);
      if (key < minMonth) minMonth = key;
      if (key > maxMonth) maxMonth = key;
      const entry = byMonth.get(key) ?? { expense: 0, income: 0 };
      if (t.type === "expense") entry.expense += Number(t.amount);
      else entry.income += Number(t.amount);
      byMonth.set(key, entry);
    }
    const currentMonth = dateKey().slice(0, 7);
    if (currentMonth > maxMonth) maxMonth = currentMonth;
    const months = monthRange(minMonth, maxMonth);
    const actual: MonthPoint[] = months.map((key) => ({ month: key, label: monthLabel(key), forecast: false, ...(byMonth.get(key) ?? { expense: 0, income: 0 }) }));

    const totalExpense = actual.reduce((total, m) => total + m.expense, 0);
    const totalIncome = actual.reduce((total, m) => total + m.income, 0);
    const monthsTracked = actual.length;
    const avgExpense = monthsTracked ? totalExpense / monthsTracked : 0;

    // Previsión: media de los últimos meses reales, proyectada hacia adelante.
    const sample = actual.slice(-FORECAST_SAMPLE);
    const forecastExpense = sample.length ? sample.reduce((t, m) => t + m.expense, 0) / sample.length : 0;
    const forecastIncome = sample.length ? sample.reduce((t, m) => t + m.income, 0) / sample.length : 0;

    let cursor = maxMonth;
    const forecastPoints: MonthPoint[] = [];
    for (let i = 0; i < FORECAST_MONTHS; i++) {
      cursor = nextMonthKey(cursor);
      forecastPoints.push({ month: cursor, label: monthLabel(cursor), forecast: true, expense: forecastExpense, income: forecastIncome });
    }

    return { monthly: [...actual, ...forecastPoints], totalExpense, totalIncome, avgExpense, monthsTracked, forecastExpense, forecastIncome };
  }, [filtered]);

  const firstForecastLabel = monthly.find((m) => m.forecast)?.label;

  // ─── Comparativa de gasto por categoría entre meses ────────────────────────
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const expenseByMonth = useMemo(() => {
    // month (YYYY-MM) -> (categoryId -> total gastado)
    const map = new Map<string, Map<string, number>>();
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      const mk = t.date.slice(0, 7);
      const cat = t.category_id ?? NO_CATEGORY;
      let inner = map.get(mk);
      if (!inner) { inner = new Map(); map.set(mk, inner); }
      inner.set(cat, (inner.get(cat) ?? 0) + Number(t.amount));
    }
    return map;
  }, [transactions]);

  const availableMonths = useMemo(() => [...expenseByMonth.keys()].sort(), [expenseByMonth]);

  const [cmpMonth, setCmpMonth] = useState("");
  const [cmpBasis, setCmpBasis] = useState<CmpBasis>("prev");
  const [cmpView, setCmpView] = useState<CmpView>("all");

  const currentMonthKey = dateKey().slice(0, 7);
  const refMonth = cmpMonth || availableMonths[availableMonths.length - 1] || currentMonthKey;
  const monthInProgress = refMonth >= currentMonthKey;

  const comparison = useMemo(() => {
    const current = expenseByMonth.get(refMonth) ?? new Map<string, number>();

    // Meses que forman la base de comparación.
    let baseMonths: string[];
    if (cmpBasis === "prev") baseMonths = [prevMonthKey(refMonth)];
    else if (cmpBasis === "year") {
      const [y, m] = refMonth.split("-");
      baseMonths = [`${Number(y) - 1}-${m}`];
    } else {
      let k = refMonth;
      baseMonths = [];
      for (let i = 0; i < 3; i++) { k = prevMonthKey(k); baseMonths.push(k); }
    }
    const baseMaps = baseMonths.map((k) => expenseByMonth.get(k)).filter(Boolean) as Map<string, number>[];
    const baseDivisor = cmpBasis === "avg3" ? 3 : 1;
    const baseFor = (cat: string) => baseMaps.reduce((s, mm) => s + (mm.get(cat) ?? 0), 0) / baseDivisor;

    // Meses para la mini-tendencia (los TREND_MONTHS que terminan en refMonth).
    const trendMonths: string[] = [];
    let tk = refMonth;
    for (let i = 0; i < TREND_MONTHS; i++) { trendMonths.unshift(tk); tk = prevMonthKey(tk); }

    const catIds = new Set<string>(current.keys());
    for (const mm of baseMaps) for (const c of mm.keys()) catIds.add(c);

    const rows = [...catIds].map((cat) => {
      const name = cat === NO_CATEGORY ? "Sin categoría" : catMap.get(cat)?.name ?? "Categoría eliminada";
      const icon = cat === NO_CATEGORY ? "•" : catMap.get(cat)?.icon ?? "•";
      const now = current.get(cat) ?? 0;
      const before = baseFor(cat);
      const delta = now - before;
      const pct = before > 0 ? (delta / before) * 100 : now > 0 ? 100 : 0;
      const trend = trendMonths.map((mk) => expenseByMonth.get(mk)?.get(cat) ?? 0);
      const tag: "new" | "gone" | null =
        before > 0 && now < 0.005 ? "gone" : before < 0.005 && now > 0 ? "new" : null;
      return { cat, name, icon, now, before, delta, pct, trend, tag };
    }).filter((r) => r.now > 0 || r.before > 0);

    rows.sort((a, b) => a.delta - b.delta); // recortes primero (delta más negativo arriba)

    const maxAbsDelta = rows.reduce((mx, r) => Math.max(mx, Math.abs(r.delta)), 0) || 1;
    const cut = rows.reduce((s, r) => (r.delta < 0 ? s - r.delta : s), 0);
    const up = rows.reduce((s, r) => (r.delta > 0 ? s + r.delta : s), 0);
    const nowTotal = rows.reduce((s, r) => s + r.now, 0);
    const beforeTotal = rows.reduce((s, r) => s + r.before, 0);
    const cutCount = rows.filter((r) => r.delta < -0.005).length;
    const upCount = rows.filter((r) => r.delta > 0.005).length;

    const hasBaseData = baseMaps.length > 0;
    const baseLabel = cmpBasis === "avg3" ? "media de los 3 meses previos" : monthLabel(baseMonths[0]);

    return { rows, maxAbsDelta, cut, up, nowTotal, beforeTotal, cutCount, upCount, hasBaseData, baseLabel };
  }, [expenseByMonth, refMonth, cmpBasis, catMap]);

  const netDelta = comparison.nowTotal - comparison.beforeTotal;
  const monthFrom = `${refMonth}-01`;
  const monthTo = `${refMonth}-${String(lastDayOfMonth(refMonth)).padStart(2, "0")}`;
  const rowHref = (cat: string) =>
    transactionsHref({ type: "expense", category: cat === NO_CATEGORY ? null : cat, from: monthFrom, to: monthTo });

  const visibleRows = comparison.rows.filter((r) =>
    cmpView === "cuts" ? r.delta < -0.005 : cmpView === "ups" ? r.delta > 0.005 : true
  );

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <select className="select" style={{ maxWidth: 260 }} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </select>
      </div>

      <section className="dashboard-metrics" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <article className="dashboard-metric-card">
          <div className="metric-icon metric-icon-expense"><ReceiptText size={20} /></div>
          <div>
            <p className="metric-label">Gastado en total</p>
            <p className="dashboard-metric-value"><Money value={totalExpense} /></p>
          </div>
        </article>
        <article className="dashboard-metric-card">
          <div className="metric-icon metric-icon-income"><ArrowUpRight size={20} /></div>
          <div>
            <p className="metric-label">Ingresado en total</p>
            <p className="dashboard-metric-value"><Money value={totalIncome} /></p>
          </div>
        </article>
        <article className="dashboard-metric-card">
          <div className="metric-icon metric-icon-saving"><CalendarRange size={20} /></div>
          <div>
            <p className="metric-label">Promedio mensual de gasto</p>
            <p className="dashboard-metric-value"><Money value={avgExpense} /></p>
          </div>
        </article>
        <article className="dashboard-metric-card">
          <div className="metric-icon metric-icon-saving"><Sparkles size={20} /></div>
          <div>
            <p className="metric-label">Previsión próximo mes</p>
            <p className="dashboard-metric-value"><Money value={forecastExpense} /></p>
          </div>
        </article>
      </section>

      <article className="card chart-card">
        <div className="section-head dashboard-section-head">
          <div>
            <span className="eyebrow">{monthsTracked} mes{monthsTracked === 1 ? "" : "es"} registrados</span>
            <h2>Evolución mensual</h2>
          </div>
        </div>
        <div className="area-chart-wrap">
          {monthly.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 10, right: 6, left: -18, bottom: 0 }}>
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: chart.axis, fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: chart.axis, fontSize: 12 }} />
                {!hideAmounts && (
                  <Tooltip
                    contentStyle={{ background: chart.tooltipBg, border: `1px solid ${chart.tooltipBorder}`, borderRadius: 12, color: chart.tooltipText }}
                    labelStyle={{ color: chart.tooltipText }}
                    itemStyle={{ color: chart.tooltipText }}
                    formatter={(value: number, name: string, item: any) => [`${value.toFixed(2)} €`, item?.payload?.forecast ? `${name} (previsión)` : name]}
                  />
                )}
                {firstForecastLabel && <ReferenceLine x={firstForecastLabel} stroke={chart.grid} strokeDasharray="4 4" />}
                <Bar dataKey="expense" name="Gastos" radius={[6, 6, 0, 0]}>
                  {monthly.map((m) => <Cell key={`e-${m.month}`} fill="#ec4899" fillOpacity={m.forecast ? 0.35 : 1} />)}
                </Bar>
                <Bar dataKey="income" name="Ingresos" radius={[6, 6, 0, 0]}>
                  {monthly.map((m) => <Cell key={`i-${m.month}`} fill="#10b981" fillOpacity={m.forecast ? 0.35 : 1} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="empty">Todavía no hay movimientos.</div>}
        </div>
        <div className="chart-caption">
          <span><i className="chart-key expense-key" /> Gastos</span>
          <span><i className="chart-key income-key" /> Ingresos</span>
          {firstForecastLabel && <span>Barras claras desde {firstForecastLabel}: previsión basada en la media de los últimos {Math.min(FORECAST_SAMPLE, monthsTracked)} meses.</span>}
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
            style={{ maxWidth: 200 }}
            value={refMonth}
            onChange={(e) => setCmpMonth(e.target.value)}
          >
            {(availableMonths.length ? availableMonths : [refMonth]).slice().reverse().map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
          <span style={{ color: "var(--muted)", fontSize: 13, fontWeight: 650 }}>comparado con</span>
          <select
            className="select"
            style={{ maxWidth: 220 }}
            value={cmpBasis}
            onChange={(e) => setCmpBasis(e.target.value as CmpBasis)}
          >
            <option value="prev">Mes anterior</option>
            <option value="avg3">Media de los 3 meses previos</option>
            <option value="year">Mismo mes del año pasado</option>
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
          <div className="empty">No hay datos del periodo de comparación ({comparison.baseLabel}).</div>
        ) : !comparison.rows.length ? (
          <div className="empty">Sin gastos que comparar en estos meses.</div>
        ) : (
          <>
            {monthInProgress && (
              <div className="filter-summary" style={{ marginBottom: 12 }}>
                <span>⚠ {monthLabel(refMonth)} aún está en curso: la comparación es parcial y casi todo aparecerá como recorte.</span>
              </div>
            )}

            <div className="filter-summary" style={{ marginBottom: 14 }}>
              <span>Recortado: <strong className="income amount-value">−{comparison.cut.toFixed(0)} €</strong></span>
              <span>Aumentado: <strong className="expense amount-value">+{comparison.up.toFixed(0)} €</strong></span>
              <span>
                Neto:{" "}
                <strong className={`amount-value ${netDelta <= 0 ? "income" : "expense"}`}>
                  {netDelta > 0 ? "+" : netDelta < 0 ? "−" : ""}{Math.abs(netDelta).toFixed(0)} €
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
                          <span className="cmp-label">{r.icon} {r.name}</span>
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
                            {r.delta > 0 ? "+" : r.delta < 0 ? "−" : ""}{Math.abs(r.delta).toFixed(0)} €
                          </span>
                          {r.before > 0 && dir !== "flat" && (
                            <span className="cmp-pct">({r.pct > 0 ? "+" : ""}{r.pct.toFixed(0)}%)</span>
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
              <span>Ordenado por mayor recorte · barra clara = tendencia últimos {TREND_MONTHS} meses · pulsa una fila para ver sus movimientos.</span>
            </div>
          </>
        )}
      </article>
    </>
  );
}
