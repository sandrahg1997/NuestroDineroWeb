// Cálculos del Histórico: evolución por periodo y comparativa de gasto por
// categoría entre periodos. Sin React, para poder probarlos aparte.

export type HistoricoRow = { date: string; amount: number; type: "expense" | "income"; category_id: string | null };
export type PeriodRow = { id: string; name: string; start_date: string; end_date: string };
export type PeriodPoint = {
  id: string;
  label: string;
  start: string;
  end: string;
  expense: number;
  income: number;
  balance: number;
};
export type CmpBasis = "prev" | "avg3" | "year";
export type ComparisonRow = {
  cat: string;
  name: string;
  icon: string;
  now: number;
  before: number;
  delta: number;
  pct: number;
  trend: number[];
  tag: "new" | "gone" | null;
};

export const NO_CATEGORY = "__none__";
const TREND_PERIODS = 6;
const FORECAST_SAMPLE = 3;

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`)) / 86400000);
}
function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Una entrada por periodo (ya ordenados) con lo gastado, ingresado y el balance,
// más los totales, la media y la previsión (media de los últimos periodos).
export function periodEvolution(orderedPeriods: PeriodRow[], rows: HistoricoRow[]) {
  const evolution: PeriodPoint[] = orderedPeriods.map((p) => {
    let expense = 0;
    let income = 0;
    for (const t of rows) {
      if (t.date >= p.start_date && t.date <= p.end_date) {
        if (t.type === "expense") expense += Number(t.amount);
        else income += Number(t.amount);
      }
    }
    return {
      id: p.id,
      label: p.name,
      start: p.start_date,
      end: p.end_date,
      expense,
      income,
      balance: income - expense,
    };
  });

  const totalExpense = evolution.reduce((s, p) => s + p.expense, 0);
  const totalIncome = evolution.reduce((s, p) => s + p.income, 0);
  const avgExpense = evolution.length ? totalExpense / evolution.length : 0;
  const sample = evolution.slice(-FORECAST_SAMPLE);
  const forecastExpense = sample.length ? sample.reduce((s, p) => s + p.expense, 0) / sample.length : 0;

  return { evolution, totalExpense, totalIncome, avgExpense, forecastExpense };
}

// periodId -> (categoryId -> total gastado)
export function expenseByPeriod(orderedPeriods: PeriodRow[], rows: HistoricoRow[]) {
  const map = new Map<string, Map<string, number>>();
  for (const p of orderedPeriods) {
    const inner = new Map<string, number>();
    for (const t of rows) {
      if (t.type !== "expense") continue;
      if (t.date < p.start_date || t.date > p.end_date) continue;
      const cat = t.category_id ?? NO_CATEGORY;
      inner.set(cat, (inner.get(cat) ?? 0) + Number(t.amount));
    }
    map.set(p.id, inner);
  }
  return map;
}

// Periodo de referencia por defecto: el último con gasto, o el último.
export function defaultReferencePeriod(orderedPeriods: PeriodRow[], byPeriod: Map<string, Map<string, number>>) {
  for (let i = orderedPeriods.length - 1; i >= 0; i--) {
    const m = byPeriod.get(orderedPeriods[i].id);
    if (m && m.size) return orderedPeriods[i].id;
  }
  return orderedPeriods[orderedPeriods.length - 1]?.id ?? "";
}

// Compara el gasto por categoría del periodo de referencia con una base: el
// periodo anterior, la media de los 3 anteriores o el mismo periodo del año pasado.
export function compareCategories(
  orderedPeriods: PeriodRow[],
  byPeriod: Map<string, Map<string, number>>,
  refIndex: number,
  basis: CmpBasis,
  categoryInfo: (id: string) => { name: string; icon: string } | undefined
) {
  const empty = {
    rows: [] as ComparisonRow[],
    maxAbsDelta: 1,
    cut: 0,
    up: 0,
    nowTotal: 0,
    beforeTotal: 0,
    cutCount: 0,
    upCount: 0,
    trendCount: 0,
    hasBaseData: false,
    baseLabel: "",
  };
  if (refIndex < 0) return empty;

  const current = byPeriod.get(orderedPeriods[refIndex].id) ?? new Map<string, number>();

  // Periodos que forman la base de comparación.
  let basePeriods: PeriodRow[];
  if (basis === "prev") {
    basePeriods = refIndex > 0 ? [orderedPeriods[refIndex - 1]] : [];
  } else if (basis === "avg3") {
    basePeriods = orderedPeriods.slice(Math.max(0, refIndex - 3), refIndex);
  } else {
    // "year": el periodo cuyo inicio cae más cerca de un año antes (±60 días).
    const target = addDays(orderedPeriods[refIndex].start_date, -365);
    let best: PeriodRow | undefined;
    let bestDist = Infinity;
    for (let i = 0; i < refIndex; i++) {
      const dist = Math.abs(daysBetween(target, orderedPeriods[i].start_date));
      if (dist < bestDist) {
        bestDist = dist;
        best = orderedPeriods[i];
      }
    }
    basePeriods = best && bestDist <= 60 ? [best] : [];
  }

  const baseMaps = basePeriods.map((p) => byPeriod.get(p.id)).filter(Boolean) as Map<string, number>[];
  const baseDivisor = basis === "avg3" ? Math.max(1, basePeriods.length) : 1;
  const baseFor = (cat: string) => baseMaps.reduce((s, mm) => s + (mm.get(cat) ?? 0), 0) / baseDivisor;

  // Periodos para la mini-tendencia (los que terminan en el de referencia).
  const trendPeriods = orderedPeriods.slice(Math.max(0, refIndex - (TREND_PERIODS - 1)), refIndex + 1);

  const catIds = new Set<string>(current.keys());
  for (const mm of baseMaps) for (const c of mm.keys()) catIds.add(c);

  const rows = [...catIds]
    .map((cat): ComparisonRow => {
      const info = cat === NO_CATEGORY ? undefined : categoryInfo(cat);
      const name = cat === NO_CATEGORY ? "Sin categoría" : (info?.name ?? "Categoría eliminada");
      const icon = info?.icon ?? "•";
      const now = current.get(cat) ?? 0;
      const before = baseFor(cat);
      const delta = now - before;
      const pct = before > 0 ? (delta / before) * 100 : now > 0 ? 100 : 0;
      const trend = trendPeriods.map((p) => byPeriod.get(p.id)?.get(cat) ?? 0);
      const tag = before > 0 && now < 0.005 ? "gone" : before < 0.005 && now > 0 ? "new" : null;
      return { cat, name, icon, now, before, delta, pct, trend, tag };
    })
    .filter((r) => r.now > 0 || r.before > 0);

  rows.sort((a, b) => a.delta - b.delta); // recortes primero (delta más negativo arriba)

  return {
    rows,
    maxAbsDelta: rows.reduce((mx, r) => Math.max(mx, Math.abs(r.delta)), 0) || 1,
    cut: rows.reduce((s, r) => (r.delta < 0 ? s - r.delta : s), 0),
    up: rows.reduce((s, r) => (r.delta > 0 ? s + r.delta : s), 0),
    nowTotal: rows.reduce((s, r) => s + r.now, 0),
    beforeTotal: rows.reduce((s, r) => s + r.before, 0),
    cutCount: rows.filter((r) => r.delta < -0.005).length,
    upCount: rows.filter((r) => r.delta > 0.005).length,
    trendCount: trendPeriods.length,
    hasBaseData: baseMaps.length > 0,
    baseLabel:
      basis === "avg3"
        ? `media de ${basePeriods.length} periodo${basePeriods.length === 1 ? "" : "s"} previo${basePeriods.length === 1 ? "" : "s"}`
        : (basePeriods[0]?.name ?? "el periodo anterior"),
  };
}
