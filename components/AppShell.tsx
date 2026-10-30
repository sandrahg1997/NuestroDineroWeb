"use client";

import { createClient } from "@/lib/supabase/client";
import type { HouseholdOption } from "@/lib/data";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import {
  LayoutDashboard,
  ReceiptText,
  Tags,
  Repeat2,
  PiggyBank,
  ScanLine,
  CalendarRange,
  History,
  Settings,
  Plus,
  MoreHorizontal,
  Users,
  Eye,
  EyeOff,
  Handshake,
  LoaderCircle,
  Trophy,
} from "lucide-react";
import WhatsNewModal from "./WhatsNewModal";
import { useToast } from "./Toast";
import ThemeToggle from "./ThemeToggle";
import { useHouseholdRealtime } from "@/lib/useHouseholdRealtime";

const items = [
  ["/dashboard", LayoutDashboard, "Inicio"],
  ["/transactions", ReceiptText, "Movimientos"],
  ["/categories", Tags, "Categorías"],
  ["/scan", ScanLine, "Escanear"],
  ["/recurring", Repeat2, "Recurrentes"],
  ["/budgets", PiggyBank, "Presupuestos"],
  ["/periods", CalendarRange, "Periodos"],
  ["/historico", History, "Histórico"],
  ["/reunion", Handshake, "Reunión"],
  ["/retos", Trophy, "Retos"],
  ["/settings", Settings, "Ajustes"],
] as const;

// Distancia (ya amortiguada) que hay que tirar hacia abajo para recargar.
const PULL_THRESHOLD = 64;

function householdLabel(h: HouseholdOption) {
  if (h.member_count > 1) return h.partner_email ? `${h.name} · con ${h.partner_email.split("@")[0]}` : h.name;
  return h.name;
}

export default function AppShell({
  children,
  households = [],
  hideAmounts = false,
}: {
  children: ReactNode;
  households?: HouseholdOption[];
  hideAmounts?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);
  // El refresh no devuelve promesa; la transición sigue pendiente hasta que
  // llegan los datos del nuevo espacio.
  const [refreshing, startRefresh] = useTransition();
  const switching = saving || refreshing;
  const [hidden, setHidden] = useState(hideAmounts);
  const [savingHidden, setSavingHidden] = useState(false);
  const [pull, setPull] = useState(0);
  const [pullRefreshing, startPullRefresh] = useTransition();
  const [, startLiveRefresh] = useTransition();

  // Cambios de la otra persona (u otro dispositivo) en tiempo real: se vuelven a
  // pedir los datos de la página actual sin recargarla.
  const activeHouseholdId = households.find((h) => h.is_active)?.household_id ?? households[0]?.household_id ?? null;
  useHouseholdRealtime(activeHouseholdId, () => startLiveRefresh(() => router.refresh()));

  // Tirar hacia abajo desde arriba del todo para recargar (gesto habitual en móvil).
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let distance = 0;
    let tracking = false;
    const onStart = (e: TouchEvent) => {
      // Solo arriba del todo y sin un modal abierto encima.
      if (window.scrollY > 0 || document.querySelector(".modal-backdrop")) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      distance = 0;
      tracking = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      // Un gesto horizontal (p. ej. deslizar un movimiento) no es "tirar para recargar".
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) {
        tracking = false;
        setPull(0);
        return;
      }
      distance = Math.min(dy * 0.5, 90);
      setPull(distance);
    };
    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (distance >= PULL_THRESHOLD) startPullRefresh(() => router.refresh());
      setPull(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  const primary = items.slice(0, 4);
  const secondary = items.slice(4);
  const moreActive = secondary.some(([href]) => pathname.startsWith(href));

  const toggleMore = () => setMore((current) => !current);

  async function handleSwitch(e: React.ChangeEvent<HTMLSelectElement>) {
    const householdId = e.target.value;
    setSaving(true);
    const s = createClient();
    const { error } = await s.rpc("set_active_household", { p_household_id: householdId });
    setSaving(false);
    if (error) {
      toast(error.message, "error");
      return;
    }
    startRefresh(() => router.refresh());
  }

  async function toggleHideAmounts() {
    if (savingHidden) return;
    const next = !hidden;
    setHidden(next);
    setSavingHidden(true);
    const s = createClient();
    const { error } = await s.rpc("set_hide_amounts", { p_hidden: next });
    if (error) {
      setHidden(!next);
      toast(error.message, "error");
    }
    setSavingHidden(false);
  }

  const privacyLabel = hidden ? "Mostrar importes" : "Ocultar importes";
  const privacyButton = (
    <button
      type="button"
      className={`privacy-toggle ${hidden ? "active" : ""}`}
      onClick={toggleHideAmounts}
      disabled={savingHidden}
      aria-pressed={hidden}
      aria-busy={savingHidden}
    >
      {hidden ? <EyeOff size={19} /> : <Eye size={19} />}
      {privacyLabel}
    </button>
  );

  return (
    <div className={`shell ${hidden ? "hide-amounts" : ""}`}>
      <WhatsNewModal />
      {(pull > 0 || pullRefreshing) && (
        <div
          className="pull-indicator"
          role="status"
          aria-label={pullRefreshing ? "Actualizando…" : "Suelta para actualizar"}
          style={{ transform: `translate(-50%, ${pullRefreshing ? PULL_THRESHOLD : pull}px)` }}
        >
          <LoaderCircle
            size={20}
            className={pullRefreshing ? "spin" : undefined}
            style={pullRefreshing ? undefined : { transform: `rotate(${pull * 4}deg)`, opacity: pull / PULL_THRESHOLD }}
          />
        </div>
      )}
      <aside className="sidebar">
        <div className="brand">
          <span className="brandmark">
            <img src="/icon-192.png" alt="OurMoney logo" />
          </span>
          <span className="brand-text">OurMoney</span>
        </div>

        <nav className="nav">
          {items.map(([href, Icon, label]) => (
            <Link className={pathname.startsWith(href) ? "active" : ""} href={href} key={href}>
              <Icon size={19} />
              {label}
            </Link>
          ))}
        </nav>

        {privacyButton}
        <ThemeToggle />
      </aside>

      <main className="main">
        {households.length > 1 && (
          <div className={`household-switcher ${switching ? "is-switching" : ""}`}>
            <span className="household-switcher-icon">
              <Users size={13} />
            </span>
            <select
              value={households.find((h) => h.is_active)?.household_id ?? households[0]?.household_id}
              onChange={handleSwitch}
              disabled={switching}
              aria-label="Cambiar de espacio"
            >
              {households.map((h) => (
                <option key={h.household_id} value={h.household_id}>
                  {householdLabel(h)}
                </option>
              ))}
            </select>
          </div>
        )}
        {children}
      </main>

      <nav className="mobile-nav">
        {primary.map(([href, Icon, label]) => (
          <Link
            className={pathname.startsWith(href) ? "active" : ""}
            href={href}
            key={href}
            aria-current={pathname.startsWith(href) ? "page" : undefined}
          >
            <Icon size={20} />
            {label}
          </Link>
        ))}

        <button
          type="button"
          className={`mobile-more ${moreActive ? "active" : ""}`}
          onClick={toggleMore}
          aria-expanded={more}
          aria-controls="mobile-more-menu"
        >
          <MoreHorizontal size={20} /> Más
        </button>
      </nav>

      {more && (
        <>
          <div className="mobile-more-backdrop" onClick={() => setMore(false)} />
          <div id="mobile-more-menu" className="mobile-more-popup" role="menu">
            {privacyButton}
            <ThemeToggle />
            {secondary.map(([href, Icon, label]) => (
              <Link
                href={href}
                key={href}
                onClick={() => setMore(false)}
                className={pathname.startsWith(href) ? "active" : ""}
              >
                <Icon size={18} />
                {label}
              </Link>
            ))}
          </div>
        </>
      )}

      {!pathname.startsWith("/transactions") && (
        <Link
          href={pathname.startsWith("/recurring") ? "/recurring?new=1" : "/transactions?new=expense"}
          className="fab"
          aria-label={pathname.startsWith("/recurring") ? "Nuevo recurrente" : "Añadir gasto"}
        >
          <Plus />
        </Link>
      )}
    </div>
  );
}
