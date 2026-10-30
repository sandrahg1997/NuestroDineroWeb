"use client";

import type { Category, TransactionType } from "@/lib/types";

export type Filters = {
  type: "all" | TransactionType;
  category: string;
  dateFrom: string;
  dateTo: string;
  sort: "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
};

export type PeriodOption = { id: string; name: string; start_date: string; end_date: string };

export const NO_FILTERS: Filters = { type: "all", category: "", dateFrom: "", dateTo: "", sort: "date_desc" };

export function activeFilterCount(f: Filters) {
  return [f.type !== "all", !!f.category, !!(f.dateFrom || f.dateTo)].filter(Boolean).length;
}

export default function TransactionFilters({
  open,
  filters,
  onChange,
  categories,
  periods,
}: {
  open: boolean;
  filters: Filters;
  onChange: (change: Partial<Filters>) => void;
  categories: Category[];
  periods: PeriodOption[];
}) {
  // El periodo no es un filtro aparte: rellena Desde/Hasta y se reconoce por ellas.
  const selectedPeriod = periods.find((p) => p.start_date === filters.dateFrom && p.end_date === filters.dateTo);
  const periodValue = selectedPeriod?.id ?? (filters.dateFrom || filters.dateTo ? "custom" : "");

  return (
    <div id="transaction-filters" className={`transaction-toolbar ${open ? "open" : ""}`} style={{ marginBottom: 16 }}>
      <select
        className="select"
        style={{ width: "100%" }}
        aria-label="Tipo"
        value={filters.type}
        onChange={(e) => onChange({ type: e.target.value as Filters["type"] })}
      >
        <option value="all">Todos</option>
        <option value="expense">Gastos</option>
        <option value="income">Ingresos</option>
      </select>
      <select
        className="select"
        style={{ width: "100%" }}
        aria-label="Categoría"
        value={filters.category}
        onChange={(e) => onChange({ category: e.target.value })}
      >
        <option value="">Todas las categorías</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {periods.length > 0 && (
        <select
          className="select"
          style={{ width: "100%" }}
          aria-label="Periodo"
          value={periodValue}
          onChange={(e) => {
            const p = periods.find((x) => x.id === e.target.value);
            onChange({ dateFrom: p?.start_date ?? "", dateTo: p?.end_date ?? "" });
          }}
        >
          <option value="">Cualquier periodo</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          {periodValue === "custom" && (
            <option value="custom" disabled>
              Fechas personalizadas
            </option>
          )}
        </select>
      )}
      <div className="field">
        <label htmlFor="tf-from">Desde</label>
        <input
          id="tf-from"
          className="input"
          type="date"
          value={filters.dateFrom}
          onChange={(e) => onChange({ dateFrom: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="tf-to">Hasta</label>
        <input
          id="tf-to"
          className="input"
          type="date"
          value={filters.dateTo}
          onChange={(e) => onChange({ dateTo: e.target.value })}
        />
      </div>
      <select
        className="select"
        style={{ width: "100%" }}
        aria-label="Ordenar"
        value={filters.sort}
        onChange={(e) => onChange({ sort: e.target.value as Filters["sort"] })}
      >
        <option value="date_desc">Más recientes</option>
        <option value="date_asc">Más antiguos</option>
        <option value="amount_desc">Mayor importe</option>
        <option value="amount_asc">Menor importe</option>
      </select>
      {activeFilterCount(filters) > 0 && (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => onChange({ type: "all", category: "", dateFrom: "", dateTo: "" })}
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
