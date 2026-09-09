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
  axis: "#8b8494",
  grid: "#e8e3ee",
  tooltipBg: "#ffffff",
  tooltipBorder: "#e8e3ee",
  tooltipText: "#24212b",
};
const DARK: ChartTheme = {
  axis: "#a89cb6",
  grid: "#332c44",
  tooltipBg: "#1e1929",
  tooltipBorder: "#332c44",
  tooltipText: "#f1edf7",
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
