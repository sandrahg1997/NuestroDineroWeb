// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SwipeRow from "@/components/transactions/SwipeRow";

afterEach(cleanup);

const touch = (x: number, y = 0) => ({ touches: [{ clientX: x, clientY: y }] });

function setup(open = false) {
  const onOpenChange = vi.fn();
  render(
    <SwipeRow open={open} onOpenChange={onOpenChange} actions={<button type="button">Eliminar</button>}>
      <span>Mercadona</span>
    </SwipeRow>
  );
  return { onOpenChange, content: screen.getByText("Mercadona").parentElement! };
}

describe("SwipeRow", () => {
  it("deslizar a la izquierda más de la mitad abre las acciones", () => {
    const { onOpenChange, content } = setup();
    fireEvent.touchStart(content, touch(300));
    fireEvent.touchMove(content, touch(200));
    fireEvent.touchEnd(content);
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("un deslizamiento corto vuelve a cerrar", () => {
    const { onOpenChange, content } = setup();
    fireEvent.touchStart(content, touch(300));
    fireEvent.touchMove(content, touch(260));
    fireEvent.touchEnd(content);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("un gesto vertical (hacer scroll) no abre nada", () => {
    const { onOpenChange, content } = setup();
    fireEvent.touchStart(content, touch(300, 0));
    fireEvent.touchMove(content, touch(290, 80));
    fireEvent.touchEnd(content);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("con la fila cerrada las acciones no se pueden enfocar", () => {
    setup(false);
    expect(screen.getByText("Eliminar").closest("[inert]")).not.toBeNull();
  });
});
