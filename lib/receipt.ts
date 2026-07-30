const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const moneyRegex = /(?<!\d)(?:\d{1,3}(?:[.\s]\d{3})+|\d+)[,.]\d{2}(?!\d)/g;
export function parseMoney(value: string) {
  const compact = value.replace(/\s/g, "");
  const comma = compact.lastIndexOf(","), dot = compact.lastIndexOf(".");
  const decimal = comma > dot ? "," : ".";
  return Number(compact.replace(decimal === "," ? /\./g : /,/g, "").replace(decimal, "."));
}
export function parseReceipt(text: string) {
  const lines = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const keywords = ["total", "importe", "a pagar", "total compra", "total factura", "tarjeta", "efectivo"];
  let amount: number | null = null;
  for (const line of [...lines].reverse()) {
    if (!keywords.some(k => normalize(line).includes(k))) continue;
    const values = line.match(moneyRegex) ?? [];
    if (values.length) { amount = parseMoney(values.at(-1)!); break; }
  }
  if (amount == null) {
    const tail = lines.slice(Math.floor(lines.length * .66));
    const values = tail.flatMap(line => (line.match(moneyRegex) ?? []).map(parseMoney)).filter(v => v > 0 && v < 100000);
    amount = values.length ? Math.max(...values) : null;
  }
  const excluded = ["ticket","factura","cif","nif","fecha","hora","cliente","caja","telefono","www","http","gracias"];
  const merchant = lines.slice(0,10).find(line => line.replace(/[^a-záéíóúüñ]/gi,"").length >= 3 && !excluded.some(x => normalize(line).includes(x)) && !(line.match(moneyRegex)?.length)) ?? "";
  const dateMatch = text.match(/\b([0-3]?\d)[/.-]([01]?\d)[/.-](20\d{2}|\d{2})\b/);
  let date = "";
  if (dateMatch) { let y = Number(dateMatch[3]); if (y < 100) y += 2000; date = `${y}-${String(Number(dateMatch[2])).padStart(2,"0")}-${String(Number(dateMatch[1])).padStart(2,"0")}`; }
  return { amount, merchant, date };
}
export const merchantSuggestions: Record<string,string> = {
  mercadona:"Supermercado", carrefour:"Supermercado", lidl:"Supermercado", aldi:"Supermercado", dia:"Supermercado",
  repsol:"Transporte", cepsa:"Transporte", bp:"Transporte", uber:"Transporte", renfe:"Transporte",
  amazon:"Otros", netflix:"Suscripciones", spotify:"Suscripciones", ikea:"Vivienda", leroy:"Vivienda",
  farmacia:"Salud", druni:"Salud", primor:"Salud", zara:"Ropa", mango:"Ropa", decathlon:"Ocio"
};
