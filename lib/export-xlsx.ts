// Exportación de movimientos a Excel. El formato de la hoja "Movimientos" es el mismo que
// admite Ajustes › Importar Excel (Fecha, Tipo, Concepto, Comercio, Importe, Categoría, Nota).

export type ExportRow = {
  date: string;
  type: string;
  concept?: string | null;
  merchant?: string | null;
  amount: number | string;
  note?: string | null;
  category?: { name?: string } | null;
};

export const EXPORT_HEADER = ["Fecha", "Tipo", "Concepto", "Comercio", "Importe", "Categoría", "Nota"] as const;

const toDate = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : v;
};

export function toExportRows(list: ExportRow[]) {
  return list.map((r) => ({
    Fecha: toDate(r.date),
    Tipo: r.type === "income" ? "Ingreso" : r.type === "expense" ? "Gasto" : r.type,
    Concepto: r.concept ?? "",
    Comercio: r.merchant ?? "",
    Importe: Number(r.amount) || 0,
    Categoría: r.category?.name ?? "",
    Nota: r.note ?? "",
  }));
}

// Hoja "Resumen": qué filtros se aplicaron y cuánto suman. Va después de Movimientos para
// que la importación siga leyendo la primera hoja.
export function summaryRows(list: ExportRow[], filterLines: string[]) {
  const sum = (type: string) =>
    Math.round(list.filter((r) => r.type === type).reduce((t, r) => t + (Number(r.amount) || 0), 0) * 100) / 100;
  const expense = sum("expense");
  const income = sum("income");
  return [
    ["Movimientos exportados", list.length],
    ["Gastos", expense],
    ["Ingresos", income],
    ["Balance", Math.round((income - expense) * 100) / 100],
    [],
    ["Filtros aplicados"],
    ...(filterLines.length ? filterLines.map((l) => [l]) : [["Ninguno (todos los movimientos)"]]),
  ];
}

export async function downloadTransactionsXlsx(list: ExportRow[], filterLines: string[], fileName: string) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(toExportRows(list), { header: [...EXPORT_HEADER], cellDates: true });
  ws["!cols"] = [{ wch: 12 }, { wch: 9 }, { wch: 28 }, { wch: 20 }, { wch: 10 }, { wch: 18 }, { wch: 30 }];
  const summary = XLSX.utils.aoa_to_sheet(summaryRows(list, filterLines));
  summary["!cols"] = [{ wch: 28 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
  XLSX.utils.book_append_sheet(wb, summary, "Resumen");
  XLSX.writeFile(wb, fileName);
}

// ---- Libros de varias hojas (informe, presupuestos, recurrentes, objetivos) ----

export type Cell = string | number | null;
export type SheetData = {
  name: string;
  rows: Cell[][];
  /** Anchos de columna en caracteres. */
  widths?: number[];
  /** Columnas (desde 0) con importes en euros: se les da formato de moneda. */
  moneyCols?: number[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Los nombres de hoja de Excel: máximo 31 caracteres y sin : \ / ? * [ ]
export const sheetName = (name: string) => name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Hoja";

export async function downloadWorkbook(sheets: SheetData[], fileName: string) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const rows = sheet.rows.map((row) => row.map((c) => (typeof c === "string" && ISO_DATE.test(c) ? toDate(c) : c)));
    const ws = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
    if (sheet.widths) ws["!cols"] = sheet.widths.map((wch) => ({ wch }));
    for (const col of sheet.moneyCols ?? []) {
      rows.forEach((row, r) => {
        const cell = ws[XLSX.utils.encode_cell({ r, c: col })];
        if (cell && cell.t === "n") cell.z = '#,##0.00 "€"';
      });
    }
    XLSX.utils.book_append_sheet(wb, ws, sheetName(sheet.name));
  }
  XLSX.writeFile(wb, fileName);
}
