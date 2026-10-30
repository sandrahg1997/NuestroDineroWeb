"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LoaderCircle, LogOut } from "lucide-react";
import { useToast } from "./Toast";
export default function LogoutButton() {
  const [leaving, setLeaving] = useState(false);
  const { toast } = useToast();
  return (
    <button
      className="btn btn-soft"
      disabled={leaving}
      onClick={async () => {
        setLeaving(true);
        const { error } = await createClient()
          .auth.signOut()
          .catch(() => ({ error: { message: "Sin conexión. Inténtalo de nuevo." } }));
        if (error) {
          toast(error.message, "error");
          setLeaving(false);
          return;
        }
        location.href = "/login";
      }}
    >
      {leaving ? <LoaderCircle size={16} className="spin" /> : <LogOut size={16} />}
      {leaving ? "Saliendo…" : "Salir"}
    </button>
  );
}
