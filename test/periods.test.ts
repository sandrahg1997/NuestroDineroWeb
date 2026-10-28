import { describe, it, expect } from "vitest";
import { overlappingPeriods, overlapWarning } from "@/lib/periods";

const periods = [
  { id: "oct", name: "Octubre", start_date: "2026-10-01", end_date: "2026-10-31" },
  { id: "sep", name: "Septiembre", start_date: "2026-09-01", end_date: "2026-09-30" },
];

describe("overlappingPeriods", () => {
  it("detecta solapes parciales y de un solo día", () => {
    expect(overlappingPeriods("2026-10-25", "2026-11-24", periods).map((p) => p.id)).toEqual(["oct"]);
    expect(overlappingPeriods("2026-09-30", "2026-10-01", periods).map((p) => p.id)).toEqual(["oct", "sep"]);
  });
  it("periodos consecutivos no se solapan", () => {
    expect(overlappingPeriods("2026-11-01", "2026-11-30", periods)).toEqual([]);
  });
  it("al editar no se compara consigo mismo", () => {
    expect(overlappingPeriods("2026-10-01", "2026-10-31", periods, "oct")).toEqual([]);
  });
  it("sin fechas o con fechas al revés no hay solape", () => {
    expect(overlappingPeriods("", "2026-10-31", periods)).toEqual([]);
    expect(overlappingPeriods("2026-10-31", "2026-10-01", periods)).toEqual([]);
  });
});

describe("overlapWarning", () => {
  it("nombra los periodos y resume el resto", () => {
    expect(overlapWarning([])).toBeNull();
    const many = [...periods, { id: "x", name: "X", start_date: "2026-10-05", end_date: "2026-10-06" }];
    const msg = overlapWarning(many)!;
    expect(msg).toContain("«Octubre»");
    expect(msg).toContain("y 1 más");
  });
});
