import type { ChallengeProgress } from "./challenges";

export type WeeklyReportInput = {
  householdName: string;
  weekExpense: number;
  previousWeekExpense: number;
  topCategory?: { name: string; value: number };
  budget?: { spent: number; amount: number };
  challenges: { title: string; icon: string; progress: ChallengeProgress }[];
  // Si la persona tiene "Ocultar importes" activado, el aviso no muestra cifras
  // (se ve en la pantalla de bloqueo).
  hideAmounts: boolean;
};

const fmt = (value: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);

export function buildWeeklyReport(input: WeeklyReportInput): { title: string; body: string } | null {
  const { weekExpense, previousWeekExpense, topCategory, budget, challenges, hideAmounts } = input;
  if (weekExpense === 0 && previousWeekExpense === 0 && !challenges.length) return null;

  const parts: string[] = [];

  if (previousWeekExpense > 0) {
    const pct = Math.round(((weekExpense - previousWeekExpense) / previousWeekExpense) * 100);
    const trend = pct === 0 ? "igual que la anterior" : `${pct > 0 ? "+" : "−"}${Math.abs(pct)} % que la anterior`;
    parts.push(hideAmounts ? `Esta semana habéis gastado ${trend}.` : `Habéis gastado ${fmt(weekExpense)} (${trend}).`);
  } else {
    parts.push(
      hideAmounts ? "Este es vuestro resumen de la semana." : `Habéis gastado ${fmt(weekExpense)} esta semana.`
    );
  }

  if (topCategory && topCategory.value > 0) {
    parts.push(
      hideAmounts ? `Donde más: ${topCategory.name}.` : `Donde más: ${topCategory.name} (${fmt(topCategory.value)}).`
    );
  }

  if (budget && budget.amount > 0) {
    const pct = Math.round((budget.spent / budget.amount) * 100);
    parts.push(pct >= 100 ? `Presupuesto superado (${pct} %).` : `Presupuesto del periodo al ${pct} %.`);
  }

  const live = challenges.filter((c) => c.progress.status === "active" || c.progress.status === "broken");
  for (const c of live.slice(0, 2)) {
    parts.push(
      c.progress.status === "active"
        ? `${c.icon} ${c.title}: ${c.progress.cleanStreak} ${c.progress.cleanStreak === 1 ? "día" : "días"} limpios 💪`
        : `${c.icon} ${c.title}: se ha roto, ¡a por el siguiente!`
    );
  }

  return { title: `Vuestra semana · ${input.householdName}`, body: parts.join(" ") };
}
