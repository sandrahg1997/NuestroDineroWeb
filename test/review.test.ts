import { describe, it, expect } from "vitest";
import { buildPeriodReview } from "@/lib/review";

const row = (type: "expense" | "income", amount: number, category_id: string | null, name?: string) => ({
  type,
  amount,
  category_id,
  category: name ? { name } : null,
});

describe("buildPeriodReview", () => {
  const previousRows = [
    row("income", 2000, "n", "Nómina"),
    row("expense", 300, "s", "Supermercado"),
    row("expense", 100, "r", "Restaurantes"),
    row("expense", 80, "o", "Ocio"),
  ];
  const rows = [
    row("income", 2000, "n", "Nómina"),
    row("expense", 250, "s", "Supermercado"),
    row("expense", 180, "r", "Restaurantes"),
    row("expense", 82, "o", "Ocio"),
  ];

  it("calcula totales y compara con el periodo anterior", () => {
    const r = buildPeriodReview({ rows, previousRows, budgets: [] });
    expect(r.expense).toBe(512);
    expect(r.balance).toBe(1488);
    expect(r.savingsRate).toBe(74);
    expect(r.previous).toEqual({ income: 2000, expense: 480, balance: 1520 });
  });

  it("separa recortes y subidas e ignora variaciones de menos de 5 €", () => {
    const r = buildPeriodReview({ rows, previousRows, budgets: [] });
    expect(r.cuts.map((c) => [c.name, c.delta])).toEqual([["Supermercado", -50]]);
    expect(r.rises.map((c) => [c.name, c.delta])).toEqual([["Restaurantes", 80]]);
  });

  it("sin periodo anterior no hay recortes ni subidas", () => {
    const r = buildPeriodReview({ rows, previousRows: null, budgets: [] });
    expect(r.previous).toBeNull();
    expect(r.cuts).toEqual([]);
    expect(r.rises).toEqual([]);
  });

  it("propone presupuesto para una subida fuerte sin presupuesto y lo limita a 3 propuestas", () => {
    const r = buildPeriodReview({ rows, previousRows, budgets: [], recurringMonthly: 40 });
    expect(r.proposals.length).toBeLessThanOrEqual(3);
    expect(r.proposals[0].text).toContain("Restaurantes subió");
    expect(r.proposals[0].href).toBe("/budgets");
  });

  it("prioriza el presupuesto más superado", () => {
    const r = buildPeriodReview({
      rows,
      previousRows,
      budgets: [
        { name: "Restaurantes", amount: 120, spent: 180, categoryId: "r" },
        { name: "Supermercado", amount: 300, spent: 250, categoryId: "s" },
      ],
    });
    expect(r.budgetsOver.map((b) => [b.name, b.over])).toEqual([["Restaurantes", 60]]);
    expect(r.budgetsMet.map((b) => b.name)).toEqual(["Supermercado"]);
    expect(r.proposals[0].href).toBe("/retos");
    // Restaurantes ya tiene presupuesto: no se propone crear otro.
    expect(r.proposals.some((p) => p.text.includes("Restaurantes subió"))).toBe(false);
  });

  it("con poco ahorro propone apartar el 10 %", () => {
    const r = buildPeriodReview({
      rows: [row("income", 1000, "n", "Nómina"), row("expense", 950, "s", "Supermercado")],
      previousRows: null,
      budgets: [{ name: "Presupuesto general", amount: 1000, spent: 950, categoryId: null }],
    });
    expect(r.proposals.some((p) => p.text.includes("10 %"))).toBe(true);
  });
});
