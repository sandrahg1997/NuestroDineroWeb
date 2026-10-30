"use client";

import dynamic from "next/dynamic";
import type { FC } from "react";
import ChartSkeleton from "./ChartSkeleton";

type ByCategory = { name: string; value: number; categoryId?: string | null }[];
type ByDay = { day: string; expense: number; income: number }[];

const DashboardCharts = dynamic(() => import("./DashboardCharts"), {
  ssr: false,
  loading: () => (
    <section className="dashboard-charts">
      <ChartSkeleton variant="donut" />
      <ChartSkeleton />
    </section>
  ),
});

const DashboardChartsLoader: FC<{
  byCategory: ByCategory;
  byDay: ByDay;
  hideAmounts?: boolean;
  from?: string;
  to?: string;
}> = (props) => <DashboardCharts {...props} />;

export default DashboardChartsLoader;
