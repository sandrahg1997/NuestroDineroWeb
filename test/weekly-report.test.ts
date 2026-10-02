import { describe, it, expect } from "vitest";
import type { ChallengeProgress } from "@/lib/challenges";
import { buildWeeklyReport } from "@/lib/weekly-report";

const progress = (over: Partial<ChallengeProgress>): ChallengeProgress => ({
  status: "active",
  spent: 0,
  matches: 0,
  totalDays: 7,
  elapsedDays: 5,
  daysLeft: 2,
  cleanStreak: 5,
  estimatedSaved: 0,
  ...over,
});

const base = {
  householdName: "Casa",
  weekExpense: 312.4,
  previousWeekExpense: 355,
  topCategory: { name: "Supermercado", value: 120 },
  budget: { spent: 640, amount: 1000 },
  challenges: [{ title: "Semana sin delivery", icon: "🛵", progress: progress({}) }],
  hideAmounts: false,
};

describe("buildWeeklyReport", () => {
  it("resume gasto, tendencia, categoría, presupuesto y retos", () => {
    const r = buildWeeklyReport(base)!;
    expect(r.title).toBe("Vuestra semana · Casa");
    expect(r.body).toContain("312");
    expect(r.body).toContain("−12 % que la anterior");
    expect(r.body).toContain("Supermercado");
    expect(r.body).toContain("al 64 %");
    expect(r.body).toContain("5 días limpios");
  });

  it("sin importes si la persona los tiene ocultos", () => {
    const r = buildWeeklyReport({ ...base, hideAmounts: true })!;
    expect(r.body).not.toMatch(/\d+\s?€/);
    expect(r.body).toContain("−12 %");
  });

  it("no manda nada si no hay ni gastos ni retos", () => {
    expect(buildWeeklyReport({ ...base, weekExpense: 0, previousWeekExpense: 0, challenges: [] })).toBeNull();
  });

  it("avisa de un reto roto", () => {
    const r = buildWeeklyReport({
      ...base,
      challenges: [{ title: "Café en casa", icon: "☕", progress: progress({ status: "broken" }) }],
    })!;
    expect(r.body).toContain("se ha roto");
  });
});
