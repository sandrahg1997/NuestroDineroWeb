// Lógica de los objetivos de ahorro. Fechas como AAAA-MM-DD; sin dependencias de
// servidor ni de navegador para poder probarla.

export type Goal = {
  id: string;
  household_id: string;
  title: string;
  icon: string;
  target_amount: number;
  target_date: string | null;
  created_by: string | null;
  created_at: string;
};

export type Contribution = {
  id: string;
  goal_id: string;
  household_id: string;
  user_id: string | null;
  amount: number;
  date: string;
  note: string;
  created_at: string;
};

export type GoalStatus = "done" | "on-track" | "behind" | "late" | "no-date";

export type GoalProgress = {
  saved: number;
  remaining: number;
  /** 0–100, redondeado hacia abajo para no enseñar 100 % sin haber llegado. */
  pct: number;
  done: boolean;
  status: GoalStatus;
  /** Lo que habría que apartar cada mes para llegar a tiempo; null si no aplica. */
  monthlyNeeded: number | null;
  daysLeft: number | null;
};

const DAY = 86_400_000;
const atNoon = (date: string) => Date.parse(`${date.slice(0, 10)}T12:00:00Z`);
const cents = (n: number) => Math.round(n * 100) / 100;

export function goalProgress(
  goal: Pick<Goal, "target_amount" | "target_date" | "created_at">,
  contributions: Pick<Contribution, "amount">[],
  today: string
): GoalProgress {
  const target = Number(goal.target_amount);
  const saved = cents(contributions.reduce((sum, c) => sum + Number(c.amount), 0));
  const remaining = cents(Math.max(0, target - saved));
  const done = saved >= target;
  const pct = target > 0 ? Math.max(0, Math.min(100, Math.floor((saved / target) * 100))) : 0;

  if (done) return { saved, remaining: 0, pct: 100, done: true, status: "done", monthlyNeeded: null, daysLeft: null };
  if (!goal.target_date)
    return { saved, remaining, pct, done: false, status: "no-date", monthlyNeeded: null, daysLeft: null };

  const now = atNoon(today);
  const end = atNoon(goal.target_date);
  const daysLeft = Math.round((end - now) / DAY);
  if (daysLeft < 0) return { saved, remaining, pct, done: false, status: "late", monthlyNeeded: null, daysLeft };

  // Meses que quedan (mínimo 1, para no dividir por casi cero el último día).
  const months = Math.max(1, daysLeft / 30.44);
  const monthlyNeeded = cents(remaining / months);

  // ¿Va a ritmo? Se compara lo ahorrado con la parte del plazo que ya ha pasado.
  const start = atNoon(goal.created_at);
  const total = end - start;
  const elapsed = total > 0 ? Math.min(1, Math.max(0, (now - start) / total)) : 1;
  const status: GoalStatus = saved >= target * elapsed * 0.9 ? "on-track" : "behind";
  return { saved, remaining, pct, done: false, status, monthlyNeeded, daysLeft };
}

// Total apartado entre todas las metas (para el resumen de arriba).
export function totalSaved(contributions: Pick<Contribution, "amount">[]) {
  return cents(contributions.reduce((sum, c) => sum + Number(c.amount), 0));
}

export function daysLeftLabel(daysLeft: number | null) {
  if (daysLeft == null) return "";
  if (daysLeft < 0) return `Venció hace ${-daysLeft} ${-daysLeft === 1 ? "día" : "días"}`;
  if (daysLeft === 0) return "Vence hoy";
  if (daysLeft === 1) return "Vence mañana";
  if (daysLeft < 45) return `Quedan ${daysLeft} días`;
  const months = Math.round(daysLeft / 30.44);
  return `Quedan ${months} ${months === 1 ? "mes" : "meses"}`;
}

// El objetivo que se destaca en Inicio: entre los no cumplidos, el que vence antes (sin
// contar los ya vencidos); si ninguno tiene fecha futura, el más avanzado. null si no
// hay ninguno pendiente.
export function pickFeaturedGoal<G extends Pick<Goal, "id" | "target_amount" | "target_date" | "created_at">>(
  goals: G[],
  contributions: Pick<Contribution, "amount" | "goal_id">[],
  today: string
): { goal: G; progress: GoalProgress } | null {
  const open = goals
    .map((goal) => ({
      goal,
      progress: goalProgress(
        goal,
        contributions.filter((c) => c.goal_id === goal.id),
        today
      ),
    }))
    .filter((g) => !g.progress.done);
  if (!open.length) return null;
  const dated = open
    .filter((g) => g.goal.target_date && g.progress.status !== "late")
    .sort((a, b) => (a.goal.target_date! < b.goal.target_date! ? -1 : 1));
  if (dated.length) return dated[0];
  return [...open].sort((a, b) => b.progress.pct - a.progress.pct)[0];
}
