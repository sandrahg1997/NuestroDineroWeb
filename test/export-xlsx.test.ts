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

import { budgetSheets, goalSheets, recurringSheets, reportSheets } from "@/lib/export-sheets";
import { goalProgress } from "@/lib/goals";
import { buildReportData } from "@/lib/report";
import { sheetName } from "@/lib/export-xlsx";

describe("hojas de Excel por pantalla", () => {
  it("presupuestos: restante y porcentaje", () => {
    const [sheet] = budgetSheets("Noviembre", [{ name: "Comida", amount: 200, spent: 150.5 }]);
    expect(sheet.name).toBe("Presupuestos Noviembre");
    expect(sheet.rows[1]).toEqual(["Comida", 200, 150.5, 49.5, 75]);
  });

  it("recurrentes: equivalente mensual, estado y totales solo de activos", () => {
    const base = { id: "x", household_id: "h", note: "", category_id: null, end_date: null };
    const [sheet] = recurringSheets([
      {
        ...base,
        concept: "Alquiler",
        amount: 800,
        type: "expense",
        frequency: "monthly",
        next_date: "2026-12-01",
        is_active: true,
      },
      {
        ...base,
        concept: "Seguro",
        amount: 120,
        type: "expense",
        frequency: "yearly",
        next_date: "2027-03-01",
        is_active: true,
      },
      {
        ...base,
        concept: "Gimnasio",
        amount: 30,
        type: "expense",
        frequency: "monthly",
        next_date: "2026-12-05",
        is_active: false,
      },
    ]);
    expect(sheet.rows[1].slice(0, 9)).toEqual([
      "Alquiler",
      "Gasto",
      "",
      800,
      "Mensual",
      800,
      "2026-12-01",
      "",
      "Activo",
    ]);
    expect(sheet.rows[2][5]).toBe(10);
    expect(sheet.rows[3][8]).toBe("Pausado");
    expect(sheet.rows.at(-2)![5]).toBe(810); // el pausado no cuenta
  });

  it("objetivos: resumen y aportaciones de sus metas", () => {
    const goal = {
      id: "g1",
      household_id: "h",
      title: "Viaje",
      icon: "✈️",
      target_amount: 1000,
      target_date: null,
      created_by: null,
      created_at: "2026-01-01T00:00:00Z",
    };
    const contributions = [
      { goal_id: "g1", date: "2026-02-01", amount: 100, note: "" },
      { goal_id: "g1", date: "2026-03-01", amount: -20, note: "imprevisto" },
      { goal_id: "otra", date: "2026-03-01", amount: 5, note: "" },
    ];
    const [overview, history] = goalSheets(
      [{ goal, progress: goalProgress(goal, contributions.slice(0, 2), "2026-04-01") }],
      contributions
    );
    expect(overview.rows[1]).toEqual(["Viaje", 1000, 80, 920, 8, "", null, "Sin fecha"]);
    expect(history.rows).toHaveLength(3); // cabecera + 2 (la de otra meta no entra)
    expect(history.rows[1]).toEqual(["Viaje", "2026-03-01", -20, "imprevisto"]);
  });

  it("informe: hojas esperadas y movimientos con fechas en texto", () => {
    const tx = [
      {
        date: "2026-11-02",
        type: "expense" as const,
        concept: "Super",
        merchant: "Mercadona",
        amount: 40,
        category: { name: "Comida" },
      },
      { date: "2026-11-01", type: "income" as const, concept: "Nómina", amount: 1000 },
    ];
    const report = buildReportData(tx, null, 30);
    const sheets = reportSheets({
      periodName: "Noviembre",
      start: "2026-11-01",
      end: "2026-11-30",
      report,
      budgets: [],
      transactions: tx,
    });
    expect(sheets.map((s) => s.name)).toEqual(["Resumen", "Categorías", "Mayores gastos", "Comercios", "Movimientos"]);
    const movs = sheets.at(-1)!.rows;
    expect(movs[1][0]).toBe("2026-11-01"); // ordenado por fecha
    expect(typeof movs[1][0]).toBe("string");
    expect(sheets[0].rows[4]).toEqual(["Ingresos", 1000]);
  });

  it("los nombres de hoja respetan las reglas de Excel", () => {
    expect(sheetName("Informe: 2026/11 [x]?")).toBe("Informe  2026 11  x");
    expect(sheetName("a".repeat(50))).toHaveLength(31);
  });
});
