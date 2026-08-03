"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { LayoutDashboard, ReceiptText, Tags, Repeat2, PiggyBank, ScanLine, Settings, Plus, MoreHorizontal } from "lucide-react";

const items = [
  ["/dashboard", LayoutDashboard, "Inicio"],
  ["/transactions", ReceiptText, "Movimientos"],
  ["/categories", Tags, "Categorías"],
  ["/scan", ScanLine, "Escanear"],
  ["/recurring", Repeat2, "Recurrentes"],
  ["/budgets", PiggyBank, "Presupuestos"],
  ["/settings", Settings, "Ajustes"]
] as const;

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);

  const primary = items.slice(0, 4);
  const secondary = items.slice(4);

  const toggleMore = () => setMore((current) => !current);

  return (
    <div className="shell">
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
      </aside>

      <main className="main">{children}</main>

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
          className="mobile-more"
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
