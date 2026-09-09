import { describe, it, expect } from "vitest";
import { parseMoney, parseReceipt } from "@/lib/receipt";

describe("parseMoney", () => {
  it("coma decimal (formato español)", () => {
    expect(parseMoney("12,50")).toBe(12.5);
  });

  it("miles con punto y decimales con coma", () => {
    expect(parseMoney("1.234,56")).toBe(1234.56);
  });

  it("miles con coma y decimales con punto", () => {
    expect(parseMoney("1,234.56")).toBe(1234.56);
  });

  it("entero sin separador decimal", () => {
    expect(parseMoney("100")).toBe(100);
  });
});

const TICKET = `MERCADONA S.A.
C/ MAYOR 10
Fecha 09/09/2026 12:34
Leche          1,20
Pan            0,95
TOTAL          2,15
GRACIAS POR SU COMPRA`;

describe("parseReceipt", () => {
  it("extrae importe del total, comercio y fecha", () => {
    const r = parseReceipt(TICKET);
    expect(r.amount).toBe(2.15);
    expect(r.merchant.toLowerCase()).toContain("mercadona");
    expect(r.date).toBe("2026-09-09");
  });

  it("texto vacío no rompe", () => {
    expect(parseReceipt("")).toEqual({ amount: null, merchant: "", date: "" });
  });

  it("sin línea de total, coge el mayor importe de la parte final", () => {
    const r = parseReceipt(`BAR PEPE\nCafe 1,20\nTostada 2,00\nRefresco 2,50`);
    expect(r.amount).toBe(2.5);
  });
});
