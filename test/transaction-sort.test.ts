import { describe, expect, it } from "vitest";
import { compareTransactions, nextSort } from "@/lib/transaction-sort";
import type { Category, Transaction } from "@/lib/types";

type Row = Pick<Transaction, "date" | "created_at" | "concept" | "type" | "amount" | "category">;

const row = (concept: string, date: string, amount: number, extra: Partial<Row> = {}): Row => ({
  concept,
  date,
  amount,
  type: "expense",
  created_at: "2026-11-01T10:00:00Z",
  category: null,
  ...extra,
});
const names = (rows: Row[]) => rows.map((r) => r.concept);

describe("compareTransactions", () => {
  it("por defecto usa la fecha del movimiento, no cuándo se añadió", () => {
    const rows = [
      row("Gasto de octubre metido hoy", "2026-10-15", 10, { created_at: "2026-11-04T10:00:00Z" }),
      row("Gasto de noviembre", "2026-11-02", 10, { created_at: "2026-11-02T10:00:00Z" }),
    ];
    expect(names([...rows].sort(compareTransactions("date_desc")))).toEqual([
      "Gasto de noviembre",
      "Gasto de octubre metido hoy",
    ]);
  });

  it("dentro del mismo día pone primero el último añadido", () => {
    const rows = [
      row("Primero", "2026-11-02", 10, { created_at: "2026-11-02T08:00:00Z" }),
      row("Segundo", "2026-11-02", 10, { created_at: "2026-11-02T09:00:00Z" }),
    ];
    expect(names([...rows].sort(compareTransactions("date_desc")))).toEqual(["Segundo", "Primero"]);
  });

  it("ordena por importe en ambos sentidos, también con importes en texto", () => {
    const rows = [row("Medio", "2026-11-01", 50), row("Alto", "2026-11-02", 100), row("Bajo", "2026-11-03", 9)];
    rows[1].amount = "100" as unknown as number;
    expect(names([...rows].sort(compareTransactions("amount_asc")))).toEqual(["Bajo", "Medio", "Alto"]);
    expect(names([...rows].sort(compareTransactions("amount_desc")))).toEqual(["Alto", "Medio", "Bajo"]);
  });

  it("ordena el texto sin distinguir mayúsculas ni acentos", () => {
    const rows = [row("zumo", "2026-11-01", 1), row("Ágape", "2026-11-01", 1), row("Barra", "2026-11-01", 1)];
    expect(names([...rows].sort(compareTransactions("concept_asc")))).toEqual(["Ágape", "Barra", "zumo"]);
  });

  it("trata la falta de categoría como «Sin categoría»", () => {
    const rows = [
      row("Sin", "2026-11-01", 1),
      row("Con", "2026-11-01", 1, { category: { name: "Hogar" } as Category }),
    ];
    expect(names([...rows].sort(compareTransactions("category_asc")))).toEqual(["Con", "Sin"]);
  });

  it("deshace los empates por fecha más reciente en cualquier sentido", () => {
    const rows = [row("Vieja", "2026-10-01", 5), row("Nueva", "2026-11-01", 5)];
    expect(names([...rows].sort(compareTransactions("amount_asc")))).toEqual(["Nueva", "Vieja"]);
    expect(names([...rows].sort(compareTransactions("amount_desc")))).toEqual(["Nueva", "Vieja"]);
  });
});

describe("nextSort", () => {
  it("una columna nueva empieza en ascendente", () => {
    expect(nextSort("date_desc", "amount")).toBe("amount_asc");
  });
  it("pulsar la columna activa invierte el sentido", () => {
    expect(nextSort("amount_asc", "amount")).toBe("amount_desc");
    expect(nextSort("amount_desc", "amount")).toBe("amount_asc");
    expect(nextSort("date_desc", "date")).toBe("date_asc");
  });
});
