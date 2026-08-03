"use client";

import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLORS = ["#8b5cf6", "#ec4899", "#3b82f6", "#10b981", "#f59e0b", "#6366f1"];

export default function DashboardCharts({
  byCategory,
  byDay,
}: {
  byCategory: { name: string; value: number }[];
  byDay: { day: string; expense: number; income: number }[];
}) {
  return (
    <section className="dashboard-charts">
      <article className="card chart-card">
        <div className="section-head dashboard-section-head">
          <div>
            <span className="eyebrow">Distribución</span>
            <h2>Gastos por categoría</h2>
          </div>
        </div>
        {byCategory.length ? (
          <div className="category-chart-layout">
            <div className="category-donut">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={66} outerRadius={96} paddingAngle={4} stroke="none">
                    {byCategory.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${value.toFixed(2)} €`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-label"><strong>{byCategory.length}</strong><span>categorías</span></div>
            </div>
            <div className="category-legend">
              {byCategory.slice(0, 5).map((item, index) => (
                <div className="legend-row" key={item.name}>
                  <span className="legend-dot" style={{ background: COLORS[index % COLORS.length] }} />
                  <span>{item.name}</span>
                  <strong>{item.value.toFixed(0)} €</strong>
                </div>
              ))}
            </div>
          </div>
        ) : <div className="empty">Sin gastos en este periodo.</div>}
      </article>

      <article className="card chart-card">
        <div className="section-head dashboard-section-head">
          <div>
            <span className="eyebrow">Ritmo del periodo</span>
            <h2>Evolución diaria</h2>
          </div>
        </div>
        <div className="area-chart-wrap">
          {byDay.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={byDay} margin={{ top: 10, right: 6, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ec4899" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#ec4899" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#8b8494", fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#8b8494", fontSize: 12 }} />
                <Tooltip formatter={(value: number) => `${value.toFixed(2)} €`} />
                <Area type="monotone" dataKey="expense" name="Gastos" stroke="#ec4899" strokeWidth={3} fill="url(#expenseFill)" />
                <Area type="monotone" dataKey="income" name="Ingresos" stroke="#10b981" strokeWidth={3} fill="url(#incomeFill)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div className="empty">Todavía no hay movimientos suficientes.</div>}
        </div>
        <div className="chart-caption"><span><i className="chart-key expense-key" /> Gastos</span><span><i className="chart-key income-key" /> Ingresos</span></div>
      </article>
    </section>
  );
}
