import { describe, it, expect } from "vitest";
import {
  buildBackup,
  describePlan,
  isEmptyPlan,
  parseBackup,
  planRestore,
  totalSkipped,
  type Backup,
  type RawData,
} from "@/lib/backup";

const NOW = new Date("2026-11-26T10:00:00Z");

const raw = (over: Partial<RawData> = {}): RawData => ({
  householdName: "Casa",
  categories: [
    {
      id: "c1",
      household_id: "h",
      name: "Supermercado",
      icon: "🛒",
      type: "expense",
      is_default: true,
      created_at: "",
    },
    { id: "c2", household_id: "h", name: "Nómina", icon: "💼", type: "income", is_default: true, created_at: "" },
  ],
  periods: [
    {
      id: "p1",
      household_id: "h",
      name: "Noviembre 2026",
      start_date: "2026-11-01",
      end_date: "2026-11-30",
      created_at: "",
    },
  ],
  budgets: [
    { id: "b1", household_id: "h", category_id: "c1", period_id: "p1", amount: 300, created_at: "" },
    { id: "b2", household_id: "h", category_id: null, period_id: "p1", amount: 1500, created_at: "" },
  ],
  transactions: [
    tx("t1", "2026-11-03", "expense", "Compra", "Mercadona", 42.5, "c1"),
    tx("t2", "2026-11-03", "expense", "Café", "Bar", 1.5, null),
    tx("t3", "2026-11-03", "expense", "Café", "Bar", 1.5, null),
    tx("t4", "2026-11-01", "income", "Nómina", "", 2000, "c2"),
  ],
  recurring: [
    {
      id: "r1",
      household_id: "h",
      concept: "Hipoteca",
      amount: 800,
      category_id: null,
      type: "expense",
      note: "",
      frequency: "monthly",
      next_date: "2026-12-01",
      end_date: null,
      is_active: true,
      created_at: "",
    },
  ],
  rules: [
    {
      id: "u1",
      household_id: "h",
      merchant_pattern: "mercadona",
      category_id: "c1",
      auto_confirm: true,
      created_at: "",
    },
  ],
  goals: [
    {
      id: "g1",
      household_id: "h",
      title: "Viaje",
      icon: "✈️",
      target_amount: 1000,
      target_date: "2027-06-01",
      created_by: null,
      created_at: "2026-07-01T00:00:00Z",
    },
  ],
  contributions: [
    {
      id: "k1",
      goal_id: "g1",
      household_id: "h",
      user_id: null,
      amount: 200,
      date: "2026-10-01",
      note: "oct",
      created_at: "",
    },
    {
      id: "k2",
      goal_id: "g1",
      household_id: "h",
      user_id: null,
      amount: -50,
      date: "2026-10-15",
      note: "",
      created_at: "",
    },
  ],
  ...over,
});

function tx(
  id: string,
  date: string,
  type: "expense" | "income",
  concept: string,
  merchant: string,
  amount: number,
  category_id: string | null
) {
  return {
    id,
    household_id: "h",
    user_id: "u",
    concept,
    amount,
    date,
    category_id,
    type,
    note: "",
    merchant,
    receipt_text: "",
    recurring_id: null,
    created_at: "",
    activity_notified_at: null,
  } as RawData["transactions"][number];
}

const empty = (): Backup =>
  buildBackup(
    raw({
      categories: [],
      periods: [],
      budgets: [],
      transactions: [],
      recurring: [],
      rules: [],
      goals: [],
      contributions: [],
    }),
    NOW
  );

describe("buildBackup / parseBackup", () => {
  it("exporta por nombres y se puede volver a leer", () => {
    const backup = buildBackup(raw(), NOW);
    expect(backup.transactions[0]).toMatchObject({
      concept: "Compra",
      category: { type: "expense", name: "Supermercado" },
    });
    expect(backup.budgets.find((b) => b.category === null)?.amount).toBe(1500);
    expect(backup.goals[0].contributions).toHaveLength(2);
    expect(backup.rules[0]).toMatchObject({ merchant_pattern: "mercadona", auto_confirm: true });
    const read = parseBackup(JSON.stringify(backup));
    expect(read.ok).toBe(true);
    expect(read.ok && read.backup).toEqual(backup);
  });

  it("rechaza lo que no es una copia", () => {
    expect(parseBackup("no es json")).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify({ hola: 1 }))).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify({ app: "ourmoney", version: 99 }))).toMatchObject({ ok: false });
  });

  it("rechaza importes o fechas inválidos", () => {
    const bad = buildBackup(raw(), NOW);
    bad.transactions[0].amount = -5;
    expect(parseBackup(JSON.stringify(bad))).toMatchObject({ ok: false });
    const bad2 = buildBackup(raw(), NOW);
    bad2.transactions[0].date = "ayer";
    expect(parseBackup(JSON.stringify(bad2))).toMatchObject({ ok: false });
  });

  it("una copia antigua sin objetivos se lee con la lista vacía", () => {
    const old: Record<string, unknown> = { ...buildBackup(raw(), NOW) };
    delete old.goals;
    const read = parseBackup(JSON.stringify(old));
    expect(read.ok && read.backup.goals).toEqual([]);
  });

  it("descarta presupuestos y reglas de categorías desaparecidas sin romper", () => {
    const b = buildBackup(raw({ categories: [] }), NOW);
    expect(b.rules).toEqual([]);
    expect(b.transactions[0].category).toBeNull();
  });
});

describe("planRestore", () => {
  it("restaurar tu propia copia en el mismo espacio no añade nada", () => {
    const backup = buildBackup(raw(), NOW);
    const plan = planRestore(backup, backup);
    expect(isEmptyPlan(plan)).toBe(true);
    expect(plan.skipped.transactions).toBe(4);
    expect(totalSkipped(plan)).toBeGreaterThan(10);
  });

  it("en un espacio vacío añade todo", () => {
    const plan = planRestore(buildBackup(raw(), NOW), empty());
    expect(plan.transactions).toHaveLength(4);
    expect(plan.categories).toHaveLength(2);
    expect(plan.periods).toHaveLength(1);
    expect(plan.budgets).toHaveLength(2);
    expect(plan.recurring).toHaveLength(1);
    expect(plan.rules).toHaveLength(1);
    expect(plan.goals).toHaveLength(1);
    expect(totalSkipped(plan)).toBe(0);
    expect(describePlan(plan)).toBe(
      "4 movimientos, 2 categorías, 1 periodo, 2 presupuestos, 1 recurrente, 1 regla de comercio, 1 objetivo de ahorro"
    );
  });

  it("dos movimientos idénticos: si ya hay uno, añade solo el que falta", () => {
    const backup = buildBackup(raw(), NOW);
    const existing = buildBackup(
      raw({ transactions: [tx("x", "2026-11-03", "expense", "Café", "Bar", 1.5, null)] }),
      NOW
    );
    const plan = planRestore(backup, existing);
    expect(plan.transactions.filter((t) => t.concept === "Café")).toHaveLength(1);
    expect(plan.skipped.transactions).toBe(1);
  });

  it("categorías: no distingue mayúsculas ni espacios; presupuestos y objetivos no se duplican", () => {
    const backup = buildBackup(raw(), NOW);
    const existing = buildBackup(raw(), NOW);
    existing.categories[0].name = "  SUPERMERCADO ";
    existing.goals[0].title = "viaje";
    const plan = planRestore(backup, existing);
    expect(plan.categories).toHaveLength(0);
    expect(plan.goals).toHaveLength(0);
  });

  it("comparar movimientos ignora mayúsculas del concepto pero no el importe ni el día", () => {
    const backup = buildBackup(raw(), NOW);
    const existing = buildBackup(raw(), NOW);
    existing.transactions[0].concept = "COMPRA";
    existing.transactions[3].amount = 2001;
    const plan = planRestore(backup, existing);
    expect(plan.transactions.map((t) => t.concept)).toEqual(["Nómina"]);
  });
});
