import type { Transaction } from "@/lib/types";

export type SortColumn = "date" | "concept" | "category" | "type" | "amount";
export type SortDirection = "asc" | "desc";
export type TransactionSort = `${SortColumn}_${SortDirection}`;

export const DEFAULT_SORT: TransactionSort = "date_desc";

export function parseSort(sort: TransactionSort) {
  const [column, direction] = sort.split("_") as [SortColumn, SortDirection];
  return { column, direction };
}

// Pulsar una columna nueva ordena ascendente; pulsar la activa invierte el sentido.
export function nextSort(current: TransactionSort, column: SortColumn): TransactionSort {
  const active = parseSort(current);
  if (active.column !== column) return `${column}_asc`;
  return `${column}_${active.direction === "asc" ? "desc" : "asc"}`;
}

type Sortable = Pick<Transaction, "date" | "created_at" | "concept" | "type" | "amount" | "category">;

const text = (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "base" });
const dateOf = (r: Sortable) => (typeof r.date === "string" ? r.date : "");
const categoryOf = (r: Sortable) => r.category?.name ?? "Sin categoría";

// Más reciente primero; dentro del mismo día, el último añadido.
const newestFirst = (a: Sortable, b: Sortable) =>
  dateOf(b).localeCompare(dateOf(a)) || (b.created_at ?? "").localeCompare(a.created_at ?? "");

const byColumn: Record<SortColumn, (a: Sortable, b: Sortable) => number> = {
  date: (a, b) => -newestFirst(a, b),
  concept: (a, b) => text(a.concept ?? "", b.concept ?? ""),
  category: (a, b) => text(categoryOf(a), categoryOf(b)),
  type: (a, b) => a.type.localeCompare(b.type),
  amount: (a, b) => Number(a.amount) - Number(b.amount),
};

// Los empates siempre quedan por fecha, sea cual sea el sentido elegido.
export function compareTransactions(sort: TransactionSort) {
  const { column, direction } = parseSort(sort);
  const sign = direction === "asc" ? 1 : -1;
  return (a: Sortable, b: Sortable) => sign * byColumn[column](a, b) || newestFirst(a, b);
}
