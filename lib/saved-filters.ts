// Filtros guardados de Movimientos. Viven en este dispositivo (localStorage, por espacio):
// no se comparten con tu pareja ni entre móviles. Las fechas "Este mes", "Este año" o
// "Últimos 30 días" se guardan como relativas, para que el filtro siga valiendo mañana.

export type DatePreset = "month" | "year" | "last30";
export type TypeFilter = "all" | "expense" | "income";

export type SavedFilter = {
  id: string;
  name: string;
  query: string;
  type: TypeFilter;
  /** Id de categoría, "__none" (sin categoría) o "" (todas). */
  category: string;
  amountMin: string;
  amountMax: string;
  datePreset: DatePreset | null;
  dateFrom: string;
  dateTo: string;
};

export type FilterState = Pick<
  SavedFilter,
  "query" | "type" | "category" | "amountMin" | "amountMax" | "dateFrom" | "dateTo"
>;

export const NO_CATEGORY = "__none";
export const PRESET_LABELS: Record<DatePreset, string> = {
  month: "Este mes",
  year: "Este año",
  last30: "Últimos 30 días",
};

const MAX_SAVED = 20;
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function parse(date: string) {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

function addDays(date: string, days: number) {
  const { y, m, d } = parse(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

// Rango de fechas de un preajuste respecto a `today` (AAAA-MM-DD).
export function presetRange(preset: DatePreset, today: string): { from: string; to: string } {
  const { y, m } = parse(today);
  if (preset === "year") return { from: ymd(y, 1, 1), to: ymd(y, 12, 31) };
  if (preset === "month") return { from: ymd(y, m, 1), to: ymd(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate()) };
  return { from: addDays(today, -29), to: today };
}

// ¿Esas fechas son exactamente un preajuste de hoy? Si sí, el filtro se guarda relativo.
export function detectPreset(from: string, to: string, today: string): DatePreset | null {
  if (!from || !to) return null;
  for (const preset of ["month", "year", "last30"] as const) {
    const r = presetRange(preset, today);
    if (r.from === from && r.to === to) return preset;
  }
  return null;
}

export function makeSavedFilter(
  name: string,
  state: FilterState,
  today: string,
  id = crypto.randomUUID()
): SavedFilter {
  const datePreset = detectPreset(state.dateFrom, state.dateTo, today);
  return {
    id,
    name: name.trim().slice(0, 40),
    query: state.query.trim(),
    type: state.type,
    category: state.category,
    amountMin: state.amountMin,
    amountMax: state.amountMax,
    datePreset,
    dateFrom: datePreset ? "" : state.dateFrom,
    dateTo: datePreset ? "" : state.dateTo,
  };
}

// Lo que hay que aplicar al elegir un filtro guardado. Si su categoría ya no existe, se
// ignora en vez de dejar la lista vacía sin explicación.
export function resolveSavedFilter(saved: SavedFilter, today: string, categoryIds: Set<string>): FilterState {
  const range = saved.datePreset ? presetRange(saved.datePreset, today) : null;
  const categoryOk = saved.category === "" || saved.category === NO_CATEGORY || categoryIds.has(saved.category);
  return {
    query: saved.query,
    type: saved.type,
    category: categoryOk ? saved.category : "",
    amountMin: saved.amountMin,
    amountMax: saved.amountMax,
    dateFrom: range?.from ?? saved.dateFrom,
    dateTo: range?.to ?? saved.dateTo,
  };
}

const isType = (v: unknown): v is TypeFilter => v === "all" || v === "expense" || v === "income";
const isDate = (v: unknown): v is string => typeof v === "string" && (v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v));
const isAmount = (v: unknown): v is string => typeof v === "string" && v.length <= 14 && /^[\d.,]*$/.test(v);

// Lee lo guardado con tolerancia: lo que no cuadra se descarta, nunca lanza.
export function parseSavedFilters(raw: string | null): SavedFilter[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: SavedFilter[] = [];
  for (const item of data) {
    if (typeof item !== "object" || item === null) continue;
    const f = item as Record<string, unknown>;
    if (typeof f.id !== "string" || typeof f.name !== "string" || !f.name.trim()) continue;
    if (!isType(f.type) || typeof f.query !== "string" || typeof f.category !== "string") continue;
    if (!isAmount(f.amountMin) || !isAmount(f.amountMax) || !isDate(f.dateFrom) || !isDate(f.dateTo)) continue;
    const preset =
      f.datePreset === "month" || f.datePreset === "year" || f.datePreset === "last30" ? f.datePreset : null;
    out.push({
      id: f.id,
      name: f.name.trim().slice(0, 40),
      query: f.query.slice(0, 120),
      type: f.type,
      category: f.category,
      amountMin: f.amountMin,
      amountMax: f.amountMax,
      datePreset: preset,
      dateFrom: f.dateFrom,
      dateTo: f.dateTo,
    });
    if (out.length >= MAX_SAVED) break;
  }
  return out;
}

const storageKey = (householdId: string) => `ourmoney-saved-filters:${householdId}`;

export function loadSavedFilters(householdId: string): SavedFilter[] {
  try {
    return parseSavedFilters(localStorage.getItem(storageKey(householdId)));
  } catch {
    return [];
  }
}

// Devuelve false si no se pudo guardar (almacenamiento bloqueado o lleno).
export function storeSavedFilters(householdId: string, list: SavedFilter[]): boolean {
  try {
    localStorage.setItem(storageKey(householdId), JSON.stringify(list.slice(0, MAX_SAVED)));
    return true;
  } catch {
    return false;
  }
}

export const MAX_SAVED_FILTERS = MAX_SAVED;

// Importe tecleado → número, o null si está vacío o no es un número.
export function amountValue(text: string): number | null {
  if (!text.trim()) return null;
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
