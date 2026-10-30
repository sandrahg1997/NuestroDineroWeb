"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Money from "@/components/Money";
import type { Category } from "@/lib/types";
import { expenseByPeriod, periodEvolution, type HistoricoRow, type PeriodRow } from "@/lib/historico";
import { ArrowUpRight, CalendarRange, ReceiptText, Sparkles } from "lucide-react";
import EvolutionChart from "./historico/EvolutionChart";
import PeriodBalanceList from "./historico/PeriodBalanceList";
import CategoryComparison from "./historico/CategoryComparison";

export default function HistoricoCharts({
  transactions,
  categories,
  periods,
  hideAmounts,
}: {
  transactions: HistoricoRow[];
  categories: Category[];
  periods: PeriodRow[];
  hideAmounts?: boolean;
}) {
  const [categoryId, setCategoryId] = useState("");

  // Periodos ordenados por fecha de inicio (ascendente).
  const orderedPeriods = useMemo(
    () => [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [periods]
  );

  const filtered = useMemo(
    () => (categoryId ? transactions.filter((t) => t.category_id === categoryId) : transactions),
    [transactions, categoryId]
  );

  // Evolución: una barra por periodo (con el filtro de categoría aplicado).
  const { evolution, totalExpense, totalIncome, avgExpense, forecastExpense } = useMemo(
    () => periodEvolution(orderedPeriods, filtered),
    [orderedPeriods, filtered]
  );

  // La comparativa usa siempre todas las categorías, sin el filtro.
  const byPeriod = useMemo(() => expenseByPeriod(orderedPeriods, transactions), [orderedPeriods, transactions]);

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

  const metrics = [
    { label: "Gastado en total", value: totalExpense, icon: <ReceiptText size={20} />, tone: "expense" },
    { label: "Ingresado en total", value: totalIncome, icon: <ArrowUpRight size={20} />, tone: "income" },
    { label: "Promedio por periodo", value: avgExpense, icon: <CalendarRange size={20} />, tone: "saving" },
    { label: "Previsión próximo periodo", value: forecastExpense, icon: <Sparkles size={20} />, tone: "saving" },
  ];

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <select
          className="select"
          style={{ maxWidth: 260 }}
          aria-label="Filtrar por categoría"
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
        {metrics.map((m) => (
          <article className="dashboard-metric-card" key={m.label}>
            <div className={`metric-icon metric-icon-${m.tone}`} aria-hidden="true">
              {m.icon}
            </div>
            <div>
              <p className="metric-label">{m.label}</p>
              <p className="dashboard-metric-value">
                <Money value={m.value} />
              </p>
            </div>
          </article>
        ))}
      </section>

      <EvolutionChart evolution={evolution} hideAmounts={hideAmounts} />

      {evolution.length > 0 && <PeriodBalanceList evolution={evolution} totalBalance={totalIncome - totalExpense} />}

      <CategoryComparison orderedPeriods={orderedPeriods} byPeriod={byPeriod} categories={categories} />
    </>
  );
}
