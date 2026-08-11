import type { SupabaseClient } from "@supabase/supabase-js";

type PeriodTransaction = {
  id: string;
  type: "expense" | "income";
  amount: number | string;
  date: string;
  concept: string;
  merchant?: string;
  category_id: string | null;
  category: { name?: string } | null;
};

type BudgetRow = { id: string; amount: number | string; category_id: string | null; category?: { name?: string; icon?: string } | null };

export type PeriodSummary = {
  rows: PeriodTransaction[];
  expense: number;
  income: number;
  balance: number;
  savingsRate: number;
  categoryData: { name: string; value: number; categoryId: string | null }[];
  byDay: { day: string; expense: number; income: number }[];
  topCategory?: { name: string; value: number; categoryId: string | null };
  budgetTotal: number;
  budgetSpent: number;
  budgetPercentage: number;
  budgets: { id: string; name: string; icon?: string; amount: number; spent: number; percentage: number; categoryId: string | null }[];
};

export async function computePeriodSummary(
  supabase: SupabaseClient,
  householdId: string,
  start: string,
  end: string,
  periodId?: string | null
): Promise<PeriodSummary> {
  const [{ data: tx }, { data: budgetData }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id,type,amount,date,concept,merchant,category_id,category:categories(name)")
      .eq("household_id", householdId)
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    periodId
      ? supabase
          .from("budgets")
          .select("id,amount,category_id,category:categories(name,icon)")
          .eq("household_id", householdId)
          .eq("period_id", periodId)
      : Promise.resolve({ data: [] as BudgetRow[] }),
  ]);

  const rows = (tx ?? []) as unknown as PeriodTransaction[];
  const budgetRows = (budgetData ?? []) as BudgetRow[];

  const expense = rows.filter((r) => r.type === "expense").reduce((total, r) => total + Number(r.amount), 0);
  const income = rows.filter((r) => r.type === "income").reduce((total, r) => total + Number(r.amount), 0);

  const categoryMap = new Map<string, number>();
  const categorySpendById = new Map<string, number>();
  const categoryIdByName = new Map<string, string | null>();
  const dayMap = new Map<string, { day: string; expense: number; income: number }>();

  for (const row of rows) {
    const day = new Date(`${row.date}T12:00:00`).getDate().toString();
    const daily = dayMap.get(day) ?? { day, expense: 0, income: 0 };
    daily[row.type] += Number(row.amount);
    dayMap.set(day, daily);

    if (row.type === "expense") {
      const categoryName = row.category?.name ?? "Sin categoría";
      categoryMap.set(categoryName, (categoryMap.get(categoryName) ?? 0) + Number(row.amount));
      categoryIdByName.set(categoryName, row.category_id);
      if (row.category_id) {
        categorySpendById.set(row.category_id, (categorySpendById.get(row.category_id) ?? 0) + Number(row.amount));
      }
    }
  }

  const categoryData = [...categoryMap]
    .map(([name, value]) => ({ name, value, categoryId: categoryIdByName.get(name) ?? null }))
    .sort((a, b) => b.value - a.value);
  const budgetTotal = budgetRows.reduce((total, b) => total + Number(b.amount), 0);
  const budgetSpent = budgetRows.reduce(
    (total, b) => total + (b.category_id ? categorySpendById.get(b.category_id) ?? 0 : expense),
    0
  );
  const budgetPercentage = budgetTotal > 0 ? Math.round((budgetSpent / budgetTotal) * 100) : 0;
  const balance = income - expense;
  const savingsRate = income > 0 ? Math.round((balance / income) * 100) : 0;

  const budgets = budgetRows.map((b) => {
    const amount = Number(b.amount);
    const spent = b.category_id ? categorySpendById.get(b.category_id) ?? 0 : expense;
    return {
      id: b.id,
      name: b.category?.name ?? "Presupuesto general",
      icon: b.category?.icon,
      amount,
      spent,
      percentage: amount > 0 ? Math.round((spent / amount) * 100) : 0,
      categoryId: b.category_id,
    };
  });

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
    budgetSpent,
    budgetPercentage,
    budgets,
  };
}
