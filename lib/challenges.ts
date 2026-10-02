import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { dateKey } from "./utils";

export type ChallengeKind = "no_spend" | "limit";

export interface Challenge {
  id: string;
  household_id: string;
  title: string;
  icon: string;
  kind: ChallengeKind;
  category_id: string | null;
  keywords: string[];
  limit_amount: number | string | null;
  start_date: string;
  end_date: string;
  created_at: string;
}

export type ChallengeTx = {
  type: "expense" | "income";
  amount: number | string;
  date: string;
  concept?: string | null;
  merchant?: string | null;
  category_id: string | null;
  recurring_id?: string | null;
};

// upcoming: aún no ha empezado · active: en curso y de momento se cumple ·
// broken: en curso pero ya se ha incumplido · won / lost: terminado.
export type ChallengeStatus = "upcoming" | "active" | "broken" | "won" | "lost";

export type ChallengeProgress = {
  status: ChallengeStatus;
  spent: number;
  matches: number;
  totalDays: number;
  elapsedDays: number;
  daysLeft: number;
  // Días seguidos sin un gasto que encaje, contando hasta hoy (o hasta el final).
  cleanStreak: number;
  // Lo que se habría gastado al ritmo de las 8 semanas previas, menos lo gastado.
  estimatedSaved: number;
};

export type ChallengeTemplate = {
  key: string;
  title: string;
  icon: string;
  description: string;
  kind: ChallengeKind;
  categoryName?: string;
  keywords?: string[];
  days: number;
  // Empieza el próximo sábado (retos de fin de semana).
  weekend?: boolean;
  needsLimit?: boolean;
};

export const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  {
    key: "delivery",
    title: "Semana sin comida a domicilio",
    icon: "🛵",
    description: "Nada de Glovo, Just Eat, Uber Eats ni similares durante 7 días.",
    kind: "no_spend",
    keywords: ["glovo", "just eat", "justeat", "uber eats", "ubereats", "deliveroo", "telepizza", "domino"],
    days: 7,
  },
  {
    key: "restaurants",
    title: "Semana sin restaurantes",
    icon: "🍽️",
    description: "Cocinamos en casa: ningún gasto en Restaurantes durante 7 días.",
    kind: "no_spend",
    categoryName: "Restaurantes",
    days: 7,
  },
  {
    key: "zero-weekend",
    title: "Fin de semana de gasto cero",
    icon: "🧘",
    description: "Sábado y domingo sin ningún gasto (los recurrentes no cuentan).",
    kind: "no_spend",
    days: 2,
    weekend: true,
  },
  {
    key: "coffee",
    title: "Café en casa",
    icon: "☕",
    description: "Dos semanas sin cafeterías.",
    kind: "no_spend",
    // "cafe " con espacio: encaja con "Café Central" pero no con "cafetera".
    keywords: ["starbucks", "cafeteria", "cafe ", "tim hortons", "costa coffee"],
    days: 14,
  },
  {
    key: "clothes",
    title: "Mes sin comprar ropa",
    icon: "👕",
    description: "Ningún gasto en Ropa durante 30 días.",
    kind: "no_spend",
    categoryName: "Ropa",
    days: 30,
  },
  {
    key: "leisure-cap",
    title: "Ocio con tope",
    icon: "🎟️",
    description: "Fijad un máximo para Ocio este mes y no lo paséis.",
    kind: "limit",
    categoryName: "Ocio",
    days: 30,
    needsLimit: true,
  },
];

// Minúsculas y sin tildes, para que "Café" encaje con "cafe".
export function normalizeText(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function challengeMatches(ch: Pick<Challenge, "category_id" | "keywords">, tx: ChallengeTx): boolean {
  if (tx.type !== "expense") return false;
  const keywords = (ch.keywords ?? []).map(normalizeText).filter(Boolean);
  if (!ch.category_id && !keywords.length) return !tx.recurring_id;
  if (ch.category_id && tx.category_id === ch.category_id) return true;
  if (!keywords.length) return false;
  // Espacio al final para que una keyword como "cafe " encaje al final del texto.
  const text = `${normalizeText(`${tx.concept ?? ""} ${tx.merchant ?? ""}`)} `;
  return keywords.some((k) => text.includes(k));
}

const day = (value: string) => parseISO(value.slice(0, 10));

export function challengeProgress(
  ch: Challenge,
  txs: ChallengeTx[],
  today: string,
  baselineDaily = 0
): ChallengeProgress {
  const totalDays = differenceInCalendarDays(day(ch.end_date), day(ch.start_date)) + 1;
  const lastCounted = today < ch.end_date ? today : ch.end_date;
  const elapsedDays =
    today < ch.start_date ? 0 : Math.min(totalDays, differenceInCalendarDays(day(lastCounted), day(ch.start_date)) + 1);
  const daysLeft = today > ch.end_date ? 0 : totalDays - elapsedDays;

  const inRange = txs.filter((t) => {
    const d = t.date.slice(0, 10);
    return d >= ch.start_date && d <= lastCounted && challengeMatches(ch, t);
  });
  const spent = inRange.reduce((total, t) => total + Number(t.amount), 0);
  const matches = inRange.length;

  const lastMatch = inRange.reduce<string | null>((max, t) => {
    const d = t.date.slice(0, 10);
    return !max || d > max ? d : max;
  }, null);
  const cleanStreak =
    elapsedDays === 0 ? 0 : lastMatch ? differenceInCalendarDays(day(lastCounted), day(lastMatch)) : elapsedDays;

  const limit = ch.limit_amount === null ? null : Number(ch.limit_amount);
  const ok = ch.kind === "no_spend" ? matches === 0 : spent <= (limit ?? 0);

  let status: ChallengeStatus;
  if (today < ch.start_date) status = "upcoming";
  else if (today <= ch.end_date) status = ok ? "active" : "broken";
  else status = ok ? "won" : "lost";

  return {
    status,
    spent,
    matches,
    totalDays,
    elapsedDays,
    daysLeft,
    cleanStreak,
    estimatedSaved: Math.max(0, baselineDaily * elapsedDays - spent),
  };
}

// Gasto medio diario que encaja con el reto en las 8 semanas anteriores a su inicio.
export const BASELINE_DAYS = 56;
export function baselineWindow(ch: Pick<Challenge, "start_date">) {
  const start = day(ch.start_date);
  return { from: dateKey(addDays(start, -BASELINE_DAYS)), to: dateKey(addDays(start, -1)) };
}
export function baselineDaily(ch: Challenge, txs: ChallengeTx[]) {
  const { from, to } = baselineWindow(ch);
  const total = txs
    .filter((t) => {
      const d = t.date.slice(0, 10);
      return d >= from && d <= to && challengeMatches(ch, t);
    })
    .reduce((sum, t) => sum + Number(t.amount), 0);
  return total / BASELINE_DAYS;
}

// Racha de retos superados seguidos (los más recientes primero) y total superados.
export function challengeStreak(ended: { status: ChallengeStatus; end_date: string }[]) {
  const sorted = ended
    .filter((c) => c.status === "won" || c.status === "lost")
    .sort((a, b) => b.end_date.localeCompare(a.end_date));
  let streak = 0;
  for (const c of sorted) {
    if (c.status !== "won") break;
    streak++;
  }
  return { streak, won: sorted.filter((c) => c.status === "won").length };
}

// Fechas de inicio/fin para una plantilla, empezando hoy (o el próximo sábado).
export function templateDates(t: Pick<ChallengeTemplate, "days" | "weekend">, today: string) {
  let start = day(today);
  if (t.weekend) {
    const dow = start.getDay(); // 0 domingo · 6 sábado
    if (dow === 0) start = addDays(start, -1);
    else if (dow !== 6) start = addDays(start, 6 - dow);
  }
  // Un fin de semana ya empezado (hoy domingo) sigue contando desde el sábado.
  return { start_date: dateKey(start), end_date: dateKey(addDays(start, t.days - 1)) };
}
