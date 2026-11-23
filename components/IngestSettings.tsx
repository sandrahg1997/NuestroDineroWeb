"use client";
import { useCallback, useEffect, useState } from "react";
import { Copy, CreditCard, LoaderCircle, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { generateToken, hashToken } from "@/lib/ingest";
import { useToast } from "./Toast";

type TokenRow = { id: string; label: string; last_used_at: string | null; created_at: string };

// Ajustes › Pagos con Apple Pay. El token en claro solo existe en este navegador
// hasta que se cierra el aviso: en la base de datos se guarda únicamente su hash.
export default function IngestSettings({ householdId, userId }: { householdId: string; userId: string }) {
  const { toast, confirm } = useToast();
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [label, setLabel] = useState("iPhone");
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState("/api/ingest");

  useEffect(() => setEndpoint(`${location.origin}/api/ingest`), []);

  const load = useCallback(async () => {
    const { data } = await createClient()
      .from("ingest_tokens")
      .select("id,label,last_used_at,created_at")
      .eq("user_id", userId)
      .eq("household_id", householdId)
      .order("created_at", { ascending: false });
    setTokens(data ?? []);
  }, [userId, householdId]);
  useEffect(() => {
    load().catch(() => setTokens([]));
  }, [load]);

  const copy = (text: string, done: string) =>
    navigator.clipboard.writeText(text).then(
      () => toast(done, "success"),
      () => toast("No se pudo copiar. Selecciónalo y cópialo a mano.", "error")
    );

  async function create() {
    setCreating(true);
    const token = generateToken();
    const { error } = await createClient()
      .from("ingest_tokens")
      .insert({
        user_id: userId,
        household_id: householdId,
        token_hash: await hashToken(token),
        label: label.trim() || "iPhone",
      });
    setCreating(false);
    if (error) return toast(error.message, "error");
    setFresh(token);
    await load();
  }

  async function revoke(row: TokenRow) {
    const ok = await confirm(`¿Revocar «${row.label}»? El atajo que lo use dejará de funcionar.`, {
      confirmLabel: "Revocar",
      danger: true,
    });
    if (!ok) return;
    const { error } = await createClient().from("ingest_tokens").delete().eq("id", row.id);
    if (error) return toast(error.message, "error");
    await load();
  }

  return (
    <div className="card">
      <h2>
        <CreditCard size={20} /> Pagos con Apple Pay
      </h2>
      <p className="subtitle">
        Cada pago con Apple Pay llega a <strong>Pendientes</strong> y lo confirmas con un toque. Se configura una vez en
        cada iPhone con la app Atajos.
      </p>

      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="ingest-label">Nombre del dispositivo</label>
        <div className="toolbar">
          <input
            id="ingest-label"
            className="input"
            value={label}
            maxLength={40}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button type="button" className="btn btn-soft" onClick={create} disabled={creating}>
            {creating ? <LoaderCircle size={16} className="spin" /> : null}
            Crear token
          </button>
        </div>
      </div>

      {fresh && (
        <div className="pending-warning" style={{ display: "block", marginTop: 14 }} role="alert">
          <strong>Copia el token ahora: no se volverá a mostrar.</strong>
          <div className="ocr-preview" style={{ marginTop: 8, wordBreak: "break-all" }}>
            {fresh}
          </div>
          <div className="toolbar" style={{ justifyContent: "flex-start", marginTop: 8 }}>
            <button type="button" className="btn btn-soft" onClick={() => copy(fresh, "Token copiado")}>
              <Copy size={15} /> Copiar token
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setFresh(null)}>
              Ya lo he copiado
            </button>
          </div>
        </div>
      )}

      {tokens && tokens.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "14px 0 0", display: "grid", gap: 8 }}>
          {tokens.map((t) => (
            <li key={t.id} className="toolbar" style={{ justifyContent: "space-between" }}>
              <span>
                <strong>{t.label}</strong>
                <span className="subtitle" style={{ display: "block", fontSize: 12 }}>
                  {t.last_used_at
                    ? `Último pago recibido: ${new Date(t.last_used_at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}`
                    : "Aún no ha recibido ningún pago"}
                </span>
              </span>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => revoke(t)}
                aria-label={`Revocar ${t.label}`}
              >
                <Trash2 size={15} /> Revocar
              </button>
            </li>
          ))}
        </ul>
      )}

      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: "pointer", fontWeight: 650 }}>Cómo crear el atajo en el iPhone</summary>
        <ol style={{ lineHeight: 1.6, paddingLeft: 20 }}>
          <li>Crea un token aquí arriba y cópialo. Cada persona crea el suyo, en su propio iPhone.</li>
          <li>
            Abre <strong>Atajos › Automatización › Nueva automatización › Transacción</strong>.
          </li>
          <li>
            Elige la tarjeta (o todas) y marca <strong>Ejecutar inmediatamente</strong>.
          </li>
          <li>
            Añade la acción <strong>Obtener contenido de URL</strong> con esta dirección:
            <div className="toolbar" style={{ justifyContent: "flex-start", margin: "6px 0" }}>
              <code style={{ wordBreak: "break-all" }}>{endpoint}</code>
              <button type="button" className="btn btn-soft" onClick={() => copy(endpoint, "Dirección copiada")}>
                <Copy size={15} /> Copiar
              </button>
            </div>
          </li>
          <li>
            Pulsa <strong>Mostrar más</strong> y pon Método <strong>POST</strong>. En <strong>Cabeceras</strong> añade{" "}
            <code>Authorization</code> con el valor <code>Bearer </code> seguido de tu token (con un espacio).
          </li>
          <li>
            En <strong>Cuerpo de la solicitud</strong> elige <strong>JSON</strong> y añade estos campos de texto,
            tocando cada valor y eligiendo la variable del paso «Transacción»:
            <ul style={{ margin: "4px 0" }}>
              <li>
                <code>merchant</code> → Comerciante
              </li>
              <li>
                <code>amount</code> → Cantidad
              </li>
              <li>
                <code>card</code> → Tarjeta o pase
              </li>
              <li>
                <code>date</code> → Fecha actual
              </li>
            </ul>
          </li>
          <li>Haz un pago pequeño con Apple Pay: en unos segundos debería aparecer en Pendientes.</li>
        </ol>
        <p className="subtitle">
          Si no llega nada, abre el atajo y mira el resultado: un <code>401</code> es que el token está mal copiado o
          revocado, y un <code>422</code> que el importe no se ha enviado.
        </p>
      </details>
    </div>
  );
}
