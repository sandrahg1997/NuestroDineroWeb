"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
	const [email, setEmail] = useState("");
	const [error, setError] = useState("");
	const [sent, setSent] = useState(false);
	const [loading, setLoading] = useState(false);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setError("");
		const s = createClient();
		const { error } = await s.auth.resetPasswordForEmail(email, {
			redirectTo: `${location.origin}/auth/callback?next=/reset-password`,
		});
		if (error) setError(error.message);
		else setSent(true);
		setLoading(false);
	}

	return (
		<div className="login-wrap">
			<form className="login-card" onSubmit={submit}>
				<div className="brand">
					<span className="brandmark"><img src="/icon-192.png" alt="OurMoney logo" /></span>
					OurMoney
				</div>
				<h1>Recuperar contraseña</h1>
				<p className="subtitle">Te enviamos un enlace para elegir una contraseña nueva.</p>

				{sent ? (
					<p className="subtitle" style={{ marginTop: 18, color: "var(--income)" }}>
						Revisa tu correo ({email}) y sigue el enlace para continuar.
					</p>
				) : (
					<>
						<div className="field" style={{ marginTop: 14 }}>
							<label>Email</label>
							<input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
						</div>

						{error && <p className="expense">{error}</p>}

						<button className="btn btn-primary" style={{ width: "100%", marginTop: 18 }} disabled={loading}>
							{loading ? "Enviando…" : "Enviar enlace"}
						</button>
					</>
				)}

				<Link href="/login" className="btn btn-ghost" style={{ width: "100%", marginTop: 8, justifyContent: "center" }}>
					Volver a iniciar sesión
				</Link>
			</form>
		</div>
	);
}
