"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Mode = "system" | "light" | "dark";
const ORDER: Mode[] = ["system", "light", "dark"];
const LABEL: Record<Mode, string> = { system: "Tema del sistema", light: "Tema claro", dark: "Tema oscuro" };
const ICON: Record<Mode, typeof Monitor> = { system: Monitor, light: Sun, dark: Moon };

export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setMode(t === "dark" || t === "light" ? t : "system");
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    setMode(next);
    try {
      if (next === "system") {
        delete document.documentElement.dataset.theme;
        localStorage.removeItem("ourmoney-theme");
      } else {
        document.documentElement.dataset.theme = next;
        localStorage.setItem("ourmoney-theme", next);
      }
    } catch {
      // localStorage no disponible: el cambio sigue aplicándose en esta sesión
    }
  }

  const Icon = ICON[mode];
  return (
    <button type="button" className="privacy-toggle" onClick={cycle} aria-label={`Cambiar tema. Actual: ${LABEL[mode]}`}>
      <Icon size={19} />
      {LABEL[mode]}
    </button>
  );
}
