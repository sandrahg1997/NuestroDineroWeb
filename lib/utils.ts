export const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
export function monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-01`; }
export function cn(...classes: Array<string | false | null | undefined>) { return classes.filter(Boolean).join(" "); }

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
