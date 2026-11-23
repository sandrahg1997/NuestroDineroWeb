// Limpieza del nombre de comercio que manda Apple Pay: "MERCADONA ARANDA 0123",
// "PAYPAL *SPOTIFY", "AMZN Mktp ES*AB12C"… Sin dependencias, para probarla y usarla
// igual en servidor y navegador.

const LOWER_WORDS = new Set(["de", "del", "la", "las", "los", "el", "y", "en", "e"]);
const WRAPPER_PREFIX = /^(paypal|sq|tst|sp|zettle|izettle|sumup|ctlp)\s*\*\s*(.+)$/i;
const LEGAL_SUFFIX = /\s+(s\.?\s?l\.?\s?u?\.?|s\.?\s?a\.?\s?u?\.?|s\.?\s?c\.?|c\.?\s?b\.?)$/i;
// Un código de tienda o terminal: lleva algún número y es corto ("0123", "AB12C", "#45").
const isCode = (token: string) => /\d/.test(token) && /^[#nº.]*[a-z]*\d[a-z\d]*$/i.test(token) && token.length <= 8;

function titleCase(text: string) {
  return text
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && LOWER_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export function cleanMerchant(raw: string): string {
  const original = raw.replace(/\s+/g, " ").trim();
  if (!original) return "";
  if (/\b(amzn|amazon)\b/i.test(original)) return "Amazon";

  let text = original.replace(WRAPPER_PREFIX, "$2");
  text = text.replace(/[*]+/g, " ").replace(/\s+/g, " ").trim();
  text = text.replace(LEGAL_SUFFIX, "");
  const kept = text.split(" ").filter((t) => t && !isCode(t));
  text = kept
    .join(" ")
    .replace(/^[\s\-–#*.,]+|[\s\-–#*.,]+$/g, "")
    .trim();
  if (text.length < 2) return original;
  // Solo se reescribe lo que está TODO en mayúsculas; un "Bar La Esquina" ya viene bien.
  const hasLower = /[a-záéíóúüñ]/.test(text);
  return hasLower ? text : titleCase(text);
}

// Clave estable para recordar cómo habéis renombrado un comercio: sin acentos, sin
// mayúsculas, sin números ni signos. "MERCADONA ARANDA 0123" y "Mercadona Aranda 0456"
// dan la misma clave.
export function aliasKey(raw: string): string {
  return cleanMerchant(raw)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
