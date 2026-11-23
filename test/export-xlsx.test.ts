import { describe, it, expect } from "vitest";
import { summaryRows, toExportRows } from "@/lib/export-xlsx";

const rows = [
  {
    date: "2026-11-05",
    type: "expense",
    concept: "Compra",
    merchant: "Mercadona",
    amount: "12.5",
    category: { name: "Comida" },
  },
  { date: "2026-11-06", type: "income", concept: "Nómina", amount: 1000, note: "nov" },
  { date: "2026-11-07", type: "expense", amount: 7.5 },
];

describe("exportar a Excel", () => {
  it("convierte cada movimiento al formato del importador", () => {
    const out = toExportRows(rows);
    expect(out[0]).toMatchObject({ Tipo: "Gasto", Comercio: "Mercadona", Importe: 12.5, Categoría: "Comida" });
    expect(out[0].Fecha).toEqual(new Date(2026, 10, 5));
    expect(out[1]).toMatchObject({ Tipo: "Ingreso", Comercio: "", Nota: "nov", Categoría: "" });
    expect(out[2].Concepto).toBe("");
  });

  it("el resumen suma gastos, ingresos y balance", () => {
    const s = summaryRows(rows, ["Tipo: Gastos"]);
    expect(s[0]).toEqual(["Movimientos exportados", 3]);
    expect(s[1]).toEqual(["Gastos", 20]);
    expect(s[2]).toEqual(["Ingresos", 1000]);
    expect(s[3]).toEqual(["Balance", 980]);
    expect(s.at(-1)).toEqual(["Tipo: Gastos"]);
  });

  it("sin filtros lo dice", () => {
    expect(summaryRows([], []).at(-1)).toEqual(["Ninguno (todos los movimientos)"]);
  });
});
