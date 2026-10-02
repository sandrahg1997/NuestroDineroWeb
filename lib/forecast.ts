import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, parseISO } from "date-fns";
import type { Frequency, TransactionType } from "./types";
import { dateKey } from "./utils";

type ForecastRow = { type: TransactionType; amount: number | string; date: string; recurring_id?: string | null };
type ForecastRecurring = { type: TransactionType; amount: number | string; frequency: Frequency; next_date: string };

export type Forecast = {
  currentBalance: number;
  pendingIncome: number;
  pendingExpense: number;
  projectedVariable: number;
  projectedExpense: number;
  projectedBalance: number;
  dailyVariable: number;
  daysLeft: number;
};

const day = (value: string) => parseISO(value.slice(0, 10));

// Fechas en las que un recurrente generará movimiento dentro de [from, to].
// Encadena desde la fecha anterior igual que process_due_recurring en SQL, así que
// un mensual del 31 pasa a 28 en febrero y se queda en 28 a partir de ahí.
export function recurringOccurrences(r: Pick<ForecastRecurring, "frequency" | "next_date">, from: string, to: string) {
  const out: string[] = [];
  let d = day(r.next_date);
  const end = day(to);
  for (let guard = 0; d <= end && guard < 600; guard++) {
    const key = dateKey(d);
    if (key >= from) out.push(key);
    d = r.frequency === "weekly" ? addWeeks(d, 1) : r.frequency === "monthly" ? addMonths(d, 1) : addYears(d, 1);
  }
  return out;
}

// Previsión de cierre del periodo [start, end] vista desde `today`:
//   balance actual
//   + recurrentes que aún se van a generar dentro del periodo
//   − gasto variable (no recurrente) que falta, al ritmo diario de lo que va de periodo.
// Los primeros días el ritmo es poco fiable, así que se mezcla con el del periodo
// anterior (`previousDailyVariable`) hasta el día 10.
export function computeForecast({
  today,
  start,
  end,
  rows,
  recurring,
  previousDailyVariable,
}: {
  today: string;
  start: string;
  end: string;
  rows: ForecastRow[];
  recurring: ForecastRecurring[];
  previousDailyVariable?: number;
}): Forecast {
  let income = 0;
  let expense = 0;
  let variableSoFar = 0;
  for (const r of rows) {
    const amount = Number(r.amount);
    if (r.type === "income") income += amount;
    else {
      expense += amount;
      if (!r.recurring_id && r.date.slice(0, 10) <= today) variableSoFar += amount;
    }
  }

  const daysElapsed = Math.max(1, differenceInCalendarDays(day(today), day(start)) + 1);
  const daysLeft = Math.max(0, differenceInCalendarDays(day(end), day(today)));

  const currentRate = variableSoFar / daysElapsed;
  const weight = previousDailyVariable === undefined ? 1 : Math.min(1, daysElapsed / 10);
  const dailyVariable = weight * currentRate + (1 - weight) * (previousDailyVariable ?? 0);

  // Solo cuentan las ocurrencias posteriores a hoy: las de hoy o antes ya están
  // generadas (o lo estarán en el próximo procesado) y entran en `rows`.
  const tomorrow = dateKey(addDays(day(today), 1));
  let pendingIncome = 0;
  let pendingExpense = 0;
  for (const r of recurring) {
    const from = tomorrow > start ? tomorrow : start;
    const n = recurringOccurrences(r, from, end).length;
    if (r.type === "income") pendingIncome += n * Number(r.amount);
    else pendingExpense += n * Number(r.amount);
  }

  const projectedVariable = dailyVariable * daysLeft;
  const currentBalance = income - expense;
  return {
    currentBalance,
    pendingIncome,
    pendingExpense,
    projectedVariable,
    projectedExpense: expense + pendingExpense + projectedVariable,
    projectedBalance: currentBalance + pendingIncome - pendingExpense - projectedVariable,
    dailyVariable,
    daysLeft,
  };
}
