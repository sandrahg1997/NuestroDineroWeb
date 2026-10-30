import Link from "next/link";
import Money from "@/components/Money";
import type { PeriodPoint } from "@/lib/historico";
import { transactionsHref } from "@/lib/utils";

// Lista periodo a periodo (del más reciente al más antiguo) con lo ingresado,
// lo gastado y la diferencia, más el total acumulado.
export default function PeriodBalanceList({
  evolution,
  totalBalance,
}: {
  evolution: PeriodPoint[];
  totalBalance: number;
}) {
  return (
    <article className="card period-balance-card">
      <div className="section-head dashboard-section-head">
        <div>
          <span className="eyebrow">Periodo a periodo</span>
          <h2>Ingresos, gastos y diferencia</h2>
        </div>
      </div>
      <div className="period-balance-list">
        {[...evolution].reverse().map((p) => (
          <Link key={p.id} href={transactionsHref({ from: p.start, to: p.end })} className="period-balance-row">
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
                {p.balance > 0 ? "+" : p.balance < 0 ? "−" : ""}
                <Money value={Math.abs(p.balance)} />
              </strong>
              <span>{p.balance > 0 ? "Ahorrado" : p.balance < 0 ? "Perdido" : "En equilibrio"}</span>
            </div>
          </Link>
        ))}
      </div>
      <div className="period-balance-total">
        <span>
          Total en {evolution.length} periodo{evolution.length === 1 ? "" : "s"}
        </span>
        <strong className={totalBalance >= 0 ? "income" : "expense"}>
          {totalBalance > 0 ? "+" : totalBalance < 0 ? "−" : ""}
          <Money value={Math.abs(totalBalance)} /> {totalBalance >= 0 ? "ahorrados" : "perdidos"}
        </strong>
      </div>
    </article>
  );
}
