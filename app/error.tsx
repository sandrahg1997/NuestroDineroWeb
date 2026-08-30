"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
	useEffect(() => {
		console.error(error);
		fetch("/api/log", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ scope: "error.tsx", message: error.message, stack: error.stack, digest: error.digest, url: location.href }),
		}).catch(() => {});
	}, [error]);

	return (
		<div className="login-wrap">
			<div className="login-card" style={{ textAlign: "center" }}>
				<div className="brand" style={{ justifyContent: "center" }}>
					<span className="brandmark" style={{ background: "var(--expense)" }}><TriangleAlert size={20} /></span>
				</div>
				<h1>Algo ha ido mal</h1>
				<p className="subtitle">
					Ha ocurrido un error inesperado. Puedes intentarlo de nuevo; si sigue pasando, vuelve más tarde.
				</p>
				<button className="btn btn-primary" style={{ width: "100%", marginTop: 18 }} onClick={() => reset()}>
					Reintentar
				</button>
				<a className="btn btn-ghost" style={{ width: "100%", marginTop: 8, justifyContent: "center" }} href="/dashboard">
					Ir a Inicio
				</a>
			</div>
		</div>
	);
}
