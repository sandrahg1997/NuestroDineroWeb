// Cálculos del informe de un periodo (página /report). Puros: reciben los movimientos ya
// leídos y devuelven lo que hay que pintar.

export type ReportRow = {
  type: "expense" | "income";
  amount: number | string;
  date: string;
  concept: string;
  merchant?: string | null;
  recurring_id?: string | null;
  category?: { name?: string } | null;
};

export type PeriodReportData = {
  income: number;
  expense: number;
  balance: number;
  savingsRate: number;
  previous: { income: number; expense: number; balance: number } | null;
  categories: { name: string; value: number; pct: number }[];
  topMerchants: { name: string; total: number; count: number }[];
  biggest: { date: string; label: string; amount: number; category: string }[];
  fixed: number;
  variable: number;
  dailyAverage: number;
};

const cents = (n: number) => Math.round(n * 100) / 100;
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function totals(rows: Pick<ReportRow, "type" | "amount">[]) {
  let income = 0;
  let expense = 0;
  for (const r of rows) {
    if (r.type === "income") income += Number(r.amount);
    else expense += Number(r.amount);
  }
  return { income: cents(income), expense: cents(expense), balance: cents(income - expense) };
}

// `days` = días del periodo (para la media diaria). `previousRows` null = sin comparación.
export function buildReportData(
  rows: ReportRow[],
  previousRows: Pick<ReportRow, "type" | "amount">[] | null,
  days: number,
  limit = 5
): PeriodReportData {
  const { income, expense, balance } = totals(rows);
  const expenses = rows.filter((r) => r.type === "expense");

  const byCategory = new Map<string, number>();
  const byMerchant = new Map<string, { name: string; total: number; count: number }>();
  let fixed = 0;
  for (const r of expenses) {
    const amount = Number(r.amount);
    const category = r.category?.name ?? "Sin categoría";
    byCategory.set(category, (byCategory.get(category) ?? 0) + amount);
    if (r.recurring_id) fixed += amount;

    const label = (r.merchant ?? "").trim() || r.concept.trim() || "Sin nombre";
    const key = fold(label);
    const entry = byMerchant.get(key) ?? { name: label, total: 0, count: 0 };
    entry.total += amount;
    entry.count += 1;
    byMerchant.set(key, entry);
  }

  const categories = [...byCategory]
    .map(([name, value]) => ({
      name,
      value: cents(value),
      pct: expense > 0 ? Math.round((value / expense) * 100) : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const prev = previousRows ? totals(previousRows) : null;
  return {
    income,
    expense,
    balance,
    savingsRate: income > 0 ? Math.round((balance / income) * 100) : 0,
    previous: prev,
    categories,
    topMerchants: [...byMerchant.values()]
      .map((m) => ({ ...m, total: cents(m.total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit),
    biggest: [...expenses]
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, limit)
      .map((r) => ({
        date: r.date.slice(0, 10),
        label: (r.merchant ?? "").trim() || r.concept.trim() || "Sin nombre",
        amount: Number(r.amount),
        category: r.category?.name ?? "Sin categoría",
      })),
    fixed: cents(fixed),
    variable: cents(expense - fixed),
    dailyAverage: days > 0 ? cents(expense / days) : 0,
  };
}

// Variación porcentual redondeada; null si no hay con qué comparar.
export function percentChange(now: number, before: number): number | null {
  if (before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}

// Días entre dos fechas AAAA-MM-DD, ambas incluidas.
export function inclusiveDays(start: string, end: string) {
  const a = Date.parse(`${start.slice(0, 10)}T12:00:00Z`);
  const b = Date.parse(`${end.slice(0, 10)}T12:00:00Z`);
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}
