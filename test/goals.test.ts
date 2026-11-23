import { describe, it, expect } from "vitest";
import { daysLeftLabel, goalProgress, pickFeaturedGoal, totalSaved } from "@/lib/goals";

const goal = (over = {}) => ({
  target_amount: 1000,
  target_date: "2027-01-01" as string | null,
  created_at: "2026-07-01T10:00:00Z",
  ...over,
});
const c = (...amounts: number[]) => amounts.map((amount) => ({ amount }));

describe("goalProgress", () => {
  it("suma aportaciones y retiradas", () => {
    const p = goalProgress(goal(), c(300, 200, -50), "2026-10-01");
    expect(p.saved).toBe(450);
    expect(p.remaining).toBe(550);
    expect(p.pct).toBe(45);
  });

  it("alcanzada: 100 % y sin cuota mensual", () => {
    const p = goalProgress(goal(), c(600, 400), "2026-10-01");
    expect(p).toMatchObject({ done: true, status: "done", pct: 100, remaining: 0, monthlyNeeded: null });
  });

  it("no enseña 100 % hasta llegar", () => {
    expect(goalProgress(goal(), c(999.9), "2026-10-01").pct).toBe(99);
  });

  it("sin fecha no hay cuota ni ritmo", () => {
    const p = goalProgress(goal({ target_date: null }), c(100), "2026-10-01");
    expect(p).toMatchObject({ status: "no-date", monthlyNeeded: null, daysLeft: null });
  });

  it("cuota mensual para llegar a tiempo", () => {
    // 2026-10-01 → 2027-01-01 son 92 días ≈ 3,02 meses; faltan 900.
    const p = goalProgress(goal(), c(100), "2026-10-01");
    expect(p.daysLeft).toBe(92);
    expect(p.monthlyNeeded).toBeCloseTo(297.8, 0);
  });

  it("a ritmo o por detrás según lo que ya debería llevarse", () => {
    // A mitad de plazo (≈ 2026-10-01) lo esperado son ≈ 500.
    expect(goalProgress(goal(), c(520), "2026-10-01").status).toBe("on-track");
    expect(goalProgress(goal(), c(100), "2026-10-01").status).toBe("behind");
  });

  it("fecha pasada y sin completar: vencida", () => {
    const p = goalProgress(goal({ target_date: "2026-09-01" }), c(100), "2026-10-01");
    expect(p).toMatchObject({ status: "late", monthlyNeeded: null });
    expect(p.daysLeft).toBe(-30);
  });

  it("el último día no dispara la cuota (mínimo 1 mes)", () => {
    const p = goalProgress(goal({ target_date: "2026-10-01" }), c(100), "2026-10-01");
    expect(p.monthlyNeeded).toBe(900);
  });

  it("sin aportaciones", () => {
    const p = goalProgress(goal(), [], "2026-10-01");
    expect(p).toMatchObject({ saved: 0, pct: 0, remaining: 1000 });
  });

  it("importes con céntimos no acumulan error de coma flotante", () => {
    expect(goalProgress(goal(), c(0.1, 0.2), "2026-10-01").saved).toBe(0.3);
  });
});

describe("totalSaved / daysLeftLabel", () => {
  it("total", () => expect(totalSaved(c(10, 20.5, -5))).toBe(25.5));
  it("etiquetas", () => {
    expect(daysLeftLabel(null)).toBe("");
    expect(daysLeftLabel(-3)).toBe("Venció hace 3 días");
    expect(daysLeftLabel(0)).toBe("Vence hoy");
    expect(daysLeftLabel(1)).toBe("Vence mañana");
    expect(daysLeftLabel(20)).toBe("Quedan 20 días");
    expect(daysLeftLabel(92)).toBe("Quedan 3 meses");
  });
});

describe("pickFeaturedGoal", () => {
  const g = (id: string, target_date: string | null, target_amount = 1000) => ({
    id,
    target_amount,
    target_date,
    created_at: "2026-07-01T10:00:00Z",
  });
  const contribs = [
    { goal_id: "a", amount: 100 },
    { goal_id: "c", amount: 900 },
  ];

  it("el que vence antes entre los pendientes", () => {
    const pick = pickFeaturedGoal([g("a", "2027-06-01"), g("b", "2027-01-01")], contribs, "2026-10-01");
    expect(pick?.goal.id).toBe("b");
  });

  it("ignora los cumplidos y los ya vencidos", () => {
    const done = [{ goal_id: "x", amount: 1000 }];
    const pick = pickFeaturedGoal(
      [g("x", "2026-12-01"), g("old", "2026-01-01"), g("b", "2027-03-01")],
      done,
      "2026-10-01"
    );
    expect(pick?.goal.id).toBe("b");
  });

  it("sin fechas futuras, el más avanzado", () => {
    const pick = pickFeaturedGoal([g("a", null), g("c", null)], contribs, "2026-10-01");
    expect(pick?.goal.id).toBe("c");
  });

  it("si todos están cumplidos o no hay objetivos, null", () => {
    expect(pickFeaturedGoal([], [], "2026-10-01")).toBeNull();
    expect(pickFeaturedGoal([g("x", null)], [{ goal_id: "x", amount: 1000 }], "2026-10-01")).toBeNull();
  });
});
