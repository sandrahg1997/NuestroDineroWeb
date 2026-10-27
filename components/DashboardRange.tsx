"use client";

import { useEffect, useRef, useState } from "react";
import SubmitButton from "./SubmitButton";
import { dateKey } from "@/lib/utils";

function monthRange(offset: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: dateKey(start), to: dateKey(end) };
}

function lastNDays(n: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1));
  return { from: dateKey(start), to: dateKey(now) };
}

const PRESETS = [
  { label: "Este mes", get: () => monthRange(0) },
  { label: "Mes pasado", get: () => monthRange(-1) },
  { label: "Últimos 30 días", get: () => lastNDays(30) },
];

export default function DashboardRange({
  action,
  from: initialFrom,
  to: initialTo,
}: {
  action: (formData: FormData) => void;
  from: string;
  to: string;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [pending, setPending] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setFrom(initialFrom);
    setTo(initialTo);
  }, [initialFrom, initialTo]);

  // Al pulsar un atajo, aplicamos el rango en cuanto los inputs tienen el valor nuevo.
  useEffect(() => {
    if (!pending) return;
    setPending(false);
    formRef.current?.requestSubmit();
  }, [pending]);

  const activeLabel = PRESETS.find((p) => {
    const r = p.get();
    return r.from === from && r.to === to;
  })?.label;
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });

  return (
    <form ref={formRef} action={action} className="dashboard-range-form">
      <div className="range-presets">
        {PRESETS.map((p) => (
          <button
            type="button"
            key={p.label}
            className={`range-preset ${activeLabel === p.label ? "active" : ""}`}
            onClick={() => {
              const r = p.get();
              setFrom(r.from);
              setTo(r.to);
              setCustomOpen(false);
              setPending(true);
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className={`range-preset ${!activeLabel ? "active" : ""}`}
          aria-expanded={customOpen}
          onClick={() => setCustomOpen((o) => !o)}
        >
          {activeLabel ? "Fechas…" : `${fmt(from)} – ${fmt(to)}`}
        </button>
      </div>
      {/* Las fechas viajan siempre en el formulario; solo se muestran al abrir "Fechas…". */}
      <div className="range-custom" hidden={!customOpen}>
        <label>
          Desde
          <input name="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Hasta
          <input name="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <SubmitButton className="btn btn-soft" pendingText="Aplicando…">
          Aplicar
        </SubmitButton>
      </div>
    </form>
  );
}
