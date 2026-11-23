"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, CreditCard, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Category, TransactionType } from "@/lib/types";
import { aliasKey } from "@/lib/merchant";
import { suggestCategoryId } from "@/lib/receipt";
import { notifyPartnerActivity } from "@/lib/utils";
import { useToast } from "./Toast";
import MoneyInput from "./MoneyInput";
import SwipeRow from "./transactions/SwipeRow";

export type PendingRow = {
  id: string;
  user_id: string | null;
  merchant: string;
  amount: number;
  type: TransactionType;
  date: string;
  card: string;
  // Nombre tal y como lo mandó Apple Pay (vacío si la migración de nombres no está aplicada).
  raw_merchant?: string;
  possible_duplicate: boolean;
  created_at: string;
};
export type FailureRow = { id: string; reason: string; raw: string; created_at: string };
type Rule = { merchant_pattern: string; category_id: string };
type Edit = { merchant: string; amount: string; date: string; categoryId: string; auto: boolean };

const fmtAmount = (n: number) => n.toFixed(2).replace(".", ",");
const when = (iso: string) => new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
const parseEdit = (e: Edit) => Number(e.amount.replace(",", "."));
const isValid = (e: Edit) => Number.isFinite(parseEdit(e)) && parseEdit(e) > 0 && Boolean(e.date);
// "Guardar siempre sin preguntar" solo tiene sentido con un comercio reconocible y categoría.
const canAuto = (row: PendingRow, e: Edit) =>
  row.type === "expense" && e.merchant.trim().length >= 3 && Boolean(e.categoryId);

function PendingItem({
  row,
  edit,
  payer,
  categories,
  busy,
  open,
  onOpenChange,
  onChange,
  onConfirm,
  onDiscard,
}: {
  row: PendingRow;
  edit: Edit;
  payer: string;
  categories: Category[];
  busy: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (patch: Partial<Edit>) => void;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const id = `pending-${row.id}`;
  const list = categories.filter((c) => c.type === row.type);
  const valid = isValid(edit);

  return (
    <div className="pending-swipe">
      <SwipeRow
        open={open}
        onOpenChange={onOpenChange}
        disabled={busy}
        actions={
          <>
            <button type="button" className="swipe-action confirm" onClick={onConfirm} disabled={!valid || busy}>
              <Check size={18} /> Confirmar
            </button>
            <button type="button" className="swipe-action delete" onClick={onDiscard} disabled={busy}>
              <X size={18} /> Descartar
            </button>
          </>
        }
      >
        <div className="card pending-card">
          <div className="pending-head">
            <span className={`recent-icon ${row.type === "expense" ? "expense" : "income"}`}>
              <CreditCard size={19} />
            </span>
            <div className="recent-main">
              <strong>{row.type === "expense" ? "Gasto con Apple Pay" : "Devolución"}</strong>
              <span>
                {payer} · {row.card ? `${row.card} · ` : ""}
                {when(row.created_at)}
              </span>
            </div>
          </div>
          {row.possible_duplicate && (
            <p className="pending-warning" role="note">
              <TriangleAlert size={15} /> Ya hay un movimiento parecido (mismo importe, esos días y mismo comercio).
              Puede que ya lo hayas apuntado: si es así, descártalo.
            </p>
          )}
          <div className="form-grid" style={{ marginTop: 12 }}>
            <div className="field">
              <label htmlFor={`${id}-merchant`}>Comercio</label>
              <input
                id={`${id}-merchant`}
                className="input"
                value={edit.merchant}
                onChange={(e) => onChange({ merchant: e.target.value })}
                placeholder="Sin nombre"
              />
            </div>
            <div className="field">
              <label htmlFor={`${id}-amount`}>Importe</label>
              <MoneyInput id={`${id}-amount`} value={edit.amount} onChange={(amount) => onChange({ amount })} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-date`}>Fecha</label>
              <input
                id={`${id}-date`}
                className="input"
                type="date"
                value={edit.date}
                onChange={(e) => onChange({ date: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor={`${id}-category`}>Categoría</label>
              <select
                id={`${id}-category`}
                className="select"
                value={edit.categoryId}
                onChange={(e) => onChange({ categoryId: e.target.value })}
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
          {canAuto(row, edit) && (
            <label className="pending-auto">
              <input type="checkbox" checked={edit.auto} onChange={(e) => onChange({ auto: e.target.checked })} />
              <span>Guardar siempre los pagos de «{edit.merchant.trim()}» sin preguntar (con esta categoría)</span>
            </label>
          )}
          <div className="toolbar" style={{ marginTop: 14, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost" onClick={onDiscard} disabled={busy}>
              <X size={16} /> Descartar
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || !valid} onClick={onConfirm}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />} Confirmar
            </button>
          </div>
        </div>
      </SwipeRow>
    </div>
  );
}

export default function PendingManager({
  householdId,
  userId,
  partnerName,
  initial,
  failures: initialFailures,
  categories,
  rules,
}: {
  householdId: string;
  userId: string;
  partnerName: string;
  initial: PendingRow[];
  failures: FailureRow[];
  categories: Category[];
  rules: Rule[];
}) {
  const { toast, confirm } = useToast();
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [failures, setFailures] = useState(initialFailures);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // Datos nuevos del servidor (tiempo real o tirar para recargar): sustituyen a los locales.
  useEffect(() => setRows(initial), [initial]);
  useEffect(() => setFailures(initialFailures), [initialFailures]);

  const defaultEdit = (row: PendingRow): Edit => ({
    merchant: row.merchant,
    amount: fmtAmount(Number(row.amount)),
    date: row.date,
    categoryId: suggestCategoryId(row.merchant, categories, rules, row.type),
    auto: false,
  });
  const editOf = (row: PendingRow) => edits[row.id] ?? defaultEdit(row);
  const change = (row: PendingRow, patch: Partial<Edit>) =>
    setEdits((current) => {
      const base = current[row.id] ?? defaultEdit(row);
      const next = { ...base, ...patch };
      // Mientras no hayas elegido tú una categoría, se sigue ajustando al comercio.
      if (patch.merchant !== undefined && !base.categoryId)
        next.categoryId = suggestCategoryId(patch.merchant, categories, rules, row.type);
      if (!canAuto(row, next)) next.auto = false;
      return { ...current, [row.id]: next };
    });
  const setBusy = (ids: string[], on: boolean) =>
    setBusyIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  // Los que ya traen categoría, un importe válido y no parecen repetidos.
  const ready = useMemo(
    () =>
      rows.filter((row) => {
        const e = edits[row.id] ?? {
          merchant: row.merchant,
          amount: fmtAmount(Number(row.amount)),
          date: row.date,
          categoryId: suggestCategoryId(row.merchant, categories, rules, row.type),
          auto: false,
        };
        return Boolean(e.categoryId) && isValid(e) && !row.possible_duplicate;
      }),
    [rows, edits, categories, rules]
  );

  // Confirma uno; devuelve si salió bien. No refresca ni avisa: lo hace quien llama.
  async function confirmRow(row: PendingRow, e: Edit): Promise<string | null> {
    const s = createClient();
    const merchant = e.merchant.trim();
    const { data: txId, error } = await s.rpc("confirm_pending_transaction", {
      p_id: row.id,
      p_concept: merchant,
      p_merchant: merchant,
      p_amount: parseEdit(e),
      p_date: e.date,
      p_category_id: e.categoryId || null,
    });
    if (error) return error.message;
    if (txId && row.user_id === userId) notifyPartnerActivity(txId);
    // Si le has cambiado el nombre al comercio, se recuerda para los próximos pagos.
    if (row.raw_merchant && merchant && merchant !== row.merchant) {
      const key = aliasKey(row.raw_merchant);
      if (key)
        await s
          .from("merchant_aliases")
          .upsert({ household_id: householdId, key, name: merchant }, { onConflict: "household_id,key" });
    }
    // Aprende la categoría elegida para este comercio, igual que el escáner de tickets.
    if (merchant && e.categoryId && row.type === "expense")
      await s.from("merchant_category_rules").upsert(
        {
          household_id: householdId,
          merchant_pattern: merchant.toLowerCase(),
          category_id: e.categoryId,
          // Solo se enciende; apagarlo se hace en Ajustes.
          ...(e.auto && canAuto(row, e) ? { auto_confirm: true } : {}),
        },
        { onConflict: "household_id,merchant_pattern" }
      );
    return null;
  }

  async function confirmOne(row: PendingRow) {
    setOpenId(null);
    setBusy([row.id], true);
    const message = await confirmRow(row, editOf(row));
    setBusy([row.id], false);
    if (message) {
      toast(message, "error");
      // Si ya lo confirmó la otra persona, se refresca para que desaparezca.
      router.refresh();
      return;
    }
    setRows((current) => current.filter((r) => r.id !== row.id));
    toast("Movimiento guardado", "success");
    router.refresh();
  }

  async function confirmAll() {
    const targets = ready;
    if (!targets.length) return;
    const ok = await confirm(
      `¿Confirmar ${targets.length} ${targets.length === 1 ? "pago" : "pagos"} con su categoría?`,
      { confirmLabel: "Confirmar todos" }
    );
    if (!ok) return;
    setBulk(true);
    setBusy(
      targets.map((r) => r.id),
      true
    );
    const done: string[] = [];
    let lastError = "";
    // En serie: son pocos y así cada fallo se atribuye al pago que lo causó.
    for (const row of targets) {
      const message = await confirmRow(row, editOf(row));
      if (message) lastError = message;
      else done.push(row.id);
    }
    setBusy(
      targets.map((r) => r.id),
      false
    );
    setBulk(false);
    setRows((current) => current.filter((r) => !done.includes(r.id)));
    if (done.length)
      toast(`${done.length} ${done.length === 1 ? "movimiento guardado" : "movimientos guardados"}`, "success");
    if (lastError) toast(`${targets.length - done.length} no se pudieron guardar: ${lastError}`, "error");
    router.refresh();
  }

  async function discard(row: PendingRow) {
    setOpenId(null);
    setBusy([row.id], true);
    const { error } = await createClient().from("pending_transactions").delete().eq("id", row.id);
    setBusy([row.id], false);
    if (error) return toast(error.message, "error");
    setRows((current) => current.filter((r) => r.id !== row.id));
    router.refresh();
  }

  async function dismissFailure(f: FailureRow) {
    const { error } = await createClient().from("ingest_failures").delete().eq("id", f.id);
    if (error) return toast(error.message, "error");
    setFailures((current) => current.filter((x) => x.id !== f.id));
    router.refresh();
  }

  const payerName = (row: PendingRow) => (row.user_id === userId ? "Tú" : partnerName);

  return (
    <>
      {failures.length > 0 && (
        <section className="card pending-failures" aria-label="Pagos que no se pudieron leer">
          <h2>
            <TriangleAlert size={19} />{" "}
            {failures.length === 1 ? "Un pago no se pudo leer" : `${failures.length} pagos no se pudieron leer`}
          </h2>
          <p className="subtitle">
            Llegaron desde el atajo pero sin un importe válido. Añádelos a mano para no perderlos.
          </p>
          <ul className="failure-list">
            {failures.map((f) => (
              <li key={f.id}>
                <div>
                  <strong>{f.reason || "No se pudo leer"}</strong>
                  <span className="subtitle" style={{ display: "block", fontSize: 12 }}>
                    {when(f.created_at)}
                  </span>
                  {f.raw && <code className="failure-raw">{f.raw}</code>}
                </div>
                <div className="toolbar" style={{ justifyContent: "flex-end" }}>
                  <Link href="/transactions?new=expense" className="btn btn-soft">
                    Añadir a mano
                  </Link>
                  <button type="button" className="btn btn-ghost" onClick={() => dismissFailure(f)}>
                    <X size={16} /> Descartar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!rows.length ? (
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <CreditCard size={36} />
          <h2>No hay nada pendiente</h2>
          <p className="subtitle">
            Cuando pagues con Apple Pay, el gasto aparecerá aquí para confirmarlo. Si aún no lo has activado,
            configúralo en{" "}
            <a href="/settings" style={{ textDecoration: "underline" }}>
              Ajustes
            </a>
            .
          </p>
        </div>
      ) : (
        <>
          {rows.length > 1 && (
            <div className="pending-bar">
              <span className="subtitle">
                {ready.length > 0
                  ? `${ready.length} de ${rows.length} listos para confirmar (con categoría y sin posible duplicado).`
                  : "Elige categoría para poder confirmarlos de golpe."}
              </span>
              <button type="button" className="btn btn-primary" onClick={confirmAll} disabled={!ready.length || bulk}>
                {bulk ? <LoaderCircle size={16} className="spin" /> : <CheckCheck size={16} />}
                Confirmar {ready.length > 0 ? ready.length : ""} listos
              </button>
            </div>
          )}
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", alignItems: "start" }}
          >
            {rows.map((row) => (
              <PendingItem
                key={row.id}
                row={row}
                edit={editOf(row)}
                payer={payerName(row)}
                categories={categories}
                busy={busyIds.has(row.id)}
                open={openId === row.id}
                onOpenChange={(o) => setOpenId(o ? row.id : null)}
                onChange={(patch) => change(row, patch)}
                onConfirm={() => confirmOne(row)}
                onDiscard={() => discard(row)}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
