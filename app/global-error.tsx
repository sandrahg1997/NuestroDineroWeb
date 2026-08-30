"use client";

import "./globals.css";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
	useEffect(() => {
		console.error(error);
		fetch("/api/log", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ scope: "global-error.tsx", message: error.message, stack: error.stack, digest: error.digest, url: location.href }),
		}).catch(() => {});
	}, [error]);

	return (
		<html lang="es">
			<body>
				<div className="login-wrap">
					<div className="login-card" style={{ textAlign: "center" }}>
						<h1>Algo ha ido mal</h1>
						<p className="subtitle">
							La aplicación no ha podido cargar correctamente. Puedes intentarlo de nuevo.
						</p>
						<button className="btn btn-primary" style={{ width: "100%", marginTop: 18 }} onClick={() => reset()}>
							Reintentar
						</button>
					</div>
				</div>
			</body>
		</html>
	);
}
