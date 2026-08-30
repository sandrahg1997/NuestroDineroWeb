import AppShell from "@/components/AppShell";
import DashboardChartsLoader from "@/components/DashboardChartsLoader";
import DashboardRange from "@/components/DashboardRange";
import InsightCarousel, { type Insight } from "@/components/InsightCarousel";
import Money from "@/components/Money";
import PageHeader from "@/components/PageHeader";
import { getSessionContext } from "@/lib/data";
import { computePeriodSummary } from "@/lib/period-summary";
import { categoryColor, dateKey, defaultPeriodName, monthKey, relativeDayLabel, savingsTier } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, PiggyBank, Plus, ReceiptText, Sparkles, WalletCards } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

async function saveDashboardRange(formData: FormData) {
  "use server";
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  if (!isIsoDate(from) || !isIsoDate(to)) redirect("/dashboard");

  const { supabase, householdId, activePeriod } = await getSessionContext();
  if (householdId) {
    if (activePeriod) {
      // El periodo activo es único y controlado por el usuario: editar las fechas
      // en Inicio modifica ESE periodo, nunca crea uno nuevo ni depende del día de hoy.
      await supabase.from("periods").update({ start_date: from, end_date: to }).eq("id", activePeriod.id);
    } else {
      const { data: created } = await supabase
        .from("periods")
        .insert({ household_id: householdId, name: defaultPeriodName(from, to), start_date: from, end_date: to })
        .select("id")
        .single();
      if (created?.id) {
        await supabase.from("households").update({ active_period_id: created.id }).eq("id", householdId);
      }
    }
  }
  redirect("/dashboard");
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

export default async function Dashboard() {
  const { supabase, user, householdId, households, activePeriod, hideAmounts } = await getSessionContext();
  if (!user) redirect("/login");
  if (!householdId) redirect("/settings");

  // Sin periodo activo (p.ej. se borraron todos): mostrar el mes natural actual
  // por defecto hasta que el usuario pulse "Aplicar", momento en que se crea uno.
  const defaultStart = monthKey();
  const currentStart = new Date(`${defaultStart}T12:00:00`);
  const defaultEnd = dateKey(new Date(currentStart.getFullYear(), currentStart.getMonth() + 1, 0));

  const selectedStart = activePeriod?.start_date ?? defaultStart;
  const selectedEnd = activePeriod?.end_date ?? defaultEnd;
  const periodId = activePeriod?.id ?? null;
  const periodLabel = activePeriod?.name ?? defaultPeriodName(selectedStart, selectedEnd);

  const rangeStart = new Date(`${selectedStart}T12:00:00`);
  const rangeEnd = new Date(`${selectedEnd}T12:00:00`);
  const rangeDays = Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1);
  const previousStartDate = new Date(rangeStart.getTime() - rangeDays * 86400000);
  const previousEndDate = new Date(rangeStart.getTime() - 86400000);
  const previousStart = previousStartDate.toISOString().slice(0, 10);
  const previousEnd = previousEndDate.toISOString().slice(0, 10);

  const [summary, { data: previousTx }] = await Promise.all([
    computePeriodSummary(supabase, householdId, selectedStart, selectedEnd, periodId),
    supabase
      .from("transactions")
      .select("amount,type,category:categories(name)")
      .eq("household_id", householdId)
      .gte("date", previousStart)
      .lte("date", previousEnd),
  ]);

  const previousExpenseRows = ((previousTx ?? []) as unknown as { amount: number | string; type: "expense" | "income"; category: { name?: string } | null }[])
    .filter((item) => item.type === "expense");
  const previousExpense = previousExpenseRows.reduce((total, item) => total + Number(item.amount), 0);
  const previousCategoryMap = new Map<string, number>();
  for (const item of previousExpenseRows) {
    const name = item.category?.name ?? "Sin categoría";
    previousCategoryMap.set(name, (previousCategoryMap.get(name) ?? 0) + Number(item.amount));
  }

  const { rows, expense, income, balance, savingsRate, categoryData, byDay, topCategory, budgetTotal, budgets } = summary;
  const expenseChange = percentChange(expense, previousExpense);
  const firstName = user.user_metadata?.display_name?.split(" ")[0] || user.user_metadata?.full_name?.split(" ")[0] || user.email?.split("@")[0] || "equipo";
  const savings = savingsTier(savingsRate);

  function transactionsLink(type?: "expense" | "income", categoryId?: string | null) {
    const qs = new URLSearchParams();
    if (type) qs.set("type", type);
    if (categoryId) qs.set("category", categoryId);
    qs.set("from", selectedStart);
    qs.set("to", selectedEnd);
    return `/transactions?${qs.toString()}`;
  }

  const todayKey = dateKey();
  const today = new Date(`${todayKey}T12:00:00`);
  const periodInProgress = todayKey >= selectedStart && todayKey <= selectedEnd;

  const insights: Insight[] = [
    topCategory
      ? {
          icon: "🏆",
          title: topCategory.name,
          text: <>Es tu categoría con más gasto: <Money value={topCategory.value} />.</>,
          href: transactionsLink("expense", topCategory.categoryId),
        }
      : { icon: "🌱", title: "Tu panel está listo", text: "Añade movimientos y empezaremos a encontrar patrones útiles." },
  ];

  if (periodInProgress) {
    const daysLeft = Math.max(0, Math.round((rangeEnd.getTime() - today.getTime()) / 86400000));
    insights.push({
      icon: "📅",
      title: daysLeft === 0 ? "Último día" : `${daysLeft} días restantes`,
      text: daysLeft === 0 ? `Hoy se cierra "${periodLabel}".` : `Quedan ${daysLeft} días para que termine "${periodLabel}".`,
    });

    const daysElapsed = Math.max(1, Math.round((today.getTime() - rangeStart.getTime()) / 86400000) + 1);
    const projectedTotal = (expense / daysElapsed) * rangeDays;
    insights.push(
      budgetTotal > 0
        ? {
            icon: "🔮",
            title: <Money value={projectedTotal} />,
            text:
              projectedTotal > budgetTotal
                ? <>Al ritmo actual, cerrarás <Money value={projectedTotal - budgetTotal} /> por encima de tu presupuesto.</>
                : "Al ritmo actual, cerrarás el periodo dentro de tu presupuesto.",
          }
        : { icon: "🔮", title: <Money value={projectedTotal} />, text: "Es tu gasto estimado si mantienes el ritmo actual hasta el final del periodo." }
    );
  }

  let growthCategory = "";
  let growthAmount = 0;
  for (const item of categoryData) {
    const diff = item.value - (previousCategoryMap.get(item.name) ?? 0);
    if (diff > growthAmount) {
      growthAmount = diff;
      growthCategory = item.name;
    }
  }
  if (growthCategory) {
    insights.push({
      icon: "📈",
      title: growthCategory,
      text: <>Has gastado <Money value={growthAmount} /> más que en el periodo anterior en esta categoría.</>,
    });
  }

  return (
    <AppShell households={households} hideAmounts={hideAmounts}>
      <PageHeader
        title={`Hola, ${firstName} 👋`}
        subtitle={periodLabel}
      />

      <section className="dashboard-hero">
        <div className="hero-copy">
          <div className="hero-kicker"><Sparkles size={15} /> Tu periodo, de un vistazo</div>
          <div className="dashboard-range-inline">
            <DashboardRange action={saveDashboardRange} from={selectedStart} to={selectedEnd} />
          </div>
          <p className="hero-label">Balance disponible</p>
          <h1 className={balance >= 0 ? "hero-balance positive" : "hero-balance negative"}><Money value={balance} strong /></h1>
          <div className="hero-trend">
            {expenseChange <= 0 ? <ArrowDownRight size={17} /> : <ArrowUpRight size={17} />}
            <span>{Math.abs(Math.round(expenseChange))}% de gasto {expenseChange <= 0 ? "menos" : "más"} que el periodo anterior</span>
          </div>
        </div>
        <div className="hero-orb" aria-hidden="true"><WalletCards size={54} />
        </div>
        <div className="hero-glow hero-glow-one" />
        <div className="hero-glow hero-glow-two" />
      </section>

      <div className="hero-add-row">
        <Link href="/transactions?new=expense"><button className="btn btn-primary hero-add" aria-label="Añadir gasto"><Plus size={14}/> Añadir gasto</button></Link>
      </div>

      <section className="dashboard-metrics">
        <Link href={transactionsLink("expense")} className="dashboard-metric-card">
          <div className="metric-icon metric-icon-expense"><ReceiptText size={20} /></div>
          <div>
            <p className="metric-label">Gastado este periodo</p>
            <p className="dashboard-metric-value"><Money value={expense} /></p>
          </div>
          <span className={`metric-badge ${expenseChange <= 0 ? "good" : "warn"}`}>
            {expenseChange <= 0 ? "↓" : "↑"} {Math.abs(Math.round(expenseChange))}%
          </span>
        </Link>

        <Link href={transactionsLink("income")} className="dashboard-metric-card">
          <div className="metric-icon metric-icon-income"><ArrowUpRight size={20} /></div>
          <div>
            <p className="metric-label">Ingresos</p>
            <p className="dashboard-metric-value"><Money value={income} /></p>
          </div>
          <span className="metric-badge good">Este periodo</span>
        </Link>

        <article className="dashboard-metric-card">
          <div className="metric-icon metric-icon-saving"><PiggyBank size={20} /></div>
          <div>
            <p className="metric-label">Tasa de ahorro</p>
            <p className="dashboard-metric-value">{savingsRate}%</p>
          </div>
          <span className={`metric-badge ${savings.className}`}>{savings.label}</span>
        </article>
      </section>

      <section className="dashboard-insights">
        <article className="budget-card">
          <div className="section-head dashboard-section-head">
            <span className="eyebrow">Presupuesto del periodo</span>
          </div>
          {budgets.length > 0 ? (
            <div className="budget-list">
              {budgets.map((b) => (
                <Link
                  href={transactionsLink("expense", b.categoryId)}
                  className="budget-item"
                  key={b.id}
                >
                  <div className="budget-item-head">
                    <span className="budget-item-name">{b.icon ? `${b.icon} ` : ""}{b.name}</span>
                    <strong>{b.percentage}%</strong>
                  </div>
                  <div className="budget-track">
                    <span
                      className={b.percentage >= 100 ? "over" : b.percentage >= 85 ? "warn" : ""}
                      style={{ width: `${Math.min(100, b.percentage)}%` }}
                    />
                  </div>
                  <p className="budget-caption">
                    <Money value={b.spent} /> de <Money value={b.amount} /> ·{" "}
                    {b.amount - b.spent >= 0
                      ? <>te quedan <Money value={b.amount - b.spent} /></>
                      : <>superado en <Money value={b.spent - b.amount} /></>}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="budget-caption">Crea un presupuesto para saber cuánto margen te queda de un vistazo.</p>
          )}
        </article>

        <InsightCarousel insights={insights} />
      </section>

      <DashboardChartsLoader byCategory={categoryData} byDay={byDay} hideAmounts={hideAmounts} />

      <div className="section-head recent-head">
        <div>
          <span className="eyebrow">Actividad reciente</span>
          <h2>Últimos movimientos</h2>
        </div>
        <Link href="/transactions" className="btn btn-soft">Ver todos</Link>
      </div>

      <div className="card recent-card">
        {rows.slice(0, 6).map((row) => {
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
        {!rows.length && (
          <div className="empty">
            <span className="empty-icon"><ReceiptText size={22} /></span>
            <strong>Tu panel está en blanco</strong>
            <p>Añade el primer gasto o ingreso y empezaremos a mostrarte gráficos y patrones.</p>
            <Link href="/transactions?new=expense" className="btn btn-primary"><Plus size={16} /> Añadir movimiento</Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
