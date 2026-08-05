"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
	const [ready, setReady] = useState(false);
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [error, setError] = useState("");
	const [done, setDone] = useState(false);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		const s = createClient();
		s.auth.getSession().then(({ data }) => setReady(!!data.session));
	}, []);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		if (password !== confirm) {
			setError("Las contraseñas no coinciden.");
			return;
		}
		setLoading(true);
		setError("");
		const s = createClient();
		const { error } = await s.auth.updateUser({ password });
		if (error) setError(error.message);
		else setDone(true);
		setLoading(false);
	}

	return (
		<div className="login-wrap">
			<div className="login-card">
				<div className="brand">
					<span className="brandmark"><img src="/icon-192.png" alt="OurMoney logo" /></span>
					OurMoney
				</div>
				<h1>Nueva contraseña</h1>

				{!ready && !done && (
					<p className="subtitle" style={{ marginTop: 18 }}>
						Este enlace ya no es válido o ha caducado.{" "}
						<a href="/forgot-password">Solicita uno nuevo</a>.
					</p>
				)}

				{ready && !done && (
					<form onSubmit={submit}>
						<p className="subtitle">Elige la contraseña con la que quieres entrar a partir de ahora.</p>
						<div className="field" style={{ marginTop: 14 }}>
							<label>Nueva contraseña</label>
							<input className="input" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
						</div>
						<div className="field" style={{ marginTop: 14 }}>
							<label>Repite la contraseña</label>
							<input className="input" type="password" minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
						</div>

						{error && <p className="expense">{error}</p>}

						<button className="btn btn-primary" style={{ width: "100%", marginTop: 18 }} disabled={loading}>
							{loading ? "Guardando…" : "Guardar contraseña"}
						</button>
					</form>
				)}

				{done && (
					<>
						<p className="subtitle" style={{ marginTop: 18, color: "var(--income)" }}>
							Contraseña actualizada.
						</p>
						<a className="btn btn-primary" style={{ width: "100%", marginTop: 8, justifyContent: "center" }} href="/dashboard">
							Ir a Inicio
						</a>
					</>
				)}
			</div>
		</div>
	);
}
