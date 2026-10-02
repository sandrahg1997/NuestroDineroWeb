import AppShell from "@/components/AppShell";
import Money from "@/components/Money";
import PageHeader from "@/components/PageHeader";
import ReviewAgreements from "@/components/ReviewAgreements";
import { baselineDaily, challengeProgress, type Challenge } from "@/lib/challenges";
import { getSessionContext } from "@/lib/data";
import { computePeriodSummary } from "@/lib/period-summary";
import { buildPeriodReview } from "@/lib/review";
import type { Frequency, Period } from "@/lib/types";
import { dateKey, formatDateEs, monthlyEquivalent, transactionsHref } from "@/lib/utils";
import { CalendarRange, Handshake } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

type ReviewTx = {
  type: "expense" | "income";
  amount: number | string;
  date: string;
  concept: string;
  merchant: string;
  category_id: string | null;
  recurring_id: string | null;
  category: { name?: string; icon?: string } | null;
};

const TX_FIELDS = "type,amount,date,concept,merchant,category_id,recurring_id,category:categories(name,icon)";

function shiftDays(value: string, days: number) {
  const d = new Date(`${value}T12:00:00`);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

function Delta({ now, before, invert = false }: { now: number; before: number; invert?: boolean }) {
  if (before === 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  const good = invert ? pct <= 0 : pct >= 0;
  return (
    <span className={`metric-badge ${good ? "good" : "warn"}`}>
      {pct >= 0 ? "↑" : "↓"} {Math.abs(pct)}%
    </span>
  );
}

export default async function ReunionPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
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

  // Sin periodo anterior se compara con los mismos días justo antes.
  const length = Math.round(
    (new Date(`${period.end_date}T12:00:00`).getTime() - new Date(`${period.start_date}T12:00:00`).getTime()) / 86400000
  );
  const prevStart = previousPeriod?.start_date ?? shiftDays(period.start_date, -(length + 1));
  const prevEnd = previousPeriod?.end_date ?? shiftDays(period.start_date, -1);

  const [
    summary,
    { data: current },
    { data: previous },
    { data: recurring },
    { data: challengeData },
    { data: reviews },
  ] = await Promise.all([
    computePeriodSummary(supabase, householdId, period.start_date, period.end_date, period.id),
    supabase
      .from("transactions")
      .select(TX_FIELDS)
      .eq("household_id", householdId)
      .gte("date", period.start_date)
      .lte("date", period.end_date),
    supabase
      .from("transactions")
      .select(TX_FIELDS)
      .eq("household_id", householdId)
      .gte("date", prevStart)
      .lte("date", prevEnd),
    supabase
      .from("recurring_transactions")
      .select("amount,frequency")
      .eq("household_id", householdId)
      .eq("type", "expense")
      .eq("is_active", true),
    supabase
      .from("challenges")
      .select("*")
      .eq("household_id", householdId)
      .lte("start_date", period.end_date)
      .gte("end_date", period.start_date),
    supabase
      .from("period_reviews")
      .select("period_id,agreements")
      .in("period_id", [period.id, ...(previousPeriod ? [previousPeriod.id] : [])]),
  ]);

  const rows = (current ?? []) as unknown as ReviewTx[];
  const previousRows = (previous ?? []) as unknown as ReviewTx[];
  const recurringMonthly = ((recurring ?? []) as { amount: number | string; frequency: Frequency }[]).reduce(
    (t, r) => t + monthlyEquivalent(Number(r.amount), r.frequency),
    0
  );

  const review = buildPeriodReview({
    rows,
    previousRows: previousRows.length ? previousRows : null,
    budgets: summary.budgets,
    recurringMonthly,
  });

  // Retos que han coincidido con el periodo, con su resultado.
  const challenges = (challengeData ?? []) as Challenge[];
  let challengeResults: { challenge: Challenge; progress: ReturnType<typeof challengeProgress> }[] = [];
  if (challenges.length) {
    const from = challenges.reduce((min, c) => (c.start_date < min ? c.start_date : min), challenges[0].start_date);
    const to = challenges.reduce((max, c) => (c.end_date > max ? c.end_date : max), challenges[0].end_date);
    const { data: ctx } = await supabase
      .from("transactions")
      .select("type,amount,date,concept,merchant,category_id,recurring_id")
      .eq("household_id", householdId)
      .eq("type", "expense")
      .gte("date", shiftDays(from, -56))
      .lte("date", to);
    const txs = (ctx ?? []) as ReviewTx[];
    challengeResults = challenges.map((c) => ({
      challenge: c,
      progress: challengeProgress(c, txs, today, baselineDaily(c, txs)),
    }));
  }
  const challengesWon = challengeResults.filter((c) => c.progress.status === "won" || c.progress.status === "active");
  const challengesLost = challengeResults.filter((c) => c.progress.status === "lost" || c.progress.status === "broken");

  const agreements = (reviews ?? []).find((r) => r.period_id === period.id)?.agreements ?? "";
  const previousAgreements = previousPeriod
    ? ((reviews ?? []).find((r) => r.period_id === previousPeriod.id)?.agreements ?? "")
    : "";

  const prevLabel = previousPeriod ? previousPeriod.name : "los días anteriores";
  const recentPeriods = periods.slice(-6).reverse();
  const wentWell = review.cuts.length + review.budgetsMet.length + challengesWon.length > 0;
  const wentBad = review.rises.length + review.budgetsOver.length + challengesLost.length > 0;

  return (
    <AppShell households={households} hideAmounts={hideAmounts}>
      <PageHeader
        title="Reunión del mes"
        subtitle={`${period.name} · ${formatDateEs(period.start_date)} – ${formatDateEs(period.end_date)}`}
      />

      {recentPeriods.length > 1 && (
        <div className="chip-row" style={{ marginBottom: 18 }}>
          {recentPeriods.map((p) => (
            <Link key={p.id} href={`/reunion?period=${p.id}`} className={`chip ${p.id === period.id ? "active" : ""}`}>
              {p.name}
            </Link>
          ))}
        </div>
      )}

      {!rows.length ? (
        <div className="card empty">
          <span className="empty-icon">
            <CalendarRange size={22} />
          </span>
          <strong>No hay movimientos en este periodo</strong>
          <p>Cuando haya gastos e ingresos podréis revisarlo aquí juntos.</p>
        </div>
      ) : (
        <>
          <section className="dashboard-metrics">
            <article className="dashboard-metric-card">
              <div>
                <p className="metric-label">Ingresos</p>
                <p className="dashboard-metric-value">
                  <Money value={review.income} />
                </p>
              </div>
              {review.previous && <Delta now={review.income} before={review.previous.income} />}
            </article>
            <article className="dashboard-metric-card">
              <div>
                <p className="metric-label">Gastos</p>
                <p className="dashboard-metric-value">
                  <Money value={review.expense} />
                </p>
              </div>
              {review.previous && <Delta now={review.expense} before={review.previous.expense} invert />}
            </article>
            <article className="dashboard-metric-card">
              <div>
                <p className="metric-label">Ahorro</p>
                <p className={`dashboard-metric-value ${review.balance >= 0 ? "income" : "expense"}`}>
                  <Money value={review.balance} />
                </p>
              </div>
              <span
                className={`metric-badge ${review.savingsRate >= 20 ? "good" : review.savingsRate < 0 ? "warn" : "neutral"}`}
              >
                {review.savingsRate}%
              </span>
            </article>
          </section>
          {review.previous && <p className="subtitle review-compare">Comparado con {prevLabel}.</p>}

          <section className="review-grid">
            <article className="card">
              <span className="eyebrow">💚 Lo que fue bien</span>
              {wentWell ? (
                <ul className="review-list">
                  {review.cuts.map((c) => (
                    <li key={`cut-${c.name}`}>
                      <Link
                        href={transactionsHref({
                          type: "expense",
                          category: c.categoryId,
                          from: period.start_date,
                          to: period.end_date,
                        })}
                      >
                        {c.icon ? `${c.icon} ` : ""}
                        {c.name}
                      </Link>
                      <span className="income">
                        −<Money value={-c.delta} />
                      </span>
                    </li>
                  ))}
                  {review.budgetsMet.map((b) => (
                    <li key={`met-${b.name}`}>
                      <span>✅ {b.name} dentro del presupuesto</span>
                      <span className="subtitle">
                        <Money value={b.spent} /> / <Money value={b.amount} />
                      </span>
                    </li>
                  ))}
                  {challengesWon.map(({ challenge, progress }) => (
                    <li key={`won-${challenge.id}`}>
                      <span>
                        {challenge.icon} {challenge.title} {progress.status === "won" ? "superado" : "en marcha"}
                      </span>
                      {progress.estimatedSaved > 0 && (
                        <span className="income">
                          ~<Money value={progress.estimatedSaved} />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="subtitle">Sin grandes recortes esta vez. Las propuestas de abajo pueden ayudar.</p>
              )}
            </article>

            <article className="card">
              <span className="eyebrow">🔥 Dónde os pasasteis</span>
              {wentBad ? (
                <ul className="review-list">
                  {review.budgetsOver.map((b) => (
                    <li key={`over-${b.name}`}>
                      <span>
                        {b.icon ? `${b.icon} ` : "⚠️ "}
                        {b.name}: presupuesto superado
                      </span>
                      <span className="expense">
                        +<Money value={b.over} />
                      </span>
                    </li>
                  ))}
                  {review.rises.map((c) => (
                    <li key={`rise-${c.name}`}>
                      <Link
                        href={transactionsHref({
                          type: "expense",
                          category: c.categoryId,
                          from: period.start_date,
                          to: period.end_date,
                        })}
                      >
                        {c.icon ? `${c.icon} ` : ""}
                        {c.name}
                      </Link>
                      <span className="expense">
                        +<Money value={c.delta} />
                      </span>
                    </li>
                  ))}
                  {challengesLost.map(({ challenge }) => (
                    <li key={`lost-${challenge.id}`}>
                      <span>
                        {challenge.icon} {challenge.title}: no salió
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="subtitle">Nada que destacar: ¡buen trabajo! 🎉</p>
              )}
            </article>
          </section>

          {review.proposals.length > 0 && (
            <section className="card" style={{ marginBottom: 18 }}>
              <span className="eyebrow">💡 Propuestas para el siguiente periodo</span>
              <ul className="review-list proposals">
                {review.proposals.map((p, i) => (
                  <li key={i}>
                    <span className="proposal-icon">{p.icon}</span>
                    <span className="proposal-text">{p.text}</span>
                    {p.href && (
                      <Link href={p.href} className="btn btn-soft">
                        Ir
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="review-grid">
        {previousPeriod && (
          <article className="card">
            <span className="eyebrow">📝 Lo que acordasteis en {previousPeriod.name}</span>
            {previousAgreements ? (
              <p className="review-agreements">{previousAgreements}</p>
            ) : (
              <p className="subtitle">No apuntasteis acuerdos en la reunión anterior.</p>
            )}
          </article>
        )}
        <article className="card">
          <span className="eyebrow">
            <Handshake size={13} style={{ verticalAlign: "-2px" }} /> Acuerdos de esta reunión
          </span>
          <p className="subtitle" style={{ marginBottom: 10 }}>
            Apuntad lo que decidáis; lo veréis en la próxima reunión para ver si se ha cumplido.
          </p>
          <ReviewAgreements householdId={householdId} periodId={period.id} initial={agreements} />
        </article>
      </section>
    </AppShell>
  );
}
