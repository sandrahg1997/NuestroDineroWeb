import { z } from "zod";

// Utilidades de la ingesta de pagos (Atajos de iOS → /api/ingest). Sin dependencias
// de servidor ni de navegador para poder probarlas y usarlas en ambos lados.

// Importe tal y como lo manda Atajos: "12,50 €", "12.50", "1.234,56", "-5,00", 12.5…
// Devuelve null si no hay un importe válido. Con un solo separador, 3 cifras detrás
// se leen como miles ("1.234" = 1234); 1 o 2 como decimales ("12,5", "12.50").
export function parseAmount(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input * 100) / 100 : null;
  if (typeof input !== "string") return null;
  const negative = /-|−|–/.test(input.replace(/\s/g, "").slice(0, 2)) || /^\(.*\)$/.test(input.trim());
  const cleaned = input.replace(/[^\d.,]/g, "");
  if (!/\d/.test(cleaned)) return null;
  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");
  let normalized: string;
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const thousands = decimal === "," ? /\./g : /,/g;
    normalized = cleaned.replace(thousands, "").replace(decimal, ".");
  } else if (comma >= 0 || dot >= 0) {
    const sep = comma >= 0 ? "," : ".";
    const parts = cleaned.split(sep);
    const last = parts[parts.length - 1];
    const isThousands = parts.length > 2 || last.length === 3;
    normalized = isThousands ? parts.join("") : `${parts[0]}.${last}`;
  } else normalized = cleaned;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value * 100) / 100;
  return negative ? -rounded : rounded;
}

// Cuerpo que manda el atajo. Todo viene como texto y puede venir vacío o con
// variables sin sustituir, así que se valida con tolerancia y se limita el tamaño.
// `amount` y `merchant` son lo ideal; si el atajo solo puede mandar la transacción
// entera como texto, llega en `text` y de ahí se extraen los datos.
export const ingestSchema = z.object({
  merchant: z.string().trim().max(120).optional().default(""),
  amount: z.union([z.string().max(40), z.number()]).optional(),
  card: z.string().trim().max(80).optional().default(""),
  date: z.string().trim().max(40).optional().default(""),
  text: z.string().trim().max(500).optional().default(""),
});

export type IngestPayload = z.infer<typeof ingestSchema>;

export type NormalizedIngest = {
  merchant: string;
  amount: number;
  type: "expense" | "income";
  card: string;
  rawAmount: string;
};

const MONEY_IN_TEXT =
  /[-−–]?\s?(?:\d{1,3}(?:[.\s]\d{3})+|\d+)(?:[.,]\d{1,2})?\s?(?:€|eur\b|euros?\b)|[-−–]?\s?(?:\d{1,3}(?:[.\s]\d{3})+|\d+)[.,]\d{2}(?!\d)/i;

// Saca importe y comercio de un texto libre tipo "Mercadona 12,50 €" o
// "Comerciante: Mercadona\nCantidad: 12,50 €". El comercio es lo que queda al
// quitar el importe y las etiquetas más habituales.
export function extractFromText(text: string): { amount: string; merchant: string } {
  const match = text.match(MONEY_IN_TEXT);
  if (!match) return { amount: "", merchant: "" };
  const rest = text
    .replace(match[0], " ")
    .split(/\r?\n|\s[·|•]\s/)
    .map((line) =>
      line
        .replace(/^\s*(comerciante|comercio|merchant|cantidad|importe|amount|tarjeta|card|nombre|name)\s*[:=-]\s*/i, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((line) => /[a-záéíóúüñ]{2}/i.test(line));
  return { amount: match[0].trim(), merchant: rest[0] ?? "" };
}

// Aplica `parseAmount` y decide el tipo: un importe negativo (devolución) es un ingreso.
export function normalizeIngest(payload: IngestPayload): NormalizedIngest | null {
  let amountInput = payload.amount;
  let merchant = payload.merchant;
  const hasAmount = amountInput !== undefined && parseAmount(amountInput) != null;
  if (!hasAmount && payload.text) {
    const found = extractFromText(payload.text);
    amountInput = found.amount;
    if (!merchant) merchant = found.merchant;
  }
  const parsed = parseAmount(amountInput);
  if (parsed == null || parsed === 0 || Math.abs(parsed) > 1_000_000) return null;
  return {
    merchant: merchant.replace(/\s+/g, " ").trim(),
    amount: Math.abs(parsed),
    type: parsed < 0 ? "income" : "expense",
    card: payload.card,
    rawAmount: String(amountInput).slice(0, 40),
  };
}

// Fecha del pago en AAAA-MM-DD. Atajos manda la fecha en el formato del móvil
// ("23/11/2026", "23 nov 2026, 14:05"…); si no se entiende, se usa `fallback` (hoy en España).
export function parseIngestDate(raw: string, fallback: string): string {
  const text = raw.trim();
  if (!text) return fallback;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const es = text.match(/^([0-3]?\d)[/.-]([01]?\d)[/.-](\d{4}|\d{2})\b/);
  let y: number, m: number, d: number;
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (es) {
    [d, m] = [Number(es[1]), Number(es[2])];
    y = Number(es[3]);
    if (y < 100) y += 2000;
  } else return fallback;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return fallback;
  // Una fecha futura o de hace más de 60 días es casi seguro un error de formato.
  const diffDays = (Date.parse(fallback) - date.getTime()) / 86_400_000;
  if (diffDays < -1 || diffDays > 60) return fallback;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// SHA-256 en hexadecimal. Funciona igual en el navegador (al crear el token) y en
// el servidor (al comprobarlo), porque `crypto.subtle` existe en ambos.
export async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const TOKEN_PREFIX = "om_";

// 32 bytes aleatorios en base64url con prefijo, para reconocerlo si se filtra.
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${TOKEN_PREFIX}${b64}`;
}

export function looksLikeToken(value: string) {
  return /^om_[A-Za-z0-9_-]{40,60}$/.test(value);
}

// Máximo de pendientes sin revisar por hogar: protege de un atajo que se dispare en bucle.
export const MAX_PENDING_PER_HOUSEHOLD = 200;

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// ¿Es el mismo comercio? Uno contiene al otro ("mercadona" / "MERCADONA ARANDA") o
// comparten la primera palabra (4+ letras). Textos muy cortos no cuentan.
export function sameMerchant(a: string, b: string) {
  const x = fold(a);
  const y = fold(b);
  if (x.length < 3 || y.length < 3) return false;
  if (x.includes(y) || y.includes(x)) return true;
  const fx = x.split(" ")[0];
  return fx.length >= 4 && fx === y.split(" ")[0];
}

// `candidates` son movimientos ya guardados con el mismo importe, tipo y fecha
// (±1 día). Es duplicado probable si alguno es del mismo comercio o si no tiene
// comercio con el que comparar. Dos tiendas distintas con el mismo importe el
// mismo día NO cuentan: pasa más de lo que parece (un café de 2,00 €).
export function isLikelyDuplicate(merchant: string, candidates: { merchant: string; concept: string }[]) {
  return candidates.some((c) => {
    const name = c.merchant.trim() || c.concept.trim();
    if (!name || !merchant.trim()) return true;
    return sameMerchant(merchant, name);
  });
}

// Regla de "guardar sin preguntar" que encaja con el comercio: gana la más específica
// (patrón más largo). Los patrones se guardan en minúsculas.
export function findAutoRule<T extends { merchant_pattern: string }>(merchant: string, rules: T[]): T | null {
  const m = merchant.toLowerCase();
  if (m.trim().length < 3) return null;
  let best: T | null = null;
  for (const r of rules) {
    const pattern = r.merchant_pattern.trim();
    if (pattern.length < 3 || !m.includes(pattern)) continue;
    if (!best || pattern.length > best.merchant_pattern.trim().length) best = r;
  }
  return best;
}

// Día anterior y siguiente en AAAA-MM-DD, para buscar duplicados con margen.
export function dayRange(date: string, margin = 1): [string, string] {
  const base = Date.parse(`${date}T12:00:00Z`);
  const f = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return [f(base - margin * 86_400_000), f(base + margin * 86_400_000)];
}

// Recordatorio de pendientes olvidados: a los 2 días del más antiguo y luego cada 3
// (2, 5, 8…), para avisar sin agobiar. `days` son los días desde que llegó el más antiguo.
export function shouldRemindPending(days: number) {
  return days >= 2 && (days - 2) % 3 === 0;
}
