"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CreditCard, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Category, TransactionType } from "@/lib/types";
import { suggestCategoryId } from "@/lib/receipt";
import { notifyPartnerActivity } from "@/lib/utils";
import { useToast } from "./Toast";
import MoneyInput from "./MoneyInput";

export type PendingRow = {
  id: string;
  user_id: string | null;
  merchant: string;
  amount: number;
  type: TransactionType;
  date: string;
  card: string;
  possible_duplicate: boolean;
  created_at: string;
};
type Rule = { merchant_pattern: string; category_id: string };

const fmtAmount = (n: number) => n.toFixed(2).replace(".", ",");

function PendingItem({
  row,
  householdId,
  categories,
  rules,
  busy,
  onConfirm,
  onDiscard,
}: {
  row: PendingRow;
  householdId: string;
  categories: Category[];
  rules: Rule[];
  busy: boolean;
  onConfirm: (
    row: PendingRow,
    v: { merchant: string; amount: number; date: string; categoryId: string },
    householdId: string
  ) => void;
  onDiscard: (row: PendingRow) => void;
}) {
  const [merchant, setMerchant] = useState(row.merchant);
  const [amount, setAmount] = useState(fmtAmount(Number(row.amount)));
  const [date, setDate] = useState(row.date);
  const [categoryId, setCategoryId] = useState(() => suggestCategoryId(row.merchant, categories, rules, row.type));
  const id = `pending-${row.id}`;
  const parsed = Number(amount.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed > 0;
  const list = categories.filter((c) => c.type === row.type);

  return (
    <div className="card pending-card">
      <div className="pending-head">
        <span className={`recent-icon ${row.type === "expense" ? "expense" : "income"}`}>
          <CreditCard size={19} />
        </span>
        <div className="recent-main">
          <strong>{row.type === "expense" ? "Gasto con Apple Pay" : "Devolución"}</strong>
          <span>
            {row.card ? `${row.card} · ` : ""}recibido{" "}
            {new Date(row.created_at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}
          </span>
        </div>
      </div>
      {row.possible_duplicate && (
        <p className="pending-warning" role="note">
          <TriangleAlert size={15} /> Ya hay un movimiento con este importe ese día. Puede que ya lo hayas apuntado: si
          es así, descártalo.
        </p>
      )}
      <div className="form-grid" style={{ marginTop: 12 }}>
        <div className="field">
          <label htmlFor={`${id}-merchant`}>Comercio</label>
          <input
            id={`${id}-merchant`}
            className="input"
            value={merchant}
            onChange={(e) => {
              setMerchant(e.target.value);
              // Mientras no hayas elegido tú una categoría, se sigue ajustando al comercio.
              if (!categoryId) setCategoryId(suggestCategoryId(e.target.value, categories, rules, row.type));
            }}
            placeholder="Sin nombre"
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-amount`}>Importe</label>
          <MoneyInput id={`${id}-amount`} value={amount} onChange={setAmount} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-date`}>Fecha</label>
          <input
            id={`${id}-date`}
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-category`}>Categoría</label>
          <select
            id={`${id}-category`}
            className="select"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Sin categoría</option>
            {list.map((c) => (
              <option value={c.id} key={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="toolbar" style={{ marginTop: 14, justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" onClick={() => onDiscard(row)} disabled={busy}>
          <X size={16} /> Descartar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !valid || !date}
          onClick={() => onConfirm(row, { merchant: merchant.trim(), amount: parsed, date, categoryId }, householdId)}
        >
          {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />} Confirmar
        </button>
      </div>
    </div>
  );
}

export default function PendingManager({
  householdId,
  initial,
  categories,
  rules,
}: {
  householdId: string;
  initial: PendingRow[];
  categories: Category[];
  rules: Rule[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Datos nuevos del servidor (tiempo real o tirar para recargar): sustituyen a los locales.
  useEffect(() => setRows(initial), [initial]);

  async function confirm(
    row: PendingRow,
    v: { merchant: string; amount: number; date: string; categoryId: string },
    hid: string
  ) {
    setBusyId(row.id);
    const s = createClient();
    const { data: txId, error } = await s.rpc("confirm_pending_transaction", {
      p_id: row.id,
      p_concept: v.merchant,
      p_merchant: v.merchant,
      p_amount: v.amount,
      p_date: v.date,
      p_category_id: v.categoryId || null,
    });
    if (error) {
      toast(error.message, "error");
      setBusyId(null);
      // Si ya lo confirmó la otra persona, se refresca para que desaparezca.
      router.refresh();
      return;
    }
    if (txId) notifyPartnerActivity(txId);
    // Aprende la categoría elegida para este comercio, igual que el escáner de tickets.
    if (v.merchant && v.categoryId && row.type === "expense")
      await s
        .from("merchant_category_rules")
        .upsert(
          { household_id: hid, merchant_pattern: v.merchant.toLowerCase(), category_id: v.categoryId },
          { onConflict: "household_id,merchant_pattern" }
        );
    setRows((current) => current.filter((r) => r.id !== row.id));
    setBusyId(null);
    toast("Movimiento guardado", "success");
    router.refresh();
  }

  async function discard(row: PendingRow) {
    setBusyId(row.id);
    const { error } = await createClient().from("pending_transactions").delete().eq("id", row.id);
    setBusyId(null);
    if (error) return toast(error.message, "error");
    setRows((current) => current.filter((r) => r.id !== row.id));
    router.refresh();
  }

  if (!rows.length)
    return (
      <div className="card" style={{ textAlign: "center", padding: 32 }}>
        <CreditCard size={36} />
        <h2>No hay nada pendiente</h2>
        <p className="subtitle">
          Cuando pagues con Apple Pay, el gasto aparecerá aquí para confirmarlo. Si aún no lo has activado, configúralo
          en{" "}
          <a href="/settings" style={{ textDecoration: "underline" }}>
            Ajustes
          </a>
          .
        </p>
      </div>
    );

  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", alignItems: "start" }}>
      {rows.map((row) => (
        <PendingItem
          key={row.id}
          row={row}
          householdId={householdId}
          categories={categories}
          rules={rules}
          busy={busyId === row.id}
          onConfirm={confirm}
          onDiscard={discard}
        />
      ))}
    </div>
  );
}
