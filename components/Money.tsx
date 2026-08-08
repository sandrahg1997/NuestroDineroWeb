import { eur } from "@/lib/utils";

export default function Money({ value, strong = false }: { value: number; strong?: boolean }) {
  return <span className={`amount-value${strong ? " amount-value-strong" : ""}`}>{eur.format(value)}</span>;
}
