import { LoaderCircle } from "lucide-react";

export default function PageLoading() {
  return (
    <div className="page-loading">
      <LoaderCircle className="spin" />
      <span>Cargando…</span>
    </div>
  );
}
