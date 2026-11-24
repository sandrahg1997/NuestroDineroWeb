// Hojas de Excel de cada pantalla. Funciones puras: reciben lo que ya se muestra y
// devuelven filas, para poder probarlas sin navegador.
import type { SheetData } from "./export-xlsx";
import { EXPORT_HEADER, type ExportRow } from "./export-xlsx";
import type { Contribution, Goal, GoalProgress, GoalStatus } from "./goals";
import type { PeriodReportData } from "./report";
import type { Frequency, RecurringTransaction } from "./types";

const cents = (n: number) => Math.round(n * 100) / 100;
const MONTHLY: Record<Frequency, number> = { weekly: 52 / 12, monthly: 1, yearly: 1 / 12 };
const FREQUENCY: Record<Frequency, string> = { weekly: "Semanal", monthly: "Mensual", yearly: "Anual" };

// ---- Presupuestos ----
export type BudgetExportRow = { name: string; amount: number; spent: number };

export function budgetSheets(periodName: string, budgets: BudgetExportRow[]): SheetData[] {
  const rows: SheetData["rows"] = [["Categoría", "Presupuesto", "Gastado", "Restante", "% usado"]];
  for (const b of budgets) {
    rows.push([
      b.name,
      cents(b.amount),
      cents(b.spent),
      cents(b.amount - b.spent),
      b.amount > 0 ? Math.round((b.spent / b.amount) * 100) : 0,
    ]);
  }
  return [{ name: `Presupuestos ${periodName}`, rows, widths: [26, 14, 14, 14, 10], moneyCols: [1, 2, 3] }];
}

// ---- Recurrentes ----
export function recurringSheets(list: RecurringTransaction[]): SheetData[] {
  const rows: SheetData["rows"] = [
    [
      "Concepto",
      "Tipo",
      "Categoría",
      "Importe",
      "Frecuencia",
      "Equivalente al mes",
      "Próxima fecha",
      "Hasta",
      "Estado",
      "Nota",
    ],
  ];
  for (const r of list) {
    rows.push([
      r.concept,
      r.type === "income" ? "Ingreso" : "Gasto",
      r.category?.name ?? "",
      cents(Number(r.amount)),
      FREQUENCY[r.frequency] ?? r.frequency,
      cents(Number(r.amount) * (MONTHLY[r.frequency] ?? 1)),
      r.next_date,
      r.end_date ?? "",
      !r.is_active ? "Pausado" : r.end_date && r.next_date > r.end_date ? "Finalizado" : "Activo",
      r.note ?? "",
    ]);
  }
  const active = list.filter((r) => r.is_active);
  const month = (type: string) =>
    cents(
      active.filter((r) => r.type === type).reduce((t, r) => t + Number(r.amount) * (MONTHLY[r.frequency] ?? 1), 0)
    );
  rows.push([], ["Gasto al mes (activos)", null, null, null, null, month("expense")]);
  rows.push(["Ingreso al mes (activos)", null, null, null, null, month("income")]);
  return [{ name: "Recurrentes", rows, widths: [26, 9, 18, 12, 12, 18, 14, 14, 12, 30], moneyCols: [3, 5] }];
}

// ---- Objetivos de ahorro ----
const GOAL_STATUS: Record<GoalStatus, string> = {
  done: "Cumplido",
  "on-track": "A buen ritmo",
  behind: "Por detrás",
  late: "Vencido",
  "no-date": "Sin fecha",
};

export function goalSheets(
  goals: { goal: Goal; progress: GoalProgress }[],
  contributions: Pick<Contribution, "goal_id" | "date" | "amount" | "note">[]
): SheetData[] {
  const overview: SheetData["rows"] = [
    ["Objetivo", "Meta", "Ahorrado", "Falta", "% logrado", "Fecha objetivo", "A apartar al mes", "Estado"],
  ];
  for (const { goal, progress } of goals) {
    overview.push([
      goal.title,
      cents(Number(goal.target_amount)),
      progress.saved,
      progress.remaining,
      progress.pct,
      goal.target_date ?? "",
      progress.monthlyNeeded,
      GOAL_STATUS[progress.status],
    ]);
  }
  const names = new Map(goals.map(({ goal }) => [goal.id, goal.title]));
  const history: SheetData["rows"] = [["Objetivo", "Fecha", "Importe", "Nota"]];
  for (const c of [...contributions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))) {
    if (!names.has(c.goal_id)) continue;
    history.push([names.get(c.goal_id)!, c.date, cents(Number(c.amount)), c.note ?? ""]);
  }
  return [
    { name: "Objetivos", rows: overview, widths: [26, 12, 12, 12, 10, 14, 16, 14], moneyCols: [1, 2, 3, 6] },
    { name: "Aportaciones", rows: history, widths: [26, 12, 12, 34], moneyCols: [2] },
  ];
}

// ---- Informe del periodo ----
export function reportSheets(input: {
  periodName: string;
  start: string;
  end: string;
  report: PeriodReportData;
  budgets: BudgetExportRow[];
  transactions: ExportRow[];
}): SheetData[] {
  const { report, periodName } = input;
  const summary: SheetData["rows"] = [
    ["Periodo", periodName],
    ["Desde", input.start],
    ["Hasta", input.end],
    [],
    ["Ingresos", report.income],
    ["Gastos", report.expense],
    ["Ahorro (balance)", report.balance],
    ["Ahorro sobre ingresos (%)", report.savingsRate],
    ["Gasto medio al día", report.dailyAverage],
    ["Gastos fijos (recurrentes)", report.fixed],
    ["Gastos variables", report.variable],
  ];
  if (report.previous) {
    summary.push(
      [],
      ["Periodo anterior"],
      ["Ingresos", report.previous.income],
      ["Gastos", report.previous.expense],
      ["Ahorro (balance)", report.previous.balance]
    );
  }
  const sheets: SheetData[] = [
    { name: "Resumen", rows: summary, widths: [30, 18] },
    {
      name: "Categorías",
      rows: [["Categoría", "Gastado", "% del gasto"], ...report.categories.map((c) => [c.name, c.value, c.pct])],
      widths: [26, 14, 12],
      moneyCols: [1],
    },
  ];
  if (input.budgets.length)
    sheets.push(...budgetSheets("", input.budgets).map((s) => ({ ...s, name: "Presupuestos" })));
  sheets.push(
    {
      name: "Mayores gastos",
      rows: [
        ["Fecha", "Concepto", "Categoría", "Importe"],
        ...report.biggest.map((b) => [b.date, b.label, b.category, b.amount]),
      ],
      widths: [12, 28, 20, 12],
      moneyCols: [3],
    },
    {
      name: "Comercios",
      rows: [["Comercio", "Compras", "Total"], ...report.topMerchants.map((m) => [m.name, m.count, m.total])],
      widths: [28, 10, 12],
      moneyCols: [2],
    },
    {
      name: "Movimientos",
      rows: [
        [...EXPORT_HEADER],
        // Fechas como texto AAAA-MM-DD: así las hojas viajan del servidor al navegador.
        ...[...input.transactions]
          .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
          .map((r) => [
            r.date.slice(0, 10),
            r.type === "income" ? "Ingreso" : "Gasto",
            r.concept ?? "",
            r.merchant ?? "",
            cents(Number(r.amount) || 0),
            r.category?.name ?? "",
            r.note ?? "",
          ]),
      ],
      widths: [12, 9, 28, 20, 12, 18, 30],
      moneyCols: [4],
    }
  );
  return sheets;
}
