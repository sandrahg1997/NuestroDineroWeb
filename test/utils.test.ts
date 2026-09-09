import { describe, it, expect } from "vitest";
import {
  monthKey,
  dateKey,
  nextMonthKey,
  prevMonthKey,
  monthRange,
  monthLabel,
  savingsTier,
  transactionsHref,
  categoryColor,
  defaultPeriodName,
} from "@/lib/utils";

describe("claves de fecha", () => {
  it("monthKey da el día 1 del mes", () => {
    expect(monthKey(new Date(2026, 0, 15))).toBe("2026-01-01");
    expect(monthKey(new Date(2026, 11, 31))).toBe("2026-12-01");
  });

  it("dateKey da AAAA-MM-DD", () => {
    expect(dateKey(new Date(2026, 8, 9))).toBe("2026-09-09");
    expect(dateKey(new Date(2026, 0, 1))).toBe("2026-01-01");
  });

  it("nextMonthKey avanza y cambia de año", () => {
    expect(nextMonthKey("2026-01")).toBe("2026-02");
    expect(nextMonthKey("2026-12")).toBe("2027-01");
  });

  it("prevMonthKey retrocede y cambia de año", () => {
    expect(prevMonthKey("2026-03")).toBe("2026-02");
    expect(prevMonthKey("2026-01")).toBe("2025-12");
  });

  it("nextMonthKey y prevMonthKey son inversas", () => {
    expect(prevMonthKey(nextMonthKey("2026-07"))).toBe("2026-07");
  });
});

describe("monthRange", () => {
  it("incluye ambos extremos", () => {
    expect(monthRange("2026-01", "2026-03")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("cruza el cambio de año", () => {
    expect(monthRange("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("un solo mes si inicio y fin coinciden", () => {
    expect(monthRange("2026-05", "2026-05")).toEqual(["2026-05"]);
  });
});

describe("monthLabel", () => {
  it("empieza en mayúscula e incluye el año", () => {
    const label = monthLabel("2026-01");
    expect(label).toMatch(/^[A-ZÁÉÍÓÚ]/);
    expect(label).toContain("2026");
  });
});

describe("savingsTier", () => {
  it("tasa negativa = números rojos (warn)", () => {
    expect(savingsTier(-5)).toEqual({ label: "Números rojos", className: "warn" });
  });

  it("tramos intermedios son neutral", () => {
    expect(savingsTier(5).className).toBe("neutral");
    expect(savingsTier(15).className).toBe("neutral");
  });

  it("tasa alta = good", () => {
    expect(savingsTier(40)).toEqual({ label: "Excelente", className: "good" });
  });
});

describe("transactionsHref", () => {
  it("sin opciones devuelve la ruta base", () => {
    expect(transactionsHref()).toBe("/transactions");
    expect(transactionsHref({ category: null })).toBe("/transactions");
  });

  it("compone los parámetros presentes", () => {
    const href = transactionsHref({ type: "expense", category: "c1", from: "2026-01-01", to: "2026-01-31" });
    expect(href.startsWith("/transactions?")).toBe(true);
    const qs = new URLSearchParams(href.split("?")[1]);
    expect(qs.get("type")).toBe("expense");
    expect(qs.get("category")).toBe("c1");
    expect(qs.get("from")).toBe("2026-01-01");
    expect(qs.get("to")).toBe("2026-01-31");
  });
});

describe("categoryColor", () => {
  it("es determinista y devuelve un color de la paleta", () => {
    const a = categoryColor("Supermercado");
    const b = categoryColor("Supermercado");
    expect(a).toBe(b);
    expect(a).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("defaultPeriodName", () => {
  it("un mes natural completo se nombra por el mes", () => {
    const name = defaultPeriodName("2026-01-01", "2026-01-31");
    expect(name).toContain("2026");
    expect(name).toMatch(/^[A-ZÁÉÍÓÚ]/);
    expect(name).not.toContain("/");
  });

  it("un rango parcial se nombra con las dos fechas", () => {
    expect(defaultPeriodName("2026-01-05", "2026-01-20")).toBe("05/01/2026 – 20/01/2026");
  });
});
