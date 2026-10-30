import { describe, it, expect } from "vitest";
import { fetchAll } from "@/lib/fetch-all";

// Simula una tabla con `total` filas servida por bloques como .range(from, to).
function fakeTable(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls: [number, number][] = [];
  const build = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  };
  return { rows, calls, build };
}

describe("fetchAll", () => {
  it("junta todos los bloques hasta uno incompleto", async () => {
    const { rows, calls, build } = fakeTable(25);
    const { data, error } = await fetchAll(build, 10);
    expect(error).toBeNull();
    expect(data).toEqual(rows);
    expect(calls).toEqual([
      [0, 9],
      [10, 19],
      [20, 29],
    ]);
  });

  it("hace una consulta más si el último bloque viene justo lleno", async () => {
    const { calls, build } = fakeTable(25);
    const { data } = await fetchAll(build, 5);
    expect(data).toHaveLength(25);
    expect(calls).toHaveLength(6);
  });

  it("devuelve el error si un bloque falla", async () => {
    const error = { message: "boom" };
    const result = await fetchAll(
      async (from) => (from === 0 ? { data: [{ id: 1 }], error: null } : { data: null, error }),
      1
    );
    expect(result).toEqual({ data: null, error });
  });
});
