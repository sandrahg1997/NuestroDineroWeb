"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

type Option = { id: string; name: string };

// Selector de periodo de Inicio. Solo cambia lo que se ve (?period=…): no toca
// el periodo activo del hogar, que es compartido con la pareja.
export default function PeriodPicker({
  periods,
  value,
  activeId,
}: {
  periods: Option[]; // del más reciente al más antiguo
  value: string | null;
  activeId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!periods.length) {
    return (
      <Link href="/periods" className="range-preset active">
        Crear un periodo
      </Link>
    );
  }

  const index = Math.max(
    0,
    periods.findIndex((p) => p.id === value)
  );
  const go = (id: string) =>
    startTransition(() => router.push(id === activeId ? "/dashboard" : `/dashboard?period=${id}`));
  const older = periods[index + 1];
  const newer = periods[index - 1];

  return (
    <div className={`period-picker${pending ? " pending" : ""}`}>
      <button
        type="button"
        className="period-step"
        aria-label="Periodo anterior"
        disabled={!older || pending}
        onClick={() => older && go(older.id)}
      >
        <ChevronLeft size={16} />
      </button>
      <select
        className="period-select"
        aria-label="Periodo"
        value={periods[index].id}
        disabled={pending}
        onChange={(e) => go(e.target.value)}
      >
        {periods.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.id === activeId ? " · activo" : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="period-step"
        aria-label="Periodo siguiente"
        disabled={!newer || pending}
        onClick={() => newer && go(newer.id)}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
