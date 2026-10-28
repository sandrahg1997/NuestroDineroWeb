"use client";

import { useEffect, useState } from "react";

export type ChartTheme = {
  axis: string;
  grid: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
};

const LIGHT: ChartTheme = {
  axis: "#8a8090",
  grid: "#ebe5e8",
  tooltipBg: "#ffffff",
  tooltipBorder: "#ebe5e8",
  tooltipText: "#241a2b",
};
const DARK: ChartTheme = {
  axis: "#a99cb3",
  grid: "#33263d",
  tooltipBg: "#1f1527",
  tooltipBorder: "#33263d",
  tooltipText: "#f3eef5",
};

// Colores de ejes y tooltip para recharts, sincronizados con el tema activo
// (data-theme en <html> o prefers-color-scheme cuando el modo es "system").
export function useChartTheme(): ChartTheme {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const check = () => {
      const attr = document.documentElement.dataset.theme;
      setDark(attr === "dark" || (attr !== "light" && mq.matches));
    };
    check();
    mq.addEventListener("change", check);
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", check);
      observer.disconnect();
    };
  }, []);

  return dark ? DARK : LIGHT;
}
