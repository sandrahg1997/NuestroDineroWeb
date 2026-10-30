// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Transaction } from "@/lib/types";

// Supabase simulado: registra los borrados y deja controlar cuándo responde el insert.
const deleted: string[] = [];
let resolveInsert: (v: { data: unknown; error: { message: string } | null }) => void = () => {};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      delete: () => ({
        eq: (_col: string, id: string) => {
          deleted.push(id);
          return Promise.resolve({ error: null });
        },
      }),
      insert: () => ({
        select: () => ({ single: () => new Promise((resolve) => (resolveInsert = resolve)) }),
      }),
      upsert: () => Promise.resolve({ error: null }),
    }),
  }),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/utils")>()),
  notifyPartnerActivity: () => {},
}));

const { ToastProvider } = await import("@/components/Toast");
const { default: TransactionManager } = await import("@/components/TransactionManager");

const row = (id: string, concept: string): Transaction => ({
  id,
  household_id: "h1",
  user_id: "u1",
  concept,
  amount: 12.5,
  date: "2026-10-01",
  category_id: null,
  type: "expense",
  note: "",
  merchant: "",
  created_at: "2026-10-01T10:00:00Z",
  category: null,
});

function setup(initial = [row("t1", "Mercadona"), row("t2", "Cine")]) {
  return render(
    <ToastProvider>
      <TransactionManager householdId="h1" userId="u1" initial={initial} initialCategories={[]} />
    </ToastProvider>
  );
}

// La tabla de escritorio tiene una fila por movimiento; buscamos por el concepto.
const tableRows = () => screen.getAllByRole("row").filter((r) => r.closest("tbody"));
const hasRow = (concept: string) => tableRows().some((r) => within(r).queryByText(concept));

beforeEach(() => {
  deleted.length = 0;
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TransactionManager", () => {
  it("al eliminar, el movimiento desaparece al momento y se puede deshacer", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar Mercadona" }));
    expect(hasRow("Mercadona")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(hasRow("Mercadona")).toBe(true);

    // Pasado el plazo no se borra nada: se deshizo a tiempo.
    act(() => vi.advanceTimersByTime(6000));
    expect(deleted).toEqual([]);
  });

  it("si no se deshace, se borra en el servidor al acabar el plazo", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar Cine" }));
    expect(deleted).toEqual([]);
    await act(async () => vi.advanceTimersByTime(5000));
    expect(deleted).toEqual(["t2"]);
  });

  it("al salir de la página con un borrado pendiente, se hace en ese momento", () => {
    const { unmount } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar Cine" }));
    unmount();
    expect(deleted).toEqual(["t2"]);
  });

  it("un movimiento nuevo aparece en la lista antes de que responda el servidor", async () => {
    setup([]);
    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
    fireEvent.change(screen.getByLabelText("Concepto"), { target: { value: "Gasolina" } });
    fireEvent.change(screen.getByLabelText("Importe"), { target: { value: "40" } });
    fireEvent.submit(screen.getByRole("dialog"));

    // El formulario se cierra y la fila ya está, marcada como "guardando".
    expect(screen.queryByRole("dialog")).toBeNull();
    const pending = tableRows().find((r) => within(r).queryByText("Gasolina"));
    expect(pending?.getAttribute("aria-busy")).toBe("true");

    await act(async () => resolveInsert({ data: { ...row("t9", "Gasolina"), amount: 40 }, error: null }));
    const saved = tableRows().find((r) => within(r).queryByText("Gasolina"));
    expect(saved?.getAttribute("aria-busy")).toBeNull();
  });

  it("si el servidor rechaza el alta, la fila se quita y el formulario vuelve con lo escrito", async () => {
    setup([]);
    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
    fireEvent.change(screen.getByLabelText("Concepto"), { target: { value: "Gasolina" } });
    fireEvent.change(screen.getByLabelText("Importe"), { target: { value: "40" } });
    fireEvent.submit(screen.getByRole("dialog"));

    await act(async () => resolveInsert({ data: null, error: { message: "Sin conexión" } }));
    expect(screen.getByRole("alert").textContent).toContain("Sin conexión");
    expect((screen.getByLabelText("Concepto") as HTMLInputElement).value).toBe("Gasolina");
  });
});
