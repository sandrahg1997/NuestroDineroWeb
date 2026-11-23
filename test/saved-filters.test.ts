import { describe, it, expect } from "vitest";
import {
  amountValue,
  detectPreset,
  makeSavedFilter,
  parseSavedFilters,
  presetRange,
  resolveSavedFilter,
  type FilterState,
} from "@/lib/saved-filters";

const TODAY = "2026-11-26";
const state = (over: Partial<FilterState> = {}): FilterState => ({
  query: "mercadona",
  type: "expense",
  category: "",
  amountMin: "",
  amountMax: "",
  dateFrom: "",
  dateTo: "",
  ...over,
});

describe("presetRange / detectPreset", () => {
  it("rangos relativos a hoy", () => {
    expect(presetRange("month", TODAY)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(presetRange("year", TODAY)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(presetRange("last30", TODAY)).toEqual({ from: "2026-10-28", to: "2026-11-26" });
  });
  it("febrero y años bisiestos", () => {
    expect(presetRange("month", "2028-02-10").to).toBe("2028-02-29");
    expect(presetRange("month", "2027-02-10").to).toBe("2027-02-28");
    expect(presetRange("last30", "2026-01-10")).toEqual({ from: "2025-12-12", to: "2026-01-10" });
  });
  it("reconoce el preajuste solo si coincide exactamente", () => {
    expect(detectPreset("2026-11-01", "2026-11-30", TODAY)).toBe("month");
    expect(detectPreset("2026-01-01", "2026-12-31", TODAY)).toBe("year");
    expect(detectPreset("2026-11-02", "2026-11-30", TODAY)).toBeNull();
    expect(detectPreset("", "", TODAY)).toBeNull();
  });
});

describe("guardar y aplicar", () => {
  it("las fechas de 'este año' se guardan relativas y se recalculan otro día", () => {
    const saved = makeSavedFilter(
      "Mercadona este año",
      state({ dateFrom: "2026-01-01", dateTo: "2026-12-31" }),
      TODAY,
      "id1"
    );
    expect(saved).toMatchObject({ datePreset: "year", dateFrom: "", dateTo: "" });
    const nextYear = resolveSavedFilter(saved, "2027-03-05", new Set());
    expect(nextYear).toMatchObject({ dateFrom: "2027-01-01", dateTo: "2027-12-31" });
  });
  it("fechas sueltas se guardan tal cual", () => {
    const saved = makeSavedFilter("Verano", state({ dateFrom: "2026-07-01", dateTo: "2026-08-31" }), TODAY, "id2");
    expect(saved).toMatchObject({ datePreset: null, dateFrom: "2026-07-01", dateTo: "2026-08-31" });
    expect(resolveSavedFilter(saved, "2027-03-05", new Set())).toMatchObject({
      dateFrom: "2026-07-01",
      dateTo: "2026-08-31",
    });
  });
  it("una categoría borrada se ignora; 'sin categoría' se conserva", () => {
    const withCat = makeSavedFilter("x", state({ category: "c1" }), TODAY, "id3");
    expect(resolveSavedFilter(withCat, TODAY, new Set(["c1"])).category).toBe("c1");
    expect(resolveSavedFilter(withCat, TODAY, new Set(["otra"])).category).toBe("");
    const none = makeSavedFilter("x", state({ category: "__none" }), TODAY, "id4");
    expect(resolveSavedFilter(none, TODAY, new Set()).category).toBe("__none");
  });
  it("recorta el nombre y la búsqueda", () => {
    const saved = makeSavedFilter("  " + "a".repeat(60) + "  ", state({ query: "  hola  " }), TODAY, "id5");
    expect(saved.name).toHaveLength(40);
    expect(saved.query).toBe("hola");
  });
});

describe("parseSavedFilters", () => {
  const ok = makeSavedFilter("Bien", state(), TODAY, "ok");
  it("lee lo que se guardó", () => {
    expect(parseSavedFilters(JSON.stringify([ok]))).toEqual([ok]);
  });
  it("tolera basura sin lanzar", () => {
    expect(parseSavedFilters(null)).toEqual([]);
    expect(parseSavedFilters("no json")).toEqual([]);
    expect(parseSavedFilters('{"a":1}')).toEqual([]);
    expect(parseSavedFilters(JSON.stringify([null, 3, "x", { id: 1 }]))).toEqual([]);
  });
  it("descarta entradas con datos raros y conserva las buenas", () => {
    const list = [
      ok,
      { ...ok, id: "b", type: "otro" },
      { ...ok, id: "c", amountMin: "<script>" },
      { ...ok, id: "d", dateFrom: "ayer" },
      { ...ok, id: "e", name: "  " },
    ];
    expect(parseSavedFilters(JSON.stringify(list)).map((f) => f.id)).toEqual(["ok"]);
  });
  it("máximo 20", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ ...ok, id: `f${i}` }));
    expect(parseSavedFilters(JSON.stringify(many))).toHaveLength(20);
  });
});

describe("amountValue", () => {
  it("números, comas y vacío", () => {
    expect(amountValue("12,5")).toBe(12.5);
    expect(amountValue("100")).toBe(100);
    expect(amountValue("")).toBeNull();
    expect(amountValue("  ")).toBeNull();
    expect(amountValue("abc")).toBeNull();
  });
});
