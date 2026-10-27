import type { Frequency, TransactionType } from "./types";

type Sortable = { is_active: boolean; next_date: string; concept: string };

// Activos primero; dentro de cada grupo, el próximo cobro antes.
export function sortRecurring<T extends Sortable>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      Number(b.is_active) - Number(a.is_active) ||
      a.next_date.localeCompare(b.next_date) ||
      a.concept.localeCompare(b.concept, "es")
  );
}

export const frequencyLabel = (f: Frequency) => (f === "weekly" ? "Semanal" : f === "monthly" ? "Mensual" : "Anual");

// Días entre dos fechas "YYYY-MM-DD" (negativo si ya pasó). Se calcula en UTC
// para que los cambios de hora no descuadren el resultado.
export function daysUntil(date: string, today: string) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function dueLabel(date: string, today: string) {
  const d = daysUntil(date, today);
  if (d < 0) return "Pendiente";
  if (d === 0) return "Hoy";
  if (d === 1) return "Mañana";
  if (d < 7) return `En ${d} días`;
  return new Date(`${date}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

// Lo que el formulario da por importe: "12,50", "12.5" o "1.234,56".
export function parseAmount(raw: string) {
  const s = raw.trim();
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return normalized && Number.isFinite(n) ? n : NaN;
}

export type ReminderItem = { concept: string; amount: number; type: TransactionType };

const fmt = (value: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);

// Aviso de "mañana se cobra…" para un hogar. Sin cifras si la persona tiene
// "Ocultar importes" (se ve en la pantalla de bloqueo).
export function buildRecurringReminder(
  items: ReminderItem[],
  hideAmounts: boolean
): { title: string; body: string } | null {
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => b.amount - a.amount);
  const label = (i: ReminderItem) => (hideAmounts ? i.concept : `${i.concept} (${fmt(i.amount)})`);

  if (sorted.length === 1) {
    const [i] = sorted;
    return {
      title: "Mañana hay un movimiento recurrente",
      body: i.type === "income" ? `Mañana entra ${label(i)}.` : `Mañana se cobra ${label(i)}.`,
    };
  }

  const shown = sorted.slice(0, 3).map(label);
  const rest = sorted.length - shown.length;
  const list = rest > 0 ? `${shown.join(", ")} y ${rest} más` : `${shown.slice(0, -1).join(", ")} y ${shown.at(-1)}`;
  const expense = sorted.filter((i) => i.type === "expense").reduce((t, i) => t + i.amount, 0);
  const total = !hideAmounts && expense > 0 ? ` Total en gastos: ${fmt(expense)}.` : "";
  return { title: `Mañana: ${sorted.length} movimientos recurrentes`, body: `${list}.${total}` };
}
