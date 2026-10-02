import { describe, it, expect } from "vitest";
import { computeForecast, recurringOccurrences } from "@/lib/forecast";

describe("recurringOccurrences", () => {
  it("cuenta las semanas que caen en el rango", () => {
    expect(recurringOccurrences({ frequency: "weekly", next_date: "2026-01-05" }, "2026-01-01", "2026-01-31")).toEqual([
      "2026-01-05",
      "2026-01-12",
      "2026-01-19",
      "2026-01-26",
    ]);
  });

  it("encadena los mensuales como el SQL (31 → 28 de febrero → 28 de marzo)", () => {
    expect(recurringOccurrences({ frequency: "monthly", next_date: "2026-01-31" }, "2026-01-01", "2026-03-31")).toEqual(
      ["2026-01-31", "2026-02-28", "2026-03-28"]
    );
  });

  it("ignora las ocurrencias anteriores al inicio del rango", () => {
    expect(recurringOccurrences({ frequency: "weekly", next_date: "2026-01-01" }, "2026-01-10", "2026-01-20")).toEqual([
      "2026-01-15",
    ]);
  });
});

describe("computeForecast", () => {
  const base = {
    today: "2026-01-10",
    start: "2026-01-01",
    end: "2026-01-30",
    rows: [
      { type: "income" as const, amount: 2000, date: "2026-01-01", recurring_id: "r-nomina" },
      { type: "expense" as const, amount: 700, date: "2026-01-02", recurring_id: "r-alquiler" },
      { type: "expense" as const, amount: 200, date: "2026-01-05" },
      { type: "expense" as const, amount: 100, date: "2026-01-09" },
    ],
    recurring: [
      { type: "expense" as const, amount: 15, frequency: "monthly" as const, next_date: "2026-01-20" },
      { type: "expense" as const, amount: 700, frequency: "monthly" as const, next_date: "2026-02-02" },
    ],
  };

  it("suma balance actual, recurrentes pendientes y gasto variable al ritmo actual", () => {
    const f = computeForecast(base);
    // 300 € variables en 10 días → 30 €/día × 20 días restantes = 600 €.
    expect(f.currentBalance).toBe(1000);
    expect(f.dailyVariable).toBe(30);
    expect(f.daysLeft).toBe(20);
    expect(f.pendingExpense).toBe(15); // el alquiler de febrero cae fuera
    expect(f.projectedVariable).toBe(600);
    expect(f.projectedBalance).toBe(1000 - 15 - 600);
    expect(f.projectedExpense).toBe(1000 + 15 + 600);
  });

  it("los recurrentes no cuentan como gasto variable", () => {
    const f = computeForecast({ ...base, rows: base.rows.filter((r) => !r.recurring_id || r.type === "income") });
    expect(f.dailyVariable).toBe(30);
  });

  it("los primeros días mezcla el ritmo con el del periodo anterior", () => {
    const f = computeForecast({
      ...base,
      today: "2026-01-02",
      rows: [{ type: "expense", amount: 100, date: "2026-01-01" }],
      recurring: [],
      previousDailyVariable: 20,
    });
    // Día 2 de 10: peso 0.2 → 0.2 × 50 + 0.8 × 20 = 26.
    expect(f.dailyVariable).toBeCloseTo(26);
  });

  it("no cuenta una ocurrencia de hoy como pendiente (ya está generada)", () => {
    const f = computeForecast({
      ...base,
      recurring: [{ type: "income", amount: 50, frequency: "weekly", next_date: "2026-01-10" }],
    });
    // Pendientes: 17 y 24 (el 10 es hoy y el 31 cae fuera).
    expect(f.pendingIncome).toBe(100);
  });
});
