import { describe, it, expect } from "vitest";
import { timeAgo } from "@/lib/offline";

const NOW = Date.parse("2026-11-26T12:00:00Z");
const ago = (ms: number) => NOW - ms;

describe("timeAgo", () => {
  it("minutos, horas y días", () => {
    expect(timeAgo(ago(20_000), NOW)).toBe("hace un momento");
    expect(timeAgo(ago(5 * 60_000), NOW)).toBe("hace 5 min");
    expect(timeAgo(ago(3 * 3_600_000), NOW)).toBe("hace 3 h");
    expect(timeAgo(ago(26 * 3_600_000), NOW)).toBe("hace 1 día");
    expect(timeAgo(ago(3 * 86_400_000), NOW)).toBe("hace 3 días");
  });
  it("sin fecha, vacío; fecha futura no da negativos", () => {
    expect(timeAgo(null, NOW)).toBe("");
    expect(timeAgo(NOW + 60_000, NOW)).toBe("hace un momento");
  });
});
