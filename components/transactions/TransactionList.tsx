"use client";

import { useEffect, useMemo, useState } from "react";
import { Inbox, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import Money from "@/components/Money";
import type { Transaction } from "@/lib/types";
import SwipeRow from "./SwipeRow";

// Movimiento recién creado que aún no ha confirmado el servidor.
export const isTemp = (r: Transaction) => r.id.startsWith("temp-");

function dateLabel(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  const safe = value.length >= 10 ? value.slice(0, 10) : value;
  return new Date(`${safe}T12:00:00`).toLocaleDateString("es-ES");
}

function dayLabel(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  const safe = value.length >= 10 ? value.slice(0, 10) : value;
  const d = new Date(`${safe}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Hoy";
  if (d.toDateString() === yesterday.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}

export default function TransactionList({
  shown,
  total,
  expense,
  income,
  hasMore,
  onMore,
  isFiltering,
  isDateSort,
  onEdit,
  onRemove,
  onClearFilters,
  onAdd,
}: {
  shown: Transaction[];
  total: number;
  expense: number;
  income: number;
  hasMore: boolean;
  onMore: () => void;
  isFiltering: boolean;
  isDateSort: boolean;
  onEdit: (r: Transaction) => void;
  onRemove: (r: Transaction) => void;
  onClearFilters: () => void;
  onAdd: () => void;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuOpenUp, setMenuOpenUp] = useState(false);
  const [swipedId, setSwipedId] = useState<string | null>(null);

  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuFor]);

  const mobileGroups = useMemo(() => {
    if (!isDateSort) return [{ label: null as string | null, items: shown }];
    const groups: { label: string; items: Transaction[] }[] = [];
    for (const r of shown) {
      const label = dayLabel(r.date);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(r);
      else groups.push({ label, items: [r] });
    }
    return groups;
  }, [shown, isDateSort]);

  if (!total) {
    return (
      <div className="card table-wrap">
        <div className="empty">
          <span className="empty-icon">
            <Inbox size={22} />
          </span>
          {isFiltering ? (
            <>
              <strong>Sin resultados</strong>
              <p>Ningún movimiento coincide con los filtros aplicados.</p>
              <button type="button" className="btn btn-soft" onClick={onClearFilters}>
                Limpiar filtros
              </button>
            </>
          ) : (
            <>
              <strong>Aún no hay movimientos</strong>
              <p>Añade tu primer gasto o ingreso para empezar a ver tus finanzas.</p>
              <button type="button" className="btn btn-primary" onClick={onAdd}>
                <Plus size={16} />
                Añadir movimiento
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Concepto</th>
            <th>Categoría</th>
            <th>Tipo</th>
            <th>Importe</th>
            <th>
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id} className={isTemp(r) ? "row-saving" : undefined} aria-busy={isTemp(r) || undefined}>
              <td>{dateLabel(r.date)}</td>
              <td>
                <strong>{r.concept}</strong>
                {r.merchant && <div className="subtitle">{r.merchant}</div>}
              </td>
              <td>
                <span className="pill">
                  {r.category?.icon} {r.category?.name ?? "Sin categoría"}
                </span>
              </td>
              <td className={r.type === "expense" ? "expense" : "income"}>
                {r.type === "expense" ? "Gasto" : "Ingreso"}
              </td>
              <td>
                <Money value={r.amount} />
              </td>
              <td>
                <div className="chip-row" style={{ justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    aria-label={`Editar ${r.concept}`}
                    onClick={() => onEdit(r)}
                    disabled={isTemp(r)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost expense"
                    aria-label={`Eliminar ${r.concept}`}
                    onClick={() => onRemove(r)}
                    disabled={isTemp(r)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>
              {total} movimiento{total === 1 ? "" : "s"}
              {hasMore ? ` · mostrando ${shown.length}` : ""}
            </td>
            <td colSpan={3} style={{ textAlign: "right" }}>
              {expense > 0 && (
                <span className="expense">
                  −<Money value={expense} />
                </span>
              )}
              {income > 0 && (
                <span className="income" style={{ marginLeft: 12 }}>
                  +<Money value={income} />
                </span>
              )}
            </td>
          </tr>
        </tfoot>
      </table>

      <div className="mobile-list">
        {mobileGroups.map((g, gi) => (
          <div className="mobile-group" key={g.label ?? gi}>
            {g.label && <div className="mobile-group-label">{g.label}</div>}
            {g.items.map((r) => (
              <SwipeRow
                key={r.id}
                open={swipedId === r.id}
                onOpenChange={(open) => setSwipedId(open ? r.id : null)}
                disabled={isTemp(r)}
                actions={
                  <>
                    <button
                      type="button"
                      className="swipe-action edit"
                      onClick={() => {
                        setSwipedId(null);
                        onEdit(r);
                      }}
                    >
                      <Pencil size={17} />
                      Editar
                    </button>
                    <button
                      type="button"
                      className="swipe-action delete"
                      onClick={() => {
                        setSwipedId(null);
                        onRemove(r);
                      }}
                    >
                      <Trash2 size={17} />
                      Eliminar
                    </button>
                  </>
                }
              >
                <div className={`mobile-row${isTemp(r) ? " row-saving" : ""}`} aria-busy={isTemp(r) || undefined}>
                  <div className={`recent-icon ${r.type === "expense" ? "expense" : "income"}`} aria-hidden="true">
                    {r.category?.icon || (r.type === "expense" ? "↓" : "↑")}
                  </div>
                  <div className="left">
                    <strong>{r.concept}</strong>
                    <span className="meta">
                      {!g.label ? `${dateLabel(r.date)} · ` : ""}
                      {r.category?.name ?? "Sin categoría"}
                      {r.merchant ? ` · ${r.merchant}` : ""}
                    </span>
                  </div>
                  <div className="right">
                    <span className={`amount ${r.type === "expense" ? "expense" : "income"}`}>
                      {r.type === "expense" ? "-" : "+"}
                      <Money value={Math.abs(r.amount)} />
                    </span>
                    <div className="row-menu" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        aria-label={`Más opciones de ${r.concept}`}
                        aria-haspopup="menu"
                        aria-expanded={menuFor === r.id}
                        disabled={isTemp(r)}
                        onClick={(e) => {
                          if (menuFor === r.id) {
                            setMenuFor(null);
                            return;
                          }
                          const rect = e.currentTarget.getBoundingClientRect();
                          setMenuOpenUp(window.innerHeight - rect.bottom < 180);
                          setSwipedId(null);
                          setMenuFor(r.id);
                        }}
                      >
                        <MoreVertical size={18} />
                      </button>
                      {menuFor === r.id && (
                        <div className={`row-menu-popup ${menuOpenUp ? "open-up" : ""}`} role="menu">
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              onEdit(r);
                              setMenuFor(null);
                            }}
                          >
                            <Pencil size={15} />
                            Editar
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="expense"
                            onClick={() => {
                              setMenuFor(null);
                              onRemove(r);
                            }}
                          >
                            <Trash2 size={15} />
                            Eliminar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </SwipeRow>
            ))}
          </div>
        ))}
      </div>

      {hasMore && (
        <div style={{ textAlign: "center", padding: "16px 0 6px" }}>
          <button type="button" className="btn btn-soft" onClick={onMore}>
            Ver más · {total - shown.length} restantes
          </button>
        </div>
      )}
    </div>
  );
}
