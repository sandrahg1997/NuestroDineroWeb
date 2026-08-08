import AppShell from "@/components/AppShell";
import DashboardChartsLoader from "@/components/DashboardChartsLoader";
import Money from "@/components/Money";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import { getSessionContext } from "@/lib/data";
import { computePeriodSummary } from "@/lib/period-summary";
import { categoryColor, formatDateEs, relativeDayLabel } from "@/lib/utils";
import { ArrowUpRight, PiggyBank, ReceiptText, Star, WalletCards } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

async function markActive(formData: FormData) {
  "use server";
  const periodId = String(formData.get("periodId") ?? "");
  const { supabase, householdId } = await getSessionContext();
  if (householdId && periodId) {
    await supabase.from("households").update({ active_period_id: periodId }).eq("id", householdId);
  }
  redirect(`/periods/${periodId}`);
}

export default async function PeriodDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, householdId, households, activePeriod, hideAmounts } = await getSessionContext();
  if (!user) redirect("/login");
  if (!householdId) redirect("/settings");

  const { data: period } = await supabase.from("periods").select("*").eq("id", id).eq("household_id", householdId).maybeSingle();
  if (!period) notFound();

  const summary = await computePeriodSummary(supabase, householdId, period.start_date, period.end_date, period.id);
  const { expense, income, balance, savingsRate, categoryData, byDay, topCategory, budgetTotal, budgetSpent, budgetPercentage, rows } = summary;
  const isActive = activePeriod?.id === period.id;

  return (
    <AppShell households={households} hideAmounts={hideAmounts}>
      <PageHeader
        title={period.name}
        subtitle={`${formatDateEs(period.start_date)} – ${formatDateEs(period.end_date)}`}
        actions={<Link href="/periods" className="btn btn-soft">Volver a periodos</Link>}
      />

      <section className="dashboard-hero">
        <div className="hero-copy">
          {isActive ? (
            <div className="hero-kicker"><Star size={15} /> Periodo activo</div>
          ) : (
            <form action={markActive}>
              <input type="hidden" name="periodId" value={period.id} />
              <SubmitButton className="btn btn-soft" pendingText="Activando…">Marcar como activo</SubmitButton>
            </form>
          )}
          <p className="hero-label" style={{ marginTop: 16 }}>Balance del periodo</p>
          <h1 className={balance >= 0 ? "hero-balance positive" : "hero-balance negative"}><Money value={balance} /></h1>
        </div>
        <div className="hero-orb" aria-hidden="true"><WalletCards size={54} /></div>
        <div className="hero-glow hero-glow-one" />
        <div className="hero-glow hero-glow-two" />
      </section>

      <section className="dashboard-metrics">
        <article className="dashboard-metric-card">
          <div className="metric-icon metric-icon-expense"><ReceiptText size={20} /></div>
          <div>
            <p className="metric-label">Gastado</p>
            <p className="dashboard-metric-value"><Money value={expense} /></p>
          </div>
        </article>

        <article className="dashboard-metric-card">
          <div className="metric-icon metric-icon-income"><ArrowUpRight size={20} /></div>
          <div>
            <p className="metric-label">Ingresos</p>
            <p className="dashboard-metric-value"><Money value={income} /></p>
          </div>
        </article>

        <article className="dashboard-metric-card">
          <div className="metric-icon metric-icon-saving"><PiggyBank size={20} /></div>
          <div>
            <p className="metric-label">Tasa de ahorro</p>
            <p className="dashboard-metric-value">{savingsRate}%</p>
          </div>
        </article>
      </section>

      <section className="dashboard-insights">
        <article className="budget-card">
          <div className="section-head dashboard-section-head">
            <div>
              <span className="eyebrow">Presupuesto del periodo</span>
              <h2>{budgetTotal ? <><Money value={budgetSpent} /> de <Money value={budgetTotal} /></> : "Sin presupuesto configurado"}</h2>
            </div>
            {budgetTotal > 0 && <strong>{budgetPercentage}%</strong>}
          </div>
          <div className="budget-track">
            <span
              className={budgetPercentage >= 100 ? "over" : budgetPercentage >= 85 ? "warn" : ""}
              style={{ width: `${Math.min(100, budgetPercentage)}%` }}
            />
          </div>
        </article>

        <article className="insight-card">
          <span className="eyebrow">Dato destacado</span>
          <div className="insight-icon">{topCategory ? "🏆" : "🌱"}</div>
          <h2>{topCategory ? topCategory.name : "Sin datos"}</h2>
          <p>{topCategory ? <>Es tu categoría con más gasto: <Money value={topCategory.value} />.</> : "No hay movimientos en este periodo."}</p>
        </article>
      </section>

      <DashboardChartsLoader byCategory={categoryData} byDay={byDay} hideAmounts={hideAmounts} />

      <div className="section-head recent-head">
        <div>
          <span className="eyebrow">Movimientos</span>
          <h2>Del periodo</h2>
        </div>
      </div>

      <div className="card recent-card">
        {rows.slice(0, 12).map((row) => {
          const categoryName = row.category?.name ?? "Sin categoría";
          const iconColor = row.type === "expense" ? categoryColor(categoryName) : undefined;
          return (
            <div className="recent-row" key={row.id}>
              <div
                className={`recent-icon ${row.type}`}
                style={iconColor ? { background: `${iconColor}1f`, color: iconColor } : undefined}
              >
                {categoryName.slice(0, 1).toUpperCase()}
              </div>
              <div className="recent-main">
                <strong>{row.concept}</strong>
                <span>{categoryName} · {relativeDayLabel(row.date)}</span>
              </div>
              <strong className={row.type === "expense" ? "expense" : "income"}>
                {row.type === "expense" ? "−" : "+"}<Money value={Number(row.amount)} />
              </strong>
            </div>
          );
        })}
        {!rows.length && <div className="empty">No hay movimientos en este periodo.</div>}
      </div>
    </AppShell>
  );
}
