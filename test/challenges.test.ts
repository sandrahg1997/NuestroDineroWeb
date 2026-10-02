import { describe, it, expect } from "vitest";
import {
  baselineDaily,
  challengeMatches,
  challengeProgress,
  challengeStreak,
  templateDates,
  type Challenge,
  type ChallengeTx,
} from "@/lib/challenges";

const challenge = (over: Partial<Challenge> = {}): Challenge => ({
  id: "c",
  household_id: "h",
  title: "Semana sin delivery",
  icon: "🛵",
  kind: "no_spend",
  category_id: null,
  keywords: ["glovo", "just eat"],
  limit_amount: null,
  start_date: "2026-03-02",
  end_date: "2026-03-08",
  created_at: "2026-03-02T10:00:00Z",
  ...over,
});

const tx = (over: Partial<ChallengeTx>): ChallengeTx => ({
  type: "expense",
  amount: 20,
  date: "2026-03-03",
  concept: "",
  merchant: "",
  category_id: null,
  recurring_id: null,
  ...over,
});

describe("challengeMatches", () => {
  it("encaja por palabra clave sin importar mayúsculas ni tildes", () => {
    expect(challengeMatches(challenge(), tx({ merchant: "GLOVO App" }))).toBe(true);
    expect(challengeMatches(challenge({ keywords: ["cafeteria"] }), tx({ concept: "Cafetería Luna" }))).toBe(true);
    expect(challengeMatches(challenge(), tx({ merchant: "Mercadona" }))).toBe(false);
  });

  it("encaja por categoría", () => {
    const c = challenge({ keywords: [], category_id: "rest" });
    expect(challengeMatches(c, tx({ category_id: "rest" }))).toBe(true);
    expect(challengeMatches(c, tx({ category_id: "super" }))).toBe(false);
  });

  it("sin categoría ni palabras clave cuenta cualquier gasto salvo los recurrentes", () => {
    const c = challenge({ keywords: [] });
    expect(challengeMatches(c, tx({}))).toBe(true);
    expect(challengeMatches(c, tx({ recurring_id: "r" }))).toBe(false);
    expect(challengeMatches(c, tx({ type: "income" }))).toBe(false);
  });

  it("la palabra clave con espacio final encaja al final del texto pero no dentro de otra palabra", () => {
    const c = challenge({ keywords: ["cafe "] });
    expect(challengeMatches(c, tx({ concept: "Café" }))).toBe(true);
    expect(challengeMatches(c, tx({ concept: "Cafetera nueva" }))).toBe(false);
  });
});

describe("challengeProgress", () => {
  it("en curso y sin gastos: activo, con racha igual a los días transcurridos", () => {
    const p = challengeProgress(challenge(), [tx({ merchant: "Mercadona" })], "2026-03-05");
    expect(p.status).toBe("active");
    expect(p.elapsedDays).toBe(4);
    expect(p.daysLeft).toBe(3);
    expect(p.cleanStreak).toBe(4);
  });

  it("un gasto que encaja lo rompe y la racha cuenta desde ese día", () => {
    const p = challengeProgress(challenge(), [tx({ merchant: "Glovo", date: "2026-03-03" })], "2026-03-06");
    expect(p.status).toBe("broken");
    expect(p.matches).toBe(1);
    expect(p.cleanStreak).toBe(3);
  });

  it("terminado: superado o no superado", () => {
    expect(challengeProgress(challenge(), [], "2026-03-20").status).toBe("won");
    expect(challengeProgress(challenge(), [tx({ merchant: "Just Eat" })], "2026-03-20").status).toBe("lost");
  });

  it("aún no empezado", () => {
    const p = challengeProgress(challenge(), [], "2026-03-01");
    expect(p.status).toBe("upcoming");
    expect(p.elapsedDays).toBe(0);
    expect(p.cleanStreak).toBe(0);
  });

  it("con tope: se cumple mientras no se pase del límite", () => {
    const c = challenge({ kind: "limit", keywords: [], category_id: "ocio", limit_amount: 50 });
    const txs = [tx({ category_id: "ocio", amount: 30 }), tx({ category_id: "ocio", amount: 15, date: "2026-03-04" })];
    expect(challengeProgress(c, txs, "2026-03-05").status).toBe("active");
    expect(challengeProgress(c, [...txs, tx({ category_id: "ocio", amount: 10 })], "2026-03-05").status).toBe("broken");
  });

  it("ignora gastos fuera del rango y los futuros a hoy", () => {
    const p = challengeProgress(challenge(), [tx({ merchant: "Glovo", date: "2026-03-07" })], "2026-03-05");
    expect(p.status).toBe("active");
  });

  it("estima lo ahorrado frente a la línea base de las 8 semanas previas", () => {
    const c = challenge();
    // 8 pedidos de 28 € en las 8 semanas previas → 224 / 56 = 4 €/día.
    const history = Array.from({ length: 8 }, (_, i) =>
      tx({ merchant: "Glovo", amount: 28, date: `2026-02-${String(i * 3 + 1).padStart(2, "0")}` })
    );
    const daily = baselineDaily(c, history);
    expect(daily).toBe(4);
    expect(challengeProgress(c, history, "2026-03-08", daily).estimatedSaved).toBe(28);
  });
});

describe("challengeStreak", () => {
  it("cuenta superados seguidos desde el más reciente", () => {
    expect(
      challengeStreak([
        { status: "won", end_date: "2026-03-08" },
        { status: "won", end_date: "2026-02-20" },
        { status: "lost", end_date: "2026-02-10" },
        { status: "won", end_date: "2026-01-10" },
        { status: "active", end_date: "2026-04-01" },
      ])
    ).toEqual({ streak: 2, won: 3 });
  });
});

describe("templateDates", () => {
  it("empieza hoy para los retos normales", () => {
    expect(templateDates({ days: 7 }, "2026-03-04")).toEqual({ start_date: "2026-03-04", end_date: "2026-03-10" });
  });

  it("los de fin de semana van al próximo sábado, o al de ayer si hoy es domingo", () => {
    expect(templateDates({ days: 2, weekend: true }, "2026-03-04")).toEqual({
      start_date: "2026-03-07",
      end_date: "2026-03-08",
    });
    expect(templateDates({ days: 2, weekend: true }, "2026-03-08")).toEqual({
      start_date: "2026-03-07",
      end_date: "2026-03-08",
    });
  });
});
