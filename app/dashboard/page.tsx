import AppShell from "@/components/AppShell";
import DashboardChartsLoader from "@/components/DashboardChartsLoader";
import LogoutButton from "@/components/LogoutButton";
import PageHeader from "@/components/PageHeader";
import { getSessionContext } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { eur, monthKey } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, PiggyBank, Plus, ReceiptText, Sparkles, WalletCards } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

async function saveDashboardRange(formData: FormData) {
  "use server";
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  if (!isIsoDate(from) || !isIsoDate(to)) redirect("/dashboard");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase
      .from("household_members")
      .update({ dashboard_range_from: from, dashboard_range_to: to })
      .eq("user_id", user.id);
  }
  redirect(`/dashboard?from=${from}&to=${to}`);
}

type DashboardTransaction = { id: string; type: "expense" | "income"; amount: number | string; date: string; concept: string; category: { name?: string } | null };
type BudgetRow = { amount: number | string; category?: { name?: string } | null };
type PreviousTransaction = { type: "expense" | "income"; amount: number | string };

function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

export default async function Dashboard({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, user, householdId, households, dashboardRangeFrom, dashboardRangeTo } = await getSessionContext();
  if (!user) redirect("/login");
  if (!householdId) redirect("/settings");

  const resolvedSearchParams = (await Promise.resolve(searchParams ?? {})) as Record<string, string | string[] | undefined>;
  const fromParam = typeof resolvedSearchParams.from === "string" ? resolvedSearchParams.from : "";
  const toParam = typeof resolvedSearchParams.to === "string" ? resolvedSearchParams.to : "";

  const defaultStart = monthKey();
  const currentStart = new Date(`${defaultStart}T12:00:00`);
  const defaultEnd = new Date(currentStart.getFullYear(), currentStart.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  const selectedStart = fromParam || dashboardRangeFrom || defaultStart;
  const selectedEnd = toParam || dashboardRangeTo || defaultEnd;
  const rangeStart = new Date(`${selectedStart}T12:00:00`);
  const rangeEnd = new Date(`${selectedEnd}T12:00:00`);
  const rangeDays = Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1);
  const previousStartDate = new Date(rangeStart.getTime() - rangeDays * 86400000);
  const previousEndDate = new Date(rangeStart.getTime() - 86400000);
  const previousStart = previousStartDate.toISOString().slice(0, 10);
  const previousEnd = previousEndDate.toISOString().slice(0, 10);
  const budgetMonth = selectedStart.slice(0, 7);

  const [{ data: tx }, { data: previousTx }, { data: budgets }] = await Promise.all([
    supabase
      .from("transactions")
      .select("*,category:categories(*)")
      .eq("household_id", householdId)
      .gte("date", selectedStart)
      .lte("date", selectedEnd)
      .order("date", { ascending: false }),
    supabase
      .from("transactions")
      .select("amount,type")
      .eq("household_id", householdId)
      .gte("date", previousStart)
      .lte("date", previousEnd),
    supabase
      .from("budgets")
      .select("*,category:categories(*)")
      .eq("household_id", householdId)
      .eq("month", budgetMonth),
  ]);

  const rows = (tx ?? []) as DashboardTransaction[];
  const previousRows = (previousTx ?? []) as PreviousTransaction[];
  const budgetRows = (budgets ?? []) as BudgetRow[];
  const expense = rows
    .filter((item) => item.type === "expense")
    .reduce((total, item) => total + Number(item.amount), 0);
  const income = rows
    .filter((item) => item.type === "income")
    .reduce((total, item) => total + Number(item.amount), 0);
  const previousExpense = previousRows
    .filter((item) => item.type === "expense")
    .reduce((total, item) => total + Number(item.amount), 0);

  const categoryMap = new Map<string, number>();
  const dayMap = new Map<string, { day: string; expense: number; income: number }>();

  for (const row of rows) {
    const day = new Date(`${row.date}T12:00:00`).getDate().toString();
    const daily = dayMap.get(day) ?? { day, expense: 0, income: 0 };
    daily[row.type as "expense" | "income"] += Number(row.amount);
    dayMap.set(day, daily);

    if (row.type === "expense") {
      const categoryName = (row.category as { name?: string } | null)?.name ?? "Sin categoría";
      categoryMap.set(categoryName, (categoryMap.get(categoryName) ?? 0) + Number(row.amount));
    }
  }

  const categoryData = [...categoryMap]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const budgetTotal = budgetRows.reduce((total: number, budget: BudgetRow) => total + Number(budget.amount), 0);
  const budgetPercentage = budgetTotal > 0 ? Math.round((expense / budgetTotal) * 100) : 0;
  const balance = income - expense;
  const savingsRate = income > 0 ? Math.round((balance / income) * 100) : 0;
  const expenseChange = percentChange(expense, previousExpense);
  const topCategory = categoryData[0];
  const firstName = user.user_metadata?.full_name?.split(" ")[0] || user.email?.split("@")[0] || "equipo";

  return (
    <AppShell households={households}>
      <PageHeader
        title={`Hola, ${firstName} 👋`}
        subtitle={new Date().toLocaleDateString("es-ES", { month: "long", year: "numeric" })}
      />

      <section className="dashboard-hero">
        <div className="hero-copy">
          <div className="hero-kicker"><Sparkles size={15} /> Tu mes, de un vistazo</div>
          <div className="dashboard-range-inline">
            <form action={saveDashboardRange} className="dashboard-range-form">
              <label>
                Desde
                <input name="from" type="date" defaultValue={selectedStart} />
              </label>
              <label>
                Hasta
                <input name="to" type="date" defaultValue={selectedEnd} />
              </label>
              <button type="submit" className="btn btn-soft">Aplicar</button>
            </form>
          </div>
          <p className="hero-label">Balance disponible</p>
          <h1 className={balance >= 0 ? "hero-balance positive" : "hero-balance negative"}>{eur.format(balance)}</h1>
          <div className="hero-trend">
            {expenseChange <= 0 ? <ArrowDownRight size={17} /> : <ArrowUpRight size={17} />}
            <span>{Math.abs(Math.round(expenseChange))}% de gasto {expenseChange <= 0 ? "menos" : "más"} que el mes pasado</span>
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
        <article className="dashboard-metric-card">
          <div className="metric-icon metric-icon-expense"><ReceiptText size={20} /></div>
          <div>
            <p className="metric-label">Gastado este mes</p>
            <p className="dashboard-metric-value">{eur.format(expense)}</p>
          </div>
          <span className={`metric-badge ${expenseChange <= 0 ? "good" : "warn"}`}>
            {expenseChange <= 0 ? "↓" : "↑"} {Math.abs(Math.round(expenseChange))}%
          </span>
        </article>

        <article className="dashboard-metric-card">
          <div className="metric-icon metric-icon-income"><ArrowUpRight size={20} /></div>
          <div>
            <p className="metric-label">Ingresos</p>
            <p className="dashboard-metric-value">{eur.format(income)}</p>
          </div>
          <span className="metric-badge good">Este mes</span>
        </article>

        <article className="dashboard-metric-card">
          <div className="metric-icon metric-icon-saving"><PiggyBank size={20} /></div>
          <div>
            <p className="metric-label">Tasa de ahorro</p>
            <p className="dashboard-metric-value">{savingsRate}%</p>
          </div>
          <span className={`metric-badge ${savingsRate >= 20 ? "good" : "neutral"}`}>
            {savingsRate >= 20 ? "Muy bien" : "En progreso"}
          </span>
        </article>
      </section>

      <section className="dashboard-insights">
        <article className="budget-card">
          <div className="section-head dashboard-section-head">
            <div>
              <span className="eyebrow">Presupuesto mensual</span>
              <h2>{budgetTotal ? `${eur.format(expense)} de ${eur.format(budgetTotal)}` : "Sin presupuesto configurado"}</h2>
            </div>
            {budgetTotal > 0 && <strong>{budgetPercentage}%</strong>}
          </div>
          <div className="budget-track"><span style={{ width: `${Math.min(100, budgetPercentage)}%` }} /></div>
          <p className="budget-caption">
            {budgetTotal > 0
              ? budgetTotal - expense >= 0
                ? `Te quedan ${eur.format(budgetTotal - expense)} para terminar el mes.`
                : `Has superado el presupuesto en ${eur.format(expense - budgetTotal)}.`
              : "Crea un presupuesto para saber cuánto margen te queda de un vistazo."}
          </p>
        </article>

        <article className="insight-card">
          <span className="eyebrow">Dato destacado</span>
          <div className="insight-icon">{topCategory ? "🏆" : "🌱"}</div>
          <h2>{topCategory ? topCategory.name : "Tu panel está listo"}</h2>
          <p>{topCategory ? `Es tu categoría con más gasto: ${eur.format(topCategory.value)}.` : "Añade movimientos y empezaremos a encontrar patrones útiles."}</p>
        </article>
      </section>

      <DashboardChartsLoader
        byCategory={categoryData}
        byDay={[...dayMap.values()].sort((a, b) => Number(a.day) - Number(b.day))}
      />

      <div className="section-head recent-head">
        <div>
          <span className="eyebrow">Actividad reciente</span>
          <h2>Últimos movimientos</h2>
        </div>
        <Link href="/transactions" className="btn btn-soft">Ver todos</Link>
      </div>

      <div className="card recent-card">
        {rows.slice(0, 6).map((row) => {
          const categoryName = (row.category as { name?: string } | null)?.name ?? "Sin categoría";
          return (
            <div className="recent-row" key={row.id}>
              <div className={`recent-icon ${row.type}`}>{categoryName.slice(0, 1).toUpperCase()}</div>
              <div className="recent-main">
                <strong>{row.concept}</strong>
                <span>{categoryName} · {new Date(`${row.date}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span>
              </div>
              <strong className={row.type === "expense" ? "expense" : "income"}>
                {row.type === "expense" ? "−" : "+"}{eur.format(Number(row.amount))}
              </strong>
            </div>
          );
        })}
        {!rows.length && <div className="empty">Añade el primer movimiento para despertar el panel ✨</div>}
      </div>
    </AppShell>
  );
}
