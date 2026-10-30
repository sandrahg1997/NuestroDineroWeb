"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import Money from "@/components/Money";
import type { Category } from "@/lib/types";
import { compareCategories, defaultReferencePeriod, NO_CATEGORY, type CmpBasis, type PeriodRow } from "@/lib/historico";
import { categoryColor, dateKey, transactionsHref } from "@/lib/utils";

type CmpView = "all" | "cuts" | "ups";

// Comparativa de gasto por categoría entre el periodo elegido y una base.
export default function CategoryComparison({
  orderedPeriods,
  byPeriod,
  categories,
}: {
  orderedPeriods: PeriodRow[];
  byPeriod: Map<string, Map<string, number>>;
  categories: Category[];
}) {
  const [cmpPeriodId, setCmpPeriodId] = useState("");
  const [cmpBasis, setCmpBasis] = useState<CmpBasis>("prev");
  const [cmpView, setCmpView] = useState<CmpView>("all");

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const defaultRefId = useMemo(() => defaultReferencePeriod(orderedPeriods, byPeriod), [orderedPeriods, byPeriod]);

  const refId = cmpPeriodId || defaultRefId;
  const refIndex = orderedPeriods.findIndex((p) => p.id === refId);
  const refPeriod = refIndex >= 0 ? orderedPeriods[refIndex] : undefined;

  const todayKey = dateKey();
  const periodInProgress = !!refPeriod && todayKey >= refPeriod.start_date && todayKey <= refPeriod.end_date;

  const comparison = useMemo(
    () => compareCategories(orderedPeriods, byPeriod, refIndex, cmpBasis, (id) => catMap.get(id)),
    [orderedPeriods, byPeriod, refIndex, cmpBasis, catMap]
  );

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

  return (
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
          aria-label="Periodo a comparar"
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
          aria-label="Comparar con"
          value={cmpBasis}
          onChange={(e) => setCmpBasis(e.target.value as CmpBasis)}
        >
          <option value="prev">Periodo anterior</option>
          <option value="avg3">Media de los 3 periodos previos</option>
          <option value="year">Mismo periodo del año pasado</option>
        </select>
      </div>

      {comparison.hasBaseData && comparison.rows.length > 0 && (
        <div className="chip-row" style={{ marginBottom: 14 }} role="group" aria-label="Mostrar">
          <button
            type="button"
            className={`chip${cmpView === "all" ? " active" : ""}`}
            aria-pressed={cmpView === "all"}
            onClick={() => setCmpView("all")}
          >
            Todo ({comparison.rows.length})
          </button>
          <button
            type="button"
            className={`chip${cmpView === "cuts" ? " active" : ""}`}
            aria-pressed={cmpView === "cuts"}
            onClick={() => setCmpView("cuts")}
          >
            Solo recortes ({comparison.cutCount})
          </button>
          <button
            type="button"
            className={`chip${cmpView === "ups" ? " active" : ""}`}
            aria-pressed={cmpView === "ups"}
            onClick={() => setCmpView("ups")}
          >
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
                        <DirIcon size={14} aria-hidden="true" />
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
              Ordenado por mayor recorte · barra clara = tendencia últimos {comparison.trendCount} periodos · pulsa una
              fila para ver sus movimientos.
            </span>
          </div>
        </>
      )}
    </article>
  );
}
