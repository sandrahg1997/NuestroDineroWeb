"use client";

import { useEffect, useState } from "react";
import type { FC } from "react";
import type { Category } from "@/lib/types";

type Row = { date: string; amount: number; type: "expense" | "income"; category_id: string | null };

const HistoricoChartsLoader: FC<{ transactions: Row[]; categories: Category[]; hideAmounts?: boolean }> = ({ transactions, categories, hideAmounts }) => {
  const [Comp, setComp] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    import("./HistoricoCharts").then((mod) => {
      if (mounted) setComp(() => mod.default);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!Comp) return (
    <article className="card chart-card">
      <div className="empty">Cargando gráficos…</div>
    </article>
  );

  const C = Comp;
  return <C transactions={transactions} categories={categories} hideAmounts={hideAmounts} />;
};

export default HistoricoChartsLoader;
