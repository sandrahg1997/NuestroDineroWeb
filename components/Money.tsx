import { eur } from "@/lib/utils";

// `split` muestra los céntimos y el símbolo más pequeños (saldo de Inicio).
export default function Money({
  value,
  strong = false,
  split = false,
}: {
  value: number;
  strong?: boolean;
  split?: boolean;
}) {
  const className = `amount-value${strong ? " amount-value-strong" : ""}`;
  if (!split) return <span className={className}>{eur.format(value)}</span>;
  const parts = eur.formatToParts(value);
  const cut = parts.findIndex((p) => p.type === "decimal");
  const main = (cut < 0 ? parts : parts.slice(0, cut)).map((p) => p.value).join("");
  const rest =
    cut < 0
      ? ""
      : parts
          .slice(cut)
          .map((p) => p.value)
          .join("");
  return (
    <span className={className}>
      {main}
      <span className="amount-minor">{rest}</span>
    </span>
  );
}
