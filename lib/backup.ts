import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/database.types";
import { fetchAll } from "@/lib/fetch-all";

// Copia de seguridad de un espacio en un JSON. Se guarda por NOMBRES (categorías,
// periodos) y no por identificadores, para poder restaurarla en cualquier espacio:
// al restaurar, lo que ya existe se reutiliza y lo que falta se crea. Restaurar solo
// AÑADE: nunca borra ni modifica nada de lo que ya hay.
//
// Incluye: categorías, periodos, presupuestos, movimientos, recurrentes, reglas de
// comercio y objetivos de ahorro con sus aportaciones. No incluye: retos, reuniones,
// pendientes de Apple Pay, preferencias, ni el texto OCR de los tickets.

type Client = SupabaseClient<Database>;
type Tables = Database["public"]["Tables"];

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "fecha no válida");
const money = z.number().finite().positive().max(1e9);
const type = z.enum(["expense", "income"]);
const text = (max: number) => z.string().max(max);
const catRef = z.object({ type, name: text(80) }).nullable();

export const backupSchema = z.object({
  app: z.literal("ourmoney"),
  version: z.literal(1),
  exportedAt: z.string(),
  household: z.object({ name: text(120) }),
  categories: z.array(z.object({ name: text(80).min(1), icon: text(16), type })).max(1000),
  periods: z.array(z.object({ name: text(120), start_date: day, end_date: day })).max(2000),
  budgets: z
    .array(z.object({ amount: money, period: z.object({ start_date: day, end_date: day }), category: catRef }))
    .max(50_000),
  transactions: z
    .array(
      z.object({
        date: day,
        type,
        concept: text(200),
        merchant: text(200),
        amount: money,
        note: text(1000),
        category: catRef,
      })
    )
    .max(200_000),
  recurring: z
    .array(
      z.object({
        concept: text(200),
        amount: money,
        type,
        note: text(1000),
        frequency: z.enum(["weekly", "monthly", "yearly"]),
        next_date: day,
        end_date: day.nullable(),
        is_active: z.boolean(),
        category: catRef,
      })
    )
    .max(5000),
  rules: z
    .array(
      z.object({
        merchant_pattern: text(200).min(1),
        category: z.object({ type, name: text(80) }),
        auto_confirm: z.boolean().optional(),
      })
    )
    .max(20_000),
  goals: z
    .array(
      z.object({
        title: text(120).min(1),
        icon: text(16),
        target_amount: money,
        target_date: day.nullable(),
        created_at: z.string(),
        contributions: z
          .array(
            z.object({
              amount: z
                .number()
                .finite()
                .refine((n) => n !== 0, "aportación a 0")
                .refine((n) => Math.abs(n) <= 1e9),
              date: day,
              note: text(300),
            })
          )
          .max(20_000),
      })
    )
    .max(1000)
    .default([]),
});

export type Backup = z.infer<typeof backupSchema>;
export type BackupCategory = Backup["categories"][number];
export type BackupPeriod = Backup["periods"][number];
export type BackupBudget = Backup["budgets"][number];
export type BackupTransaction = Backup["transactions"][number];
export type BackupRecurring = Backup["recurring"][number];
export type BackupRule = Backup["rules"][number];
export type BackupGoal = Backup["goals"][number];

export type RawData = {
  householdName: string;
  categories: Tables["categories"]["Row"][];
  periods: Tables["periods"]["Row"][];
  budgets: Tables["budgets"]["Row"][];
  transactions: Tables["transactions"]["Row"][];
  recurring: Tables["recurring_transactions"]["Row"][];
  rules: Tables["merchant_category_rules"]["Row"][];
  goals: Tables["savings_goals"]["Row"][];
  contributions: Tables["savings_contributions"]["Row"][];
};

// ---------- Exportar ----------

const norm = (s: string) => s.trim().toLowerCase();
const d10 = (s: string) => s.slice(0, 10);

export function buildBackup(raw: RawData, now = new Date()): Backup {
  const cats = new Map(raw.categories.map((c) => [c.id, { type: c.type, name: c.name }]));
  const ref = (id: string | null) => (id ? (cats.get(id) ?? null) : null);
  const periods = new Map(raw.periods.map((p) => [p.id, p]));
  const contributions = new Map<string, RawData["contributions"]>();
  for (const c of raw.contributions) contributions.set(c.goal_id, [...(contributions.get(c.goal_id) ?? []), c]);

  return {
    app: "ourmoney",
    version: 1,
    exportedAt: now.toISOString(),
    household: { name: raw.householdName },
    categories: raw.categories.map((c) => ({ name: c.name, icon: c.icon, type: c.type })),
    periods: raw.periods.map((p) => ({ name: p.name, start_date: d10(p.start_date), end_date: d10(p.end_date) })),
    budgets: raw.budgets.flatMap((b) => {
      const p = periods.get(b.period_id);
      return p
        ? [
            {
              amount: Number(b.amount),
              period: { start_date: d10(p.start_date), end_date: d10(p.end_date) },
              category: ref(b.category_id),
            },
          ]
        : [];
    }),
    transactions: raw.transactions.map((t) => ({
      date: d10(t.date),
      type: t.type,
      concept: t.concept,
      merchant: t.merchant ?? "",
      amount: Number(t.amount),
      note: t.note ?? "",
      category: ref(t.category_id),
    })),
    recurring: raw.recurring.map((r) => ({
      concept: r.concept,
      amount: Number(r.amount),
      type: r.type,
      note: r.note ?? "",
      frequency: r.frequency,
      next_date: d10(r.next_date),
      end_date: r.end_date ? d10(r.end_date) : null,
      is_active: r.is_active,
      category: ref(r.category_id),
    })),
    rules: raw.rules.flatMap((r) => {
      const category = ref(r.category_id);
      return category
        ? [{ merchant_pattern: r.merchant_pattern, category, ...(r.auto_confirm ? { auto_confirm: true } : {}) }]
        : [];
    }),
    goals: raw.goals.map((g) => ({
      title: g.title,
      icon: g.icon,
      target_amount: Number(g.target_amount),
      target_date: g.target_date ? d10(g.target_date) : null,
      created_at: g.created_at,
      contributions: (contributions.get(g.id) ?? []).map((c) => ({
        amount: Number(c.amount),
        date: d10(c.date),
        note: c.note ?? "",
      })),
    })),
  };
}

// Lee todo lo del espacio. Las tablas de objetivos pueden no existir (migración sin
// aplicar): en ese caso se tratan como vacías. Cualquier otro error se propaga.
export async function loadHouseholdRaw(s: Client, householdId: string): Promise<RawData> {
  const must = <T>(label: string, r: { data: T[] | null; error: { message: string } | null }) => {
    if (r.error) throw new Error(`${label}: ${r.error.message}`);
    return r.data ?? [];
  };
  const [household, categories, periods, budgets, transactions, recurring, rules, goals, contributions] =
    await Promise.all([
      s.from("households").select("name").eq("id", householdId).single(),
      fetchAll((from, to) =>
        s.from("categories").select("*").eq("household_id", householdId).order("id").range(from, to)
      ),
      fetchAll((from, to) => s.from("periods").select("*").eq("household_id", householdId).order("id").range(from, to)),
      fetchAll((from, to) => s.from("budgets").select("*").eq("household_id", householdId).order("id").range(from, to)),
      fetchAll((from, to) =>
        s.from("transactions").select("*").eq("household_id", householdId).order("date").order("id").range(from, to)
      ),
      fetchAll((from, to) =>
        s.from("recurring_transactions").select("*").eq("household_id", householdId).order("id").range(from, to)
      ),
      fetchAll((from, to) =>
        s.from("merchant_category_rules").select("*").eq("household_id", householdId).order("id").range(from, to)
      ),
      fetchAll((from, to) =>
        s.from("savings_goals").select("*").eq("household_id", householdId).order("id").range(from, to)
      ),
      fetchAll((from, to) =>
        s.from("savings_contributions").select("*").eq("household_id", householdId).order("id").range(from, to)
      ),
    ]);
  if (household.error) throw new Error(`Espacio: ${household.error.message}`);
  return {
    householdName: household.data?.name ?? "",
    categories: must("Categorías", categories),
    periods: must("Periodos", periods),
    budgets: must("Presupuestos", budgets),
    transactions: must("Movimientos", transactions),
    recurring: must("Recurrentes", recurring),
    rules: must("Reglas de comercio", rules),
    goals: goals.error ? [] : (goals.data ?? []),
    contributions: contributions.error ? [] : (contributions.data ?? []),
  };
}

// ---------- Leer un fichero ----------

export function parseBackup(content: string): { ok: true; backup: Backup } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return { ok: false, error: "El fichero no es una copia de OurMoney (no es un JSON válido)." };
  }
  if (typeof json !== "object" || json === null || (json as { app?: unknown }).app !== "ourmoney")
    return { ok: false, error: "Este fichero no es una copia de seguridad de OurMoney." };
  if ((json as { version?: unknown }).version !== 1)
    return { ok: false, error: "Esta copia es de una versión que esta app no sabe leer." };
  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `La copia está dañada o incompleta (${issue.path.join(".") || "formato"}: ${issue.message}).`,
    };
  }
  return { ok: true, backup: parsed.data };
}

// ---------- Planificar la restauración ----------

const catKey = (c: { type: string; name: string }) => `${c.type}|${norm(c.name)}`;
const refKey = (c: { type: string; name: string } | null) => (c ? catKey(c) : "*");
const periodKey = (p: { start_date: string; end_date: string }) => `${p.start_date}|${p.end_date}`;
const txKey = (t: BackupTransaction) =>
  `${t.date}|${t.type}|${t.amount.toFixed(2)}|${norm(t.concept)}|${norm(t.merchant)}`;
const recurringKey = (r: BackupRecurring) => `${r.type}|${norm(r.concept)}|${r.amount.toFixed(2)}|${r.frequency}`;
const budgetKey = (b: BackupBudget) => `${periodKey(b.period)}|${refKey(b.category)}`;
const goalKey = (g: BackupGoal) => `${norm(g.title)}|${g.target_amount.toFixed(2)}`;

export type RestorePlan = {
  categories: BackupCategory[];
  periods: BackupPeriod[];
  budgets: BackupBudget[];
  transactions: BackupTransaction[];
  recurring: BackupRecurring[];
  rules: BackupRule[];
  goals: BackupGoal[];
  /** Cuántos elementos de la copia ya estaban y se omiten. */
  skipped: Record<"categories" | "periods" | "budgets" | "transactions" | "recurring" | "rules" | "goals", number>;
};

// Qué hay que crear para que `existing` (lo que ya hay, en formato copia) incluya todo
// lo de `backup`. Los movimientos se comparan contando repeticiones: si en la copia hay
// dos cafés iguales el mismo día y ya hay uno, se añade solo el que falta.
export function planRestore(backup: Backup, existing: Backup): RestorePlan {
  const skipped = { categories: 0, periods: 0, budgets: 0, transactions: 0, recurring: 0, rules: 0, goals: 0 };
  const missing = <T>(items: T[], have: Set<string>, key: (x: T) => string, name: keyof typeof skipped) => {
    const seen = new Set(have);
    return items.filter((item) => {
      const k = key(item);
      if (seen.has(k)) {
        skipped[name]++;
        return false;
      }
      seen.add(k);
      return true;
    });
  };

  const categories = missing(backup.categories, new Set(existing.categories.map(catKey)), catKey, "categories");
  const periods = missing(backup.periods, new Set(existing.periods.map(periodKey)), periodKey, "periods");
  const budgets = missing(backup.budgets, new Set(existing.budgets.map(budgetKey)), budgetKey, "budgets");
  const recurring = missing(backup.recurring, new Set(existing.recurring.map(recurringKey)), recurringKey, "recurring");
  const rules = missing(
    backup.rules,
    new Set(existing.rules.map((r) => norm(r.merchant_pattern))),
    (r) => norm(r.merchant_pattern),
    "rules"
  );
  const goals = missing(backup.goals, new Set(existing.goals.map(goalKey)), goalKey, "goals");

  const have = new Map<string, number>();
  for (const t of existing.transactions) have.set(txKey(t), (have.get(txKey(t)) ?? 0) + 1);
  const transactions = backup.transactions.filter((t) => {
    const k = txKey(t);
    const n = have.get(k) ?? 0;
    if (n > 0) {
      have.set(k, n - 1);
      skipped.transactions++;
      return false;
    }
    return true;
  });

  return { categories, periods, budgets, transactions, recurring, rules, goals, skipped };
}

export function isEmptyPlan(p: RestorePlan) {
  return (
    !p.categories.length &&
    !p.periods.length &&
    !p.budgets.length &&
    !p.transactions.length &&
    !p.recurring.length &&
    !p.rules.length &&
    !p.goals.length
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Resumen para enseñar antes de restaurar: solo lo que se va a añadir.
export function describePlan(p: RestorePlan) {
  const parts = [
    p.transactions.length && plural(p.transactions.length, "movimiento", "movimientos"),
    p.categories.length && plural(p.categories.length, "categoría", "categorías"),
    p.periods.length && plural(p.periods.length, "periodo", "periodos"),
    p.budgets.length && plural(p.budgets.length, "presupuesto", "presupuestos"),
    p.recurring.length && plural(p.recurring.length, "recurrente", "recurrentes"),
    p.rules.length && plural(p.rules.length, "regla de comercio", "reglas de comercio"),
    p.goals.length && plural(p.goals.length, "objetivo de ahorro", "objetivos de ahorro"),
  ].filter(Boolean);
  return parts.join(", ");
}

export function totalSkipped(p: RestorePlan) {
  return Object.values(p.skipped).reduce((a, b) => a + b, 0);
}

// ---------- Restaurar ----------

const CHUNK = 500;
function* chunks<T>(items: T[], size = CHUNK) {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

// Ejecuta el plan en el espacio dado. Orden: categorías y periodos primero (hace falta
// su id para lo demás). Si algo falla a medias, volver a restaurar la misma copia es
// seguro: lo ya añadido se detecta y se omite.
export async function restoreBackup(
  s: Client,
  ctx: { householdId: string; userId: string },
  plan: RestorePlan,
  onProgress: (message: string) => void = () => {}
) {
  const { householdId, userId } = ctx;
  const fail = (label: string, error: { message: string }): never => {
    throw new Error(`${label}: ${error.message}. Puedes volver a intentarlo: lo que ya se restauró se omitirá.`);
  };

  if (plan.categories.length) {
    onProgress("Categorías…");
    for (const part of chunks(plan.categories)) {
      const { error } = await s
        .from("categories")
        .insert(
          part.map((c) => ({
            household_id: householdId,
            name: c.name,
            icon: c.icon || "📦",
            type: c.type,
            is_default: false,
          }))
        );
      if (error) fail("Categorías", error);
    }
  }
  if (plan.periods.length) {
    onProgress("Periodos…");
    for (const part of chunks(plan.periods)) {
      const { error } = await s
        .from("periods")
        .insert(
          part.map((p) => ({ household_id: householdId, name: p.name, start_date: p.start_date, end_date: p.end_date }))
        );
      if (error) fail("Periodos", error);
    }
  }

  // Identificadores actuales (los que ya había + los recién creados).
  const [cats, pers] = await Promise.all([
    fetchAll((from, to) =>
      s.from("categories").select("id,name,type").eq("household_id", householdId).order("id").range(from, to)
    ),
    fetchAll((from, to) =>
      s.from("periods").select("id,start_date,end_date").eq("household_id", householdId).order("id").range(from, to)
    ),
  ]);
  if (cats.error) fail("Categorías", cats.error);
  if (pers.error) fail("Periodos", pers.error);
  const catId = new Map((cats.data ?? []).map((c) => [catKey(c), c.id]));
  const periodId = new Map(
    (pers.data ?? []).map((p) => [periodKey({ start_date: d10(p.start_date), end_date: d10(p.end_date) }), p.id])
  );
  const category = (c: { type: string; name: string } | null) => (c ? (catId.get(catKey(c)) ?? null) : null);

  if (plan.budgets.length) {
    onProgress("Presupuestos…");
    const rows = plan.budgets.flatMap((b) => {
      const pid = periodId.get(periodKey(b.period));
      const cid = category(b.category);
      // Un presupuesto de categoría cuya categoría no se encuentra no puede restaurarse.
      if (!pid || (b.category && !cid)) return [];
      return [{ household_id: householdId, period_id: pid, category_id: cid, amount: b.amount }];
    });
    for (const part of chunks(rows)) {
      const { error } = await s.from("budgets").insert(part);
      if (error) fail("Presupuestos", error);
    }
  }

  if (plan.transactions.length) {
    let done = 0;
    for (const part of chunks(plan.transactions)) {
      onProgress(`Movimientos… ${done}/${plan.transactions.length}`);
      const { error } = await s.from("transactions").insert(
        part.map((t) => ({
          household_id: householdId,
          user_id: userId,
          concept: t.concept || t.merchant || "Movimiento",
          merchant: t.merchant,
          amount: t.amount,
          date: t.date,
          category_id: category(t.category),
          type: t.type,
          note: t.note,
        }))
      );
      if (error) fail("Movimientos", error);
      done += part.length;
    }
  }

  if (plan.recurring.length) {
    onProgress("Recurrentes…");
    for (const part of chunks(plan.recurring)) {
      const { error } = await s.from("recurring_transactions").insert(
        part.map((r) => ({
          household_id: householdId,
          concept: r.concept,
          amount: r.amount,
          category_id: category(r.category),
          type: r.type,
          note: r.note,
          frequency: r.frequency,
          next_date: r.next_date,
          end_date: r.end_date,
          is_active: r.is_active,
        }))
      );
      if (error) fail("Recurrentes", error);
    }
  }

  if (plan.rules.length) {
    onProgress("Reglas de comercio…");
    const rows = plan.rules.flatMap((r) => {
      const cid = category(r.category);
      return cid
        ? [
            {
              household_id: householdId,
              merchant_pattern: r.merchant_pattern,
              category_id: cid,
              // Solo si es true: sin la migración de Pendientes la columna no existe.
              ...(r.auto_confirm ? { auto_confirm: true } : {}),
            },
          ]
        : [];
    });
    for (const part of chunks(rows)) {
      const { error } = await s
        .from("merchant_category_rules")
        .upsert(part, { onConflict: "household_id,merchant_pattern", ignoreDuplicates: true });
      if (error) fail("Reglas de comercio", error);
    }
  }

  for (const [i, g] of plan.goals.entries()) {
    onProgress(`Objetivos… ${i + 1}/${plan.goals.length}`);
    const { data: goal, error } = await s
      .from("savings_goals")
      .insert({
        household_id: householdId,
        title: g.title,
        icon: g.icon || "🎯",
        target_amount: g.target_amount,
        target_date: g.target_date,
        created_by: userId,
        created_at: g.created_at,
      })
      .select("id")
      .single();
    if (error || !goal) return fail("Objetivos", error ?? { message: "no se pudo crear" });
    for (const part of chunks(g.contributions)) {
      const { error: cError } = await s.from("savings_contributions").insert(
        part.map((c) => ({
          goal_id: goal.id,
          household_id: householdId,
          user_id: userId,
          amount: c.amount,
          date: c.date,
          note: c.note,
        }))
      );
      if (cError) fail("Aportaciones", cError);
    }
  }
}
