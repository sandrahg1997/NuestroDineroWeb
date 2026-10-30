"use client";

import { Bar, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PeriodPoint } from "@/lib/historico";
import { useChartTheme } from "@/lib/useChartTheme";

const MAX_BARS = 12;

const axisLabel = (v: string) => (v.length > 12 ? `${v.slice(0, 11)}…` : v);

// Barras de gasto e ingreso y línea de balance, una por periodo (los últimos 12).
export default function EvolutionChart({
  evolution,
  hideAmounts,
}: {
  evolution: PeriodPoint[];
  hideAmounts?: boolean;
}) {
  const chart = useChartTheme();
  const periodsTracked = evolution.length;
  const evolutionChart = evolution.slice(-MAX_BARS);

  return (
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
            <ComposedChart data={evolutionChart} margin={{ top: 10, right: 6, left: -18, bottom: 0 }}>
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
                  formatter={(value: number, name: string) => [
                    `${name === "Balance" && value > 0 ? "+" : ""}${value.toFixed(2)} €`,
                    name,
                  ]}
                />
              )}
              <ReferenceLine y={0} stroke={chart.grid} />
              <Bar dataKey="expense" name="Gastos" radius={[6, 6, 0, 0]}>
                {evolutionChart.map((p) => (
                  <Cell key={`e-${p.id}`} fill="#c0587a" />
                ))}
              </Bar>
              <Bar dataKey="income" name="Ingresos" radius={[6, 6, 0, 0]}>
                {evolutionChart.map((p) => (
                  <Cell key={`i-${p.id}`} fill="#5f9e80" />
                ))}
              </Bar>
              <Line
                dataKey="balance"
                name="Balance"
                type="monotone"
                stroke="#c99a4b"
                strokeWidth={2}
                dot={{ r: 3, fill: "#c99a4b", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
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
        <span>
          <i className="chart-key balance-key" /> Balance
        </span>
        {periodsTracked > MAX_BARS && (
          <span>
            Mostrando los últimos {MAX_BARS} de {periodsTracked} periodos.
          </span>
        )}
      </div>
    </article>
  );
}
