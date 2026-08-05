"use client";

import { changelog } from "@/lib/changelog";
import { Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "ourmoney_last_seen_changelog";

const latestVersion = changelog.reduce((max, entry) => (entry.version > max ? entry.version : max), "");

export default function WhatsNewModal() {
  const [pending, setPending] = useState<typeof changelog>([]);

  useEffect(() => {
    if (changelog.length === 0) return;
    const lastSeen = localStorage.getItem(STORAGE_KEY) ?? "";
    if (lastSeen === latestVersion) return;
    const unseen = [...changelog].filter((entry) => entry.version > lastSeen).sort((a, b) => a.version.localeCompare(b.version));
    if (unseen.length > 0) setPending(unseen);
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, latestVersion);
    setPending([]);
  }

  if (pending.length === 0) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal whatsnew-modal">
        <div className="modal-head">
          <h2><Sparkles size={19} className="whatsnew-icon" /> Novedades</h2>
          <button type="button" className="btn btn-ghost" onClick={dismiss} aria-label="Cerrar"><X /></button>
        </div>
        <div className="whatsnew-body">
          {pending.map((entry) => (
            <div key={entry.version} className="whatsnew-entry">
              <span className="whatsnew-date">{entry.date}</span>
              <ul>
                {entry.items.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 20 }}>
          <button type="button" className="btn btn-primary" onClick={dismiss}>Entendido</button>
        </div>
      </div>
    </div>
  );
}
