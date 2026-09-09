import { describe, it, expect } from "vitest";
import { computePeriodSummary } from "@/lib/period-summary";

// Fake mínimo del cliente de Supabase: cada método del builder se encadena y el
// resultado es "thenable" y resuelve a { data }. Suficiente para las dos queries
// que hace computePeriodSummary (transactions y budgets).
function fakeSupabase(data: { transactions?: any[]; budgets?: any[] }) {
  const builder = (rows: any[]) => {
    const p: any = {};
    for (const m of ["select", "eq", "gte", "lte", "order", "in", "not", "maybeSingle"]) {
      p[m] = () => p;
    }
    p.then = (resolve: (v: { data: any[]; error: null }) => unknown) => resolve({ data: rows, error: null });
    return p;
  };
  return {
    from: (table: string) => builder(table === "budgets" ? (data.budgets ?? []) : (data.transactions ?? [])),
  } as any;
}

const transactions = [
  {
    id: "1",
    type: "expense",
    amount: 100,
    date: "2026-01-05",
    concept: "Compra",
    category_id: "c1",
    category: { name: "Super" },
  },
  {
    id: "2",
    type: "expense",
    amount: 50,
    date: "2026-01-05",
    concept: "Cena",
    category_id: "c2",
    category: { name: "Resto" },
  },
  { id: "3", type: "expense", amount: 30, date: "2026-01-10", concept: "Bus", category_id: null, category: null },
  {
    id: "4",
    type: "income",
    amount: 1000,
    date: "2026-01-01",
    concept: "Nómina",
    category_id: "i1",
    category: { name: "Nómina" },
  },
];

const budgets = [
  { id: "b1", amount: 120, category_id: "c1", category: { name: "Super", icon: "🛒" } },
  { id: "b2", amount: 200, category_id: null, category: null },
];

describe("computePeriodSummary", () => {
  it("totaliza gasto, ingreso, balance y tasa de ahorro", async () => {
    const s = await computePeriodSummary(
      fakeSupabase({ transactions, budgets }),
      "h1",
      "2026-01-01",
      "2026-01-31",
      "p1"
    );
    expect(s.expense).toBe(180);
    expect(s.income).toBe(1000);
    expect(s.balance).toBe(820);
    expect(s.savingsRate).toBe(82);
  });

  it("agrupa por categoría, ordena de mayor a menor y marca la principal", async () => {
    const s = await computePeriodSummary(
      fakeSupabase({ transactions, budgets }),
      "h1",
      "2026-01-01",
      "2026-01-31",
      "p1"
    );
    expect(s.categoryData[0]).toEqual({ name: "Super", value: 100, categoryId: "c1" });
    expect(s.topCategory?.name).toBe("Super");
    const sinCat = s.categoryData.find((c) => c.name === "Sin categoría");
    expect(sinCat?.value).toBe(30);
  });

  it("agrupa por día ordenado numéricamente", async () => {
    const s = await computePeriodSummary(
      fakeSupabase({ transactions, budgets }),
      "h1",
      "2026-01-01",
      "2026-01-31",
      "p1"
    );
    expect(s.byDay.map((d) => d.day)).toEqual(["1", "5", "10"]);
    expect(s.byDay.find((d) => d.day === "5")?.expense).toBe(150);
    expect(s.byDay.find((d) => d.day === "1")?.income).toBe(1000);
  });

  it("presupuesto por categoría usa su gasto; el general usa el gasto total", async () => {
    const s = await computePeriodSummary(
      fakeSupabase({ transactions, budgets }),
      "h1",
      "2026-01-01",
      "2026-01-31",
      "p1"
    );
    expect(s.budgetTotal).toBe(320);
    const porCategoria = s.budgets.find((b) => b.id === "b1")!;
    expect(porCategoria.spent).toBe(100);
    expect(porCategoria.percentage).toBe(83);
    const general = s.budgets.find((b) => b.id === "b2")!;
    expect(general.spent).toBe(180);
    expect(general.percentage).toBe(90);
  });

  it("sin movimientos ni periodo devuelve ceros sin romper", async () => {
    const s = await computePeriodSummary(fakeSupabase({}), "h1", "2026-01-01", "2026-01-31");
    expect(s.expense).toBe(0);
    expect(s.income).toBe(0);
    expect(s.savingsRate).toBe(0);
    expect(s.categoryData).toEqual([]);
    expect(s.topCategory).toBeUndefined();
    expect(s.byDay).toEqual([]);
    expect(s.budgets).toEqual([]);
  });
});
