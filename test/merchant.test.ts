import { describe, it, expect } from "vitest";
import { aliasKey, cleanMerchant } from "@/lib/merchant";
import { shouldRemindPending } from "@/lib/ingest";

describe("cleanMerchant", () => {
  it.each([
    ["MERCADONA ARANDA 0123", "Mercadona Aranda"],
    ["MERCADONA S.A.", "Mercadona"],
    ["PAYPAL *SPOTIFY", "Spotify"],
    ["SQ *CAFE LUNA", "Cafe Luna"],
    ["AMZN Mktp ES*AB12C", "Amazon"],
    ["Amazon.es", "Amazon"],
    ["REPSOL ESTACION 4521", "Repsol Estacion"],
    ["Bar La Esquina", "Bar La Esquina"],
    ["PANADERIA DE LA PLAZA", "Panaderia de la Plaza"],
    ["  LIDL   ", "Lidl"],
  ])("%s → %s", (input, expected) => {
    expect(cleanMerchant(input)).toBe(expected);
  });

  it("vacío y casos raros no rompen", () => {
    expect(cleanMerchant("")).toBe("");
    expect(cleanMerchant("   ")).toBe("");
    // Si al limpiar no queda nada, se devuelve el original.
    expect(cleanMerchant("1234")).toBe("1234");
  });
});

describe("aliasKey", () => {
  it("ignora mayúsculas, acentos y números de tienda", () => {
    expect(aliasKey("MERCADONA ARANDA 0123")).toBe(aliasKey("Mercadona Aranda 0456"));
    expect(aliasKey("Café Ñam 12")).toBe("cafe nam");
  });
  it("comercios distintos, claves distintas", () => {
    expect(aliasKey("Lidl")).not.toBe(aliasKey("Aldi"));
  });
});

describe("shouldRemindPending", () => {
  it("a los 2 días y luego cada 3", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].filter(shouldRemindPending)).toEqual([2, 5, 8]);
  });
});
