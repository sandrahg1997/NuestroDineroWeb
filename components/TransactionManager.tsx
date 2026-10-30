"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Category, Transaction, TransactionType } from "@/lib/types";
import Money from "@/components/Money";
import { notifyPartnerActivity, TRANSACTION_LIST_FIELDS } from "@/lib/utils";
import { Plus, Search, SlidersHorizontal } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useToast } from "./Toast";
import TransactionForm, { blankForm, type Form, type MerchantRule } from "./transactions/TransactionForm";
import TransactionFilters, {
  activeFilterCount,
  NO_FILTERS,
  type Filters,
  type PeriodOption,
} from "./transactions/TransactionFilters";
import TransactionList, { isTemp } from "./transactions/TransactionList";

const PAGE_SIZE = 50;
// Tiempo para pulsar "Deshacer" antes de borrar de verdad.
const UNDO_MS = 5000;
const NO_PERIODS: PeriodOption[] = [];

type PendingDelete = { row: Transaction; timer: ReturnType<typeof setTimeout> };

export default function TransactionManager({
  householdId,
  userId,
  initial,
  initialCategories,
  rules = [],
  periods = NO_PERIODS,
}: {
  householdId: string;
  userId: string;
  initial: Transaction[];
  initialCategories: Category[];
  rules?: MerchantRule[];
  periods?: PeriodOption[];
}) {
  const [rows, setRows] = useState(initial);
  const [categories] = useState(initialCategories);
  const [form, setForm] = useState<Form | null>(null);
  const [formResetKey, setFormResetKey] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const params = useSearchParams();
  const { toast } = useToast();
  // Borrados en espera de que pase el plazo para deshacer.
  const pendingDeletes = useRef(new Map<string, PendingDelete>());
  // Dónde estaba el foco al abrir el formulario, para devolverlo al cerrarlo.
  const returnFocus = useRef<HTMLElement | null>(null);

  // Datos nuevos del servidor (tiempo real o tirar para recargar): sustituyen a
  // los locales, salvo lo que aún está en vuelo (altas sin confirmar y borrados
  // que se pueden deshacer).
  useEffect(() => {
    setRows((prev) => [...prev.filter(isTemp), ...initial.filter((r) => !pendingDeletes.current.has(r.id))]);
  }, [initial]);

  useEffect(() => {
    const n = params.get("new");
    if (n === "expense" || n === "income") setForm(blankForm(n));
  }, [params]);

  useEffect(() => {
    const t = params.get("type");
    const c = params.get("category");
    const period = periods.find((p) => p.id === params.get("period"));
    const from = period?.start_date ?? params.get("from");
    const to = period?.end_date ?? params.get("to");
    const change: Partial<Filters> = {};
    if (t === "expense" || t === "income") change.type = t;
    if (c) change.category = c;
    if (from) change.dateFrom = from;
    if (to) change.dateTo = to;
    if (Object.keys(change).length) {
      setFilters((f) => ({ ...f, ...change }));
      setFiltersOpen(true);
    }
  }, [params, periods]);

  // Filtrar por texto no en cada pulsación: espera a que el usuario pare.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(id);
  }, [query]);

  // Volver a la primera página cuando cambian los filtros u ordenación.
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [debouncedQuery, filters]);

  const formOpen = form !== null;
  useEffect(() => {
    if (formOpen) return;
    returnFocus.current?.focus?.();
    returnFocus.current = null;
  }, [formOpen]);

  function openForm(next: Form) {
    if (!form) returnFocus.current = document.activeElement as HTMLElement | null;
    setForm(next);
  }
  const closeForm = useCallback(() => setForm(null), []);

  const filterCount = activeFilterCount(filters);
  const clearFilters = () => setFilters((f) => ({ ...NO_FILTERS, sort: f.sort }));

  const filtered = useMemo(() => {
    const { type, category, dateFrom, dateTo, sort } = filters;
    return rows
      .filter((r) => {
        const dateValue = typeof r.date === "string" ? r.date : "";
        const text = `${r.concept} ${r.merchant} ${r.note} ${r.category?.name ?? ""}`.toLowerCase();
        return (
          (!debouncedQuery || text.includes(debouncedQuery.toLowerCase())) &&
          (type === "all" || r.type === type) &&
          (!category || r.category_id === category) &&
          (!dateFrom || dateValue >= dateFrom) &&
          (!dateTo || dateValue <= dateTo)
        );
      })
      .sort((a, b) => {
        const aDate = typeof a.date === "string" ? a.date : "";
        const bDate = typeof b.date === "string" ? b.date : "";
        if (sort === "date_asc") return aDate.localeCompare(bDate);
        if (sort === "amount_desc") return b.amount - a.amount;
        if (sort === "amount_asc") return a.amount - b.amount;
        return bDate.localeCompare(aDate);
      });
  }, [rows, debouncedQuery, filters]);

  const shown = useMemo(() => filtered.slice(0, visible), [filtered, visible]);
  const isFiltering = !!debouncedQuery || filterCount > 0;
  const filteredExpense = useMemo(
    () => filtered.filter((r) => r.type === "expense").reduce((total, r) => total + Number(r.amount), 0),
    [filtered]
  );
  const filteredIncome = useMemo(
    () => filtered.filter((r) => r.type === "income").reduce((total, r) => total + Number(r.amount), 0),
    [filtered]
  );

  // Categorías más usadas, para acceso rápido al crear un movimiento.
  const frequentCategories = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of rows) if (r.category_id) count.set(r.category_id, (count.get(r.category_id) ?? 0) + 1);
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => categories.find((c) => c.id === id))
      .filter((c): c is Category => Boolean(c));
  }, [rows, categories]);

  // Guardado optimista: el movimiento aparece (o cambia) en la lista al instante
  // y el formulario se cierra; si el servidor falla, se deshace el cambio y se
  // vuelve a abrir el formulario con lo escrito para no perderlo.
  async function save(again: boolean) {
    if (!form) return;
    const submitted = form;
    const amount = Number(submitted.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast("Introduce un importe válido mayor que cero.", "error");
      return;
    }

    const payload = {
      household_id: householdId,
      user_id: userId,
      concept: submitted.concept.trim(),
      amount,
      date: submitted.date,
      category_id: submitted.category_id || null,
      type: submitted.type,
      note: submitted.note.trim(),
      merchant: submitted.merchant.trim(),
    };
    const editingId = submitted.id;
    const previous = editingId ? rows.find((r) => r.id === editingId) : undefined;
    const tempId = editingId ?? `temp-${crypto.randomUUID()}`;
    const optimistic: Transaction = {
      ...payload,
      id: tempId,
      recurring_id: previous?.recurring_id ?? null,
      created_at: previous?.created_at ?? new Date().toISOString(),
      category: categories.find((c) => c.id === payload.category_id) ?? null,
    };
    setRows((prev) => (editingId ? prev.map((r) => (r.id === editingId ? optimistic : r)) : [optimistic, ...prev]));
    if (again && !editingId) {
      setForm({ ...blankForm(submitted.type), date: submitted.date });
      setFormResetKey((k) => k + 1);
    } else {
      setForm(null);
    }

    const s = createClient();
    const { data, error } = editingId
      ? await s
          .from("transactions")
          .update(payload)
          .eq("id", editingId)
          // Sin receipt_text: la lista no lo carga y no debe sobrescribirse con "".
          .select(TRANSACTION_LIST_FIELDS)
          .single()
      : await s
          .from("transactions")
          .insert({ ...payload, receipt_text: submitted.receipt_text })
          .select(TRANSACTION_LIST_FIELDS)
          .single();

    if (error || !data) {
      setRows((prev) =>
        editingId && previous
          ? prev.map((r) => (r.id === editingId ? previous : r))
          : prev.filter((r) => r.id !== tempId)
      );
      toast(error?.message ?? "No se pudo guardar el movimiento.", "error");
      // Reabrimos con lo escrito, salvo que ya se esté rellenando otro.
      setForm((current) => (current && (current.concept || current.amount) ? current : submitted));
      return;
    }

    setRows((prev) => {
      if (editingId) return prev.map((r) => (r.id === editingId ? data : r));
      // Si un refresco en tiempo real ya trajo la fila, solo quitamos la provisional.
      return prev.some((r) => r.id === data.id)
        ? prev.filter((r) => r.id !== tempId)
        : prev.map((r) => (r.id === tempId ? data : r));
    });
    if (!editingId) notifyPartnerActivity(data.id);
    if (again && !editingId) toast("Movimiento guardado", "success");
    if (payload.merchant && payload.category_id) {
      await s.from("merchant_category_rules").upsert(
        {
          household_id: householdId,
          merchant_pattern: payload.merchant.toLowerCase(),
          category_id: payload.category_id,
        },
        { onConflict: "household_id,merchant_pattern" }
      );
    }
  }

  // Borra de verdad un movimiento cuyo plazo para deshacer ha terminado.
  const commitDelete = useCallback(
    async (id: string) => {
      const pending = pendingDeletes.current.get(id);
      if (!pending) return;
      pendingDeletes.current.delete(id);
      clearTimeout(pending.timer);
      const { error } = await createClient().from("transactions").delete().eq("id", id);
      if (error) {
        setRows((prev) => (prev.some((r) => r.id === id) ? prev : [pending.row, ...prev]));
        toast(`No se pudo eliminar «${pending.row.concept}»: ${error.message}`, "error");
      }
    },
    [toast]
  );

  // Si se sale de la página (o se cierra la app) con borrados pendientes, se
  // hacen ya en vez de perderlos.
  useEffect(() => {
    const pending = pendingDeletes.current;
    const flush = () => {
      for (const id of [...pending.keys()]) commitDelete(id);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [commitDelete]);

  function undoDelete(id: string) {
    const pending = pendingDeletes.current.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingDeletes.current.delete(id);
    setRows((prev) => [pending.row, ...prev]);
  }

  // Sin "¿Seguro?": se quita al momento y se puede deshacer durante unos segundos.
  function remove(r: Transaction) {
    setRows((prev) => prev.filter((x) => x.id !== r.id));
    const timer = setTimeout(() => commitDelete(r.id), UNDO_MS);
    pendingDeletes.current.set(r.id, { row: r, timer });
    toast(`«${r.concept}» eliminado`, "info", {
      duration: UNDO_MS,
      action: { label: "Deshacer", onClick: () => undoDelete(r.id) },
    });
  }

  function edit(r: Transaction) {
    openForm({
      id: r.id,
      concept: r.concept,
      amount: String(r.amount),
      date: typeof r.date === "string" ? r.date.slice(0, 10) : "",
      category_id: r.category_id ?? "",
      type: r.type,
      note: r.note ?? "",
      merchant: r.merchant ?? "",
      receipt_text: r.receipt_text ?? "",
    });
  }

  const addNew = (type: TransactionType = "expense") => openForm(blankForm(type));

  return (
    <>
      <div className="toolbar transaction-toolbar-top" style={{ marginBottom: 12 }}>
        <div className="search-input" style={{ position: "relative" }}>
          <Search
            size={17}
            aria-hidden="true"
            style={{ position: "absolute", left: 12, top: 12, color: "var(--muted)" }}
          />
          <input
            className="input"
            type="search"
            aria-label="Buscar movimientos"
            style={{ paddingLeft: 38 }}
            placeholder="Buscar comercio, concepto, categoría…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn btn-soft filters-toggle"
          aria-expanded={filtersOpen}
          aria-controls="transaction-filters"
          onClick={() => setFiltersOpen((o) => !o)}
        >
          <SlidersHorizontal size={16} />
          Filtros
          {filterCount > 0 && (
            <span className="filter-badge" aria-label={`${filterCount} activos`}>
              {filterCount}
            </span>
          )}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => addNew()}>
          <Plus size={17} />
          Añadir
        </button>
      </div>

      <TransactionFilters
        open={filtersOpen}
        filters={filters}
        onChange={(change) => setFilters((f) => ({ ...f, ...change }))}
        categories={categories}
        periods={periods}
      />

      {isFiltering && (
        <div className="filter-summary" role="status">
          <span>
            {filtered.length} movimiento{filtered.length === 1 ? "" : "s"}
          </span>
          {filteredExpense > 0 && (
            <span className="expense">
              Gastado <Money value={filteredExpense} />
            </span>
          )}
          {filteredIncome > 0 && (
            <span className="income">
              Ingresado <Money value={filteredIncome} />
            </span>
          )}
        </div>
      )}

      <TransactionList
        shown={shown}
        total={filtered.length}
        expense={filteredExpense}
        income={filteredIncome}
        hasMore={filtered.length > visible}
        onMore={() => setVisible((v) => v + PAGE_SIZE)}
        isFiltering={isFiltering}
        isDateSort={filters.sort === "date_desc" || filters.sort === "date_asc"}
        onEdit={edit}
        onRemove={remove}
        onClearFilters={clearFilters}
        onAdd={() => addNew()}
      />

      {form && (
        <TransactionForm
          form={form}
          setForm={setForm}
          categories={categories}
          frequentCategories={frequentCategories}
          rules={rules}
          resetKey={formResetKey}
          onSave={save}
          onClose={closeForm}
        />
      )}
    </>
  );
}
