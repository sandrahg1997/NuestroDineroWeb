"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Money from "@/components/Money";
import { sumPeriods, type PeriodPoint } from "@/lib/historico";
import { transactionsHref } from "@/lib/utils";

// La selección se recuerda en este dispositivo.
const STORAGE_KEY = "ourmoney_historico_selected_periods";

const sign = (value: number) => (value > 0 ? "+" : value < 0 ? "−" : "");

// Lista periodo a periodo (del más reciente al más antiguo) con lo ingresado,
// lo gastado y la diferencia. Abajo, el total acumulado o, si se marcan
// periodos, la suma solo de esos.
export default function PeriodBalanceList({
  evolution,
  totalBalance,
}: {
  evolution: PeriodPoint[];
  totalBalance: number;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (Array.isArray(saved)) setSelected(new Set(saved.filter((id) => typeof id === "string")));
    } catch {
      // Sin almacenamiento (modo privado…): la selección solo dura esta visita.
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...selected]));
    } catch {
      // Ídem: no se puede guardar, pero la selección sigue funcionando.
    }
  }, [selected, restored]);
  const sum = useMemo(() => sumPeriods(evolution, selected), [evolution, selected]);
  const allSelected = sum.count === evolution.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <article className="card period-balance-card">
      <div className="section-head dashboard-section-head">
        <div>
          <span className="eyebrow">Periodo a periodo</span>
          <h2>Ingresos, gastos y diferencia</h2>
        </div>
        {evolution.length > 1 && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setSelected(allSelected ? new Set() : new Set(evolution.map((p) => p.id)))}
          >
            {allSelected ? "Quitar selección" : "Marcar todos"}
          </button>
        )}
      </div>
      <div className="period-balance-list">
        {[...evolution].reverse().map((p) => (
          <div key={p.id} className={`period-balance-item${selected.has(p.id) ? " selected" : ""}`}>
            <input
              type="checkbox"
              className="period-balance-check"
              checked={selected.has(p.id)}
              onChange={() => toggle(p.id)}
              aria-label={`Sumar ${p.label}`}
            />
            <Link href={transactionsHref({ from: p.start, to: p.end })} className="period-balance-row">
              <div className="period-balance-main">
                <strong>{p.label}</strong>
                <span>
                  <span className="income">
                    +<Money value={p.income} />
                  </span>{" "}
                  ·{" "}
                  <span className="expense">
                    −<Money value={p.expense} />
                  </span>
                </span>
              </div>
              <div className={`period-balance-diff ${p.balance >= 0 ? "income" : "expense"}`}>
                <strong>
                  {sign(p.balance)}
                  <Money value={Math.abs(p.balance)} />
                </strong>
                <span>{p.balance > 0 ? "Ahorrado" : p.balance < 0 ? "Perdido" : "En equilibrio"}</span>
              </div>
            </Link>
          </div>
        ))}
      </div>
      {sum.count > 0 ? (
        <div className="period-balance-total period-balance-selection" aria-live="polite">
          <span>
            {sum.count} periodo{sum.count === 1 ? "" : "s"} seleccionado{sum.count === 1 ? "" : "s"}
          </span>
          <dl>
            <div>
              <dt>Ingresos</dt>
              <dd className="income">
                +<Money value={sum.income} />
              </dd>
            </div>
            <div>
              <dt>Gastos</dt>
              <dd className="expense">
                −<Money value={sum.expense} />
              </dd>
            </div>
            <div>
              <dt>Diferencia</dt>
              <dd className={sum.balance >= 0 ? "income" : "expense"}>
                {sign(sum.balance)}
                <Money value={Math.abs(sum.balance)} />
              </dd>
            </div>
            {sum.count > 1 && (
              <>
                <div>
                  <dt>Gasto medio</dt>
                  <dd className="expense">
                    −<Money value={sum.avgExpense} />
                  </dd>
                </div>
                <div>
                  <dt>Diferencia media</dt>
                  <dd className={sum.avgBalance >= 0 ? "income" : "expense"}>
                    {sign(sum.avgBalance)}
                    <Money value={Math.abs(sum.avgBalance)} />
                  </dd>
                </div>
              </>
            )}
            {sum.savingsRate !== null && (
              <div>
                <dt>Ahorro</dt>
                <dd className={sum.savingsRate >= 0 ? "income" : "expense"}>{sum.savingsRate} % de lo ingresado</dd>
              </div>
            )}
          </dl>
        </div>
      ) : (
        <div className="period-balance-total">
          <span>
            Total en {evolution.length} periodo{evolution.length === 1 ? "" : "s"}
            {evolution.length > 1 && <small> · marca periodos para sumarlos</small>}
          </span>
          <strong className={totalBalance >= 0 ? "income" : "expense"}>
            {sign(totalBalance)}
            <Money value={Math.abs(totalBalance)} /> {totalBalance >= 0 ? "ahorrados" : "perdidos"}
          </strong>
        </div>
      )}
    </article>
  );
}
