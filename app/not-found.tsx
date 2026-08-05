import { Compass } from "lucide-react";

export default function NotFound() {
	return (
		<div className="login-wrap">
			<div className="login-card" style={{ textAlign: "center" }}>
				<div className="brand" style={{ justifyContent: "center" }}>
					<span className="brandmark"><Compass size={20} /></span>
				</div>
				<h1>Página no encontrada</h1>
				<p className="subtitle">La página que buscas no existe o se ha movido.</p>
				<a className="btn btn-primary" style={{ width: "100%", marginTop: 18, justifyContent: "center" }} href="/dashboard">
					Ir a Inicio
				</a>
			</div>
		</div>
	);
}
