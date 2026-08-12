"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
	const [mode, setMode] = useState<"login" | "signup">("login");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [name, setName] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setError("");
		const s = createClient();
		const result =
			mode === "login"
				? await s.auth.signInWithPassword({ email, password })
				: await s.auth.signUp({ email, password, options: { data: { display_name: name } } });
		if (result.error) setError(result.error.message);
		else location.href = "/dashboard";
		setLoading(false);
	}

	return (
		<div className="login-wrap">
			<form className="login-card" onSubmit={submit}>
				<div className="brand">
					<span className="brandmark"><img src="/icon-192.png" alt="OurMoney logo"/></span>
					OurMoney
				</div>
				<h1>{mode === "login" ? "Bienvenido de nuevo" : "Crea vuestra cuenta"}</h1>
				<p className="subtitle">Sincroniza las finanzas de dos móviles con cuentas distintas.</p>

				{mode === "signup" && (
					<div className="field">
						<label>Nombre</label>
						<input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
					</div>
				)}

				<div className="field" style={{ marginTop: 14 }}>
					<label>Email</label>
					<input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
				</div>

				<div className="field" style={{ marginTop: 14 }}>
					<label>Contraseña</label>
					<div style={{ position: "relative" }}>
						<input
							className="input"
							type={showPassword ? "text" : "password"}
							minLength={6}
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							style={{ paddingRight: 40 }}
						/>
						<button
							type="button"
							onClick={() => setShowPassword((v) => !v)}
							aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
							style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: 0, padding: 6, display: "flex", cursor: "pointer", color: "var(--muted)" }}
						>
							{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
						</button>
					</div>
				</div>

				{error && <p className="expense">{error}</p>}

				<button className="btn btn-primary" style={{ width: "100%", marginTop: 18 }} disabled={loading}>
					{loading ? "Un momento…" : mode === "login" ? "Entrar" : "Crear cuenta"}
				</button>

				{mode === "login" && (
					<Link href="/forgot-password" className="subtitle" style={{ display: "block", textAlign: "center", marginTop: 12 }}>
						¿Olvidaste tu contraseña?
					</Link>
				)}

				<button
					className="btn btn-ghost"
					type="button"
					style={{ width: "100%", marginTop: 8 }}
					onClick={() => setMode(mode === "login" ? "signup" : "login")}
				>
					{mode === "login" ? "No tengo cuenta" : "Ya tengo cuenta"}
				</button>
			</form>
		</div>
	);
}
