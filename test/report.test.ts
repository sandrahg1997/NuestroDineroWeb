import { describe, it, expect } from "vitest";
import { buildReportData, inclusiveDays, percentChange, type ReportRow } from "@/lib/report";

const tx = (over: Partial<ReportRow>): ReportRow => ({
  type: "expense",
  amount: 10,
  date: "2026-11-05",
  concept: "Compra",
  merchant: "",
  recurring_id: null,
  category: null,
  ...over,
});

const rows: ReportRow[] = [
  tx({ amount: 2000, type: "income", concept: "Nómina" }),
  tx({ amount: 60, merchant: "Mercadona", category: { name: "Supermercado" } }),
  tx({ amount: 40, merchant: "MERCADONA", category: { name: "Supermercado" } }),
  tx({ amount: 800, concept: "Hipoteca", recurring_id: "r1", category: { name: "Vivienda" } }),
  tx({ amount: 25.5, merchant: "Bar Pepe", category: { name: "Restaurantes" } }),
  tx({ amount: 10, concept: "Sin categoría" }),
];

describe("buildReportData", () => {
  const r = buildReportData(
    rows,
    [
      { type: "expense", amount: 700 },
      { type: "income", amount: 2000 },
    ],
    30
  );

  it("totales y ahorro", () => {
    expect(r.income).toBe(2000);
    expect(r.expense).toBe(935.5);
    expect(r.balance).toBe(1064.5);
    expect(r.savingsRate).toBe(53);
    expect(r.previous).toEqual({ income: 2000, expense: 700, balance: 1300 });
  });

  it("categorías ordenadas con su porcentaje del gasto", () => {
    expect(r.categories.map((c) => c.name)).toEqual(["Vivienda", "Supermercado", "Restaurantes", "Sin categoría"]);
    expect(r.categories[0]).toMatchObject({ value: 800, pct: 86 });
    expect(r.categories.reduce((t, c) => t + c.value, 0)).toBeCloseTo(935.5);
  });

  it("comercios: agrupa sin distinguir mayúsculas y usa el concepto si no hay comercio", () => {
    expect(r.topMerchants[0]).toEqual({ name: "Hipoteca", total: 800, count: 1 });
    expect(r.topMerchants.find((m) => m.name.toLowerCase() === "mercadona")).toMatchObject({ total: 100, count: 2 });
  });

  it("mayores gastos", () => {
    expect(r.biggest.map((b) => b.amount)).toEqual([800, 60, 40, 25.5, 10]);
    expect(r.biggest[0]).toMatchObject({ label: "Hipoteca", category: "Vivienda" });
  });

  it("fijos frente a variables y media diaria", () => {
    expect(r.fixed).toBe(800);
    expect(r.variable).toBe(135.5);
    expect(r.dailyAverage).toBeCloseTo(31.18, 2);
  });

  it("sin comparación y sin movimientos no rompe", () => {
    const empty = buildReportData([], null, 30);
    expect(empty).toMatchObject({
      income: 0,
      expense: 0,
      savingsRate: 0,
      previous: null,
      categories: [],
      dailyAverage: 0,
    });
  });

  it("sin ingresos, la tasa de ahorro es 0 y no NaN", () => {
    expect(buildReportData([tx({ amount: 50 })], null, 10).savingsRate).toBe(0);
  });

  it("respeta el límite", () => {
    const many = Array.from({ length: 12 }, (_, i) => tx({ amount: i + 1, merchant: `Tienda ${i}` }));
    const data = buildReportData(many, null, 30, 3);
    expect(data.topMerchants).toHaveLength(3);
    expect(data.biggest).toHaveLength(3);
  });
});

describe("percentChange / inclusiveDays", () => {
  it("variación", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(10, 0)).toBeNull();
  });
  it("días incluyendo ambos extremos", () => {
    expect(inclusiveDays("2026-11-01", "2026-11-30")).toBe(30);
    expect(inclusiveDays("2026-02-01", "2026-02-28")).toBe(28);
    expect(inclusiveDays("2026-11-05", "2026-11-05")).toBe(1);
  });
});
