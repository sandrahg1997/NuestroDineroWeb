import { describe, it, expect } from "vitest";
import {
  compareCategories,
  defaultReferencePeriod,
  expenseByPeriod,
  NO_CATEGORY,
  periodEvolution,
  type HistoricoRow,
  type PeriodRow,
} from "@/lib/historico";

const periods: PeriodRow[] = [
  { id: "p1", name: "Enero 2025", start_date: "2025-01-01", end_date: "2025-01-31" },
  { id: "p2", name: "Diciembre 2025", start_date: "2025-12-01", end_date: "2025-12-31" },
  { id: "p3", name: "Enero 2026", start_date: "2026-01-01", end_date: "2026-01-31" },
];

const rows: HistoricoRow[] = [
  { date: "2025-01-10", amount: 100, type: "expense", category_id: "super" },
  { date: "2025-12-05", amount: 200, type: "expense", category_id: "super" },
  { date: "2025-12-06", amount: 50, type: "expense", category_id: "ocio" },
  { date: "2025-12-20", amount: 1000, type: "income", category_id: null },
  { date: "2026-01-03", amount: 120, type: "expense", category_id: "super" },
  { date: "2026-01-04", amount: 30, type: "expense", category_id: null },
];

const names: Record<string, { name: string; icon: string }> = {
  super: { name: "Supermercado", icon: "🛒" },
  ocio: { name: "Ocio", icon: "🎮" },
};

describe("periodEvolution", () => {
  it("suma gastos e ingresos por periodo y calcula media y previsión", () => {
    const r = periodEvolution(periods, rows);
    expect(r.evolution.map((p) => [p.id, p.expense, p.income, p.balance])).toEqual([
      ["p1", 100, 0, -100],
      ["p2", 250, 1000, 750],
      ["p3", 150, 0, -150],
    ]);
    expect(r.totalExpense).toBe(500);
    expect(r.totalIncome).toBe(1000);
    expect(r.avgExpense).toBeCloseTo(500 / 3);
    // Previsión: media de los 3 últimos periodos.
    expect(r.forecastExpense).toBeCloseTo(500 / 3);
  });
});

describe("compareCategories", () => {
  const byPeriod = expenseByPeriod(periods, rows);

  it("por defecto toma el último periodo con gasto", () => {
    expect(defaultReferencePeriod(periods, byPeriod)).toBe("p3");
  });

  it("compara con el periodo anterior: recortes, categorías nuevas y desaparecidas", () => {
    const c = compareCategories(periods, byPeriod, 2, "prev", (id) => names[id]);
    const byCat = Object.fromEntries(c.rows.map((r) => [r.cat, r]));
    expect(byCat.super).toMatchObject({ now: 120, before: 200, delta: -80, tag: null });
    expect(byCat.ocio).toMatchObject({ now: 0, before: 50, tag: "gone" });
    expect(byCat[NO_CATEGORY]).toMatchObject({ name: "Sin categoría", now: 30, before: 0, tag: "new" });
    // Recortes primero.
    expect(c.rows[0].cat).toBe("super");
    expect(c.cut).toBe(130);
    expect(c.up).toBe(30);
    expect(c.baseLabel).toBe("Diciembre 2025");
  });

  it('"mismo periodo del año pasado" busca el que empieza ~365 días antes', () => {
    const c = compareCategories(periods, byPeriod, 2, "year", (id) => names[id]);
    expect(c.baseLabel).toBe("Enero 2025");
    expect(c.rows.find((r) => r.cat === "super")).toMatchObject({ now: 120, before: 100, delta: 20 });
  });

  it("sin periodo base no hay datos que comparar", () => {
    const c = compareCategories(periods, byPeriod, 0, "prev", (id) => names[id]);
    expect(c.hasBaseData).toBe(false);
  });
});
