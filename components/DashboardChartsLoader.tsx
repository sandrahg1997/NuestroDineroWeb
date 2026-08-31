"use client";

import { useEffect, useState } from "react";
import type { FC } from "react";

type ByCategory = { name: string; value: number; categoryId?: string | null }[];
type ByDay = { day: string; expense: number; income: number }[];

const DashboardChartsLoader: FC<{ byCategory: ByCategory; byDay: ByDay; hideAmounts?: boolean; from?: string; to?: string }> = ({ byCategory, byDay, hideAmounts, from, to }) => {
  const [Comp, setComp] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    import("./DashboardCharts").then((mod) => {
      if (mounted) setComp(() => mod.default);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!Comp) return (
    <section className="dashboard-charts">
      <article className="card chart-card">
        <div className="empty">Cargando gráficos…</div>
      </article>
    </section>
  );

  const C = Comp;
  return <C byCategory={byCategory} byDay={byDay} hideAmounts={hideAmounts} from={from} to={to} />;
};

export default DashboardChartsLoader;
