"use client";

import { useRef, useState, type ReactNode } from "react";

// Ancho de los botones que aparecen al deslizar la fila hacia la izquierda.
const ACTIONS_WIDTH = 148;

// Fila de la lista móvil que se desliza a la izquierda para mostrar acciones
// (Editar / Eliminar). Los botones solo son enfocables con la fila abierta; el
// menú ⋮ de la fila sigue ahí para quien no use gestos (teclado, lector de pantalla).
export default function SwipeRow({
  open,
  onOpenChange,
  actions,
  children,
  disabled = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: ReactNode;
  children: ReactNode;
  disabled?: boolean;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const offset = drag ?? (open ? -ACTIONS_WIDTH : 0);

  function onTouchStart(e: React.TouchEvent) {
    if (disabled) return;
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, horizontal: null };
  }

  function onTouchMove(e: React.TouchEvent) {
    const s = start.current;
    if (!s) return;
    const dx = e.touches[0].clientX - s.x;
    const dy = e.touches[0].clientY - s.y;
    // Decidimos la dirección tras unos píxeles: si es vertical, dejamos hacer scroll.
    if (s.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.horizontal = Math.abs(dx) > Math.abs(dy);
    }
    if (!s.horizontal) return;
    const base = open ? -ACTIONS_WIDTH : 0;
    setDrag(Math.max(-ACTIONS_WIDTH, Math.min(0, base + dx)));
  }

  function onTouchEnd() {
    if (start.current?.horizontal && drag !== null) onOpenChange(drag < -ACTIONS_WIDTH / 2);
    start.current = null;
    setDrag(null);
  }

  return (
    <div className={`swipe-row${offset !== 0 ? " swiping" : ""}`}>
      <div className="swipe-actions" style={{ width: ACTIONS_WIDTH }} aria-hidden={!open} inert={!open}>
        {actions}
      </div>
      <div
        className="swipe-content"
        style={{
          transform: offset ? `translateX(${offset}px)` : undefined,
          transition: drag === null ? undefined : "none",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClickCapture={(e) => {
          // Con la fila abierta, un toque en ella la cierra en vez de activar nada.
          if (open) {
            e.stopPropagation();
            e.preventDefault();
            onOpenChange(false);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
