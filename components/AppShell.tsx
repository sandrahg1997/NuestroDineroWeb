"use client";

import { createClient } from "@/lib/supabase/client";
import type { HouseholdOption } from "@/lib/data";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { LayoutDashboard, ReceiptText, Tags, Repeat2, PiggyBank, ScanLine, CalendarRange, Settings, Plus, MoreHorizontal, Users, Eye, EyeOff } from "lucide-react";
import WhatsNewModal from "./WhatsNewModal";

const items = [
  ["/dashboard", LayoutDashboard, "Inicio"],
  ["/transactions", ReceiptText, "Movimientos"],
  ["/categories", Tags, "Categorías"],
  // ["/scan", ScanLine, "Escanear"],
  ["/recurring", Repeat2, "Recurrentes"],
  ["/budgets", PiggyBank, "Presupuestos"],
  ["/periods", CalendarRange, "Periodos"],
  ["/settings", Settings, "Ajustes"]
] as const;

function householdLabel(h: HouseholdOption) {
  if (h.member_count > 1) return h.partner_email ? `Compartido con ${h.partner_email.split("@")[0]}` : "Compartido";
  return "Personal";
}

export default function AppShell({ children, households = [], hideAmounts = false }: { children: ReactNode; households?: HouseholdOption[]; hideAmounts?: boolean }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [hidden, setHidden] = useState(hideAmounts);

  const primary = items.slice(0, 4);
  const secondary = items.slice(4);
  const moreActive = secondary.some(([href]) => pathname.startsWith(href));

  const toggleMore = () => setMore((current) => !current);

  async function handleSwitch(e: React.ChangeEvent<HTMLSelectElement>) {
    const householdId = e.target.value;
    setSwitching(true);
    const s = createClient();
    const { error } = await s.rpc("set_active_household", { p_household_id: householdId });
    if (error) {
      alert(error.message);
      setSwitching(false);
      return;
    }
    window.location.reload();
  }

  async function toggleHideAmounts() {
    const next = !hidden;
    setHidden(next);
    const s = createClient();
    const { error } = await s.rpc("set_hide_amounts", { p_hidden: next });
    if (error) {
      setHidden(!next);
      alert(error.message);
    }
  }

  const privacyLabel = hidden ? "Mostrar importes" : "Ocultar importes";
  const privacyButton = (
    <button type="button" className={`privacy-toggle ${hidden ? "active" : ""}`} onClick={toggleHideAmounts} aria-pressed={hidden}>
      {hidden ? <EyeOff size={19} /> : <Eye size={19} />}
      {privacyLabel}
    </button>
  );

  return (
    <div className={`shell ${hidden ? "hide-amounts" : ""}`}>
      <WhatsNewModal />
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
      </aside>

      <main className="main">
        {households.length > 1 && (
          <div className={`household-switcher ${switching ? "is-switching" : ""}`}>
            <span className="household-switcher-icon"><Users size={13} /></span>
            <select
              value={households.find((h) => h.is_active)?.household_id ?? households[0]?.household_id}
              onChange={handleSwitch}
              disabled={switching}
              aria-label="Cambiar de espacio"
            >
              {households.map((h) => (
                <option key={h.household_id} value={h.household_id}>{householdLabel(h)}</option>
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
            {secondary.map(([href, Icon, label]) => (
              <Link href={href} key={href} onClick={() => setMore(false)} className={pathname.startsWith(href) ? "active" : ""}>
                <Icon size={18} />
                {label}
              </Link>
            ))}
          </div>
        </>
      )}

      {!pathname.startsWith("/transactions") && (
        <Link href="/transactions?new=expense" className="fab" aria-label="Añadir gasto">
          <Plus />
        </Link>
      )}
    </div>
  );
}
