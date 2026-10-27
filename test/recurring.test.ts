import { describe, it, expect } from "vitest";
import { buildRecurringReminder, daysUntil, dueLabel, parseAmount, sortRecurring } from "@/lib/recurring";

describe("sortRecurring", () => {
  it("activos primero y por próxima fecha", () => {
    const rows = [
      { concept: "Gimnasio", is_active: false, next_date: "2026-11-01" },
      { concept: "Netflix", is_active: true, next_date: "2026-11-15" },
      { concept: "Hipoteca", is_active: true, next_date: "2026-11-01" },
    ];
    expect(sortRecurring(rows).map((r) => r.concept)).toEqual(["Hipoteca", "Netflix", "Gimnasio"]);
  });
});

describe("daysUntil / dueLabel", () => {
  it("cuenta días aunque haya cambio de hora por medio", () => {
    expect(daysUntil("2026-10-26", "2026-10-24")).toBe(2);
  });
  it("etiqueta hoy, mañana, en N días, pendiente y fecha", () => {
    expect(dueLabel("2026-10-27", "2026-10-27")).toBe("Hoy");
    expect(dueLabel("2026-10-28", "2026-10-27")).toBe("Mañana");
    expect(dueLabel("2026-10-30", "2026-10-27")).toBe("En 3 días");
    expect(dueLabel("2026-10-20", "2026-10-27")).toBe("Pendiente");
    expect(dueLabel("2026-12-05", "2026-10-27")).toMatch(/5/);
  });
});

describe("parseAmount", () => {
  it("acepta coma, punto y miles con punto", () => {
    expect(parseAmount("12,50")).toBe(12.5);
    expect(parseAmount("12.5")).toBe(12.5);
    expect(parseAmount("1.234,56")).toBe(1234.56);
  });
  it("NaN si está vacío o no es un número", () => {
    expect(parseAmount("")).toBeNaN();
    expect(parseAmount("1,2,3")).toBeNaN();
  });
});

describe("buildRecurringReminder", () => {
  it("nada si no hay movimientos", () => {
    expect(buildRecurringReminder([], false)).toBeNull();
  });
  it("uno: se cobra / entra", () => {
    expect(buildRecurringReminder([{ concept: "Hipoteca", amount: 850, type: "expense" }], false)!.body).toMatch(
      /^Mañana se cobra Hipoteca \(850,00\s€\)\.$/
    );
    expect(buildRecurringReminder([{ concept: "Nómina", amount: 2000, type: "income" }], true)!.body).toBe(
      "Mañana entra Nómina."
    );
  });
  it("varios: los más grandes primero, resto agrupado y total de gastos", () => {
    const r = buildRecurringReminder(
      [
        { concept: "Netflix", amount: 12, type: "expense" },
        { concept: "Hipoteca", amount: 850, type: "expense" },
        { concept: "Luz", amount: 60, type: "expense" },
        { concept: "Spotify", amount: 11, type: "expense" },
      ],
      false
    )!;
    expect(r.title).toBe("Mañana: 4 movimientos recurrentes");
    expect(r.body.startsWith("Hipoteca")).toBe(true);
    expect(r.body).toContain("y 1 más");
    expect(r.body).toContain("Total en gastos");
  });
  it("sin cifras si se ocultan importes", () => {
    const r = buildRecurringReminder(
      [
        { concept: "Hipoteca", amount: 850, type: "expense" },
        { concept: "Luz", amount: 60, type: "expense" },
      ],
      true
    )!;
    expect(r.body).toBe("Hipoteca y Luz.");
  });
});
