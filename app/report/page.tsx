import AppShell from "@/components/AppShell";
import Money from "@/components/Money";
import PageHeader from "@/components/PageHeader";
import ExportButton from "@/components/ExportButton";
import PrintButton from "@/components/PrintButton";
import { reportSheets } from "@/lib/export-sheets";
import { getSessionContext } from "@/lib/data";
import { fetchAll } from "@/lib/fetch-all";
import { daysLeftLabel, goalProgress, type Contribution, type Goal } from "@/lib/goals";
import { computePeriodSummary } from "@/lib/period-summary";
import { buildReportData, inclusiveDays, percentChange, type ReportRow } from "@/lib/report";
import type { Period } from "@/lib/types";
import { dateKey, formatDateEs } from "@/lib/utils";
import Link from "next/link";
import { redirect } from "next/navigation";

function shiftDays(value: string, days: number) {
  const d = new Date(`${value}T12:00:00`);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

function Delta({ now, before, invert = false }: { now: number; before: number; invert?: boolean }) {
  const pct = percentChange(now, before);
  if (pct === null) return null;
  const good = invert ? pct <= 0 : pct >= 0;
  return (
    <span className={`report-delta ${good ? "good" : "warn"}`}>
      {pct >= 0 ? "↑" : "↓"} {Math.abs(pct)}% vs. periodo anterior
    </span>
  );
}

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: requested } = await searchParams;
  const { supabase, user, householdId, households, activePeriod, hideAmounts } = await getSessionContext();
  if (!user) redirect("/login");
  if (!householdId) redirect("/settings");

  const { data: periodData } = await supabase
    .from("periods")
    .select("id,household_id,name,start_date,end_date,created_at")
    .eq("household_id", householdId)
    .order("start_date", { ascending: true });
  const periods = (periodData ?? []) as Period[];
  if (!periods.length) redirect("/periods");

  // Por defecto, el último periodo ya cerrado; si no hay ninguno, el activo.
  const today = dateKey();
  const period =
    periods.find((p) => p.id === requested) ??
    [...periods].reverse().find((p) => p.end_date < today) ??
    periods.find((p) => p.id === activePeriod?.id) ??
    periods[periods.length - 1];
  const index = periods.findIndex((p) => p.id === period.id);
  const previousPeriod = index > 0 ? periods[index - 1] : null;
  const days = inclusiveDays(period.start_date, period.end_date);
  // Sin periodo anterior se compara con los mismos días justo antes.
  const prevStart = previousPeriod?.start_date ?? shiftDays(period.start_date, -days);
  const prevEnd = previousPeriod?.end_date ?? shiftDays(period.start_date, -1);

  const [summary, { data: previousRows }, { data: goalRows }, { data: contributionRows }, { data: review }] =
    await Promise.all([
      computePeriodSummary(supabase, householdId, period.start_date, period.end_date, period.id),
      fetchAll((from, to) =>
        supabase
          .from("transactions")
          .select("type,amount")
          .eq("household_id", householdId)
          .gte("date", prevStart)
          .lte("date", prevEnd)
          .order("id")
          .range(from, to)
      ),
      // Si las tablas de objetivos aún no existen, vienen vacías.
      supabase.from("savings_goals").select("*").eq("household_id", householdId).order("created_at"),
      supabase.from("savings_contributions").select("*").eq("household_id", householdId),
      supabase.from("period_reviews").select("agreements").eq("period_id", period.id).maybeSingle(),
    ]);

  const rows = summary.rows as unknown as ReportRow[];
  const report = buildReportData(rows, previousRows?.length ? previousRows : null, days);
  const goals = ((goalRows ?? []) as Goal[]).map((goal) => {
    const own = ((contributionRows ?? []) as Contribution[]).filter((c) => c.goal_id === goal.id);
    return {
      goal,
      progress: goalProgress(goal, own, today),
      inPeriod: own
        .filter((c) => c.date >= period.start_date && c.date <= period.end_date)
        .reduce((t, c) => t + Number(c.amount), 0),
    };
  });
  const agreements = (review?.agreements ?? "").trim();
  const householdName = households.find((h) => h.household_id === householdId)?.name ?? "Nuestro hogar";
  const recent = periods.slice(-6).reverse();
  const excelSheets = reportSheets({
    periodName: period.name,
    start: period.start_date,
    end: period.end_date,
    report,
    budgets: summary.budgets.map((b) => ({ name: b.name, amount: b.amount, spent: b.spent })),
    transactions: rows,
  });

  return (
    <AppShell households={households} hideAmounts={hideAmounts}>
      <div className="no-print">
        <PageHeader
          title="Informe del periodo"
          subtitle="Un resumen para guardar en PDF o imprimir y llevar a la reunión."
          actions={
            <div className="toolbar no-print" style={{ gap: 8 }}>
              <ExportButton sheets={excelSheets} fileName={`ourmoney-informe-${period.start_date}.xlsx`} />
              <PrintButton />
            </div>
          }
        />
        {recent.length > 1 && (
          <div className="chip-row" style={{ marginBottom: 18 }}>
            {recent.map((p) => (
              <Link key={p.id} href={`/report?period=${p.id}`} className={`chip ${p.id === period.id ? "active" : ""}`}>
                {p.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      <article className="report">
        <header className="report-head">
          <span className="eyebrow">OurMoney · {householdName}</span>
          <h1>{period.name}</h1>
          <p className="subtitle">
            {formatDateEs(period.start_date)} – {formatDateEs(period.end_date)} · generado el {formatDateEs(today)}
          </p>
        </header>

        {!rows.length ? (
          <p className="subtitle">No hay movimientos en este periodo.</p>
        ) : (
          <>
            <section className="report-metrics">
              <div className="report-block">
                <span className="metric-label">Ingresos</span>
                <strong>
                  <Money value={report.income} />
                </strong>
                {report.previous && <Delta now={report.income} before={report.previous.income} />}
              </div>
              <div className="report-block">
                <span className="metric-label">Gastos</span>
                <strong>
                  <Money value={report.expense} />
                </strong>
                {report.previous && <Delta now={report.expense} before={report.previous.expense} invert />}
              </div>
              <div className="report-block">
                <span className="metric-label">Ahorro</span>
                <strong className={report.balance >= 0 ? "income" : "expense"}>
                  <Money value={report.balance} />
                </strong>
                <span className="report-delta">{report.savingsRate}% de los ingresos</span>
              </div>
            </section>

            <section className="report-block">
              <h2>Gasto por categoría</h2>
              <p className="subtitle">
                Media de <Money value={report.dailyAverage} /> al día · fijos <Money value={report.fixed} /> · variables{" "}
                <Money value={report.variable} />
              </p>
              <ul className="report-list">
                {report.categories.map((c) => (
                  <li key={c.name}>
                    <span>{c.name}</span>
                    <div className="progress" aria-hidden="true">
                      <span style={{ width: `${c.pct}%` }} />
                    </div>
                    <span className="report-amount">
                      <Money value={c.value} /> <small>{c.pct}%</small>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {summary.budgets.length > 0 && (
              <section className="report-block">
                <h2>Presupuestos</h2>
                <ul className="report-list">
                  {summary.budgets.map((b) => (
                    <li key={b.id}>
                      <span>
                        {b.icon ? `${b.icon} ` : ""}
                        {b.name}
                      </span>
                      <div className="progress" aria-hidden="true">
                        <span style={{ width: `${Math.min(100, b.percentage)}%` }} />
                      </div>
                      <span className={`report-amount ${b.percentage > 100 ? "expense" : ""}`}>
                        <Money value={b.spent} /> / <Money value={b.amount} /> <small>{b.percentage}%</small>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="report-cols">
              <div className="report-block">
                <h2>Mayores gastos</h2>
                <ul className="report-simple">
                  {report.biggest.map((b, i) => (
                    <li key={i}>
                      <span>
                        {b.label}
                        <small>
                          {formatDateEs(b.date)} · {b.category}
                        </small>
                      </span>
                      <strong>
                        <Money value={b.amount} />
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="report-block">
                <h2>Dónde más gastasteis</h2>
                <ul className="report-simple">
                  {report.topMerchants.map((m) => (
                    <li key={m.name}>
                      <span>
                        {m.name}
                        <small>
                          {m.count} {m.count === 1 ? "compra" : "compras"}
                        </small>
                      </span>
                      <strong>
                        <Money value={m.total} />
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </>
        )}

        {goals.length > 0 && (
          <section className="report-block">
            <h2>Objetivos de ahorro</h2>
            <ul className="report-list">
              {goals.map(({ goal, progress, inPeriod }) => (
                <li key={goal.id}>
                  <span>
                    {goal.icon} {goal.title}
                    {goal.target_date && <small>{daysLeftLabel(progress.daysLeft)}</small>}
                  </span>
                  <div className="progress" aria-hidden="true">
                    <span style={{ width: `${progress.pct}%` }} />
                  </div>
                  <span className="report-amount">
                    <Money value={progress.saved} /> / <Money value={Number(goal.target_amount)} />{" "}
                    <small>
                      {progress.pct}%
                      {inPeriod !== 0 && (
                        <>
                          {" "}
                          · {inPeriod > 0 ? "+" : "−"}
                          <Money value={Math.abs(inPeriod)} /> este periodo
                        </>
                      )}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {agreements && (
          <section className="report-block">
            <h2>Acuerdos de la reunión</h2>
            <p className="review-agreements">{agreements}</p>
          </section>
        )}
      </article>
    </AppShell>
  );
}
