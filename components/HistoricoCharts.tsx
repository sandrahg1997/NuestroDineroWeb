"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Money from "@/components/Money";
import type { Category } from "@/lib/types";
import { dateKey, monthLabel, monthRange, nextMonthKey } from "@/lib/utils";
import { ArrowUpRight, CalendarRange, ReceiptText, Sparkles } from "lucide-react";

type Row = { date: string; amount: number; type: "expense" | "income"; category_id: string | null };
type MonthPoint = { month: string; label: string; expense: number; income: number; forecast: boolean };

const FORECAST_MONTHS = 3;
const FORECAST_SAMPLE = 3;

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
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#8b8494", fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#8b8494", fontSize: 12 }} />
                {!hideAmounts && (
                  <Tooltip
                    formatter={(value: number, name: string, item: any) => [`${value.toFixed(2)} €`, item?.payload?.forecast ? `${name} (previsión)` : name]}
                  />
                )}
                {firstForecastLabel && <ReferenceLine x={firstForecastLabel} stroke="#c9c1d4" strokeDasharray="4 4" />}
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
    </>
  );
}
