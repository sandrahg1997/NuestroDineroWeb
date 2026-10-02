type ReviewRow = {
  type: "expense" | "income";
  amount: number | string;
  category_id: string | null;
  category?: { name?: string; icon?: string } | null;
};

type ReviewBudget = { name: string; icon?: string; amount: number; spent: number; categoryId: string | null };

export type CategoryDelta = {
  categoryId: string | null;
  name: string;
  icon?: string;
  now: number;
  before: number;
  delta: number;
};

export type Proposal = { icon: string; text: string; href?: string };

export type PeriodReview = {
  income: number;
  expense: number;
  balance: number;
  savingsRate: number;
  previous: { income: number; expense: number; balance: number } | null;
  cuts: CategoryDelta[];
  rises: CategoryDelta[];
  budgetsOver: (ReviewBudget & { over: number })[];
  budgetsMet: ReviewBudget[];
  proposals: Proposal[];
};

function totals(rows: ReviewRow[]) {
  let income = 0;
  let expense = 0;
  for (const r of rows) {
    if (r.type === "income") income += Number(r.amount);
    else expense += Number(r.amount);
  }
  return { income, expense, balance: income - expense };
}

function byCategory(rows: ReviewRow[]) {
  const map = new Map<string, { categoryId: string | null; name: string; icon?: string; value: number }>();
  for (const r of rows) {
    if (r.type !== "expense") continue;
    const key = r.category_id ?? "none";
    const entry = map.get(key) ?? {
      categoryId: r.category_id,
      name: r.category?.name ?? "Sin categoría",
      icon: r.category?.icon,
      value: 0,
    };
    entry.value += Number(r.amount);
    map.set(key, entry);
  }
  return map;
}

const round = (value: number, step = 10) => Math.max(step, Math.round(value / step) * step);
const fmt = (value: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);

// Resumen para revisar un periodo en pareja: qué fue bien, dónde os pasasteis y
// hasta 3 propuestas concretas para el siguiente. `previousRows` es null cuando no
// hay periodo anterior con el que comparar.
export function buildPeriodReview({
  rows,
  previousRows,
  budgets,
  recurringMonthly = 0,
}: {
  rows: ReviewRow[];
  previousRows: ReviewRow[] | null;
  budgets: ReviewBudget[];
  recurringMonthly?: number;
}): PeriodReview {
  const { income, expense, balance } = totals(rows);
  const savingsRate = income > 0 ? Math.round((balance / income) * 100) : 0;
  const previous = previousRows ? totals(previousRows) : null;

  const now = byCategory(rows);
  const before = previousRows ? byCategory(previousRows) : new Map();
  const deltas: CategoryDelta[] = [];
  for (const key of new Set([...now.keys(), ...before.keys()])) {
    const a = now.get(key);
    const b = before.get(key);
    const base = a ?? b!;
    deltas.push({
      categoryId: base.categoryId,
      name: base.name,
      icon: base.icon,
      now: a?.value ?? 0,
      before: b?.value ?? 0,
      delta: (a?.value ?? 0) - (b?.value ?? 0),
    });
  }
  // Variaciones de menos de 5 € son ruido.
  const cuts = previousRows
    ? deltas
        .filter((d) => d.delta <= -5)
        .sort((x, y) => x.delta - y.delta)
        .slice(0, 3)
    : [];
  const rises = previousRows
    ? deltas
        .filter((d) => d.delta >= 5)
        .sort((x, y) => y.delta - x.delta)
        .slice(0, 3)
    : [];

  const budgetsOver = budgets
    .filter((b) => b.spent > b.amount)
    .map((b) => ({ ...b, over: b.spent - b.amount }))
    .sort((x, y) => y.over - x.over);
  const budgetsMet = budgets.filter((b) => b.spent <= b.amount);

  const proposals: Proposal[] = [];
  const budgetedCategories = new Set(budgets.map((b) => b.categoryId));

  const worst = budgetsOver[0];
  if (worst) {
    proposals.push({
      icon: "🎯",
      text: `${worst.name} se pasó ${fmt(worst.over)}. Decidid si el presupuesto era poco realista (subidlo a ${fmt(round(worst.spent))}) o si queréis un reto para recortarlo.`,
      href: "/retos",
    });
  }

  const bigRise = rises.find((r) => r.before > 0 && r.delta / r.before >= 0.15 && r.delta >= 30);
  if (bigRise && !budgetedCategories.has(bigRise.categoryId)) {
    proposals.push({
      icon: "📌",
      text: `${bigRise.name} subió ${fmt(bigRise.delta)} respecto al periodo anterior. Poned un presupuesto de ${fmt(round((bigRise.now + bigRise.before) / 2))} para el siguiente.`,
      href: "/budgets",
    });
  }

  if (!budgets.length && expense > 0) {
    proposals.push({
      icon: "🧭",
      text: `No teníais presupuesto. Probad con uno general de ${fmt(round(expense * 0.95, 50))} (lo gastado menos un 5 %).`,
      href: "/budgets",
    });
  }

  if (income > 0 && savingsRate < 10) {
    proposals.push({
      icon: "🐷",
      text: `Habéis ahorrado un ${savingsRate} %. Probad a apartar ${fmt(round(income * 0.1))} (el 10 %) nada más cobrar.`,
    });
  } else if (income > 0 && savingsRate >= 20) {
    proposals.push({
      icon: "🎉",
      text: `Buen periodo: ${fmt(balance)} de margen (${savingsRate} %). Decidid juntos a qué lo destináis antes de que se diluya.`,
    });
  }

  if (recurringMonthly > 0) {
    proposals.push({
      icon: "🔁",
      text: `Tenéis ${fmt(recurringMonthly)} al mes en gastos recurrentes. Repasad si seguís usando todas las suscripciones.`,
      href: "/recurring",
    });
  }

  return {
    income,
    expense,
    balance,
    savingsRate,
    previous,
    cuts,
    rises,
    budgetsOver,
    budgetsMet,
    proposals: proposals.slice(0, 3),
  };
}
