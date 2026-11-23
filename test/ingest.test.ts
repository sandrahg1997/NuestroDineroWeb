import { describe, it, expect } from "vitest";
import {
  generateToken,
  hashToken,
  extractFromText,
  ingestSchema,
  looksLikeToken,
  normalizeIngest,
  parseAmount,
  parseIngestDate,
} from "@/lib/ingest";
import { suggestCategoryId } from "@/lib/receipt";

describe("parseAmount", () => {
  it.each([
    ["12,50 €", 12.5],
    ["12.50", 12.5],
    ["€12,5", 12.5],
    ["1.234,56 €", 1234.56],
    ["1,234.56", 1234.56],
    ["1.234", 1234],
    ["1,234", 1234],
    ["12", 12],
    ["0,99", 0.99],
    ["1 234,56", 1234.56],
  ])("%s → %s", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it("negativo = devolución", () => {
    expect(parseAmount("-5,00 €")).toBe(-5);
    expect(parseAmount("−5,00")).toBe(-5);
    expect(parseAmount("(5,00)")).toBe(-5);
  });

  it("acepta números", () => {
    expect(parseAmount(12.345)).toBe(12.35);
    expect(parseAmount(NaN)).toBeNull();
  });

  it("rechaza lo que no es un importe", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
  });
});

describe("normalizeIngest", () => {
  const base = { merchant: "  MERCADONA   ARANDA ", card: "Unicaja", date: "" };

  it("gasto normal", () => {
    const r = normalizeIngest(ingestSchema.parse({ ...base, amount: "23,40 €" }));
    expect(r).toMatchObject({ merchant: "MERCADONA ARANDA", amount: 23.4, type: "expense", card: "Unicaja" });
  });

  it("importe negativo es un ingreso por el valor absoluto", () => {
    const r = normalizeIngest(ingestSchema.parse({ ...base, amount: "-10,00" }));
    expect(r).toMatchObject({ amount: 10, type: "income" });
  });

  it("importe cero o ilegible no vale", () => {
    expect(normalizeIngest(ingestSchema.parse({ ...base, amount: "0,00" }))).toBeNull();
    expect(normalizeIngest(ingestSchema.parse({ ...base, amount: "Cantidad" }))).toBeNull();
  });

  it("comercio y tarjeta son opcionales", () => {
    const parsed = ingestSchema.parse({ amount: 5 });
    expect(parsed.merchant).toBe("");
    expect(normalizeIngest(parsed)?.amount).toBe(5);
  });

  it("sin importe ni texto no vale", () => {
    expect(normalizeIngest(ingestSchema.parse({ merchant: "x" }))).toBeNull();
  });

  it("si solo llega el texto, saca importe y comercio de ahí", () => {
    const r = normalizeIngest(ingestSchema.parse({ text: "Mercadona 12,50 €" }));
    expect(r).toMatchObject({ merchant: "Mercadona", amount: 12.5, type: "expense" });
  });

  it("un amount válido manda sobre el texto", () => {
    const r = normalizeIngest(ingestSchema.parse({ amount: "3,00", merchant: "Bar", text: "Otro 99,99 €" }));
    expect(r).toMatchObject({ merchant: "Bar", amount: 3 });
  });
});

describe("parseIngestDate", () => {
  const today = "2026-11-23";
  it("formatos habituales", () => {
    expect(parseIngestDate("2026-11-22T10:00:00Z", today)).toBe("2026-11-22");
    expect(parseIngestDate("22/11/2026", today)).toBe("2026-11-22");
    expect(parseIngestDate("22/11/26, 14:05", today)).toBe("2026-11-22");
  });
  it("vacío o ilegible usa hoy", () => {
    expect(parseIngestDate("", today)).toBe(today);
    expect(parseIngestDate("ayer", today)).toBe(today);
    expect(parseIngestDate("31/02/2026", today)).toBe(today);
  });
  it("fechas futuras o muy antiguas usan hoy", () => {
    expect(parseIngestDate("2027-01-01", today)).toBe(today);
    expect(parseIngestDate("2026-01-01", today)).toBe(today);
  });
});

describe("tokens", () => {
  it("se generan válidos y distintos", () => {
    const a = generateToken();
    expect(looksLikeToken(a)).toBe(true);
    expect(generateToken()).not.toBe(a);
  });
  it("hash estable de 64 hex", async () => {
    const t = generateToken();
    expect(await hashToken(t)).toBe(await hashToken(t));
    expect(await hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("rechaza basura", () => {
    expect(looksLikeToken("")).toBe(false);
    expect(looksLikeToken("Bearer abc")).toBe(false);
    expect(looksLikeToken("om_corto")).toBe(false);
  });
});

describe("suggestCategoryId", () => {
  const categories = [
    { id: "c1", name: "Supermercado", type: "expense" },
    { id: "c2", name: "Ocio", type: "expense" },
    { id: "c3", name: "Devolución", type: "income" },
  ];
  it("prioriza lo aprendido", () => {
    expect(suggestCategoryId("MERCADONA", categories, [{ merchant_pattern: "mercadona", category_id: "c2" }])).toBe(
      "c2"
    );
  });
  it("usa los comercios conocidos", () => {
    expect(suggestCategoryId("Mercadona Aranda", categories, [])).toBe("c1");
  });
  it("sin pistas, vacío", () => {
    expect(suggestCategoryId("Bar Pepe", categories, [])).toBe("");
    expect(suggestCategoryId("", categories, [])).toBe("");
  });
  it("no sugiere categorías de gasto para un ingreso", () => {
    expect(suggestCategoryId("Mercadona", categories, [], "income")).toBe("");
  });
});

describe("extractFromText", () => {
  it("formatos con etiquetas", () => {
    expect(extractFromText("Comerciante: Lidl\nCantidad: 8,99 €")).toEqual({ amount: "8,99 €", merchant: "Lidl" });
  });
  it("separado por puntos medios", () => {
    expect(extractFromText("Repsol · 45,30 €")).toEqual({ amount: "45,30 €", merchant: "Repsol" });
  });
  it("importe negativo", () => {
    expect(extractFromText("Zara -19,95 €").amount).toBe("-19,95 €");
  });
  it("sin importe no extrae nada", () => {
    expect(extractFromText("Hola mundo")).toEqual({ amount: "", merchant: "" });
  });
});
