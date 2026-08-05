import type { SupabaseClient } from "@supabase/supabase-js";

type PeriodTransaction = {
  id: string;
  type: "expense" | "income";
  amount: number | string;
  date: string;
  concept: string;
  merchant?: string;
  category: { name?: string } | null;
};

type BudgetRow = { amount: number | string; category?: { name?: string } | null };

export type PeriodSummary = {
  rows: PeriodTransaction[];
  expense: number;
  income: number;
  balance: number;
  savingsRate: number;
  categoryData: { name: string; value: number }[];
  byDay: { day: string; expense: number; income: number }[];
  topCategory?: { name: string; value: number };
  budgetTotal: number;
  budgetPercentage: number;
};

export async function computePeriodSummary(
  supabase: SupabaseClient,
  householdId: string,
  start: string,
  end: string,
  periodId?: string | null
): Promise<PeriodSummary> {
  const [{ data: tx }, { data: budgets }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id,type,amount,date,concept,merchant,category:categories(name)")
      .eq("household_id", householdId)
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: false }),
    periodId
      ? supabase
          .from("budgets")
          .select("amount,category:categories(name)")
          .eq("household_id", householdId)
          .eq("period_id", periodId)
          .is("category_id", null)
      : Promise.resolve({ data: [] as BudgetRow[] }),
  ]);

  const rows = (tx ?? []) as unknown as PeriodTransaction[];
  const budgetRows = (budgets ?? []) as BudgetRow[];

  const expense = rows.filter((r) => r.type === "expense").reduce((total, r) => total + Number(r.amount), 0);
  const income = rows.filter((r) => r.type === "income").reduce((total, r) => total + Number(r.amount), 0);

  const categoryMap = new Map<string, number>();
  const dayMap = new Map<string, { day: string; expense: number; income: number }>();

  for (const row of rows) {
    const day = new Date(`${row.date}T12:00:00`).getDate().toString();
    const daily = dayMap.get(day) ?? { day, expense: 0, income: 0 };
    daily[row.type] += Number(row.amount);
    dayMap.set(day, daily);

    if (row.type === "expense") {
      const categoryName = row.category?.name ?? "Sin categoría";
      categoryMap.set(categoryName, (categoryMap.get(categoryName) ?? 0) + Number(row.amount));
    }
  }

  const categoryData = [...categoryMap].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const budgetTotal = budgetRows.reduce((total, b) => total + Number(b.amount), 0);
  const budgetPercentage = budgetTotal > 0 ? Math.round((expense / budgetTotal) * 100) : 0;
  const balance = income - expense;
  const savingsRate = income > 0 ? Math.round((balance / income) * 100) : 0;

  return {
    rows,
    expense,
    income,
    balance,
    savingsRate,
    categoryData,
    byDay: [...dayMap.values()].sort((a, b) => Number(a.day) - Number(b.day)),
    topCategory: categoryData[0],
    budgetTotal,
    budgetPercentage,
  };
}
