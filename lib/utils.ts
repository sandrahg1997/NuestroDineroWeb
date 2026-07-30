export const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
export function monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-01`; }
export function cn(...classes: Array<string | false | null | undefined>) { return classes.filter(Boolean).join(" "); }
