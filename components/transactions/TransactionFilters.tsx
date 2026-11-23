"use client";

import { DEFAULT_SORT, type TransactionSort } from "@/lib/transaction-sort";
import type { Category, TransactionType } from "@/lib/types";
import { detectPreset, NO_CATEGORY, presetRange, PRESET_LABELS, type DatePreset } from "@/lib/saved-filters";
import { dateKey } from "@/lib/utils";

export type Filters = {
  type: "all" | TransactionType;
  category: string;
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
  sort: TransactionSort;
};

export type PeriodOption = { id: string; name: string; start_date: string; end_date: string };

export const NO_FILTERS: Filters = {
  type: "all",
  category: "",
  dateFrom: "",
  dateTo: "",
  amountMin: "",
  amountMax: "",
  sort: DEFAULT_SORT,
};

export function activeFilterCount(f: Filters) {
  return [f.type !== "all", !!f.category, !!(f.dateFrom || f.dateTo), !!(f.amountMin || f.amountMax)].filter(Boolean)
    .length;
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
  const today = dateKey();
  const preset = selectedPeriod ? null : detectPreset(filters.dateFrom, filters.dateTo, today);
  const periodValue =
    selectedPeriod?.id ?? (preset ? `preset:${preset}` : filters.dateFrom || filters.dateTo ? "custom" : "");

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
        <option value={NO_CATEGORY}>Sin categoría</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        className="select"
        style={{ width: "100%" }}
        aria-label="Periodo"
        value={periodValue}
        onChange={(e) => {
          const value = e.target.value;
          if (value.startsWith("preset:")) {
            const r = presetRange(value.slice(7) as DatePreset, today);
            return onChange({ dateFrom: r.from, dateTo: r.to });
          }
          const p = periods.find((x) => x.id === value);
          onChange({ dateFrom: p?.start_date ?? "", dateTo: p?.end_date ?? "" });
        }}
      >
        <option value="">Cualquier fecha</option>
        <optgroup label="Rápidos">
          {(Object.keys(PRESET_LABELS) as DatePreset[]).map((k) => (
            <option key={k} value={`preset:${k}`}>
              {PRESET_LABELS[k]}
            </option>
          ))}
        </optgroup>
        {periods.length > 0 && (
          <optgroup label="Periodos">
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
        )}
        {periodValue === "custom" && (
          <option value="custom" disabled>
            Fechas personalizadas
          </option>
        )}
      </select>
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
      <div className="field">
        <label htmlFor="tf-min">Importe desde (€)</label>
        <input
          id="tf-min"
          className="input"
          inputMode="decimal"
          placeholder="0"
          value={filters.amountMin}
          onChange={(e) => onChange({ amountMin: e.target.value.replace(/[^\d.,]/g, "") })}
        />
      </div>
      <div className="field">
        <label htmlFor="tf-max">Importe hasta (€)</label>
        <input
          id="tf-max"
          className="input"
          inputMode="decimal"
          placeholder="Sin límite"
          value={filters.amountMax}
          onChange={(e) => onChange({ amountMax: e.target.value.replace(/[^\d.,]/g, "") })}
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
        <option value="concept_asc">Concepto (A-Z)</option>
        <option value="concept_desc">Concepto (Z-A)</option>
        <option value="category_asc">Categoría (A-Z)</option>
        <option value="category_desc">Categoría (Z-A)</option>
        <option value="type_asc">Gastos primero</option>
        <option value="type_desc">Ingresos primero</option>
      </select>
      {activeFilterCount(filters) > 0 && (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() =>
            onChange({ type: "all", category: "", dateFrom: "", dateTo: "", amountMin: "", amountMax: "" })
          }
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
