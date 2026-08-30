"use client";

import { forwardRef } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
};

// Campo de importe: muestra el símbolo € y, al salir del campo, normaliza a
// dos decimales con coma (12.5 → "12,50"). Deja el texto intacto si no es válido.
const MoneyInput = forwardRef<HTMLInputElement, Props>(function MoneyInput(
  { value, onChange, required, placeholder, autoFocus },
  ref,
) {
  return (
    <span className="money-input">
      <span aria-hidden="true">€</span>
      <input
        ref={ref}
        className="input"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          if (!raw) return;
          const n = Number(raw.replace(",", "."));
          if (Number.isFinite(n)) onChange(n.toFixed(2).replace(".", ","));
        }}
      />
    </span>
  );
});

export default MoneyInput;
