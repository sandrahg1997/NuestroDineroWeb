// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider, useToast } from "@/components/Toast";

afterEach(cleanup);

// Componente mínimo que expone el API del Toast con botones.
function Harness({ onUndo, onConfirm }: { onUndo?: () => void; onConfirm?: (ok: boolean) => void }) {
  const { toast, confirm } = useToast();
  return (
    <>
      <button
        type="button"
        onClick={() => toast("Movimiento eliminado", "info", { action: { label: "Deshacer", onClick: onUndo! } })}
      >
        borrar
      </button>
      <button type="button" onClick={() => toast("Algo falló", "error")}>
        fallar
      </button>
      <button type="button" onClick={async () => onConfirm?.(await confirm("¿Seguro?"))}>
        preguntar
      </button>
    </>
  );
}

describe("Toast", () => {
  it("la acción del aviso llama a su función y cierra el aviso", () => {
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <Harness onUndo={onUndo} />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("borrar"));
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(onUndo).toHaveBeenCalledOnce();
    expect(screen.queryByText("Movimiento eliminado")).toBeNull();
  });

  it("los avisos con acción se cierran solos pasado el plazo", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Harness onUndo={() => {}} />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("borrar"));
    expect(screen.getByText("Movimiento eliminado")).toBeTruthy();
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByText("Movimiento eliminado")).toBeNull();
    vi.useRealTimers();
  });

  it("los errores se anuncian como alerta", () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("fallar"));
    expect(screen.getByRole("alert").textContent).toContain("Algo falló");
  });

  it("Escape cancela el diálogo y el foco vuelve al botón que lo abrió", async () => {
    const onConfirm = vi.fn();
    render(
      <ToastProvider>
        <Harness onConfirm={onConfirm} />
      </ToastProvider>
    );
    const trigger = screen.getByText("preguntar");
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(onConfirm).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
