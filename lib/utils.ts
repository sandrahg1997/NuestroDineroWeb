export const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
export function monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-01`; }
export function cn(...classes: Array<string | false | null | undefined>) { return classes.filter(Boolean).join(" "); }

const CATEGORY_PALETTE = ["#8b5cf6", "#ec4899", "#3b82f6", "#10b981", "#f59e0b", "#6366f1", "#14b8a6", "#f43f5e"];

// Color determinista por nombre de categoría: mismo color en el donut y en las listas de movimientos.
export function categoryColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return CATEGORY_PALETTE[Math.abs(hash) % CATEGORY_PALETTE.length];
}

export function savingsTier(rate: number): { label: string; className: "good" | "neutral" | "warn" } {
  if (rate < 0) return { label: "Números rojos", className: "warn" };
  if (rate < 10) return { label: "Bajo", className: "neutral" };
  if (rate < 20) return { label: "En progreso", className: "neutral" };
  if (rate < 35) return { label: "Muy bien", className: "good" };
  return { label: "Excelente", className: "good" };
}

export function formatDateEs(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function defaultPeriodName(start: string, end: string) {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  const lastDayOfMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();
  const isFullCalendarMonth =
    startDate.getDate() === 1 &&
    endDate.getDate() === lastDayOfMonth &&
    endDate.getMonth() === startDate.getMonth() &&
    endDate.getFullYear() === startDate.getFullYear();
  if (isFullCalendarMonth) {
    const label = startDate.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return `${formatDateEs(start)} – ${formatDateEs(end)}`;
}
