"use client";

import dynamic from "next/dynamic";
import type { FC } from "react";
import type { Category } from "@/lib/types";

type Row = { date: string; amount: number; type: "expense" | "income"; category_id: string | null };
type PeriodRow = { id: string; name: string; start_date: string; end_date: string };

const HistoricoCharts = dynamic(() => import("./HistoricoCharts"), {
  ssr: false,
  loading: () => (
    <article className="card chart-card">
      <div className="empty">Cargando gráficos…</div>
    </article>
  ),
});

const HistoricoChartsLoader: FC<{
  transactions: Row[];
  categories: Category[];
  periods: PeriodRow[];
  hideAmounts?: boolean;
}> = (props) => <HistoricoCharts {...props} />;

export default HistoricoChartsLoader;
